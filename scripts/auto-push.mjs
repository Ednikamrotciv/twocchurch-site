import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readFeedConfig, effectiveFeed } from "./feed-config.mjs";
import { pushMirror } from "./feed-mirror.mjs";

/* Publish-to-deploy: after the office publishes (locally — `npm run serve`,
   `start.bat`, or `npm run dev`), the new words bake into seed.json and push
   themselves to GitHub a couple of minutes later, and the static host
   redeploys on its own. No always-on computer, no tunnel, no commands.
   Only CMS data files ever move (data/, seed.json) — code is never touched,
   and a failed push only prints a line; publishing itself always succeeds.

   Off switch: create an empty file named `no-auto-push.txt` beside
   package.json, or set WOM_NO_PUSH=1. Auto-push also stays quiet outside a
   git checkout, or when there is no remote to push to. */

const DELAY_MS = 120000;

let runner = null;
let hookSender = null;
function run(cmd, args, cwd) {
  if (runner) return runner(cmd, args, cwd);
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code || 1 : 0, out: String(stdout || ""), err: String(stderr || "") });
    });
  });
}

/* Test seams: replace the process runner or the webhook sender. */
export function setRunner(fn) {
  runner = fn;
}
export function setHookSender(fn) {
  hookSender = fn;
}

const timers = new Map();
let repoState = null;

async function repoReady(rootDir) {
  if (repoState) return repoState;
  repoState = { ok: false, reason: "" };
  const inside = await run("git", ["rev-parse", "--is-inside-work-tree"], rootDir);
  if (inside.code !== 0 || inside.out.trim() !== "true") {
    repoState.reason = "not a git checkout";
    return repoState;
  }
  const remote = await run("git", ["remote", "get-url", "origin"], rootDir);
  if (remote.code !== 0 || !remote.out.trim()) {
    repoState.reason = "no git remote";
    return repoState;
  }
  repoState = { ok: true, reason: "" };
  return repoState;
}

async function disabledByFile(rootDir) {
  if (typeof process !== "undefined" && process.env && process.env.WOM_NO_PUSH) return true;
  try {
    await readFile(path.join(rootDir, "no-auto-push.txt"));
    return true;
  } catch {
    return false;
  }
}

async function pushOnce(rootDir) {
  timers.delete(rootDir);
  try {
    if (await disabledByFile(rootDir)) return { skipped: "disabled" };
    const repo = await repoReady(rootDir);
    if (!repo.ok) {
      if (!pushOnce.quiet) {
        pushOnce.quiet = true;
        console.log(`auto-deploy is off (${repo.reason}) — publish locally, the words stay here`);
      }
      return { skipped: repo.reason };
    }
    const dirty = await run("git", ["status", "--porcelain", "--", "data", "seed.json"], rootDir);
    if (dirty.code !== 0) return { skipped: "git status failed" };
    if (!dirty.out.trim()) return { skipped: "nothing new to deploy" };
    /* process.execPath (note 307): the exact node running this backend — a
       bare "node" relies on PATH and can fail on machines where only npm's
       node is present. */
    const bake = await run(process.execPath || "node", ["scripts/bake-seed.mjs"], rootDir);
    if (bake.code !== 0) {
      /* Say WHY (note 307): the old line hid the real error, so a broken
         bake looked identical to "nothing happened" and the live bake went
         stale — then every sleep brought maintenance back. The words are
         still safe here; the next publish retries. To fix now, run
         `npm run bake-seed` by hand and read its error. */
      const why = String((bake.err || "") + "\n" + (bake.out || "")).trim().split("\n").slice(0, 3).join(" | ").slice(0, 300);
      console.warn("auto-deploy: could not bake the new words — will retry after the next publish" + (why ? ` (bake said: ${why})` : " (run `npm run bake-seed` by hand to see the error)"));
      return { skipped: "bake failed" };
    }
    const add = await run("git", ["add", "-A", "--", "data", "seed.json"], rootDir);
    if (add.code !== 0) return { skipped: "git add failed" };
    const again = await run("git", ["status", "--porcelain", "--", "data", "seed.json"], rootDir);
    if (!again.out.trim()) return { skipped: "nothing new to deploy" };
    const day = new Date().toISOString().slice(0, 16).replace("T", " ");
    const commit = await run("git", ["commit", "-m", `content update ${day}`, "--quiet"], rootDir);
    if (commit.code !== 0) return { skipped: "git commit failed" };
    const push = await run("git", ["push", "--quiet"], rootDir);
    if (push.code !== 0) {
      /* Name the usual suspects (note 307): huge uploads break the push while
         looking like a login problem. GitHub refuses files over 100 MB — one
         long video in data/uploads/ is enough. The words are safe here and
         will go out after the next publish; shrink or remove the big file,
         then publish again (or push by hand to see git's own error). */
      const pushWhy = String((push.err || "") + "\n" + (push.out || "")).trim().split("\n").slice(0, 2).join(" | ").slice(0, 240);
      console.warn("auto-deploy: push failed (offline, login expired, or a file over the host's size limit — check data/uploads/ for videos near/over 100 MB) — the words are safe here and will go out after the next publish" + (pushWhy ? ` (git said: ${pushWhy})` : ""));
      return { skipped: "git push failed" };
    }
    console.log("auto-deploy: new words pushed — the live site updates itself in a few minutes");
    try {
      watchLiveCatchUp(rootDir);
    } catch {
      /* the push already went out — watching is best effort */
    }
    await fireDeployHook(rootDir);
    /* Private source repo? The public mirror (if configured) carries the
       snapshot out to every copy within minutes. Best effort, like the hook. */
    try {
      const cfg = await readFeedConfig(rootDir);
      if (cfg.mirror && effectiveFeed(cfg)) {
        await pushMirror(rootDir, cfg.mirror);
      }
    } catch {
      /* the main push already went out */
    }
    return { pushed: true };
  } catch (err) {
    console.warn("auto-deploy skipped:", err?.message || err);
    return { skipped: "error" };
  }
}

