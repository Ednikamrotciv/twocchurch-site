import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* The private-repo path: the source repo stays private, and only the tiny
   public snapshot (seed.json) is mirrored to a second, PUBLIC repo holding
   nothing else. Deployed copies read the mirror through the same proven
   hosts as the direct feed — the mirror is just another public repo.

   One-time setup (30 seconds, on github.com): create an empty PUBLIC repo,
   paste its address as a second line in publish-feed.txt, commit, push.
   After that the mirror pushes itself after every publish, using the same
   login the main push already uses — no new secrets anywhere. The mirror is
   machine-managed (force-pushed by this script alone); hand edits there get
   overwritten, which is the point. */

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
    let r = await run("git", ["init", "-q", tmp], rootDir);
    if (r.code !== 0) return { skipped: "git init failed" };
    r = await run("git", ["-C", tmp, "remote", "add", "origin", url], rootDir);
    if (r.code !== 0) return { skipped: "git remote failed" };
    r = await run("git", ["-C", tmp, "checkout", "-q", "-B", "main"], rootDir);
    if (r.code !== 0) return { skipped: "git checkout failed" };
    await writeFile(path.join(tmp, "seed.json"), seed);
    r = await run("git", ["-C", tmp, ...git, "add", "seed.json"], rootDir);
    if (r.code !== 0) return { skipped: "git add failed" };
    r = await run("git", ["-C", tmp, ...git, "status", "--porcelain", "--", "seed.json"], rootDir);
    if (r.code !== 0) return { skipped: "git status failed" };
    if (!r.out.trim()) return { skipped: "mirror already current" };
    r = await run(
      "git",
      ["-C", tmp, ...git, "commit", "-q", "-m", `content update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`],
      rootDir
    );
    if (r.code !== 0) return { skipped: "git commit failed" };
    r = await run("git", ["-C", tmp, "push", "-q", "--force", "--set-upstream", "origin", "main"], rootDir);
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
