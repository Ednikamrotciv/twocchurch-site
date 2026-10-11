/* verify-update.mjs — the pre-ship gate (note 293).
   The maintenance notice kept going missing on updates because a blessing
   leaked through the baked seed / the fallback / the auto-heal, opening new
   code with no office review. The invariants below lock the fail-safe rule:
   NOTHING blesses a copy except an explicit office action (publish, undo
   click, bless, offline flush) on its own server, a feed answer, or the local
   bless click. Section K (note 307) locks the local → live chain: dev
   restore/delete doors, loud bake failures, big-file push hints. Run this
   before EVERY update zip — a single FAIL blocks the
   ship, no exceptions.
   RUN (paste the two lines into an execute_js call):
     const m = await import(URL.createObjectURL(new Blob(
       [await fs.readTextFile("src/tools/verify-update.mjs")])));
     return await m.runAll({ read: (p) => fs.readTextFile(p) });
   Needs network (esbuild-wasm from esm.sh). Site code must NEVER import this
   module — it pulls a compiler and runs suites. */

const FILES = [
  ["scripts/cms-server.js", "js"],
  ["scripts/seed-fallback.mjs", "js"],
  ["src/lib/cms.ts", "ts"],
  ["src/components/editor.tsx", "tsx"],
  ["src/lib/hooks.ts", "ts"],
  ["src/data/photos.ts", "ts"],
  ["src/lib/cmsSchema.ts", "ts"],
  ["src/lib/jobs.ts", "ts"],
  ["src/lib/pageMap.ts", "ts"],
  ["src/components/layout.tsx", "tsx"],
  ["src/App.tsx", "tsx"],
  ["scripts/build-static.mjs", "js"],
  ["scripts/serve.mjs", "js"],
  ["scripts/vite-cms-backend.mjs", "js"],
  ["scripts/bake-seed.mjs", "js"],
  ["scripts/auto-push.mjs", "js"],
  ["index.html", null],
  ["src/styles/admin.css", null],
  ["APPLY_UPDATE.txt", null],
];

function has(src, needle) {
  return src.indexOf(needle) !== -1;
}

function loadVm(code, state, pub) {
  const fn = new Function("state", "self", "pubsub", "console", code + "\nreturn self.rpc;");
  const self = {};
  return fn(state, self, { publish: pub || function () {} }, console);
}

function stubAuth(code) {
  return code
    .replace(
      'publish: function (info, raw) {\n    if (!admins.has(info.conn.id)) return fail("unauthorized");',
      'publish: function (info, raw) {\n    if (false) return fail("unauthorized");'
    )
    .replace(
      'undoPublish: function (info, raw) {\n    if (!admins.has(info.conn.id)) return fail("unauthorized");',
      'undoPublish: function (info, raw) {\n    if (false) return fail("unauthorized");'
    );
}