/* Live catch-up watch (note 310): a push is only half the trip — the host
   still has to rebuild before a sleep is harmless. After every successful
   push, poll the live version.json until its update number catches the
   just-baked seed, then say so; if it never catches up, say that loudly
   instead, with the by-hand fix. A stale live bake is exactly how "sleep
   affects last published" happens, and until now nothing reported it. */
const catchUpTimers = new Map();
const catchUpWant = new Map();
async function watchLiveCatchUp(rootDir) {
  try {
    const raw = await readFile(path.join(rootDir, "cms-server.txt"), "utf8").catch(() => "");
    const live = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] || "";
    if (!/^https?:\/\/[^/\s]+$/i.test(live)) return;
    const seed = JSON.parse(await readFile(path.join(rootDir, "seed.json"), "utf8").catch(() => "{}"));
    const want = typeof seed?.notes === "number" ? Math.floor(seed.notes) : 0;
    if (!want) return;
    /* A newer push while a watch is running just raises the bar. */
    catchUpWant.set(rootDir, want);
    if (catchUpTimers.has(rootDir)) return;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const bar = catchUpWant.get(rootDir) || 0;
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : 0;
        try {
          const res = await fetch(live.replace(/\/+$/, "") + "/version.json", {
            cache: "no-store",
            signal: ctrl ? ctrl.signal : undefined,
          });
          if (res && res.ok) {
            const v = await res.json().catch(() => null);
            const notes = v && typeof v.notes === "number" ? Math.floor(v.notes) : 0;
            if (bar && notes >= bar) {
              console.log(`live is on update ${notes} — the last publish is sleep-safe`);
              catchUpTimers.delete(rootDir);
              catchUpWant.delete(rootDir);
              return;
            }
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch {
        /* offline or host asleep — keep watching a while longer */
      }
      if (tries >= 15) {
        catchUpTimers.delete(rootDir);
        console.warn(
          `live has not caught up to update ${bar || want} after the push (still serving older) — a sleep now would bring back the older publish. ` +
          `Check the host dashboard that it rebuilt on the push (Render: Deploys tab), or deploy by hand, then reload the live site once.`
        );
        catchUpWant.delete(rootDir);
        return;
      }
      const t = setTimeout(() => void tick(), 60000);
      if (t && typeof t.unref === "function") try { t.unref(); } catch { /* long-lived backends stay up anyway */ }
      catchUpTimers.set(rootDir, t);
    };
    const first = setTimeout(() => void tick(), 180000);
    if (first && typeof first.unref === "function") try { first.unref(); } catch {}
    catchUpTimers.set(rootDir, first);
  } catch {
    /* the push already went out — watching is best effort */
  }
}

/* Some hosts don't watch git and instead rebuild when a URL is called
   (a "deploy hook" / "build hook" from the host's dashboard). Put that URL
   alone in `deploy-hook.txt` beside package.json and it gets called after
   every successful push. The file is git-ignored: it stays on your computer.
   Absent file, or a bad URL, and this step is silently skipped. */
async function fireDeployHook(rootDir) {
  try {
    const raw = await readFile(path.join(rootDir, "deploy-hook.txt"), "utf8").catch(() => "");
    const url = String(raw).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "";
    if (!url) return { skipped: "no hook" };
    if (!/^https?:\/\/[^\s/\\]+(\/[^\s]*)?$/i.test(url)) {
      console.warn(`auto-deploy: deploy-hook.txt is not a URL ("${url}") — hook not called`);
      return { skipped: "bad url" };
    }
    if (hookSender) {
      await hookSender(url);
    } else if (typeof fetch !== "undefined") {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : 0;
      try {
        await fetch(url, { method: "POST", signal: ctrl ? ctrl.signal : undefined });
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    console.log("auto-deploy: deploy hook called");
    return { hooked: true };
  } catch (err) {
    console.warn("auto-deploy: deploy hook failed — the push itself already went out");
    return { skipped: "hook failed" };
  }
}

/* Called after every successful store save; the push goes out DELAY_MS after
   the last one, so a publishing session lands as a single deploy. */
export function notePublished(rootDir, delayMs) {
  if (timers.has(rootDir)) clearTimeout(timers.get(rootDir));
  timers.set(
    rootDir,
    setTimeout(() => pushOnce(rootDir), delayMs == null ? DELAY_MS : delayMs)
  );
}

export { pushOnce, fireDeployHook };
