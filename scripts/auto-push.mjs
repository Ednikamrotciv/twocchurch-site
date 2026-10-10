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
/* Sleeps die fast: on Render the box can nap a minute after a publish, so the
   persist push goes out in seconds there instead of minutes (note 302). */
const RENDER_DELAY_MS = 15000;

/* Durable publishes on hosts with no disk (note 302): Render free sleeps and
   wipes data/cms-state.bin — a publish made on the live box dies with the nap
   and the site falls back to the last deploy, looking like a new update. When
   a token is configured the server commits + pushes after every save, so the
   publish is in git before the nap and the next boot clones it back. Free: a
   fine-grained GitHub PAT (Contents read + write on this repo only) as
   GITHUB_TOKEN (WOM_GIT_TOKEN and GIT_TOKEN also work). The token never
   leaves the server and is never logged. */
function pushToken() {
  if (typeof process === "undefined" || !process.env) return "";
  return String(process.env.GITHUB_TOKEN || process.env.WOM_GIT_TOKEN || process.env.GIT_TOKEN || "").trim();
}
function onRenderHost() {
  if (typeof process === "undefined" || !process.env) return false;
  return !!(process.env.RENDER || process.env.RENDER_SERVICE_ID);
}
/** How this backend survives a restart: token-pushed, local disk, or wiped. */
export function persistMode() {
  if (pushToken()) return "token";
  if (!onRenderHost()) return "local";
  if (typeof process !== "undefined" && process.env && process.env.PERSIST_OK === "1") return "disk";
  return "ephemeral";
}
/** "render" on Render, else "other" — rides the getContent answer for __maintState. */
export function hostKind() {
  return onRenderHost() ? "render" : "other";
}
/** Branch to push to: Render names it, else the checkout does. "" = unknown. */
async function pushBranch(rootDir) {
  try {
    if (typeof process !== "undefined" && process.env && process.env.RENDER_GIT_BRANCH) {
      const b = String(process.env.RENDER_GIT_BRANCH).trim();
      if (b) return b;
    }
    const b = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], rootDir);
    const name = String(b.out || "").trim();
    if (b.code === 0 && name && name !== "HEAD") return name;
  } catch { /* unknown — the caller says so instead of guessing */ }
  return "";
}
/** Origin URL with the token embedded for the push only (never stored, never logged). */
async function authedPushUrl(rootDir) {
  const token = pushToken();
  if (!token) return null;
  const remote = await run("git", ["remote", "get-url", "origin"], rootDir);
  const url = String(remote.out || "").trim();
  if (remote.code !== 0 || !url) return null;
  if (/^https:\/\/github\.com\//i.test(url)) return url.replace(/^https:\/\//i, () => "https://x-access-token:" + token + "@");
  return null; // ssh or non-github remotes: a token cannot authenticate these
}

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
    if (dirty.code !== 0) {
      if (onRenderHost()) console.warn("auto-deploy: git status failed at runtime — live publishes here die on sleep; publish from the office computer instead (see DEPLOY.md)");
      return { skipped: "git status failed" };
    }
    if (!dirty.out.trim()) return { skipped: "nothing new to deploy" };
    const branch = await pushBranch(rootDir);
    const authed = await authedPushUrl(rootDir);
    if (pushToken() && !authed) console.warn("auto-deploy: a token is set but origin is not an https github URL — token cannot authenticate this remote");
    if (pushToken() && authed && !branch) console.warn("auto-deploy: a token is set but the branch is unknown — falling back to a plain push, which needs its own login");
    const bake = await run("node", ["scripts/bake-seed.mjs"], rootDir);
    if (bake.code !== 0) {
      console.warn("auto-deploy: could not bake the new words — will retry after the next publish");
      return { skipped: "bake failed" };
    }
    const add = await run("git", ["add", "-A", "--", "data", "seed.json"], rootDir);
    if (add.code !== 0) return { skipped: "git add failed" };
    const again = await run("git", ["status", "--porcelain", "--", "data", "seed.json"], rootDir);
    if (!again.out.trim()) return { skipped: "nothing new to deploy" };
    const day = new Date().toISOString().slice(0, 16).replace("T", " ");
    /* Identity inline (not global): hosts like Render have no git identity. */
    const commit = await run("git", ["-c", "user.name=WOM Office", "-c", "user.email=office@localhost", "commit", "-m", `content update ${day}`, "--quiet"], rootDir);
    if (commit.code !== 0) return { skipped: "git commit failed" };
    let push;
    if (authed && branch) push = await run("git", ["push", "--quiet", authed, `HEAD:${branch}`], rootDir);
    else push = await run("git", ["push", "--quiet"], rootDir);
    if (push.code !== 0) {
      if (onRenderHost() && !pushToken()) console.warn("auto-deploy: push failed and no token is set — on Render free, set GITHUB_TOKEN or live publishes die on sleep (see DEPLOY.md)");
      else console.warn("auto-deploy: push failed (offline, or the login expired) — the words are safe here and will go out after the next publish");
      return { skipped: "git push failed" };
    }
    console.log("auto-deploy: new words pushed — the live site updates itself in a few minutes");
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
    setTimeout(() => pushOnce(rootDir), delayMs == null ? (onRenderHost() ? RENDER_DELAY_MS : DELAY_MS) : delayMs)
  );
}

export { pushOnce, fireDeployHook };
