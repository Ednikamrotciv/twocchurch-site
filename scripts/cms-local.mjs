import vm from "node:vm";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { recordSeen } from "./backup-data.mjs";
import { notePublished } from "./auto-push.mjs";
import { DEFAULT_LIVE_ORIGIN, pickLiveOrigin, shouldAdoptLive, adoptPatch } from "./live-follow.mjs";

const STATE_SIZE = 8 * 1024 * 1024;

function hashText(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdead;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export { hashText };
/* Surgically forget the publish log inside a content-server state image while
   keeping every published section, the revision and the admin roster. True
   when the image was valid (even when there was no history to forget). */
function clearPublishLog(state, scriptSrc) {
  try {
    const gen = /var LOG_GEN\s*=\s*(\d+)/.exec(String(scriptSrc));
    const stamp = gen ? Number(gen[1]) : 2;
    const headerLen = 34 + 64 * 48;
    if (state.length < headerLen) return false;
    const dv = new DataView(state.buffer, state.byteOffset, state.byteLength);
    if (state[0] !== 0xc7 || state[1] !== 2) return true;
    const metaChars = dv.getUint32(14, false);
    const sectionChars = dv.getUint32(26, false);
    const base = headerLen / 2;
    if ((base + sectionChars + metaChars) * 2 > state.length) return false;
    const at = (base + sectionChars) * 2;
    const parsed = JSON.parse(Buffer.from(state.buffer, state.byteOffset + at, metaChars * 2).toString("utf16le"));
    /* Already on this generation: a later code change must never touch the
       record again — only an admin's publish writes history. */
    if (parsed && parsed.logGen === stamp) return true;
    parsed.log = [];
    parsed.logGen = stamp;
    parsed.by = "";
    const fresh = Buffer.from(JSON.stringify(parsed), "utf16le");
    if (at + fresh.length > state.length) return false;
    Buffer.from(state.buffer, state.byteOffset + at, fresh.length).set(fresh);
    dv.setUint32(14, fresh.length / 2, false);
    dv.setUint32(2, 0, false);
    dv.setFloat64(6, 0, false);
    return true;
  } catch {
    return false;
  }
}

export async function createCmsHost(rootDir, opts) {
  /* The site's own content server (sign-in, publishing, uploads, live
     updates): one plain code file, run here in Node for `npm run dev` and
     `npm start` alike. */
  const scriptSrc = await readFile(path.join(rootDir, "scripts", "cms-server.js"), "utf8");
  if (!scriptSrc.trim()) throw new Error("cms-local: scripts/cms-server.js is empty");

  const dataDir = path.join(rootDir, "data");
  await mkdir(dataDir, { recursive: true });

  /* The shipped code is the original state: when it changes (a fresh extract),
     the publish history is cleared while every published section is kept, so
     nothing old can override the new code yet no content is lost.
     Same-version restarts keep everything. */
  const scriptHash = hashText(scriptSrc);
  const versionPath = path.join(dataDir, "cms-version.txt");
  let prevHash = "";
  try {
    prevHash = (await readFile(versionPath, "utf8")).trim();
  } catch { /* first run */ }
  const statePath = path.join(dataDir, "cms-state.bin");
  const state = new Uint8Array(STATE_SIZE);
  let saveTimer = null;
  let saving = false;
  let dirtyAgain = false;
  try {
    const prev = await readFile(statePath);
    state.set(prev.subarray(0, Math.min(prev.length, STATE_SIZE)));
    if (prev.length) console.log(`cms backend: loaded ${prev.length} bytes from data/cms-state.bin`);
  } catch {
    console.log("cms backend: fresh state (data/cms-state.bin will be created on first publish)");
  }
  if (prevHash && prevHash !== scriptHash) {
    if (clearPublishLog(state, scriptSrc)) {
      console.log("cms backend: new code version — publish history cleared, content kept");
      saveSoon();
    } else {
      console.log("cms backend: new code version — local content reset to the shipped state");
      state.fill(0);
    }
  }
  try {
    await writeFile(versionPath, scriptHash + "\n");
  } catch { /* best-effort */ }

  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (saving) {
        dirtyAgain = true;
        return;
      }
      saving = true;
      try {
        await writeFile(statePath, state);
        /* Fingerprint every store this folder's own server writes, so the
           boot guard can tell our bytes from a zip's (see backup-data.mjs). */
        try {
          const sum = createHash("sha256").update(state).digest("hex").slice(0, 16);
          await recordSeen(rootDir, sum);
        } catch { /* fingerprinting never breaks a save */ }
        /* The new words deploy themselves a couple of minutes later
           (see auto-push.mjs) — never blocks or breaks the save. */
        try {
          notePublished(rootDir);
        } catch { /* auto-deploy never breaks a save */ }
      } catch (err) {
        console.error("cms backend: could not save state:", err?.message || err);
      }
      saving = false;
      if (dirtyAgain) {
        dirtyAgain = false;
        saveSoon();
      }
    }, 150);
  }

  const senders = new Map();
  const conns = new Map();

  function getConn(id) {
    let c = conns.get(id);
    if (!c) {
      if (conns.size > 1000) conns.delete(conns.keys().next().value);
      const topics = new Set();
      c = {
        id,
        net: ["local", 0, 0],
        subscribe: (t) => {
          topics.add(String(t));
        },
        topics,
      };
      conns.set(id, c);
    }
    return c;
  }

  const pubsub = {
    publish(topic, msg) {
      const text = String(msg);
      const t = String(topic);
      for (const [id, sender] of senders) {
        const conn = conns.get(id);
        if (conn && conn.topics.has(t)) {
          try {
            sender(text);
          } catch { /* a dead tab is harmless */ }
        }
      }
    },
  };

  const selfObj = {};
  const sandbox = { state, pubsub, self: selfObj, console };
  vm.createContext(sandbox);
  /* Live-follow token (note 343): minted fresh on every boot, handed to the
     server code through `self` — only this process's own minute loop below
     ever learns it (see the adoptLive rpc in cms-server.js). */
  const adoptToken = "adopt-" + createHash("sha256").update(String(Date.now()) + ":" + String(Math.random()) + ":" + String(process.pid || 0)).digest("hex");
  vm.runInContext(scriptSrc + "\nself.__adoptToken = " + JSON.stringify(adoptToken) + ";", sandbox, { filename: "cms-server.js" });
  const rpc = selfObj.rpc || {};
  console.log(`cms backend: running the site's own server code (${Object.keys(rpc).length} rpc methods)`);
  /* A publish tapped on live/admin reaches this copy by itself (note 343):
     about once a minute the loop reads the live site's published words and
     adopts them when strictly newer — with no browser tab open. The adopted
     save rides the normal auto-deploy out (bake, git push, redeploy), so a
     live publish becomes sleep-proof within minutes. Never on the live box
     itself (RENDER=true — it IS live), never without fetch, never across a
     newer update, never from a fallback bake onto used words (see
     live-follow.mjs). A missed round is harmless: the next minute retries,
     and any signed-in office tab pulls the same way in between. */
  /* The minute loop is a SERVING process's job (note 377): `npm start` and
     `npm run dev` opt in below. One-shot users of this host (bake-seed,
     bake-recent — and through them every static-host build) must never start
     it: its minute timer kept build processes alive forever, which is exactly
     how a Vercel deploy got stuck mid-build. */
  if (opts && opts.follow) {
    try {
      startLiveFollow({ rootDir, rpcCall: call, adoptToken });
    } catch (err) {
      console.warn("live follow skipped:", err?.message || err);
    }
  }

  function openConn(id) {
    const conn = getConn(id);
    try {
      if (typeof selfObj.onopen === "function") selfObj.onopen({ conn });
    } catch (err) {
      console.error("cms backend onopen:", err?.message || err);
    }
    return conn;
  }

  function closeConn(id) {
    const conn = conns.get(id);
    if (!conn) return;
    try {
      if (typeof selfObj.onclose === "function") selfObj.onclose({ conn });
    } catch { /* best-effort */ }
  }

  async function call(method, id, raw) {
    const fn = rpc[method];
    if (typeof fn !== "function") {
      return { status: 404, body: JSON.stringify({ ok: false, err: "unknown-method" }) };
    }
    const conn = getConn(id);
    let out;
    try {
      out = await fn({ conn }, raw);
    } catch (err) {
      console.error(`cms backend rpc ${method}:`, err?.message || err);
      return { status: 500, body: JSON.stringify({ ok: false, err: "error" }) };
    }
    saveSoon();
    /* A publish moves the words — the recents follow the channel on the same
       cycle (note 345): without this the new channel's services took up to
       the 20-minute loop plus a deploy to appear. Only real publishes
       (never reads) schedule it, debounced well past the auto-push delay so
       words and recents ride one commit. */
    try {
      if (method === "publish" || method === "adoptLive" || method === "undoPublish") noteRecentsDirty(rootDir);
    } catch {
      /* the publish itself already landed */
    }
    return { status: 200, body: typeof out === "string" ? out : JSON.stringify(out === undefined ? { ok: true } : out) };
  }

  function attachSender(id, send) {
    senders.set(id, send);
  }

  function detachSender(id) {
    senders.delete(id);
  }

  return { openConn, closeConn, attachSender, detachSender, call };
}

