import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* The private-repo path: the source repo stays private, and the published
   snapshot is mirrored to a second, PUBLIC repo. Deployed copies read the
   mirror through the same proven hosts as the direct feed — the mirror is
   just another public repo.

   One-time setup (30 seconds, on github.com): create an empty PUBLIC repo,
   paste its address as a second line in publish-feed.txt, commit, push.
   After that the mirror pushes itself after every publish, using the same
   login the main push already uses — no new secrets anywhere. The mirror is
   machine-managed (this script alone writes it); hand edits there get
   overwritten, which is the point.

   Wipe durability: besides seed.json the mirror carries every upload the
   published words point at (uploads/<name>), so anything pushed is fetchable
   by every copy straight off the public repo — painting and healing no
   longer need the uploader's browser. Files near GitHub's 100 MB refusal are
   skipped with a warning (keep videos shorter). */

let runner = null;
export function setRunner(fn) {
  runner = fn;
}

function run(cmd, args, cwd) {
  if (runner) return runner(cmd, args, cwd);
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code || 1 : 0, out: String(stdout || ""), err: String(stderr || "") });
    });
  });
}

export async function pushMirror(rootDir, mirror, opts) {
  const tmpBase = (opts && opts.tmpDir) || tmpdir();
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const tmp = path.join(tmpBase, `wom-feed-${stamp}`);
  const url = `https://github.com/${mirror.owner}/${mirror.repo}.git`;
  try {
    let seed;
    try {
      seed = await readFile(path.join(rootDir, "seed.json"));
    } catch {
      return { skipped: "no seed.json to mirror" };
    }
    if (!seed.length) return { skipped: "seed.json is empty" };
    await mkdir(tmp, { recursive: true });
    const git = ["-c", "user.name=WOM Office", "-c", "user.email=office@localhost"];
    /* Clone the mirror shallowly instead of starting fresh, so unchanged
       uploads are never re-uploaded — only seed.json and new/changed files
       travel. A brand-new (empty) mirror clones just as well. */
    let r = await run("git", ["clone", "--depth", "1", url, tmp], rootDir);
    if (r.code !== 0) {
      await run("git", ["init", "-q", tmp], rootDir);
      r = await run("git", ["-C", tmp, "remote", "add", "origin", url], rootDir);
      if (r.code !== 0) return { skipped: "git remote failed" };
    }
    r = await run("git", ["-C", tmp, "checkout", "-q", "-B", "main"], rootDir);
    if (r.code !== 0) return { skipped: "git checkout failed" };
    await writeFile(path.join(tmp, "seed.json"), seed);
    /* Every upload the published words point at rides along at uploads/<name>
       (wipe durability — see the header). Dereferenced files are removed so
       the mirror never serves stale pictures. Over ~90 MB is skipped with a
       warning: GitHub refuses files over 100 MB and the push would fail. */
    const wanted = [...new Set(
      [...String(seed).matchAll(/\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/g)].map((m) => m[1])
    )];
    const upDir = path.join(tmp, "uploads");
    await mkdir(upDir, { recursive: true });
    try {
      for (const f of await readdir(upDir)) {
        if (!wanted.includes(f)) await rm(path.join(upDir, f), { force: true });
      }
    } catch { /* nothing mirrored yet */ }
    const skippedBig = [];
    for (const n of wanted) {
      try {
        const st = await stat(path.join(rootDir, "data", "uploads", n));
        if (!st.isFile()) continue;
        if (st.size > 90 * 1024 * 1024) {
          skippedBig.push(n);
          continue;
        }
        await cp(path.join(rootDir, "data", "uploads", n), path.join(upDir, n));
      } catch { /* office file gone — the seed reference heals on next publish */ }
    }
    if (skippedBig.length) {
      console.warn(`auto-deploy: mirror skips ${skippedBig.length} file(s) over ~90 MB (${skippedBig.slice(0, 3).join(", ")}) — GitHub refuses files over 100 MB, so keep videos shorter`);
    }
    r = await run("git", ["-C", tmp, ...git, "add", "-A"], rootDir);
    if (r.code !== 0) return { skipped: "git add failed" };
    r = await run("git", ["-C", tmp, ...git, "status", "--porcelain"], rootDir);
    if (r.code !== 0) return { skipped: "git status failed" };
    if (!r.out.trim()) return { skipped: "mirror already current" };
    r = await run(
      "git",
      ["-C", tmp, ...git, "commit", "-q", "-m", `content update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`],
      rootDir
    );
    if (r.code !== 0) return { skipped: "git commit failed" };
    /* Plain push (no --force): with the clone above history continues, so the
       public hosts' caches stay valid and every push ships only what changed. */
    r = await run("git", ["-C", tmp, "push", "-q", "--set-upstream", "origin", "main"], rootDir);
    if (r.code !== 0) {
      console.warn("auto-deploy: mirror push failed — create the empty public repo and check the login; the main push already went out");
      return { skipped: "mirror push failed" };
    }
    console.log(`auto-deploy: live mirror updated (${mirror.owner}/${mirror.repo}) — every copy refreshes in minutes`);
    return { pushed: true };
  } catch (err) {
    console.warn("auto-deploy: mirror skipped:", err?.message || err);
    return { skipped: "error" };
  } finally {
    try {
      await rm(tmp, { recursive: true, force: true });
    } catch { /* scratch cleans itself */ }
  }
}