export async function runAll(fs) {
  const out = [];
  const ok = (name, cond, extra) => out.push((cond ? "OK " : "FAIL ") + name + (cond || !extra ? "" : " — " + extra));
  const text = {};
  for (const [p] of FILES) text[p] = await fs.read(p);

  /* A. every touched file still parses. */
  try {
    const { default: esbuild } = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    await esbuild.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    for (const [p, loader] of FILES) {
      if (!loader) continue; // read-only invariant source, not code
      try {
        await esbuild.transform(text[p], { loader });
        ok("parse " + p, true);
      } catch (e) {
        ok("parse " + p, false, String((e && e.message) || e).slice(0, 160));
      }
    }
  } catch (e) {
    ok("esbuild available", false, String((e && e.message) || e).slice(0, 160));
  }

  /* B. seed fallback: words yes, blessing never (note 293). */
  try {
    const mod = await import(
      URL.createObjectURL(new Blob([text["scripts/seed-fallback.mjs"]], { type: "text/javascript" }))
    );
    const liveEmpty = JSON.stringify({ ok: true, rev: 0, at: 0, by: "", notes: 0, sections: "{}", log: [], admin: false, pwgen: 3 });
    const seed = { rev: 12, notes: 291, sections: { services: [{ a: 1 }], live: { b: 2 } } };
    const r = JSON.parse(mod.fallbackGetContent(liveEmpty, seed));
    ok("fallback seeds words", r.seeded === true && r.rev === 12 && r.pwgen === 3 && JSON.parse(r.sections).live.b === 2);
    ok("fallback recovers the bake stamp (note 300)", r.notes === 291, "notes=" + r.notes);
    const seed0 = { rev: 5, notes: 0, sections: { services: [{ a: 1 }] } };
    const r0 = JSON.parse(mod.fallbackGetContent(liveEmpty, seed0));
    ok("fallback invents no stamp", r0.notes === 0 && r0.seeded === true, "notes=" + r0.notes);
    const liveFull = JSON.stringify({ ok: true, rev: 15, sections: JSON.stringify({ x: [1] }), pwgen: 3 });
    ok("fallback leaves live answers alone", mod.fallbackGetContent(liveFull, seed) === liveFull);
    ok("fallback leaves failures alone", mod.fallbackGetContent(JSON.stringify({ ok: false }), seed) === JSON.stringify({ ok: false }));
    ok("fallback leaves garbage alone", mod.fallbackGetContent("not json", seed) === "not json");
    ok("fallback needs a real seed", mod.fallbackGetContent(liveEmpty, { rev: 0, notes: 0, sections: {} }) === liveEmpty && mod.fallbackGetContent(liveEmpty, null) === liveEmpty);
    ok("fallback is getContent-only", (await mod.answerWithSeedFallback("publish", liveEmpty, "/", "/")) === liveEmpty);
  } catch (e) {
    ok("fallback suite", false, String((e && e.message) || e).slice(0, 200));
  }

  /* C. content-server VM: publish replaces, one ~15-min undo, then gone. */
  try {
    const serverSrc = text["scripts/cms-server.js"];
    const stubbed = stubAuth(serverSrc);
    ok("vm test seam stubs both guards", stubbed !== serverSrc);
    const conn = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pub = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 291, ...(extra || {}) })));
    const get = (rpc) => JSON.parse(rpc.getContent({ conn }, ""));
    const state = new Uint8Array(8 * 1024 * 1024);
    const rpc = loadVm(stubbed, state);
    const r1 = pub(rpc, { home: JSON.stringify({ title: "A" }), live: JSON.stringify({ on: true }) }, { first: true });
    ok("vm publish rev1", r1.ok && r1.rev === 1);
    ok("vm first-on-empty arms no undo", get(rpc).undoLeft === 0);
    const rb1 = pub(rpc, { home: JSON.stringify({ title: "B" }) }, { first: true, quiet: true });
    const rb2 = pub(rpc, { live: JSON.stringify({ on: false }) }, { quiet: false });
    ok("vm multi-batch publish", rb1.ok && rb2.ok);
    const g2 = get(rpc);
    ok("vm second publish arms ~900s", g2.undoLeft > 870 && g2.undoLeft <= 900, "undoLeft=" + g2.undoLeft);
    const u1 = JSON.parse(rpc.undoPublish({ conn }, JSON.stringify({ by: "office" })));
    const g3 = get(rpc);
    const s3 = JSON.parse(g3.sections);
    ok("vm undo restores whole pre-publish set", u1.ok && s3.home.title === "A" && s3.live.on === true);
    ok("vm undo consumes the window", g3.undoLeft === 0);
    const u2 = JSON.parse(rpc.undoPublish({ conn }, ""));
    ok("vm second undo expired", !u2.ok && u2.err === "expired");
    /* exactness: ids the previous publish never held leave with the current one. */
    pub(rpc, { home: JSON.stringify({ title: "C" }) }, { first: true });
    pub(rpc, { home: JSON.stringify({ title: "D" }), extra: JSON.stringify({ n: 1 }) }, { first: true });
    JSON.parse(rpc.undoPublish({ conn }, ""));
    const sx = JSON.parse(get(rpc).sections);
    ok("vm undo is exact, not a merge", sx.home.title === "C" && !("extra" in sx));
    /* expiry by time travel, then persistence across reboot. */
    pub(rpc, { home: JSON.stringify({ title: "E" }) }, { first: true });
    const realNow = Date.now();
    try {
      Date.now = () => realNow + 16 * 60 * 1000;
      ok("vm window expires (~16 min)", get(rpc).undoLeft === 0);
      const ue = JSON.parse(rpc.undoPublish({ conn }, ""));
      ok("vm undo after expiry refused", !ue.ok && ue.err === "expired");
    } finally {
      Date.now = () => realNow;
    }
    pub(rpc, { home: JSON.stringify({ title: "F" }) }, { first: true });
    const rpc2 = loadVm(stubbed, state);
    ok("vm undo survives reboot", JSON.parse(rpc2.getContent({ conn }, "")).undoLeft > 870);
    const b = JSON.parse(rpc.publish({ conn }, JSON.stringify({ sections: {}, by: "office", changed: [], notes: 291 })));
    ok("vm bless preserves armed undo", b.ok && get(rpc).undoLeft > 0);
    const rpcB = loadVm(stubbed, new Uint8Array(8 * 1024 * 1024));
    JSON.parse(rpcB.publish({ conn }, JSON.stringify({ sections: {}, by: "office", changed: [], notes: 291 })));
    ok("vm bless on empty arms nothing", JSON.parse(rpcB.getContent({ conn }, "")).undoLeft === 0);
    const rpc3 = loadVm(stubbed, new Uint8Array(8 * 1024 * 1024));
    pub(rpc3, { home: JSON.stringify({ title: "G" }) });
    ok("vm publish without first arms nothing", get(rpc3).undoLeft === 0);
    /* pristine guards. */
    const pristine = loadVm(serverSrc, new Uint8Array(8 * 1024 * 1024));
    const anon = { id: "anon" };
    const up = JSON.parse(pristine.undoPublish({ conn: anon }, ""));
    const pp = JSON.parse(pristine.publish({ conn: anon }, JSON.stringify({ sections: {}, changed: [], notes: 0 })));
    ok("vm auth guards intact", !up.ok && up.err === "unauthorized" && !pp.ok);
    /* old images (no prev in meta) load fine. */
    const oldState = new Uint8Array(8 * 1024 * 1024);
    const rpcO = loadVm(stubbed, oldState);
    JSON.parse(rpcO.publish({ conn }, JSON.stringify({ sections: { home: JSON.stringify({ t: 1 }) }, by: "o", changed: ["home"], notes: 1 })));
    {
      const dv = new DataView(oldState.buffer);
      const metaChars = dv.getUint32(14, false);
      const secChars = dv.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(oldState.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.prev;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dv.setUint32(14, nm.length, false);
    }
    const rpcO2 = loadVm(stubbed, oldState);
    const gg = JSON.parse(rpcO2.getContent({ conn }, ""));
    ok("vm old-image compat", gg.ok && gg.undoLeft === 0 && JSON.parse(gg.sections).home.t === 1);
  } catch (e) {
    ok("vm suite", false, String((e && e.message) || e).slice(0, 200));
  }

  /* D. blessing invariants — the maintenance gate's fail-safe (note 293). */
  const cms = text["src/lib/cms.ts"];
  ok("seed records evidence raise-only", has(cms, "setPublishedNotes((seed as any).notes)"), "applySeedOnce must raise from the bake, never assign");
  ok("seed hold gated on new code", has(cms, "if (!ranThisBuild) setPublishedNotes(BUILD_NOTES - 1);"), "hold must not manufacture on a build the browser already ran");
  ok("heal never blesses", has(cms, "sendPatch(sections, ids, why, false)"));
  ok("publish path carries bless flag", has(cms, "notes: bless ? BUILD_NOTES : 0"));
  ok("undo batch marked first", has(cms, "first: b === 0"));
  ok("undo countdown exported", has(cms, "export function undoCountdownSec"));
  ok("canUndo covers server window", has(cms, "undoCountdownSec() > 0"));
  ok("close keeps the session", !has(cms, "socket = null;\n  authed = false;"), "onClose still signs out on every drop");
  ok("denial-only session burn", has(cms, 'if (!res.ok && res.error === "denied") clearSession()'));
  /* E. sign-out keeps last-published (note 297): a changed/retired password
     still signs tabs out at login, publish and undo — but the session drop
     must never clear held words, queues or the publish stamp. Only a new
     update's first boot or an explicit office delete may clear them. */
  const clearAt = cms.indexOf("function clearSession()");
  const clearBody = clearAt >= 0 ? cms.slice(clearAt, clearAt + 1200) : "";
  ok("sign-out keeps words", clearAt >= 0 && has(clearBody, "SESSION_KEY") && has(clearBody, "PWROLE_KEY") && !has(clearBody, "CACHE_KEY") && !has(clearBody, "PENDING_KEY") && !has(clearBody, "NOTES_KEY") && !has(clearBody, "overrides") && !has(clearBody, "publishedNotes") && !has(clearBody, "writeJSON") && !has(clearBody, "applyOverrides"), "clearSession touches stored words");
  ok("sign-out drops role", has(clearBody, "myRole = null") && has(clearBody, 'myName = ""'));
  const deniedSignouts = cms.split('error === "denied") clearSession()').length - 1;
  ok("publish denied signs out", deniedSignouts >= 4, "found " + deniedSignouts);
  const unauthSignouts = cms.split('err === "unauthorized") clearSession()').length - 1;
  ok("server denied signs out", unauthSignouts >= 2, "found " + unauthSignouts);
  const fb = text["scripts/seed-fallback.mjs"];
  ok("fallback recovers bake stamp", has(fb, "out.notes = good.notes") && !has(fb, "out.notes = 0"));

  const srv = text["scripts/cms-server.js"];
  ok("server undo rpc exists", has(srv, "undoPublish: function (info, raw)"));
  ok(
    "server undo rpc guarded",
    has(srv, "undoPublish: function (info, raw) {\n    if (!admins.has(info.conn.id)) return fail(\"unauthorized\");")
  );
  ok("server reports undo window", has(srv, "undoLeft: left") || has(srv, "undoLeft:"));
  const ed = text["src/components/editor.tsx"];
  ok("tools card counts down", has(ed, "undoCountdownSec()") && has(ed, "Nothing to undo"));
  /* F. office removals (note 298): the Main-photos section is gone from the
     drawer (the site shows its original photos), and announcement slides
     take pictures only. */
  const ph = text["src/data/photos.ts"];
  const sc = text["src/lib/cmsSchema.ts"];
  const jb = text["src/lib/jobs.ts"];
  const pm = text["src/lib/pageMap.ts"];
  ok("main photos section gone", !has(ph, '"Main photos"') && !has(sc, '"Main photos"') && !has(jb, "photos-main") && !has(pm, "photos-main"));
  ok("slide upload pictures only", !has(ed, "isVideoFile") && has(ed, "Upload a picture") && !has(ed, "Upload a picture or video") && !has(ed, "photo or video link"));
  ok("slide copy pictures only", has(sc, "Upload a picture and it becomes") && !has(sc, "picture or a video"));
  /* Upload previews can never tear or shift (photo #302/#303 fix): the image
     fills its frame by absolute positioning on phone and desktop, video
     previews the same, and a dead address falls back to the placeholder. */
  const previewCss = text["src/styles/admin.css"];
  ok("upload previews fill unbreakably", has(previewCss, ".admin__imagepreview img") && has(previewCss, "position: absolute") && has(previewCss, "object-fit: cover"), "a shifted/torn photo must be impossible by construction");
  ok("video previews fill unbreakably", has(previewCss, ".admin__videopreview video") && has(previewCss, "position: absolute"));
  ok("dead uploads fall back to placeholder", has(ed, "imgError") && has(ed, "onError={() => setImgError(true)}"), "a dead address must show the camera, never a torn frame");
  /* G. last-published survives without a new update (note 300): the site went
     back to update-mode and looked fresh with no new update because the boot
     manufactured a hold stamp, skipped the cached paint on unproven codegen,
     wiped the stamp on storage errors, and the server forgot its stamp on
     restart. None of those may come back. */
  ok("no manufactured hold stamp", !has(cms, "if (publishedNotes < BUILD_NOTES && serverInvolved())"), "the forced BUILD_NOTES-1 boot write is back");
  ok("boot never zeroes the stamp", has(cms, "Raise-only, never wipe (note 300)"), "a storage failure must keep the in-memory stamp");
  ok("proven-new codegen gate", has(cms, "function storedCodegenProvesNewUpdate()") && has(cms, "const freshEyes = storedCodegenProvesNewUpdate();"), "only a stored codegen that exists and differs is a new update");
  ok("cache carries its publish update", has(cms, "function writeCache()") && has(cms, "notes: publishedNotes") && !has(cms, "writeJSON(CACHE_KEY, { rev, overrides })"), "every cache write must stamp its update");
  ok("cache stamp adopted as evidence", has(cms, 'typeof cached.notes === "number") setPublishedNotes(cached.notes)'), "a returning copy stays on its last publish");
  ok("offline flush blesses", has(cms, "An offline flush is a deliberate office publish"), "flushPending must move the stamp like any publish");
  /* H. maintenance can never vanish again (note 301): a corrupt stamp waits,
     seed immunity is pre-bake memory, blank answers never bless, a new history
     generation is unreviewed, and the notice keeps its update line + office doors. */
  ok("corrupt stamp waits", (cms.split("corrupt stamp is unreviewed").length - 1) >= 2, "gates must sanitize the stamp");
  ok("seed immunity pre-bake", cms.indexOf("const seenBefore = readJSON<number>(NOTES_KEY, 0);") < cms.indexOf("setPublishedNotes((seed as any).notes)"), "seenBefore must be read before the bake lands");
  ok("blank never blesses", has(cms, "a blank answer can never bless"), "empty server answers must run before the stamp");
  ok("new generation unreviewed", has(srv, "NOTES = 0; // note 301"), "history generation change must reset the publish stamp");
  const layout = text["src/components/layout.tsx"];
  const maintBlock = layout.slice(layout.indexOf("export function MaintenanceSite()"), layout.indexOf("export function PageHead("));
  ok("notice stays bare", maintBlock.length > 100 && !has(maintBlock, "maint__update") && !has(maintBlock, "Preview the new site") && !has(maintBlock, "Open the admin console") && has(maintBlock, "right back"), "office wants logo + message only, no update line or links");
  /* I. no hard refresh ever again (note 302): after an update a NORMAL reload
     must land visitors on the maintenance notice until the office publishes.
     The one-shot stale guard trapped tabs on the old bundle (Ctrl+Shift+R to
     escape); a cached version.json / index.html hid the update entirely; and
     the app painted live before the version check settled. */
  const app = text["src/App.tsx"];
  const html = text["index.html"];
  const staticBuild = text["scripts/build-static.mjs"];
  const serve = text["scripts/serve.mjs"];
  const backend = text["scripts/vite-cms-backend.mjs"];
  ok("stale reload retried, never one-shot", has(cms, "STALE_MAX_TRIES") && !has(cms, "sessionStorage.getItem(STALE_RELOAD_KEY) === String"), "the one-shot guard traps tabs on old code");
  ok("stale fetch cache-busted", has(cms, '"t=" + Date.now()'), "version.json must bypass every cache");
  ok("stale bundle waits, never plays live", has(cms, "staleNewerNotes > BUILD_NOTES"), "old code must show maintenance once an update is known");
  ok("stale gate exported", has(cms, "export function useStaleBuild()"));
  ok("app holds splash for the version check", has(app, "useStaleBuild()") && has(app, "!stale.settled"), "live must not paint before the check settles");
  ok("app waits while stale", has(app, "stale.waiting || maintenance"));
  ok("app re-checks while open", has(app, "setInterval") && has(app, "checkStaleBuild"));
  ok("pre-bundle gate in the entry page", has(html, "wom.cms.notes") && has(html, "/version.json?t=") && has(html, "right back"), "the notice must paint before React boots");
  ok("entry gate yields to preview", has(html, 'q.get("preview") === "1"'), "the office preview must bypass the early notice");
  ok("entry gate never touches admin", has(html, 'ap === "/admin"'), "the notice belongs to the visitors' site only");
  ok("static hosts never cache the entry", has(staticBuild, "_headers") && has(staticBuild, ".htaccess") && has(staticBuild, "no-store, must-revalidate"));
  ok("server never caches the stamp", has(serve, 'base === "version.json"'), "a cached version.json hides the update");
  ok("dev bake keeps the stamp", has(backend, "notes, sections"), "a notes-less seed holds a published deploy on maintenance");
  /* J. free-host sleep is harmless (note 303): Render's free tier wipes the
     live store on every sleep, which used to clear the admin publish
     (sections, stamp AND history) so the site looked like a new update until
     the office published again. The bake now carries the publish history
     with the stamp, and the fallback serves all of it — a wake re-serves the
     last publish with its history, no office action needed. */
  const bake = text["scripts/bake-seed.mjs"];
  ok("bake carries the history", has(bake, "note 303") && has(bake, "log, by, at"), "a stamp-only bake clears Last published on every wake");
  ok("dev bake carries the history", has(backend, "note 303"));
  ok("fallback serves the history", has(fb, "out.log = good.log"), "words without history still clear Last published");
  try {
    const modJ = await import(
      URL.createObjectURL(new Blob([text["scripts/seed-fallback.mjs"]], { type: "text/javascript" }))
    );
    const wiped = JSON.stringify({ ok: true, rev: 0, at: 0, by: "", notes: 0, sections: "{}", log: [], admin: false, pwgen: 3 });
    const baked = {
      rev: 15,
      notes: 307,
      sections: { home: JSON.stringify({ title: "Live words" }) },
      log: [{ rev: 15, at: 1700000000000, by: "office", note: "Sunday update", changed: ["home"] }],
      by: "office",
      at: 1700000000000,
    };
    const w = JSON.parse(modJ.fallbackGetContent(wiped, baked));
    ok("wake re-serves words+stamp+history", w.seeded === true && w.rev === 15 && w.notes === 307 && JSON.parse(JSON.parse(w.sections).home).title === "Live words" && w.log.length === 1 && w.log[0].note === "Sunday update" && w.by === "office" && w.at === 1700000000000, "a wake must restore the whole publish");
    const bare = JSON.parse(modJ.fallbackGetContent(wiped, { rev: 4, notes: 0, sections: { home: JSON.stringify({ t: 1 }) } }));
    ok("history-less bake stays safe", bare.seeded === true && Array.isArray(bare.log) && bare.log.length === 0 && bare.by === "" && bare.at === 0);
    const liveFull = JSON.stringify({ ok: true, rev: 16, at: 1, by: "office", notes: 307, sections: JSON.stringify({ home: JSON.stringify({ title: "Newer" }) }), log: [{ rev: 16 }], admin: false, pwgen: 3 });
    const lf = JSON.parse(modJ.fallbackGetContent(liveFull, baked));
    ok("fallback leaves a live store alone", lf.sections !== undefined && JSON.parse(JSON.parse(lf.sections).home).title === "Newer" && lf.seeded !== true, "a healthy store must never be overlaid");
  } catch (e) {
    ok("wake suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* K. local publish reaches live with everything (note 307): the dev backend
     must accept backup restores and photo deletes like the office server
     (otherwise a live backup restored on local loses its uploads), and a
     failed bake must say why instead of failing silently (a silent stale bake
     is how every sleep brought maintenance back). */
  const devBackend = text["scripts/vite-cms-backend.mjs"];
  const push = text["scripts/auto-push.mjs"];
  const seedBaker = text["scripts/bake-seed.mjs"];
  ok("dev restores embedded uploads", has(devBackend, '"/__restore-file"') && has(devBackend, "restored: true"), "a live backup restored on local must bring its photos/videos home");
  ok("dev deletes office uploads", has(devBackend, '"/__delete-file"') && has(devBackend, "deleted: true"), "the office photo delete must work on local too");
  ok("dev restore guards names", has(devBackend, "bad name"), "foreign file names must be refused on local like on live");
  ok("bake uses the running node", has(push, "process.execPath"), "a bare 'node' can miss PATH and fail every bake");
  ok("bake failure says why", has(push, "bake said:") && has(push, "npm run bake-seed"), "a silent bake failure leaves the live bake stale with no hint");
  ok("push failure names big files", has(push, "100 MB") && has(push, "data/uploads/"), "a video over the host limit looks exactly like a login failure");
  ok("bake CLI fails loudly", has(seedBaker, "bake-seed failed:") && has(seedBaker, "previous seed.json was kept"), "bake must never wipe a good seed on the way out");
  const notes = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  const apply = text["APPLY_UPDATE.txt"];
  ok("update number consistent", notes > 0 && has(apply, `APPLY THIS UPDATE (${notes})`), "hooks=" + notes);
  return out.join("\n");
}
