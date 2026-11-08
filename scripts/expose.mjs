import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 5173);
const LOCAL = `http://127.0.0.1:${PORT}`;
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function sh(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 180000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code || 1 : 0, out: String(stdout || ""), err: String(stderr || "") });
    });
  });
}

async function serving() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 2000);
  try {
    const r = await fetch(LOCAL + "/", { signal: c.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function waitForServer(child) {
  for (let i = 0; i < 45; i++) {
    if (await serving()) return true;
    if (child && child.exitCode != null) throw new Error("the site server exited before it started");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("the site server did not answer at " + LOCAL);
}

function cloudflaredAsset() {
  const p = process.platform, a = process.arch;
  if (p === "win32") return { file: "cloudflared-windows-amd64.exe", bin: "cloudflared.exe" };
  if (p === "darwin") return { file: a === "arm64" ? "cloudflared-darwin-arm64" : "cloudflared-darwin-amd64", bin: "cloudflared" };
  if (p === "linux") return { file: a === "arm64" ? "cloudflared-linux-arm64" : "cloudflared-linux-amd64", bin: "cloudflared" };
  throw new Error(`no tunnel download for ${p}/${a} — install cloudflared by hand and re-run`);
}

async function cloudflaredBin() {
  const probe = await sh("cloudflared", ["--version"]);
  if (probe.code === 0) return "cloudflared";
  const { file, bin } = cloudflaredAsset();
  const dest = path.join(ROOT, "bin", bin);
  try {
    const direct = await sh(dest, ["--version"]);
    if (direct.code === 0) return dest;
  } catch { /* not there yet */ }
  console.log("fetching the free tunnel tool (once) …");
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tunnel download failed (${res.status}) — install cloudflared by hand and re-run`);
  await mkdir(path.join(ROOT, "bin"), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  if (process.platform !== "win32") await chmod(dest, 0o755).catch(() => {});
  return dest;
}

function openTunnel(bin) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["tunnel", "--url", LOCAL], { stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    const done = (fn) => (v) => { clearTimeout(timer); child.stdout.destroy(); child.stderr.destroy(); fn(v); };
    const ok = done(resolve), no = done(reject);
    child.stdout.on("data", (d) => {
      text += String(d);
      const m = text.match(URL_RE);
      if (m) ok({ child, url: m[0] });
    });
    child.stderr.on("data", (d) => {
      text += String(d);
      const m = text.match(URL_RE);
      if (m) ok({ child, url: m[0] });
    });
    child.on("exit", (code) => no(new Error(`the tunnel exited before giving an address (code ${code})`)));
    child.on("error", (e) => no(e));
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      no(new Error("the tunnel gave no address within 90 seconds"));
    }, 90000);
  });
}

async function currentFirstAddress(file) {
  try {
    const raw = await readFile(path.join(ROOT, file), "utf8");
    const line = String(raw).split(/\r?\n/).map((l) => String(l || "").trim()).find((l) => l && !l.startsWith("#")) || "";
    return line.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/* Hosted-backend hostnames (Render topology): when the main server file
   already points at one of these, this boot's tunnel is the OFFICE READER
   (office-server.txt) — the main file keeps pointing at the hosted backend.
   Anything else (empty, loopback, a tunnel URL) is the office topology, where
   the tunnel itself IS the server (cms-server.txt, as always). */
const HOSTED_RE = /(onrender\.com|netlify\.app|vercel\.app|pages\.dev|github\.io|cloudfront\.net|herokuapp\.com|fly\.dev|azurewebsites\.net|render\.com)$/i;

async function registerAndPush(url, log) {
  /* Reader routing (Render topology): the tunnel refreshes office-server.txt
     and the hosted address in cms-server.txt is left alone — so the tunnel
     rotation heals itself on the next rebuild instead of hijacking the
     backend pointer. Office topology keeps the legacy path untouched. */
  try {
    const cmsAddr = await currentFirstAddress("cms-server.txt");
    const officeAddr = await currentFirstAddress("office-server.txt");
    let officeExists = false;
    try {
      await readFile(path.join(ROOT, "office-server.txt"), "utf8");
      officeExists = true;
    } catch {
      officeExists = false;
    }
    const hosted = /^https:\/\//i.test(cmsAddr || "") && HOSTED_RE.test(cmsAddr);
    if (officeExists && (officeAddr || hosted)) {
      const prev = await readFile(path.join(ROOT, "office-server.txt"), "utf8").catch(() => "");
      const keep = prev.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
      await writeFile(path.join(ROOT, "office-server.txt"), (keep.length ? keep.join("\n") + "\n" : "") + url + "\n");
      log(`office reader is now ${url} (office-server.txt — rebuild the frontend hosts to pick it up)`);
      const add = await sh("git", ["add", "office-server.txt"]);
      if (add.code !== 0) {
        log("not a git checkout — commit office-server.txt by hand wherever the repo lives");
        return;
      }
      const diff = await sh("git", ["diff", "--cached", "--quiet"]);
      if (diff.code === 0) {
        log("office-server.txt already carried this address — nothing to push");
        return;
      }
      const commit = await sh("git", ["commit", "-m", `office reader ${url}`]);
      if (commit.code !== 0) {
        log("could not commit (nothing to commit, or git needs setup) — run: git commit -m \"office reader\" office-server.txt && git push");
        return;
      }
      const push = await sh("git", ["push"]);
      log(
        push.code === 0
          ? "pushed — every deployed copy reads YouTube through the office after the next redeploy (a few minutes)"
          : "commit saved but push failed (" + (push.err || push.out).trim().split("\n")[0] + ") — run: git push"
      );
      return;
    }
  } catch (err) {
    log("office reader update skipped (" + (err?.message || err) + ") — falling back to the office address");
  }
  const set = await sh(process.execPath, ["scripts/set-server.mjs", url]);
  if (set.code !== 0) throw new Error((set.err || set.out).trim() || "set-server failed");
  log((set.out || "").trim());
  const add = await sh("git", ["add", "cms-server.txt"]);
  if (add.code !== 0) {
    log("not a git checkout — commit cms-server.txt by hand wherever the repo lives");
    return;
  }
  const diff = await sh("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) {
    log("cms-server.txt already carried this address — nothing to push");
    return;
  }
  const commit = await sh("git", ["commit", "-m", `office server ${url}`]);
  if (commit.code !== 0) {
    log("could not commit (nothing to commit, or git needs setup) — run: git commit -m \"office server\" cms-server.txt && git push");
    return;
  }
  const push = await sh("git", ["push"]);
  log(
    push.code === 0
      ? "pushed — every deployed copy joins this server after the next redeploy (a few minutes)"
      : "commit saved but push failed (" + (push.err || push.out).trim().split("\n")[0] + ") — run: git push"
  );
}

/* Attach this machine as the office server: open the secure tunnel, register
   the address, push it. The caller must already be serving the site
   (serve.mjs calls this at boot when sharing is on). Never throws
   synchronously; failures reject so the caller can log and carry on. The
   tunnel child lives until this process ends. */
export async function attachShare(log) {
  const say = log || console.log;
  const bin = await cloudflaredBin();
  say("opening the secure tunnel …");
  const { child: tunnel, url } = await openTunnel(bin);
  try {
    process.once("exit", () => {
      try { tunnel.kill(); } catch { /* already gone */ }
    });
  } catch { /* a host that cannot hook exit still shares until it stops */ }
  say("================================================================");
  say(`  OFFICE ADDRESS: ${url}`);
  say("================================================================");
  await registerAndPush(url, say);
  say(`live: ${url}  (stop this server and the office goes offline)`);
  say("copies keep working from baked words while it is dark, and sync back when it returns.");
  return { url, tunnel };
}

/* Sharing is wanted while auto-share.txt exists and no-auto-share.txt does
   not. The flag ships ON with the site; `npm run share-off` writes the
   override (git-ignored, so a fresh zip never turns sharing back on). */
export async function shareWanted(rootDir) {
  /* A hosted backend (Render) must never share itself: its tunnel would be a
     datacenter read (walled, like its own /__yt) and its commit would fight
     the office's. The office computer shares; the hosted box serves. */
  try {
    if (process.env.RENDER) return false;
  } catch {
    /* env unreadable — fall through to the file flags */
  }
  try {
    await readFile(path.join(rootDir, "auto-share.txt"));
  } catch {
    return false;
  }
  try {
    await readFile(path.join(rootDir, "no-auto-share.txt"));
    return false;
  } catch {
    return true;
  }
}

const CLI = typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("expose.mjs");
if (CLI) {
  const startedHere = [];
  const shutdown = () => {
    for (const c of startedHere.splice(0)) {
      try { c.kill(); } catch { /* already gone */ }
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("OFFICE SERVER — one command, leave this window open.");
  let serverChild = null;
  if (await serving()) {
    console.log(`site already running at ${LOCAL} — using it`);
  } else {
    console.log(`starting the site at ${LOCAL} …`);
    serverChild = spawn(process.execPath, ["scripts/serve.mjs"], {
      cwd: ROOT, stdio: "inherit", env: { ...process.env, PORT: String(PORT) },
    });
    startedHere.push(serverChild);
    serverChild.on("exit", (code) => {
      if (code) { console.error(`site server exited (code ${code})`); shutdown(); }
    });
    try {
      await waitForServer(serverChild);
    } catch (e) {
      console.error("expose: " + e.message);
      shutdown();
    }
  }
  try {
    const attached = await attachShare(console.log);
    startedHere.push(attached.tunnel);
  } catch (e) {
    console.error("expose: " + (e?.message || e));
    shutdown();
  }
  console.log("run `npm run autostart` once to start this by itself at every login from here on.");
  console.log(`live (this window must stay open; closing it takes the office offline)`);
  await new Promise(() => {});
}
