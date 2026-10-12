/* verify-update.mjs — the pre-ship gate (note 293).   The maintenance notice kept going missing on updates because a blessing
   leaked through the baked seed / the fallback / the auto-heal, opening new
   code with no office review. The invariants below lock the fail-safe rule:
   NOTHING blesses a copy except an explicit office action (publish, undo
   click, bless, offline flush) on its own server, a feed answer, or the local
   bless click. Section K (note 307) locks the local → live chain: dev
   restore/delete doors, loud bake failures, big-file push hints. Section L
   (notes 308–309) locks the other half: live → local sync that refuses newer
   updates, fallback bakes and older-or-tied publishes, never auto-adopts over
   unsaved work, and folds live's newer words into every Publish instead of a
   hand button. Section M (note 310) locks live-at-once: short cadence, urgent
   Watch check, moved-channel re-check on live and local, button re-asks, and
   offline Publish stamping. Section N (note 318) locks the office-reported
   on-air answer: public reads, admin-only writes, strict validation, fresh-
   for-same-target trust on visitors, office-only reporting. Section O (note
   320) locks the pasted-channel cleaning: a doubled "@" or stray spaces can
   never point the site at nothing again. Section P (note 322) locks the
   live follow: the Live tab's video is asked on its watch page before
   anything is called off, on-air chrome is read there, traps stay shut and
   unreadable pages stay unknown. Section Q (note 324) locks verified
   candidates: no bare first-id fallback, ordered suggestions each asked on
   its watch page. Section R (note 328) locks the shipped default: @twocorg in
   the code default and in the fallback bake's words and recents. Section S
   (note 330) locks the walled-but-on-air channel follow: the owner's id with
   a clear margin or nothing, chrome with no verifiable video plays the
   channel (never a guessed video, never off), the player embeds the running
   broadcast, and the office report carries the channel id. Section T (note 332) locks the dead-video net (oEmbed verdict before play, fallback with a way out, gated autoplay), same-update office reports, the shipped maintenance hold, and the fresh @twocorg recents bake. Run this
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
  ["src/lib/livestatus.ts", "ts"],
  ["src/lib/embed.ts", "ts"],
  ["src/lib/recentstreams.ts", "ts"],
  ["src/pages/WatchLive.tsx", "tsx"],
  ["src/App.tsx", "tsx"],
  ["src/components/editor.tsx", "tsx"],
  ["src/lib/hooks.ts", "ts"],
  ["src/data/photos.ts", "ts"],
  ["src/lib/cmsSchema.ts", "ts"],
  ["src/data/live.ts", "ts"],
  ["seed.json", null],
  ["src/lib/jobs.ts", "ts"],
  ["src/lib/pageMap.ts", "ts"],
  ["src/components/layout.tsx", "tsx"],
  ["src/components/blocks.tsx", "tsx"],
  ["src/App.tsx", "tsx"],
  ["scripts/build-static.mjs", "js"],
  ["scripts/serve.mjs", "js"],
  ["scripts/vite-cms-backend.mjs", "js"],
  ["scripts/bake-seed.mjs", "js"],
  ["scripts/bake-recent.mjs", "js"],
  ["scripts/auto-push.mjs", "js"],
  ["index.html", null],
  ["src/styles/admin.css", null],
  ["APPLY_UPDATE.txt", null],
  ["maintenance-hold.txt", null],
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
      notes: 309,
      sections: { home: JSON.stringify({ title: "Live words" }) },
      log: [{ rev: 15, at: 1700000000000, by: "office", note: "Sunday update", changed: ["home"] }],
      by: "office",
      at: 1700000000000,
    };
    const w = JSON.parse(modJ.fallbackGetContent(wiped, baked));
    ok("wake re-serves words+stamp+history", w.seeded === true && w.rev === 15 && w.notes === 309 && JSON.parse(JSON.parse(w.sections).home).title === "Live words" && w.log.length === 1 && w.log[0].note === "Sunday update" && w.by === "office" && w.at === 1700000000000, "a wake must restore the whole publish");
    const bare = JSON.parse(modJ.fallbackGetContent(wiped, { rev: 4, notes: 0, sections: { home: JSON.stringify({ t: 1 }) } }));
    ok("history-less bake stays safe", bare.seeded === true && Array.isArray(bare.log) && bare.log.length === 0 && bare.by === "" && bare.at === 0);
    const liveFull = JSON.stringify({ ok: true, rev: 16, at: 1, by: "office", notes: 309, sections: JSON.stringify({ home: JSON.stringify({ title: "Newer" }) }), log: [{ rev: 16 }], admin: false, pwgen: 3 });
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
  /* L. two-way sync with live (notes 308–309): anything published on live is
     saved on the office copy by itself, and every Publish first folds live's
     newer words in (untouched sections follow live, office edits win) — there
     is no pull button anymore. The fold and the automatic save share the same
     guards: refuse newer updates, fallback bakes (except a fresh restore by
     hand), and older-or-tied publishes (rev counters are per-store — the wall
     clock arbitrates). The live box itself never pulls. */
  const liveServe = text["scripts/serve.mjs"];
  ok("office names its live address", has(devBackend, '"/__live-url"') && has(liveServe, '"/__live-url"'), "office copies must know where live is");
  ok("live box never pulls itself", has(liveServe, "process.env.RENDER"), "the live box IS live — its tabs must never pull");
  ok("pull entry exists", has(cms, "export async function pullFromLive()") && has(cms, "function startLivePull()") && has(cms, "async function foldLiveInto("), "the sync needs its auto entry, its poller and its publish-time fold");
  ok("pull refuses newer updates", has(cms, "Live is on update") && has(cms, '"newer-update"'), "a live stamp from a newer update must never be adopted here");
  ok("pull respects fallback bakes", has(cms, "seeded && (rev !== 0 || publishedNotes > 0)"), "a fallback bake must never regress office words");
  ok("pull arbitrates by clock", has(cms, "liveAt <= updatedAt"), "rev counters are per-store — only a strictly newer live publish wins");
  ok("auto-pull stays conservative", has(cms, "publishedNotes < BUILD_NOTES || pendingSections().length > 0"), "no auto-adopt over an unblessed copy or unsaved work");
  ok("publish folds live in", has(cms, "await foldLiveInto(content || draft)") && has(cms, "await foldLiveInto(draft, sectionId)"), "every Publish (whole site and per-section) must fold live's newer words in first");
  ok("fold keeps office edits", has(cms, "The office's own edits always win"), "a section the office touched must never be overwritten by live");
  ok("fold brings uploads home", has(cms, "backfillUploadsFrom(read.base, snap") && has(cms, '"/__restore-file?name="'), "folded words must point at working photos");
  ok("no hand pull button", !has(ed, "Pull from live now") && !has(ed, "pullFromLive(") && has(ed, "folds into this publish"), "the card is gone — Publish does it, and says so");
  /* M. live shows at once, clock vanishes with it (note 310): the Watch page
     checks immediately on open and stays on the short cadence even with no
     gathering on the clock; the fast cadence itself is shorter; a retyped
     channel (editable in the console) or a landed publish re-checks at once
     on live and on local; Start/Continue/Stop re-ask at once; an offline
     Publish still moves last-published on this copy with its cache, so a host
     sleep afterwards changes nothing. */
  const live = text["src/lib/livestatus.ts"];
  const watch = text["src/pages/WatchLive.tsx"];
  ok("live cadence is short", has(live, "SOON_MS = 20_000") && has(live, "IDLE_MS = 90_000"), "a YouTube start must show in seconds, not minutes");
  ok("watch checks at once", has(live, "urgent") && has(watch, "useLiveStream(true, false, true)"), "the Watch page must not wait out the freshness window");
  ok("app hurries on watch", has(app, 'onWatchPage') && has(app, "expecting || onWatchPage"), "the header must follow the stream on the Watch page");
  ok("moved channel jumps the queue", has(live, "wom:live-target") && has(live, "noteLiveTargetMayHaveChanged") && has(live, "export function recheckLiveNow()") && has(cms, 'window.dispatchEvent(new Event("wom:live-target"))'), "a retyped channel must be re-checked at once on live and local");
  ok("office buttons re-ask", has(ed, "recheckLiveNow()") && has(ed, 'import { readLiveStatus, recheckLiveNow } from "../lib/livestatus"'), "Start/Continue/Stop must ask the channel at once");
  ok("section publish stamps offline", has(cms, "An offline click still moves last-published on this copy"), "a per-section Publish while offline must move the stamp like the whole-site one");
  ok("bless caches offline", has(cms, "The stamp is cached with"), "a bless-only Publish while offline must cache the stamp with the words");
  /* N. office-reported on-air answer (note 318): the deployed server cannot
     read YouTube itself (bot wall — login wall, no live marker), so a
     signed-in office tab reports each definitive answer and visitors trust a
     fresh report for the same target instead of the scrape. */
  const srvLive = text["scripts/cms-server.js"];
  ok("report store exists", has(srvLive, "var LIVE_REPORT = null;"), "the server must hold the latest office answer");
  ok("report reads public", has(srvLive, "if (!raw) return ok({ report: LIVE_REPORT });"), "visitors ask every check, no session needed");
  ok("report writes take admin", has(srvLive, "liveReport: function (info, raw)") && has(srvLive, 'if (!admins.has(info.conn.id)) return fail("denied");'), "only the signed-in office may report");
  ok("report validates strictly", has(srvLive, 'return fail("bad-report");') && has(srvLive, "LIVE_REPORT = { target:") && has(srvLive, "now - checkedAt > 10 * 60 * 1000"), "stale tabs, wrong channels and forged ids must never reach the screen");
  ok("visitors ask the office first", has(live, "fetchLiveReport()") && has(live, "officeHit") && has(live, "officeRep.target === target.url"), "a fresh office answer must win over the scrape");
  ok("reports stay fresh-only", has(live, "REPORT_FRESH_MS = 150_000") && has(live, "Date.now() - checkedAt > REPORT_FRESH_MS"), "a closed office tab must stop steering visitors");
  ok("office reports definitive answers", has(live, "setLiveReportSink") && has(live, "maybeReport(next)") && has(cms, "socket.rpc.liveReport"), "the poll must hand live/off answers to the joined server");
  ok("only signed-in office reports", has(cms, "if (!authed || !socket || status !=="), "visitors and signed-out tabs must only read");
  try {
    const rpcR = loadVm(srv, new Uint8Array(8 * 1024 * 1024));
    const anon = { id: "anon-rep", net: ["x", 0, 0], subscribe() {}, topics: new Set() };
    const read0 = JSON.parse(rpcR.liveReport({ conn: anon }, ""));
    ok("report starts empty, reads public", read0.ok === true && read0.report === null);
    const denied = JSON.parse(rpcR.liveReport({ conn: anon }, JSON.stringify({ target: "https://www.youtube.com/@a/live", state: "live", videoId: "dQw4w9WgXcQ", title: "T", checkedAt: Date.now() })));
    ok("report write needs admin", denied.ok === false, "an anonymous write must be refused");
    const open = srv.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");');
    const rpcO = loadVm(open, new Uint8Array(8 * 1024 * 1024));
    const w = (payload) => JSON.parse(rpcO.liveReport({ conn: anon }, JSON.stringify(payload)));
    const good = { target: "https://www.youtube.com/@church/live", state: "live", videoId: "dQw4w9WgXcQ", title: "Sunday", checkedAt: Date.now() };
    ok("report stores a strict answer", w(good).ok === true);
    const back = JSON.parse(rpcO.liveReport({ conn: anon }, ""));
    ok("report reads back whole", back.ok === true && back.report && back.report.state === "live" && back.report.videoId === "dQw4w9WgXcQ" && back.report.target === good.target);
    ok("report refuses junk", !w({}).ok && !w("x").ok && !w({ ...good, state: "maybe" }).ok && !w({ ...good, target: "https://evil.example/x" }).ok && !w({ ...good, videoId: "short" }).ok && !w({ ...good, checkedAt: Date.now() - 11 * 60 * 1000 }).ok, "bad state, channel, id or stamp must never store");
    const longT = w({ ...good, title: "x".repeat(201) });
    const backT = JSON.parse(rpcO.liveReport({ conn: anon }, ""));
    ok("report trims long titles", longT.ok === true && backT.report.title.length === 200, "a long title must shrink, not refuse the whole answer");
    ok("report stores endings too", w({ ...good, state: "off", videoId: "", title: "" }).ok === true, "visitors must hear the ending at once");
  } catch (e) {
    ok("report suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* O. pasted-channel cleaning (note 320): the published channel once read
     "@@handle" and every reader silently watched nothing — locally and
     deployed alike. The paste is cleaned once, and every reader cleans. */
  const emb = text["src/lib/embed.ts"];
  const rec = text["src/lib/recentstreams.ts"];
  const bakeRecent = text["scripts/bake-recent.mjs"];
  ok("channel cleaner exists", has(emb, "export function cleanChannelInput"), "one cleaner, used everywhere");
  ok("channel links clean first", has(emb, "const raw = cleanChannelInput(input);"), "watch links must survive a doubled @");
  ok("live check cleans first", has(live, "const raw = cleanChannelInput(LIVE.youtubeChannel);"), "a doubled @ must still resolve to the channel's /live page");
  ok("recent lists clean", has(rec, "cleanChannelInput(LIVE.youtubeChannel)") && has(rec, 'from "./embed"'), "recent services must follow the same address");
  ok("console cleans on write", has(cms, "cleanChannelInput(value.youtubeChannel)") && has(cms, 'from "./embed"'), "a doubled @ must never reach the published words again");
  ok("bake cleans too", has(bakeRecent, '.replace(/@@+/g, "@")'), "the deploy-time recent-services bake must resolve the same paste");
  try {
    const { default: esbuild2 } = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await esbuild2.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized by section A — transform works regardless */
    }
    const t = await esbuild2.transform(emb, { loader: "ts", format: "cjs" });
    const embMod = { exports: {} };
    new Function("module", "exports", t.code)(embMod, embMod.exports);
    const clean = embMod.exports.cleanChannelInput;
    const url = embMod.exports.youtubeChannelUrl;
    ok("cleaner heals doubles", clean("@@creflodollar1") === "@creflodollar1" && clean("  @twocorg  ") === "@twocorg" && clean("https://www.youtube.com/@@foo") === "https://www.youtube.com/@foo" && clean("") === "" && clean(null) === "" && clean("@@@x") === "@x");
    ok("channel links survive doubles", url("@@creflodollar1") === "https://www.youtube.com/@creflodollar1" && url("@twocorg") === "https://www.youtube.com/@twocorg" && url("") === "");
  } catch (e) {
    ok("channel cleaner suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* P. the Live tab's video is asked before anything is called off (note 322):
     a bot-walled channel /live page names the broadcast without playing it,
     so the check follows it to its watch page and reads the on-air chrome
     there — each chrome marker alone, and "isLive":true always, still mean
     nothing, and unreadable pages stay unknown at both steps. */
  ok("live follows the Live tab", has(live, "channelLiveVideoId") && has(live, "resolveYoutube") && has(live, "watch?v=${vid}"), "a channel page with no marker must ask the Live tab's video before calling off");
  ok("on-air chrome is read", has(live, "liveIndicatorText") && has(live, "watching now") && has(live, "Started streaming ") && has(live, "playerOverlayVideoDetailsRenderer"), "a bot-walled watch page must still answer live while broadcasting");
  ok("unreadable stays unknown", has(live, "stays `unknown`, never `off`"), "a hiccup must never end a service that is on air");
  try {
    const eb3 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await eb3.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tc = await eb3.default.transform(live, { loader: "ts", format: "cjs" });
    const stubReq = (id) => {
      if (id === "react") return { useEffect: () => {}, useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      return {};
    };
    const liveMod = { exports: {} };
    new Function("module", "exports", "require", tc.code)(liveMod, liveMod.exports, stubReq);
    const parseFn = liveMod.exports.parseLivePage;
    const tabIdFn = liveMod.exports.channelLiveVideoId;
    const VID = "er5FXepH2hg";
    const liveWatch = 'ytInitialData{"a":1} "liveIndicatorText":{"simpleText":"Live"} "7,464"," watching now" "dateText":{"simpleText":"Started streaming 3 hours ago"} "liveChatRenderer":{"continuations":[{}]} "playerOverlayVideoDetailsRenderer":{"title":{"simpleText":"Sunday Service"}} <meta name="title" content="">';
    const gotLive = parseFn(liveWatch, "https://www.youtube.com/watch?v=" + VID);
    ok("shipped parser sees a walled live page", gotLive.read === true && gotLive.live === true && gotLive.videoId === VID && gotLive.title === "Sunday Service", "the id must come from the asked address, the headline from the overlay");
    const trap = parseFn('ytInitialData{"a":1} "isLive":true "isLiveContent":true "isLiveNow":false', "https://www.youtube.com/watch?v=" + VID);
    ok("shipped parser keeps the note-112 trap shut", trap.read === true && trap.live === false, '"isLive":true must never read as on air');
    const ended = parseFn('ytInitialData{"a":1} "text":"3:43:35","badgeStyle":"THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT"', "https://www.youtube.com/watch?v=" + VID);
    ok("shipped parser calls a replay off", ended.read === true && ended.live === false, "a duration badge is not a broadcast");
    const classic = parseFn('ytInitialData{"a":1} "isLiveNow":true <link rel="canonical" href="https://www.youtube.com/watch?v=' + VID + '">', "https://www.youtube.com/@x/live");
    ok("shipped parser keeps the player marker", classic.live === true && classic.videoId === VID, "isLiveNow must still win with the canonical id");
    const tabHtml = '"title":"Live","selected":true,"content":{"x":[{"videoCommand":{"commandMetadata":{"webCommandMetadata":{"url":"/watch?v=' + VID + '"}}}}]}';
    ok("Live tab names its video", tabIdFn(tabHtml) === VID && tabIdFn('ytInitialData{"a":1} "title":"Videos","selected":true') === "", "the follow needs the tab's id, and nothing when the tab is empty");
  } catch (e) {
    ok("live-follow suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* Q. suggestions are verified, never trusted (note 324): no bare first-id
     fallback anywhere — a channel page only orders candidates (Live tab,
     then most-linked) and each is asked on its own watch page. */
  ok("no bare first-id fallback", !has(live, "const any ="), "the first videoId on a channel page may be an ad — it must never steer the player");
  ok("candidates are ordered", has(live, "channelCandidateIds") && has(live, "channelCandidateIds(html)"), "the Live tab's video first, then the most-linked");
  try {
    const eb4 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await eb4.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tc2 = await eb4.default.transform(live, { loader: "ts", format: "cjs" });
    const stubReq2 = (id) => {
      if (id === "react") return { useEffect: () => {}, useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      return {};
    };
    const liveMod2 = { exports: {} };
    new Function("module", "exports", "require", tc2.code)(liveMod2, liveMod2.exports, stubReq2);
    const parseFn2 = liveMod2.exports.parseLivePage;
    const candsFn = liveMod2.exports.channelCandidateIds;
    const WRONG = "AAAAAAAAAAA";
    const RIGHT = "BBBBBBBBBBB";
    const grabBag =
      'ytInitialData{"x":1} "videoId":"' + WRONG + '" "liveIndicatorText":{"simpleText":"Live"} "9,999"," watching now" ' +
      '"dateText":{"simpleText":"Started streaming 2 hours ago"} ' +
      ("/watch?v=" + RIGHT + " ").repeat(5) + "/watch?v=" + WRONG;
    const named = parseFn2(grabBag, "https://www.youtube.com/@church/live");
    ok("grab-bag names nothing", named.read === true && named.live === true && named.videoId === "", "on-air chrome means live, but no id may be guessed from it");
    const cands = candsFn(grabBag);
    ok("grab-bag ordered right", cands.length >= 2 && cands[0] === RIGHT && cands.indexOf(WRONG) > 0, "the most-linked video asks first, the misleading first id last");
    ok("empty page names nothing", candsFn('ytInitialData{"x":1}').length === 0, "no suggestions means off, not a guess");
  } catch (e) {
    ok("verify-candidates suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* R. the church's channel ships everywhere (note 328): @twocorg is the code
     default and the fallback bake's words and recents — fresh copies,
     fallbacks and first paints never show a debugging channel. */
  ok("code default is the church", has(text["src/data/live.ts"], 'youtubeChannel: "@twocorg"'), "a copy with no published words must still watch @twocorg");
  try {
    const seedObj = JSON.parse(text["seed.json"]);
    ok("fallback words are the church", seedObj && seedObj.sections && seedObj.sections.live && seedObj.sections.live.youtubeChannel === "@twocorg", "the fallback bake must carry @twocorg, not a debugging channel");
    ok(
      "fallback recents are the church",
      seedObj && seedObj.recent && seedObj.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && Array.isArray(seedObj.recent.items) && seedObj.recent.items.length > 0,
      "the baked recent list must come from the church's channel id"
    );
  } catch (e) {
    ok("fallback seed parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* S. walled-but-on-air channel follow (note 330): measured on a real
     service, every watch page answers 502 through the deployed server while
     the channel page reads 200 with full on-air chrome but no video id — so
     the check follows the channel instead of guessing a video, the player
     embeds the channel's running broadcast, and the office report carries the
     channel id. Local runs verify watch pages as before; the follow only
     engages where verification is impossible. */
  ok("channel id is extracted strictly", has(live, "extractChannelId") && has(live, "unverifiedChannelAnswer"), "the owner must be named with a clear margin, or nothing");
  ok("walled answer follows the channel", has(live, "unverifiedChannelAnswer(parsed.live, parsed.title, parsed.live ? extractChannelId(html, target.url) :") && has(live, "stays `unknown`, never `off`"), "chrome with no verifiable video must play the channel, never end the service");
  ok("report carries the channel", has(live, "channelId: status.channelId") && has(srvLive, "channelId: channelId") && has(srvLive, "/^UC[\\w-]{20,24}$/.test(channelId)"), "office answers and server validation must know the channel id");
  ok("player embeds the channel", has(emb, "youtubeChannelEmbed") && has(emb, "live_stream?channel=") && has(emb, "youtubeChannelEmbed(source.youtubeChannelId"), "a live answer with no video id must still play on the site");
  const watchPage = text["src/pages/WatchLive.tsx"];
  ok("watch follows the channel", has(watchPage, "detectedChannel") && has(watchPage, "youtubeChannelId: detectedChannel") && has(watchPage, "liveTarget()?.url"), "the ended screen must not cover a channel-followed broadcast");
  try {
    const eb5 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await eb5.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tc3 = await eb5.default.transform(live, { loader: "ts", format: "cjs" });
    const stubReq3 = (id) => {
      if (id === "react") return { useEffect: () => {}, useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      return {};
    };
    const liveMod3 = { exports: {} };
    new Function("module", "exports", "require", tc3.code)(liveMod3, liveMod3.exports, stubReq3);
    const ownerOf = liveMod3.exports.extractChannelId;
    const decide = liveMod3.exports.unverifiedChannelAnswer;
    const OWNER = "UCLg4NCAJxhIvD4IRV__LOFg";
    const GUEST = "UCboqmwN682NPFew8Wp8Qdmg";
    const walledPage =
      'ytInitialData{"x":1} "liveIndicatorText":{"simpleText":"Live"} "1,010"," watching now" ' +
      '"dateText":{"simpleText":"Started streaming 3 hours ago"} "liveChatRenderer":{"continuations":[{}]} ' +
      ('"browseId":"' + OWNER + '" ').repeat(17) + ('"browseId":"' + GUEST + '" ').repeat(4);
    ok("owner wins clearly", ownerOf(walledPage, "https://www.youtube.com/@pastorjerryeze/live") === OWNER, "the measured walled page must name its owner");
    ok("target id needs no counting", ownerOf("", "https://www.youtube.com/channel/" + OWNER + "/live") === OWNER, "a target that carries the id wins directly");
    ok("contested names nothing", ownerOf(('"browseId":"' + OWNER + '" ').repeat(5) + ('"browseId":"' + GUEST + '" ').repeat(4)) === "", "5 vs 4 must not risk the wrong channel");
    ok("quiet names nothing", ownerOf(('"browseId":"' + OWNER + '" ').repeat(3)) === "", "3 mentions could be a guest");
    ok("empty names nothing", ownerOf('ytInitialData{"x":1}') === "", "no ids means no channel");
    const followed = decide(true, "Sunday Service", OWNER);
    ok("walled-live plays the channel", followed.state === "live" && followed.videoId === "" && followed.channelId === OWNER && followed.title === "Sunday Service", "the player needs the channel and the headline");
    const stranded = decide(true, "Sunday Service", "");
    ok("unnamed stays unknown", stranded.state === "unknown", "chrome with no owner must wait, never end");
    ok("no chrome stays off", decide(false, "", OWNER).state === "off", "an off page must not follow anything");
    const te = await eb5.default.transform(emb, { loader: "ts", format: "cjs" });
    const embMod3 = { exports: {} };
    new Function("module", "exports", te.code)(embMod3, embMod3.exports);
    const chEmbed = embMod3.exports.youtubeChannelEmbed;
    const srcOf = embMod3.exports.embedSrc;
    const hasVid = embMod3.exports.hasVideo;
    ok("channel embed is strict", chEmbed(OWNER, false) === "https://www.youtube.com/embed/live_stream?channel=" + OWNER + "&rel=0&modestbranding=1&playsinline=1" && chEmbed("short", false) === "" && chEmbed("", false) === "", "only a real channel id may build the player");
    ok("video id still wins", srcOf({ platform: "youtube", youtubeId: "dQw4w9WgXcQ", youtubeChannelId: OWNER }, false) === "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1", "a verified video must keep playing by id");
    ok("channel plays without id", srcOf({ platform: "youtube", youtubeId: "", youtubeChannelId: OWNER }, false) === chEmbed(OWNER, false) && srcOf({ platform: "youtube" }, false) === "", "no id and no channel means no player, never a guess");
    ok("channel counts as video", hasVid({ platform: "youtube", youtubeChannelId: OWNER }) === true && hasVid({ platform: "youtube" }) === false, "the watch page must treat a followed channel as playable");
    const goodCh = { target: "https://www.youtube.com/@church/live", state: "live", videoId: "", title: "Sunday", channelId: OWNER, checkedAt: Date.now() };
    const srvCh = text["scripts/cms-server.js"];
    const rpcCh = loadVm(srvCh.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");'), new Uint8Array(8 * 1024 * 1024));
    const anonCh = { id: "anon-chan", net: ["x", 0, 0], subscribe() {}, topics: new Set() };
    const wCh = (payload) => JSON.parse(rpcCh.liveReport({ conn: anonCh }, JSON.stringify(payload)));
    ok("report stores the channel", wCh(goodCh).ok === true);
    const backCh = JSON.parse(rpcCh.liveReport({ conn: anonCh }, ""));
    ok("report reads the channel back", backCh.ok === true && backCh.report && backCh.report.channelId === OWNER && backCh.report.videoId === "", "visitors must inherit the channel with the live answer");
    ok("report refuses a bad channel", !wCh({ ...goodCh, channelId: "UCshort" }).ok, "a malformed channel id must never store");
  } catch (e) {
    ok("channel-follow suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* T. no dead frame, same-update reports, hold-until-publish, fresh @twocorg
     recents (note 332): a named video id can die (stale report, removed
     upload) — it must never autoplay into the black frame; an old bundle's
     office report must never steer this update; a new build must hold fresh
     visitors on maintenance until the office publishes; Recent services bake
     from the Oct-12 @twocorg feed. */
  const buildNotes = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  const blocks = text["src/components/blocks.tsx"];
  ok("same-update reports only", has(live, "reportMatchesBuild") && has(live, "notes: BUILD_NOTES") && has(live, "notes: number"), "an old bundle's wrong id must never steer this update");
  ok("server keeps the reporter update", has(srvLive, "rep.notes") && has(srvLive, "notes: notes"), "the store must carry notes without trusting them");
  ok("player verifies before playing", has(blocks, "verifyYoutubeId") && has(blocks, "peekVerified") && has(blocks, "player--dead") && has(blocks, "can't be played here") && has(blocks, "Watch on YouTube"), "a dead video must say so with a way out, never the black frame");
  ok("watch gates autoplay", has(watchPage, "useYoutubeVerdict") && has(watchPage, "autoPlay={!!playableId}") && has(watchPage, "watchable"), "a known-dead id must never autoplay; the unverified channel follow stays one tap");
  ok("hold ships with the update", has(text["maintenance-hold.txt"], "hold") && has(text["scripts/build-static.mjs"], "maintenance-hold.txt"), "fresh visitors must wait on maintenance until the office publishes");
  try {
    const seed332 = JSON.parse(text["seed.json"]);
    const items332 = (seed332 && seed332.recent && seed332.recent.items) || [];
    const ids332 = items332.map((it) => it && it.videoId);
    ok("recents bake the church feed", seed332 && seed332.recent && seed332.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && items332.length >= 6 && ids332.indexOf("s4bLaGUNet4") === 0 && ids332.indexOf("aT5IeCtJHFw") === 1 && ids332.every((id) => /^[\w-]{11}$/.test(String(id || ""))), "six-plus @twocorg services, newest first from the Oct-12 feed");
  } catch (e) {
    ok("recents bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  try {
    const eb4 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await eb4.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const t4 = await eb4.default.transform(live, { loader: "ts", format: "cjs" });
    const stubReq4 = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [typeof v === "function" ? v() : v, () => {}], useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { BUILD_NOTES: buildNotes, readStore: (k, fb) => fb, writeStore: () => true };
      if (id === "./embed") return { parseYoutubeId: (v) => { const s = String(v || "").trim(); if (/^[\w-]{11}$/.test(s)) return s; const m = /[?&]v=([\w-]{11})/.exec(s); return m ? m[1] : ""; }, cleanChannelInput: (v) => String(v || "") };
      return {};
    };
    const liveMod4 = { exports: {} };
    new Function("module", "exports", "require", t4.code)(liveMod4, liveMod4.exports, stubReq4);
    const decidePlay = liveMod4.exports.oembedPlayable;
    const matchBuild = liveMod4.exports.reportMatchesBuild;
    const peek = liveMod4.exports.peekVerified;
    ok("oembed decision is strict", decidePlay(200) === true && decidePlay(400) === false && decidePlay(401) === false && decidePlay(403) === false && decidePlay(404) === false && decidePlay(410) === false && decidePlay(500) === null && decidePlay(0) === null, "200 plays, gone is gone, anything else waits");
    ok("same-update matching", buildNotes > 0 && matchBuild({ notes: buildNotes }) === true && matchBuild({ notes: buildNotes + 1 }) === false && matchBuild({}) === false && matchBuild({ notes: 0 }) === false, "only this update's office answers steer this update");
    ok("unasked is unknown", peek("dQw4w9WgXcQ") === null && peek("") === false, "no cache means ask, no id means dead");
    const srvT = text["scripts/cms-server.js"];
    const rpcT = loadVm(srvT.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");'), new Uint8Array(8 * 1024 * 1024));
    const anonT = { id: "anon-notes", net: ["x", 0, 0], subscribe() {}, topics: new Set() };
    const wT = (payload) => JSON.parse(rpcT.liveReport({ conn: anonT }, JSON.stringify(payload)));
    const noted = { target: "https://www.youtube.com/@church/live", state: "live", videoId: "dQw4w9WgXcQ", title: "Sunday", channelId: "UCLg4NCAJxhIvD4IRV__LOFg", checkedAt: Date.now(), notes: buildNotes };
    ok("report stores the reporter update", wT(noted).ok === true);
    const backT = JSON.parse(rpcT.liveReport({ conn: anonT }, ""));
    ok("report reads the update back", backT.ok === true && backT.report && backT.report.notes === buildNotes && backT.report.channelId === noted.channelId, "visitors must inherit notes with the live answer");
  } catch (e) {
    ok("no-dead-frame suite", false, String((e && e.message) || e).slice(0, 200));
  }
  const notes = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  const apply = text["APPLY_UPDATE.txt"];
  ok("update number consistent", notes > 0 && has(apply, `APPLY THIS UPDATE (${notes})`), "hooks=" + notes);
  return out.join("\n");
}
