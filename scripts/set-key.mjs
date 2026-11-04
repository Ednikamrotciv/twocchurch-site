/* set-key.mjs — OPTIONAL bonus key setup (livestream already auto-opens keyless).
   Usage:  npm run set-key -- <YT_API_KEY>     (validates + writes .env)
           npm run key-status                   (on/off, never prints the key)
   The key enables press-free auto-open: the Watch page opens by itself the
   moment YouTube goes live, even with no office press. Without it the site
   still works (Play + Publish opens the stream) — the admin console says so.
   Validation costs exactly 1 quota unit (channels.list, part=id). */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;
const PROBE_CHANNEL = "UCQ0KIUXUV7gTZmDDlvd3ZcQ"; // @twocorg (any readable channel proves the key)

function usage() {
  console.log("usage:");
  console.log("  npm run set-key -- <YT_API_KEY>   validate the key (1 quota unit) and save it to .env");
  console.log("  npm run key-status                 show whether auto-detect is on (env or .env)");
  console.log("");
  console.log("Get a key: Google Cloud Console -> enable YouTube Data API v3 ->");
  console.log("Credentials -> Create API key (restrict it to that API). Then restart");
  console.log("the backend (npm start / npm run dev) so it picks the key up.");
}

async function probeKey(key) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 12000) : 0;
  try {
    const u = "https://www.googleapis.com/youtube/v3/channels?part=id&id=" + encodeURIComponent(PROBE_CHANNEL) + "&key=" + encodeURIComponent(key);
    const res = await fetch(u, { headers: { accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true };
    const reason = data && data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason;
    if (res.status === 400) return { ok: false, why: "key rejected (" + (reason || "badRequest") + ") — check for a copy/paste slip" };
    if (res.status === 403) return { ok: false, why: "key rejected (" + (reason || "forbidden") + ") — enable YouTube Data API v3 for it, or lift the wrong restriction" };
    return { ok: false, why: "YouTube answered HTTP " + res.status + " — retry in a minute" };
  } catch (e) {
    const timedOut = e && e.name === "AbortError";
    return { ok: false, why: "could not reach Google (" + (timedOut ? "timeout" : "offline?") + ") — format looks right; retry with network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function upsertEnv(text, value) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  let done = false;
  const out = lines.map((line) => {
    if (/^\s*(export\s+)?YT_API_KEY\s*=/.test(line)) { done = true; return "YT_API_KEY=" + value; }
    return line;
  });
  if (!done) {
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    out.push("YT_API_KEY=" + value);
  }
  return out.join("\n").replace(/\n*$/, "\n");
}

const mode = process.argv[2] || "";
if (mode === "--help" || mode === "-h" || mode === "help") { usage(); process.exit(0); }

if (mode === "--status" || mode === "status" || !mode) {
  const fromEnv = String(process.env.YT_API_KEY || "").trim();
  let fromFile = "";
  try {
    const text = await readFile(path.join(ROOT, ".env"), "utf8").catch(() => "");
    const m = /^\s*(?:export\s+)?YT_API_KEY\s*=\s*(.*?)\s*$/m.exec(text);
    if (m) fromFile = m[1].replace(/^["']|["']$/g, "");
  } catch {}
  const key = fromEnv || fromFile;
  if (KEY_RE.test(key)) {
    console.log("key-status: ON (auto-detect live) — source: " + (fromEnv ? "environment" : ".env file"));
  } else if (key) {
    console.log("key-status: MALFORMED key found (" + (fromEnv ? "environment" : ".env file") + ") — re-run: npm run set-key -- <key>");
    process.exitCode = 1;
  } else {
    console.log("key-status: OFF — Play + Publish still opens the stream; for press-free auto-open run: npm run set-key -- <YT_API_KEY>");
  }
  process.exit(process.exitCode || 0);
}

const key = mode.trim();
if (!KEY_RE.test(key)) {
  console.error("set-key: that does not look like a YouTube API key (want AIza... 39 chars).");
  usage();
  process.exit(1);
}
console.log("set-key: format ok — asking YouTube (1 quota unit)...");
const verdict = await probeKey(key);
if (!verdict.ok) {
  console.error("set-key: " + verdict.why);
  process.exit(1);
}
const envPath = path.join(ROOT, ".env");
const prev = await readFile(envPath, "utf8").catch(() => "");
await writeFile(envPath, upsertEnv(prev, key));
console.log("set-key: key live and saved to .env — restart the backend to pick it up.");
