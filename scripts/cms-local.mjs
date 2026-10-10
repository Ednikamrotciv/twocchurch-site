import vm from "node:vm";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { recordSeen } from "./backup-data.mjs";
import { notePublished } from "./auto-push.mjs";

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

export async function createCmsHost(rootDir) {
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
  /* Which update this folder's code carries (fix 301b, ported to 302): the
     server holds a shipped stamp below it on the first boot of new code, so a
     stamp that rode in with the deploy can never release the build it ships
     with — and every content answer names the running update so older tabs
     reload onto the deploy by themselves (note 302b). */
  let srcNotes = 0;
  try {
    const hooksSrc = await readFile(path.join(rootDir, "src", "lib", "hooks.ts"), "utf8");
    srcNotes = Number((hooksSrc.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  } catch { /* stamp unreadable — the hold below sleeps, as before */ }
  const versionPath = path.join(dataDir, "cms-version.txt");
  let prevHash = "";
  let prevNotes = 0;
  let prevKnown = false;
  try {
    const rawVer = (await readFile(versionPath, "utf8")).trim();
    try {
      const pv = JSON.parse(rawVer);
      if (pv && typeof pv.hash === "string") {
        prevHash = pv.hash;
        prevNotes = Number(pv.notes) || 0;
        prevKnown = true;
      } else {
        prevHash = rawVer;
      }
    } catch {
      prevHash = rawVer;
    }
  } catch { /* first run */ }
  /* New code = a new server script, a new update number, a first run, or a
     marker from before update numbers were tracked (one hold check, then the
     new marker format makes later boots stable). Same script + same update =
     a restart, which keeps everything. */
  const newCode = !prevHash || prevHash !== scriptHash || (srcNotes > 0 && (!prevKnown || prevNotes !== srcNotes));
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
    await writeFile(versionPath, JSON.stringify({ hash: scriptHash, notes: srcNotes }) + "\n");
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
  const sandbox = { state, pubsub, self: selfObj, console, __WOM_NEW_CODE: newCode, __WOM_RUNNING_NOTES: srcNotes };
  vm.createContext(sandbox);
  vm.runInContext(scriptSrc, sandbox, { filename: "cms-server.js" });
  const rpc = selfObj.rpc || {};
  console.log(`cms backend: running the site's own server code (${Object.keys(rpc).length} rpc methods)`);

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