/* This folder's own update number (BUILD_NOTES in src/lib/hooks.ts) — the
   follow never adopts across a newer update. Read fresh each round: the
   folder can be re-extracted under a running server. */
async function folderBuildNotes(rootDir) {
  try {
    const src = await readFile(path.join(rootDir, "src", "lib", "hooks.ts"), "utf8");
    return Number((src.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  } catch {
    return 0;
  }
}

/* The office backend's minute loop (note 343): read the live site's
   published words, adopt them when strictly newer. All decisions in
   live-follow.mjs; this only moves bytes. Never throws out. */
const FOLLOW_MS = 60 * 1000;
let followStarted = false;
function startLiveFollow({ rootDir, rpcCall, adoptToken }) {
  if (followStarted) return;
  followStarted = true;
  if (process.env.RENDER) return; // the live box IS live — never follows
  if (typeof fetch !== "function") {
    console.log("live follow off (no fetch in this Node)");
    return;
  }
  let running = false;
  const round = async () => {
    if (running) return;
    running = true;
    try {
      let fileText = "";
      try {
        fileText = await readFile(path.join(rootDir, "cms-server.txt"), "utf8");
      } catch {
        /* no setup file — the default address answers (note 343) */
      }
      const origin = pickLiveOrigin(fileText) || DEFAULT_LIVE_ORIGIN;
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : 0;
      let live = null;
      try {
        const res = await fetch(origin + "/__cms/getContent?conn=livefollow", {
          method: "POST",
          headers: { "content-type": "text/plain;charset=utf-8" },
          body: "",
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (res.ok) live = await res.json().catch(() => null);
      } catch {
        /* live unreachable (offline, asleep, sleeping DNS) — next minute */
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!live || live.ok !== true) return;
      const here = await rpcCall("getContent", "livefollow", "");
      let local = null;
      try {
        local = JSON.parse(here.body);
      } catch {
        return;
      }
      if (!local || local.ok !== true) return;
      let localSections = {};
      try {
        localSections = local.sections ? JSON.parse(local.sections) : {};
      } catch {
        return;
      }
      const fresh = !localSections || !Object.keys(localSections).length;
      const buildNotes = await folderBuildNotes(rootDir);
      const verdict = shouldAdoptLive(local, live, buildNotes, fresh);
      if (verdict === "newer-update") {
        if (!round.warnedNewer) {
          round.warnedNewer = true;
          console.log(`live follow: the live site is on a newer update — apply it on this copy first`);
        }
        return;
      }
      round.warnedNewer = false;
      if (verdict !== "adopt") return;
      const patch = adoptPatch(live.sections);
      const ids = Object.keys(patch);
      if (!ids.length) return;
      const res = await rpcCall(
        "adoptLive",
        "livefollow",
        JSON.stringify({ token: adoptToken, sections: patch, notes: live.notes, by: typeof live.by === "string" ? live.by : "" })
      );
      let out = null;
      try {
        out = JSON.parse(res.body);
      } catch {
        return;
      }
      if (out && out.ok === true) {
        console.log(`live follow: adopted ${ids.length} section${ids.length === 1 ? "" : "s"} published on live/admin (${ids.slice(0, 4).join(", ")}${ids.length > 4 ? "…" : ""}) — riding auto-deploy out`);
      }
    } finally {
      running = false;
    }
  };
  setTimeout(() => round().catch(() => {}), 20000);
  setInterval(() => round().catch(() => {}), FOLLOW_MS);
}

/* Recents follow the published channel on the same cycle (note 345): after
   a real publish, re-bake the recent-services list from the newly published
   channel, debounced well past the auto-push delay so words and recents
   ride one commit out. Never on the live box (its own 20-minute loop owns
   recents there, and a datacenter read of YouTube is walled anyway). Never
   wipes: bakeRecent keeps the previous list on any failure. Never throws. */
let recentsTimer = null;
function noteRecentsDirty(rootDir) {
  if (process.env.RENDER) return;
  if (recentsTimer) clearTimeout(recentsTimer);
  recentsTimer = setTimeout(async () => {
    recentsTimer = null;
    try {
      const { bakeRecent } = await import("./bake-recent.mjs");
      const r = await bakeRecent(rootDir);
      if (r && r.changed) {
        console.log(`recent services refreshed after publish (${r.count} services from ${r.channelId}) — riding auto-deploy out`);
        notePublished(rootDir);
      }
    } catch (err) {
      console.warn("recent services refresh skipped:", err?.message || err);
    }
  }, 90000);
}
