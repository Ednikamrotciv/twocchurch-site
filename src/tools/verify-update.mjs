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
   broadcast, and the office report carries the channel id. Section T (note 332) locks the dead-video net (oEmbed verdict before play, fallback with a way out, gated autoplay), same-update office reports, the shipped maintenance hold, and the fresh @twocorg recents bake. Section U (note 334) locks the deployed update: the hold file deploys with git and step 0 lists every file (its Tools card retired in note 343 — the number lives in version.json + the console now). Section V (note 339) locks the deployed heal: the code outnumbers any mystery bundle, step 0 checks the bake's content, and the watched channel carries the reset recipe. Section W (note 341) locks the parity witness and the verified channel tap: the console tracks the live bake, and the channel tap plays a verified id or waits. Section X (note 343) locks the self-working publish (default live address, follow decision table, locked adopt door, player escape + re-ask, visible wakes, fresh @twocorg bake). Section Y (note 345) locks the one-tap @twocorg reset, the publish-time recents refresh, and the self-proving backup round-trip. Section Z (note 347) locks only-@twocorg shipping, the visitor's notice check, and the card staying gone. Section AA (note 349) locks the handle-only livestream: stamped answers, skipped foreign videos, dropped old endings, and the channel-wins screen. Section BB (note 351) locks the ready channel: a stored debugging handle boots to @twocorg with no stamp, a later edit survives, empty boots clean, and the untouched draft follows. Section CC (note 353) locks the ready recents: the restore heals the channel (announced, kept dirty), @twocorg resolves with no page read, and a failed bake never wipes. Section DD (note 355) re-locks the four retained behaviors on the rebuilt tree: automatic publish on local, perfect livestream, sleep-free Render, blank-free local backups. Section EE (note 357) locks the designated-channel gate: @twocorg's baked id, candidate provenance, the gated channel follow, videoless reports never opening the player, office-only verified ids, and the designated-only screen and tap. Section FF (note 359) locks the clean recents and slides: foreign-channel caches dropped on read, stored take-offs cleared once, the lone welcome card replanted once, drafts healed, later edits never touched. Section GG (note 361) locks the override: the per-update stamp, the full clear, the draft + browser follow, and the same-update silence. Section HH (note 363) locks the last-service fallback: the 15 @twocorg services in code, the three empty-cache doors, the same-origin read, and the proven-foreign jazz report named. Section II (note 365) locks the seed that cannot go missing: the repo-seed fallback, the red build on an empty bake, the recents riding every re-bake, and the force-tracked seed. Section JJ (note 367) locks the server-side relay gate: fresh on the server clock, reporter at the published update or newer, wiped when gated out. Section KK (note 369) locks browsers looking new: the 30-second poll, the cross-tab shout, and the admin wait banner. Section LL (note 371) locks the numbered notice, the fast feed, and the guaranteed still. Section MM (note 373) locks the self-diagnosing boot banner. Run this
   before EVERY update zip — a single FAIL blocks the
   ship, no exceptions.
   RUN (paste the two lines into an execute_js call):
     const m = await import(URL.createObjectURL(new Blob(
       [await fs.readTextFile("src/tools/verify-update.mjs")], { type: "text/javascript" })));
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
  ["src/pages/Admin.tsx", "tsx"],
  ["src/App.tsx", "tsx"],
  ["src/components/editor.tsx", "tsx"],
  ["src/lib/hooks.ts", "ts"],
  ["src/data/photos.ts", "ts"],
  ["src/lib/cmsSchema.ts", "ts"],
  ["src/lib/autostop.ts", "ts"],
  ["src/data/live.ts", "ts"],
  ["seed.json", null],
  ["src/lib/jobs.ts", "ts"],
  ["src/lib/pageMap.ts", "ts"],
  ["src/components/layout.tsx", "tsx"],
  ["src/components/blocks.tsx", "tsx"],
  ["src/lib/store.ts", "ts"],
  ["src/pages/Home.tsx", "tsx"],
  ["src/components/slides.tsx", "tsx"],
  ["src/App.tsx", "tsx"],
  ["scripts/build-static.mjs", "js"],
  ["scripts/serve.mjs", "js"],
  ["scripts/vite-cms-backend.mjs", "js"],
  ["scripts/bake-seed.mjs", "js"],
  ["scripts/bake-recent.mjs", "js"],
  ["scripts/auto-push.mjs", "js"],
  ["scripts/live-follow.mjs", "js"],
  ["scripts/seed-guard.mjs", "js"],
  ["scripts/cms-local.mjs", "js"],
  ["index.html", null],
  ["src/styles/admin.css", null],
  ["src/styles/pages.css", null],
  ["APPLY_UPDATE.txt", null],
  ["maintenance-hold.txt", null],
  [".gitignore", null],
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
  ok("office buttons re-ask", has(ed, "recheckLiveNow()") && has(ed, 'import { readLiveStatus, recheckLiveNow, guestTarget, isGuestTargetUrl } from "../lib/livestatus"'), "Start/Continue/Stop must ask the channel at once");
  ok("section publish stamps offline", has(cms, "An offline click still moves last-published on this copy"), "a per-section Publish while offline must move the stamp like the whole-site one");
  ok("bless caches offline", has(cms, "The stamp is cached with"), "a bless-only Publish while offline must cache the stamp with the words");
  /* N. office-reported on-air answer (note 318): the deployed server cannot
     read YouTube itself (bot wall — login wall, no live marker), so a
     signed-in office tab reports each definitive answer and visitors trust a
     fresh report for the same target instead of the scrape. */
  const srvLive = text["scripts/cms-server.js"];
  ok("report store exists", has(srvLive, "var LIVE_REPORT = null;"), "the server must hold the latest office answer");
  ok("report reads public through the gate", has(srvLive, "if (!raw) return ok({ report: gatedReport() });"), "visitors ask every check, no session needed — the server relays only a fresh, current answer");
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
  ok("watch plays live by itself", has(watchPage, "useYoutubeVerdict") && has(watchPage, "autoPlay={streaming && watchable}") && has(watchPage, "watchable"), "when the check says live the screen must open with no tap");
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
  /* U. the update lands on deployed and names itself (note 334): the hold
     file shipped in the zip but stayed git-ignored, so Render rebuilt
     without it — and nothing on either copy named its update. The hold
     must travel with git, step 0 must list every file, and Tools must show
     this console next to the live site with the recipe while behind. */
  const cmsU = text["src/lib/cms.ts"];
  const edU = text["src/components/editor.tsx"];
  const applyU = text["APPLY_UPDATE.txt"];
  const gitU = text[".gitignore"];
  const buildU = text["scripts/build-static.mjs"];
  ok("hold file deploys with git", gitU.split("\n").map((l) => l.trim()).indexOf("maintenance-hold.txt") === -1, "a git-ignored hold means Render rebuilds never wait");
  ok("step 0 lists every file", has(applyU, "maintenance-hold.txt") && has(applyU, "maintenance hold on"), "the deploy checklist must name the hold file and its build-log proof");
  ok("build holds git deploys", has(buildU, "NOT git-ignored") && has(buildU, "maintenance hold on"), "the builder must state the new truth, not the old clean-ship line");
  ok("office tracks the live update", has(cmsU, "liveSiteNotesVersion") && has(cmsU, "refreshLiveSiteNotes") && has(cmsU, 'base + "/version.json') && has(cmsU, "liveSiteNotes"), "Tools needs the live number without version.json spelunking");
  ok("live tick refreshes it", has(cmsU, "refreshLiveSiteNotes().catch"), "the office minute-tick must keep the number fresh");
  /* Note 343 retired the card (the office asked it gone): the number lives
     in version.json + the console now, and the trackers feed __maintState. */
  ok("site-update card removed", !has(edU, "Site update") && !has(edU, "liveSiteNotesVersion") && !has(edU, "refreshLiveBake"), "the office asked the card gone from Tools");
  ok("apply checks without the card", has(applyU, "version.json") && has(applyU, "/seed.json"), "deploy verification must not route through the removed card");
  /* V. the deployed copy heals (note 339): the box ran a mystery 337 with
     an empty bake and the old channel published — committing code alone
     changed nothing visible. The update must outnumber the mystery, step 0
     must check the bake's content, and Tools must show the watched channel
     with the @twocorg recipe while it names anything else. */
  const edV = text["src/components/editor.tsx"];
  const applyV = text["APPLY_UPDATE.txt"];
  /* Note 343 retired the card with the @twocorg recipe on it: the recipe
     lives in the APPLY instead (the office asked the card gone). */
  ok("reset recipe survives the card", has(applyV, "exactly `@twocorg`"), "the stuck channel's fix must survive the card's removal");
  ok("step 0 checks the bake content", has(applyV, '"sections":{}') && has(applyV, "copy seed.json") && has(applyV, "from THIS zip"), "an empty bake must be caught and recoverable at deploy time");
  ok("mystery bundle named", has(applyV, "337") && has(applyV, "matches no shipped update"), "a hand-edited folder must read as not-deployed");
  try {
    const seed339 = JSON.parse(text["seed.json"]);
    const items339 = (seed339 && seed339.recent && seed339.recent.items) || [];
    ok("shipped bake still church", !!seed339 && !!seed339.recent && seed339.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && items339.length >= 6, "the words that land must be @twocorg's");
  } catch (e) {
    ok("shipped bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* W. deployed matches local, no unavailable (note 341): parity had no
     witness (code without the bake is an empty shell), and the channel tap
     opened the embed blind. Tools must show the live bake, and the tap
     must verify first. */
  const cmsW = text["src/lib/cms.ts"];
  const edW = text["src/components/editor.tsx"];
  const blocksW = text["src/components/blocks.tsx"];
  const applyW = text["APPLY_UPDATE.txt"];
  ok("office tracks the live bake", has(cmsW, "liveBakeNotesVersion") && has(cmsW, "refreshLiveBake") && has(cmsW, 'base + "/seed.json') && has(cmsW, "liveBakeSections"), "parity needs a witness, not a version number alone");
  ok("bake watchdog runs itself", has(cmsW, "refreshLiveBake().catch"), "the minute-tick must keep it fresh");
  /* Note 343 retired the card: the witness lives on in the console. */
  ok("bake watch feeds the console", has(cmsW, "__maintState") && has(cmsW, "liveBakeNotes"), "the retired card's witness must live on in window.__maintState");
  ok("channel tap verifies first", has(blocksW, "checkLiveStream") && has(blocksW, "liveVideoId") && has(blocksW, "checkChannelThenPlay") && has(blocksW, "No broadcast right now"), "a blind channel embed is YouTube's unavailable waiting to happen");
  ok("push-land check in apply", has(applyW, "empty shell"), "the checklist must confirm the words landed, not just the code");
  /* X. publish reaches the office by itself; card gone; player always has a
     way out; sleep ends (note 343): the follow loop adopts live's newer
     words with no setup (the old cms-server.txt never survived a fresh
     folder), the Tools card is removed, every playing frame carries its way
     out, and a live publish lands in git instead of dying with the disk. */
  const cmsX = text["src/lib/cms.ts"];
  const edX = text["src/components/editor.tsx"];
  const localX = text["scripts/cms-local.mjs"];
  const srvX = text["scripts/cms-server.js"];
  const serveX = text["scripts/serve.mjs"];
  const viteX = text["scripts/vite-cms-backend.mjs"];
  const blocksX = text["src/components/blocks.tsx"];
  const cssX = text["src/styles/pages.css"];
  const applyX = text["APPLY_UPDATE.txt"];
  ok("no site-update card anywhere", !has(edX, "Site update") && !has(edX, "Live bake carries") && !has(edX, "The site watches"), "the office asked it gone from Tools");
  ok("default live address", has(cmsX, "DEFAULT_LIVE_ORIGIN") && has(cmsX, "https://twocchurch-site.onrender.com") && has(localX, "pickLiveOrigin"), "a fresh folder must know live with no setup file");
  ok("pull falls back to the default", has(cmsX, "backend || DEFAULT_LIVE_ORIGIN"), "the browser pull used to die on an empty __live-url");
  ok("office backend follows live", has(localX, "startLiveFollow") && has(localX, "adoptLive") && has(localX, "FOLLOW_MS") && has(localX, "process.env.RENDER"), "no tab open must still bring a live publish home");
  ok("adopt door locked twice", has(srvX, "adoptLive") && has(srvX, "__adoptToken") && has(serveX, "isLoopbackAddr") && has(viteX, "isLoopbackAddr"), "token in the vm plus loopback at both http doors");
  ok("player always has a way out", has(blocksX, "player__escape") && has(blocksX, "Can't see the video? Watch on YouTube") && has(cssX, ".player__escape"), "the frame never reports failure — the link is the permanent net");
  ok("playing videos re-asked", has(blocksX, "5 * 60 * 1000") && has(blocksX, "setDead(true)"), "a mid-play death must swap to the fallback, not sit black");
  ok("wakes are visible", has(serveX, "cold start at") && !has(serveX, "Admin > Tools shows the same number"), "the host log must show sleeps; nothing may point at the removed card");
  ok("apply keeps awake + follow", has(applyX, "UptimeRobot") && has(applyX, "live follow"), "sleep must be a non-event by recipe and by loop");
  try {
    const mod = await import(
      URL.createObjectURL(new Blob([text["scripts/live-follow.mjs"]], { type: "text/javascript" }))
    );
    const secs = (o) => JSON.stringify(o);
    const liveNew = { ok: true, notes: 343, at: 2000, rev: 9, seeded: false, sections: secs({ live: { a: 1 } }) };
    const localOld = { ok: true, notes: 343, at: 1000, rev: 4, sections: secs({}) };
    ok("follow adopts strictly newer", mod.shouldAdoptLive(localOld, liveNew, 343, false) === "adopt", "a live/admin publish must come home");
    ok("follow keeps ties", mod.shouldAdoptLive({ ...localOld, at: 2000 }, liveNew, 343, false) === "stale", "ties ride the office publish out");
    ok("follow never crosses updates", mod.shouldAdoptLive(localOld, { ...liveNew, notes: 999 }, 343, false) === "newer-update", "a newer live update waits for this copy");
    ok("follow refuses stale bakes", mod.shouldAdoptLive(localOld, { ...liveNew, at: 3000, seeded: true }, 343, false) === "seeded", "a wake bake must never regress office words");
    ok("follow heals fresh copies", mod.shouldAdoptLive({ ok: true, notes: 0, at: 0, rev: 0, sections: "{}" }, liveNew, 343, true) === "adopt", "a fresh extract may be restored from live");
    ok("follow ignores emptiness", mod.shouldAdoptLive(localOld, { ok: true, notes: 343, at: 3000, sections: "{}" }, 343, false) === "empty", "blank answers adopt nothing");
    ok("origin prefers the file", mod.pickLiveOrigin("https://office-tunnel.example/\n") === "https://office-tunnel.example", "an explicit cms-server.txt still wins");
    ok("origin defaults without a file", mod.pickLiveOrigin("") === "https://twocchurch-site.onrender.com" && mod.pickLiveOrigin("# only comments\n") === "https://twocchurch-site.onrender.com", "fresh folders must know live");
    ok("loopback gate knows its own", mod.isLoopbackAddr("127.0.0.1") && mod.isLoopbackAddr("::1") && !mod.isLoopbackAddr("8.8.8.8"), "the adopt door opens to this machine only");
    const patch = mod.adoptPatch(liveNew.sections);
    ok("adopt writes values only", Object.keys(patch).length === 1 && patch.live === JSON.stringify({ a: 1 }), "the parsed wire shape must store exactly like a publish");
  } catch (e) {
    ok("follow suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const seed343 = JSON.parse(text["seed.json"]);
    const items343 = ((seed343 && seed343.recent && seed343.recent.items) || []).map((it) => it && it.videoId);
    const want343 = ["s4bLaGUNet4", "aT5IeCtJHFw", "3uqJoUXKds4", "OV6XtrNPGgo", "BgF97PIYPe8", "rmdEvZ_ZOXo", "ddWq2WYrmZ8", "HmVTgKwA6rY", "eyGDEZplxJw", "akE7Klt3a8w", "KCGWV3jWROE", "_PD-k6SqPvg", "eu3xQ-XCHv4", "gVJP8wlL9dM", "suLunbMiN78"];
    const live343 = seed343 && seed343.sections && seed343.sections.live;
    ok("bake still @twocorg's", !!seed343 && !!seed343.recent && seed343.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && want343.every((id) => items343.indexOf(id) !== -1) && live343 && live343.youtubeChannel === "@twocorg", "recents must be the church's previous livestreams, all 15");
  } catch (e) {
    ok("bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* Y. one-tap reset, recents on the same publish, backups that prove
     themselves (note 345): the box ran 339 with an empty bake and a
     debugging channel published — so the recents followed that channel and
     restores came back blank. The console must offer the reset, a publish
     must refresh the recents itself, and a backup must carry (or name)
     every photo and video. */
  const edY = text["src/components/editor.tsx"];
  const cmsY = text["src/lib/cms.ts"];
  const localY = text["scripts/cms-local.mjs"];
  const serveY = text["scripts/serve.mjs"];
  const viteY = text["scripts/vite-cms-backend.mjs"];
  const applyY = text["APPLY_UPDATE.txt"];
  ok("reset button offered", has(edY, "Reset to @twocorg") && has(edY, "resetChannel") && has(edY, "youtubeChannel: \"@twocorg\""), "the office must fix the channel in one tap, not by retyping");
  ok("reset names the wrong channel", has(edY, "not the church's channel"), "the wrong list must say what it follows");
  ok("publish refreshes recents", has(localY, "noteRecentsDirty") && has(localY, "bake-recent.mjs") && has(localY, "process.env.RENDER"), "the new channel's services must ride the same deploy, never the next loop");
  ok("refresh only on real publishes", has(localY, "method === \"publish\""), "reads must never schedule YouTube work");
  ok("backup embeds draft files", has(cmsY, "allBackupNames") && has(cmsY, "localUploadNames(draft)"), "a pre-publish backup must not strand unsaved uploads");
  ok("restore proves its writes", has(cmsY, "verified") && has(cmsY, "Read it back"), "a counted file must be a served file, never a hope");
  ok("restore takes audio", has(serveY, "startsWith(\"audio/\")") && has(viteY, "startsWith(\"audio/\")"), "refused kinds came back blank on both backends");
  ok("backup warns by name", has(edY, "missingFiles") && has(edY, "will be blank after a restore"), "a skipping backup must shout before the restore, not after");
  ok("apply leads with the box truth", has(applyY, "Measured on the live box first"), "the checklist must start from the measured box, not the last zip");
  /* Z. only @twocorg ships; the visitor's notice; the card stays gone (note
     347): the box runs 345 code with an empty bake and debugging channel(s)
     published — lately @zoelifemultimedia. The last other name in what
     ships must go, the APPLY must check the notice like a visitor, and no
     pointer at the removed card may survive. */
  const edZ = text["src/components/editor.tsx"];
  const liveZ = text["src/data/live.ts"];
  const viteZ = text["scripts/vite-cms-backend.mjs"];
  const buildZ = text["scripts/build-static.mjs"];
  const applyZ = text["APPLY_UPDATE.txt"];
  const holdZ = text["maintenance-hold.txt"];
  const notesZ = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  ok("no site-update card anywhere", !has(edZ, "Site update") && !has(edZ, "Live bake carries") && !has(edZ, "The site watches"), "the office asked it gone from Tools");
  ok("no pointer at tools either", !has(viteZ, "Admin > Tools shows the same number") && has(viteZ, "version.json shows the same number"), "the dev boot line pointed at the removed card");
  ok("code default is @twocorg", has(liveZ, 'youtubeChannel: "@twocorg"') && has(liveZ, 'value: "@twocorg"'), "the fallback card must read the church, not the old handle");
  ok("no stray channel in code", ["src/lib/cms.ts", "src/components/editor.tsx", "src/data/live.ts", "src/components/blocks.tsx", "src/pages/WatchLive.tsx", "src/lib/livestatus.ts", "src/lib/embed.ts", "src/lib/recentstreams.ts"].every((p) => text[p].toLowerCase().indexOf("zoelifemultimedia") === -1), "@zoelifemultimedia must live only in published words, never in shipped code");
  ok("apply checks like a visitor", has(applyZ, "FRESH profile") && has(applyZ, "incognito") && has(applyZ, "Exit preview"), "the notice check must defeat the office's own bypasses");
  ok("reset recipe still in apply", has(applyZ, "exactly `@twocorg`") && has(applyZ, "Reset to @twocorg"), "the published handle only moves by reset plus publish");
  ok("hold still ships", holdZ.trim().length > 0 && has(buildZ, "maintenance hold on"), "fresh visitors wait until the publish");
  try {
    const seed347 = JSON.parse(text["seed.json"]);
    const live347 = seed347 && seed347.sections && seed347.sections.live;
    const cards347 = (live347 && live347.watchOptions) || [];
    const yt347 = cards347.filter((w) => w && w.icon === "youtube")[0] || {};
    const items347 = ((seed347 && seed347.recent && seed347.recent.items) || []).map((it) => it && it.videoId);
    ok("bake card reads @twocorg", !!live347 && live347.youtubeChannel === "@twocorg" && yt347.value === "@twocorg", "the shipped words must name no other channel");
    ok("bake notes leave room to hold", typeof seed347.notes !== "number" || seed347.notes < notesZ, "a bake stamped at/above this update would release fresh visitors");
    ok("recents still the church's", !!seed347 && !!seed347.recent && seed347.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && items347.indexOf("s4bLaGUNet4") !== -1 && items347.length >= 6, "previous livestreams must be @twocorg's");
  } catch (e) {
    ok("bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* AA. the livestream answers only for the handle (note 349): the candidate
     walk never asked whose video a suggestion was, answers outlived the
     channel, and a stray stream link could reach the screen. Answers are
     stamped with the checked address, foreign videos are skipped, old
     endings are dropped on a move, and the channel wins on the screen. */
  const liveAA = text["src/lib/livestatus.ts"];
  const watchAA = text["src/pages/WatchLive.tsx"];
  const blocksAA = text["src/components/blocks.tsx"];
  ok("answers carry their address", has(liveAA, "target: string") && has(liveAA, "target: targetUrl"), "an unstamped answer cannot be told from the handle's");
  ok("candidates prove their owner", has(liveAA, "ownerAllowsCandidate(owner, watchChannelId(watchHtml))"), "a live suggestion from another channel must be skipped, not played");
  ok("old endings are dropped", has(liveAA, "inheritEnded(before, targetUrl, checkedAt, designatedChannelIdForTarget(targetUrl))"), "a moved channel must not seed the new handle's ended screen");
  ok("office never reports stale", has(liveAA, "isStatusForTarget(status, url)"), "the office must not steer visitors to the old handle's video");
  ok("screen gates on the stamp", has(watchAA, "isStatusForTarget(air, targetUrl)") && has(watchAA, "airForTarget"), "the screen must read unknown until the fresh check lands");
  ok("channel wins the screen", has(watchAA, "!hasChannel ? LIVE.youtubeId") && has(watchAA, "hasChannel ? targetUrl"), "a stray stream link must not reach the player while the channel is set");
  ok("tap re-asks the handle", has(blocksAA, "isStatusForTarget(st, liveTarget()?.url"), "a tap after a channel move must wait, not play the old video");
  try {
    const ebAA = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebAA.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tcAA = await ebAA.default.transform(liveAA, { loader: "ts", format: "cjs" });
    const stubAA = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      return {};
    };
    const modAA = { exports: {} };
    new Function("module", "exports", "require", tcAA.code)(modAA, modAA.exports, stubAA);
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    const watchHtml = 'ytInitialData{"x":1} "videoDetails":{"videoId":"AAAAAAAAAAA","channelId":"' + OWNER + '","title":"T"}';
    ok("watch page names its owner", modAA.exports.watchChannelId(watchHtml) === OWNER && modAA.exports.watchChannelId('ytInitialData{"x":1}') === "", "the winner's own page must say whose video it is");
    const allows = modAA.exports.ownerAllowsCandidate;
    ok("own video allowed", allows(OWNER, OWNER) === true && allows("", OTHER) === true && allows(OWNER, "") === true, "unprovable either way still plays — a thin read never ends a service");
    ok("foreign video refused", allows(OWNER, OTHER) === false, "an ad or related upload is never the handle's broadcast");
    const forTarget = modAA.exports.isStatusForTarget;
    const ADDR = "https://www.youtube.com/@twocorg/live";
    ok("stamp gates the screen", forTarget({ target: ADDR }, ADDR) === true && forTarget({ target: "https://www.youtube.com/@other/live" }, ADDR) === false && forTarget({}, ADDR) === true, "another address never plays; older caches pass through");
    const inherit = modAA.exports.inheritEnded;
    const wasLive = { state: "live", platform: "youtube", videoId: "AAAAAAAAAAA", title: "T", channelId: "", target: ADDR, checkedAt: 1, endedAt: 0 };
    const kept = inherit(wasLive, ADDR, 99);
    ok("same-address ending sticks", kept.videoId === "AAAAAAAAAAA" && kept.endedAt === 99, "the ended screen keeps the video it was");
    const dropped = inherit(wasLive, "https://www.youtube.com/@other/live", 99);
    ok("moved channel drops the old video", dropped.videoId === "" && dropped.endedAt === 0, "the new handle never inherits somebody else's service");
    const wasOff = { state: "off", platform: "", videoId: "AAAAAAAAAAA", title: "T", channelId: "", target: ADDR, checkedAt: 1, endedAt: 50 };
    ok("old ending keeps its moment", inherit(wasOff, ADDR, 99).endedAt === 50 && inherit(wasOff, "https://www.youtube.com/@other/live", 99).endedAt === 0, "the moment sticks only for its own address");
  } catch (e) {
    ok("live-scope suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* BB. @twocorg arrives ready (note 351): stored words keep the last
     published channel across updates, so the office had to reset it by hand.
     The first boot of this update moves a stored non-@twocorg channel once —
     no stamp, no publish — a later edit is never touched, and an untouched
     draft follows the published words. */
  const srvBB = text["scripts/cms-server.js"];
  const cmsBB = text["src/lib/cms.ts"];
  const applyBB = text["APPLY_UPDATE.txt"];
  ok("ready flag declared", has(srvBB, "var CH_READY = false;"), "the one-shot needs memory");
  ok("ready flag persists", has(srvBB, "chReady: CH_READY") && has(srvBB, "CH_READY = parsed.chReady === true;"), "a later edit must never be re-moved");
  ok("boot moves the channel", has(srvBB, 'readyObj.youtubeChannel = "@twocorg"') && has(srvBB, "if (!CH_READY)"), "stored debugging handles must land on the church's");
  ok("empty stays empty", has(srvBB, "stays empty (fresh copies read"), "fresh copies read the code default, not an invented section");
  ok("draft heals on read", has(cmsBB, "healDraftChannel()") && has(cmsBB, "if (!draft || dirty.live) return;"), "an untouched Live section follows the published words; office edits win");
  ok("apply needs no reset", has(applyBB, "no reset tap") && has(applyBB, "Only if it offers"), "the checklist must verify readiness, not tap the button");
  try {
    const connBB = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pubBB = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn: connBB }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 351, ...(extra || {}) })));
    const getBB = (rpc) => JSON.parse(rpc.getContent({ conn: connBB }, ""));
    const stripReady = (st) => {
      const dvBB = new DataView(st.buffer);
      const metaChars = dvBB.getUint32(14, false);
      const secChars = dvBB.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(st.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.chReady;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dvBB.setUint32(14, nm.length, false);
    };
    /* a pre-351 store: debugging channel published, no flag. */
    const stBB = new Uint8Array(8 * 1024 * 1024);
    const rBB0 = loadVm(stubAuth(srvBB), stBB);
    const p0 = pubBB(rBB0, { live: JSON.stringify({ youtubeChannel: "@zoelifemultimedia", recentLimit: 6 }) }, { first: true });
    ok("bb fixture publishes", p0.ok === true, "pub=" + JSON.stringify(p0).slice(0, 120));
    stripReady(stBB);
    const beforeBB = getBB(rBB0);
    const rBB1 = loadVm(stubAuth(srvBB), stBB);
    const afterBB = getBB(rBB1);
    const liveBB = JSON.parse(afterBB.sections).live;
    ok("boot moves the stored channel", liveBB.youtubeChannel === "@twocorg" && liveBB.recentLimit === 6, "got " + liveBB.youtubeChannel);
    ok("boot stamps nothing", afterBB.rev === beforeBB.rev && afterBB.notes === beforeBB.notes && JSON.stringify(afterBB.log) === JSON.stringify(beforeBB.log), "a move is not a publish");
    /* a later intentional edit survives every later boot. */
    const p1 = pubBB(rBB1, { live: JSON.stringify({ ...liveBB, youtubeChannel: "@otherhandle" }) });
    ok("bb later edit publishes", p1.ok === true);
    const rBB2 = loadVm(stubAuth(srvBB), stBB);
    const liveBB2 = JSON.parse(getBB(rBB2).sections).live;
    ok("later edit survives reboot", liveBB2.youtubeChannel === "@otherhandle", "got " + liveBB2.youtubeChannel);
    /* empty boots invent nothing. */
    const rBBE = loadVm(stubAuth(srvBB), new Uint8Array(8 * 1024 * 1024));
    const gBBE = getBB(rBBE);
    ok("empty boots clean", gBBE.ok === true && !JSON.parse(gBBE.sections).live, "no live section may be invented");
  } catch (e) {
    ok("ready suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* CC. recents ready on deploy (note 353): the restore re-put the debugging
     channel (the boot move never sees a draft), and resolving a handle needed
     a page read the wall eats. A restored non-@twocorg channel becomes
     @twocorg in the draft — announced, kept dirty — and @twocorg resolves to
     its id with no network. */
  const cmsCC = text["src/lib/cms.ts"];
  const edCC = text["src/components/editor.tsx"];
  const brCC = text["scripts/bake-recent.mjs"];
  const applyCC = text["APPLY_UPDATE.txt"];
  ok("restore heals the channel", has(cmsCC, "channelMoved") && has(cmsCC, '{ ...rl, youtubeChannel: "@twocorg" }'), "an old backup must not re-put the debugging handle");
  ok("restore stays visible", has(cmsCC, "restoring it must not re-put") && has(cmsCC, "channelMoved: channelMoved || undefined"), "the move must ride Review, not slip in silent");
  ok("empty channel untouched", has(cmsCC, "if (rc && rc.toLowerCase()"), "an unset channel reads the code default, never an invented one");
  ok("toast names the move", has(edCC, "res.channelMoved") && has(edCC, "set to @twocorg (change it back"), "the office must see what moved, with the way back");
  ok("twocorg needs no page read", has(brCC, "/^@?twocorg$/i") && has(brCC, 'return "UCQ0KIUXUV7gTZmDDlvd3ZcQ"'), "the bake must work exactly where the wall eats channel pages");
  ok("failed bake never wipes", has(brCC, "Never wipes"), "a walled read keeps the previous list, never blanks it");
  ok("apply restores without reset", has(applyCC, "also heals the channel"), "the checklist must end with @twocorg from any backup");
  /* DD. rebuilt from the office's base, every fix retained (note 355): the
     attached zip is the 309 site the office wants — publish must work
     automatically on local, the livestream must be perfect, Render must be
     sleep-free, and photo/video backups must restore blank-free on local. */
  const cmsDD = text["src/lib/cms.ts"];
  const liveDD = text["src/lib/livestatus.ts"];
  const srvDD = text["scripts/cms-server.js"];
  const localDD = text["scripts/cms-local.mjs"];
  const followDD = text["scripts/live-follow.mjs"];
  const pushDD = text["scripts/auto-push.mjs"];
  const serveDD = text["scripts/serve.mjs"];
  const viteDD = text["scripts/vite-cms-backend.mjs"];
  const fbDD = text["scripts/seed-fallback.mjs"];
  const edDD = text["src/components/editor.tsx"];
  const applyDD = text["APPLY_UPDATE.txt"];
  ok("follow adopts live", has(localDD, "startLiveFollow") && has(followDD, "shouldAdoptLive") && has(followDD, "adoptPatch"), "a live/admin publish must reach local with no tab open");
  ok("adopt door locked", has(srvDD, "adoptLive") && has(srvDD, "self.__adoptToken"), "only this machine's own loop may adopt");
  ok("publish folds live", has(cmsDD, "async function foldLiveInto") && has(cmsDD, "await foldLiveInto(draft, sectionId)"), "every Publish carries live's newer words by itself");
  ok("auto-push rides out", has(pushDD, "notePublished") && has(localDD, "notePublished"), "a local publish must deploy itself within minutes");
  ok("handle-only answers", has(liveDD, "ownerAllowsCandidate") && has(liveDD, "isStatusForTarget") && has(liveDD, "inheritEnded"), "no foreign video, no stale address, no stray link");
  ok("walled follow plus dead net", has(liveDD, "unverifiedChannelAnswer") && has(liveDD, "verifyYoutubeId"), "chrome with no video plays the channel; dead ids never play blind");
  ok("office reports gated", has(liveDD, "maybeReport") && has(srvDD, "LIVE_REPORT"), "only definitive same-target answers steer visitors");
  ok("fallback serves last publish", has(fbDD, "answerWithSeedFallback") && has(serveDD, "answerWithSeedFallback"), "a wake with no store still serves whole words, never blank");
  ok("wakes print, holds ship", has(serveDD, "cold start at") && has(applyDD, "UptimeRobot"), "every wake is visible; the keep-awake recipe rides along");
  ok("backups embed uploads", has(cmsDD, "allBackupNames"), "a backup must carry the photos and videos the words point at");
  ok("restore proves writes", has(cmsDD, "Read it back") && has(edDD, "missingFiles"), "a counted file must be a served file; missing ones shout by name");
  ok("dev doors open local", has(viteDD, "__restore-file") && has(serveDD, "__restore-file"), "a local restore must land uploads, not blank photos");
  /* EE. only the designated channel plays (note 357): until @twocorg itself
     is verified live the screen waits — no foreign video, no unverified
     channel follow, no stray link ever opens the player. The designation is
     baked (no page read, even through the wall); suggestions answer to it
     (the Live tab vouches where a walled watch page cannot); the office
     reports only verified ids and readers never open videoless live
     reports; the screen and the tap play only the designated channel. */
  const liveEE = text["src/lib/livestatus.ts"];
  const watchEE = text["src/pages/WatchLive.tsx"];
  const blocksEE = text["src/components/blocks.tsx"];
  ok("designation baked, never read", has(liveEE, '"@twocorg": "UCQ0KIUXUV7gTZmDDlvd3ZcQ"') && has(liveEE, "designatedChannelIdForTarget(target.url)"), "the gate must know whose video counts with no page read");
  ok("candidates prove designation", has(liveEE, "candidateStandsForDesignated(watchChannelId(watchHtml), designatedId, vid === liveTabId)"), "a suggestion must stand for @twocorg, not the grab-bag");
  ok("follow needs the designated owner", has(liveEE, 'extractChannelId(html, target.url) : "", designatedId'), "a chrome-only page follows nobody unnamed or foreign");
  ok("office reports verified ids only", has(liveEE, 'if (status.state === "live" && !status.videoId) return;'), "an unverified channel-live answer must stay local");
  ok("readers wait on videoless reports", has(liveEE, "officeRep.target === target.url && reportCarriesVideo(officeRep)"), "a live report with no video must never open the player");
  ok("screen plays only the designation", has(watchEE, "isDesignatedChannel(airForTarget.channelId, designatedId)") && has(watchEE, "designatedChannelIdForTarget(targetUrl)"), "the Watch page must wait until @twocorg is proven live");
  ok("tap plays only the designation", has(blocksEE, "isDesignatedChannel(st.channelId") && has(blocksEE, "st.channelId && (!designatedId || st.channelId === designatedId)"), "a tap must wait on foreign or videoless live answers");
  try {
    const ebEE = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebEE.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tcEE = await ebEE.default.transform(liveEE, { loader: "ts", format: "cjs" });
    const stubEE = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      if (id === "./embed") return { parseYoutubeId: () => "", cleanChannelInput: (v) => String(v || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "") };
      return {};
    };
    const modEE = { exports: {} };
    new Function("module", "exports", "require", tcEE.code)(modEE, modEE.exports, stubEE);
    const D = modEE.exports;
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    ok("designation answered with no read", D.designatedChannelId("@twocorg") === OWNER && D.designatedChannelId("@@twocorg ") === OWNER && D.designatedChannelId("@TWOCORG") === OWNER && D.designatedChannelId("@other") === "" && D.designatedChannelId("") === "", "cleaned input must answer @twocorg and nothing else");
    ok("designation read off the target", D.designatedChannelIdForTarget("https://www.youtube.com/@twocorg/live") === OWNER && D.designatedChannelIdForTarget("https://www.youtube.com/channel/" + OWNER + "/live") === OWNER && D.designatedChannelIdForTarget("https://www.youtube.com/@other/live") === "" && D.designatedChannelIdForTarget("https://www.youtube.com/watch?v=AAAAAAAAAAA") === "", "handles and ids answer; anything else names nothing");
    ok("named foreign channel never stands", D.isDesignatedChannel(OTHER, OWNER) === false && D.isDesignatedChannel(OWNER, OWNER) === true && D.isDesignatedChannel("", OWNER) === true && D.isDesignatedChannel(OTHER, "") === true, "somebody else's video never plays; unprovable passes through");
    const stands = D.candidateStandsForDesignated;
    ok("suggestions answer to the designation", stands(OWNER, OWNER, false) === true && stands(OTHER, OWNER, false) === false && stands(OTHER, OWNER, true) === false && stands("", OWNER, true) === true && stands("", OWNER, false) === false && stands("", "", false) === true, "only the handle's video, or the Live tab's where the wall hides the owner");
    const uca = D.unverifiedChannelAnswer;
    ok("channel follow needs the designated owner", uca(true, "T", OWNER, OWNER).state === "live" && uca(true, "T", OTHER, OWNER).state === "unknown" && uca(true, "T", "", OWNER).state === "unknown" && uca(true, "T", OWNER).state === "live" && uca(false, "T", OWNER, OWNER).state === "off", "unnamed or foreign chrome waits; older callers behave as before");
    const rcv = D.reportCarriesVideo;
    ok("videoless live reports never open", rcv({ state: "live", videoId: "AAAAAAAAAAA" }) === true && rcv({ state: "live", videoId: "" }) === false && rcv({ state: "off", videoId: "" }) === true, "a live report with no video waits; off passes through");
    const inh = D.inheritEnded;
    const ADDR_EE = "https://www.youtube.com/@twocorg/live";
    const foreign = { state: "live", platform: "youtube", videoId: "BBBBBBBBBBB", title: "J", channelId: OTHER, target: ADDR_EE, checkedAt: 1, endedAt: 0 };
    ok("ended screen drops foreign videos", inh(foreign, ADDR_EE, 99, OWNER).videoId === "" && inh(foreign, ADDR_EE, 99, OWNER).endedAt === 0, "the new handle never inherits somebody else's service");
    const unprovable = { state: "live", platform: "youtube", videoId: "BBBBBBBBBBB", title: "J", channelId: "", target: ADDR_EE, checkedAt: 1, endedAt: 0 };
    ok("unprovable endings still stick", inh(unprovable, ADDR_EE, 99, OWNER).videoId === "BBBBBBBBBBB" && inh(unprovable, ADDR_EE, 99).videoId === "BBBBBBBBBBB", "a thin read keeps its cover; older callers behave as before");
  } catch (e) {
    ok("designated suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* FF. recents cleared to @twocorg, slides back to welcome (note 359): the
     card merged every old cached video into each fresh read, so debugging
     videos rode along forever. A foreign-channel cache now reads as empty;
     the first boot clears stored take-offs and replants the lone welcome
     card; untouched drafts heal; later edits are never touched. */
  const rsFF = text["src/lib/recentstreams.ts"];
  const srvFF = text["scripts/cms-server.js"];
  const cmsFF = text["src/lib/cms.ts"];
  const applyFF = text["APPLY_UPDATE.txt"];
  ok("foreign caches read empty", has(rsFF, "cachedChannelId !== designated) return designatedFallback();") && has(rsFF, "designatedChannelId()"), "a list saved for another channel must fall to the @twocorg fallback, never merged");
  ok("take-offs cleared once", has(srvFF, "MEDIA_CLEAN") && has(srvFF, "live359.hiddenReplays = []") && has(srvFF, "mediaClean: MEDIA_CLEAN"), "stored take-offs must go on first boot, later ones never touched");
  ok("welcome replanted once", has(srvFF, "WELCOME_SLIDE_359") && has(srvFF, 'String(slides359[0].id || "") === "welcome-home"'), "any stored slides but the lone welcome card must become it");
  ok("absent slides stay absent", has(srvFF, 'if (typeof SECTIONS.slides === "string")'), "a store with no slides keeps none — the fallback already shows welcome");
  ok("drafts heal on read", has(cmsFF, "healDraftRecents()") && has(cmsFF, "healDraftSlides()") && has(cmsFF, "(dirty as any).slides"), "a pre-clear draft must follow the words; office edits win");
  ok("apply backs up first", has(applyFF, "BACK UP FIRST (step 1)"), "the uploads survive only in the backup file");
  try {
    const ebFF = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebFF.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tcFF = await ebFF.default.transform(rsFF, { loader: "ts", format: "cjs" });
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    const cacheFF = {};
    const stubFF = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => (k in cacheFF ? cacheFF[k] : fb), writeStore: (k, v) => { cacheFF[k] = v; } };
      if (id === "./embed") return { parseYoutubeId: (u) => /([\w-]{11})/.exec(String(u || ""))?.[1] || "", cleanChannelInput: (v) => String(v || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "") };
      if (id === "./livestatus") return { liveTarget: () => ({ url: "https://www.youtube.com/@twocorg/live", kind: "channel" }), designatedChannelId: () => OWNER };
      if (id === "../data/live") return { LIVE: { youtubeChannel: "@twocorg" } };
      return {};
    };
    const modFF = { exports: {} };
    new Function("module", "exports", "require", tcFF.code)(modFF, modFF.exports, stubFF);
    cacheFF["wom.recentstreams"] = { items: [{ videoId: "AAAAAAAAAAA", title: "Debug service", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OTHER };
    ok("foreign cache dropped", modFF.exports.readRecentServices().items[0].videoId === "s4bLaGUNet4", "debugging videos must not survive the read");
    cacheFF["wom.recentstreams"] = { items: [{ videoId: "AAAAAAAAAAA", title: "Sunday service", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OWNER };
    ok("own cache kept", modFF.exports.readRecentServices().items.length === 1, "@twocorg's list must stay");
    cacheFF["wom.recentstreams"] = { items: [{ videoId: "BBBBBBBBBBB", title: "Today's service", at: 0, ago: "", thumb: "", seeded: Date.now() }], at: 5, channelId: "" };
    ok("seeds pass through", modFF.exports.readRecentServices().items.length === 1, "a just-ended service still lists at once");
  } catch (e) {
    ok("recents-cache suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const connFF = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pubFF = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn: connFF }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 359, ...(extra || {}) })));
    const getFF = (rpc) => JSON.parse(rpc.getContent({ conn: connFF }, ""));
    const stripClean = (st) => {
      const dvFF = new DataView(st.buffer);
      const metaChars = dvFF.getUint32(14, false);
      const secChars = dvFF.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(st.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.mediaClean;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dvFF.setUint32(14, nm.length, false);
    };
    const uploadsFF = [
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv12fgp8-IMG_7180.jpeg", headline: "", line: "", active: true },
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv35c9g1-WhatsApp_Image_2026-10-10_at_5.09.06_PM_2", headline: "", line: "", active: true },
    ];
    const stFF = new Uint8Array(8 * 1024 * 1024);
    const rFF0 = loadVm(stubAuth(srvFF), stFF);
    const p0 = pubFF(rFF0, { live: JSON.stringify({ youtubeChannel: "@twocorg", hiddenReplays: ["AAAAAAAAAAA", "BBBBBBBBBBB"] }), slides: JSON.stringify(uploadsFF) }, { first: true });
    ok("ff fixture publishes", p0.ok === true, "pub=" + JSON.stringify(p0).slice(0, 120));
    stripClean(stFF);
    const rFF1 = loadVm(stubAuth(srvFF), stFF);
    const afterFF = getFF(rFF1);
    const secFF = JSON.parse(afterFF.sections);
    const liveFF = secFF.live;
    ok("take-offs cleared", Array.isArray(liveFF.hiddenReplays) && liveFF.hiddenReplays.length === 0 && liveFF.youtubeChannel === "@twocorg", "every take-off goes, the channel stays");
    ok("welcome replanted", Array.isArray(secFF.slides) && secFF.slides.length === 1 && secFF.slides[0].id === "welcome-home" && secFF.slides[0].headline === "Welcome home", "the uploads go, the welcome card stays");
    ok("clear stamps nothing", afterFF.notes === 359, "notes=" + afterFF.notes);
    /* a later take-off and a new slide survive every later boot. */
    const p1 = pubFF(rFF1, { live: JSON.stringify({ ...liveFF, hiddenReplays: ["CCCCCCCCCCC"] }), slides: JSON.stringify([{ id: "easter", image: "https://example.com/e.jpg", headline: "Easter", line: "", cta: "", link: "", design: "auto", active: true }]) });
    ok("ff later edits publish", p1.ok === true);
    const rFF2 = loadVm(stubAuth(srvFF), stFF);
    const secFF2 = JSON.parse(getFF(rFF2).sections);
    ok("later edits survive reboot", secFF2.live.hiddenReplays.length === 1 && secFF2.slides.length === 1 && secFF2.slides[0].id === "easter", "got " + secFF2.slides[0].id);
    /* a store with no slides section gains none. */
    const rFFE = loadVm(stubAuth(srvFF), new Uint8Array(8 * 1024 * 1024));
    ok("absent slides stay absent", !("slides" in JSON.parse(getFF(rFFE).sections)), "the fallback already shows welcome");
  } catch (e) {
    ok("clean-migration suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* GG. this update overrides the last one (note 361): the stamp carries the
     update number so the whole clear re-runs once per update, untouched drafts
     follow, browsers drop old caches on a proven new update, and old office
     reports go silent by themselves. */
  const srvGG = text["scripts/cms-server.js"];
  const cmsGG = text["src/lib/cms.ts"];
  const rsGG = text["src/lib/recentstreams.ts"];
  const lsGG = text["src/lib/livestatus.ts"];
  const applyGG = text["APPLY_UPDATE.txt"];
  ok("override stamp per-update", has(srvGG, "var OVERRIDE_CLEAN = 0;") && has(srvGG, "overrideClean: OVERRIDE_CLEAN") && has(srvGG, "OVERRIDE_NO_397 = 397") && has(srvGG, "OVERRIDE_CLEAN !== OVERRIDE_NO_397"), "the clear must re-run on every new update, not once ever");
  ok("override clears everything old", has(srvGG, "live397.youtubeChannel = \"@twocorg\"") && has(srvGG, "live397.youtubeId = \"\"") && has(srvGG, "live397.hiddenReplays = []") && has(srvGG, "live397.externalYoutubeChannel = \"\"") && has(srvGG, "WELCOME_SLIDE_359") && has(srvGG, "String(slides397[0].id || \"\") === \"welcome-home\""), "channel, stray link, guest, take-offs and slides must all go");
  ok("override never blesses", has(srvGG, "no rev bump") && has(srvGG, "later office work is never touched"), "the clear must not publish");
  ok("draft stray link heals", has(cmsGG, "healDraftStreamLink()") && has(cmsGG, "(draft as any).live = { ...dLive, youtubeId: \"\" }"), "an untouched draft must follow the words");
  ok("browser caches drop on new update", has(rsGG, "export function clearRecentCaches()") && has(cmsGG, "if (freshEyes) clearRecentCaches();"), "old cards must not ride into the new update");
  ok("old reports go silent", has(lsGG, "Number(rep?.notes) === BUILD_NOTES"), "a 359 answer must die when 361 lands");
  ok("apply leads with override", has(applyGG, "overrides the last one, so every old clears away"), "the office must meet the override first");
  try {
    const connGG = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pubGG = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn: connGG }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 361, ...(extra || {}) })));
    const getGG = (rpc) => JSON.parse(rpc.getContent({ conn: connGG }, ""));
    const stripOverride = (st) => {
      const dvGG = new DataView(st.buffer);
      const metaChars = dvGG.getUint32(14, false);
      const secChars = dvGG.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(st.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.overrideClean;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dvGG.setUint32(14, nm.length, false);
    };
    const uploadsGG = [
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv12fgp8-IMG_7180.jpeg", headline: "", line: "", active: true },
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv35c9g1-WhatsApp_Image_2026-10-10_at_5.09.06_PM_2", headline: "", line: "", active: true },
    ];
    const stGG = new Uint8Array(8 * 1024 * 1024);
    const rGG0 = loadVm(stubAuth(srvGG), stGG);
    const p0 = pubGG(rGG0, { live: JSON.stringify({ youtubeChannel: "@debugging", youtubeId: "AAAAAAAAAAA", externalYoutubeChannel: "@guestchan", hiddenReplays: ["BBBBBBBBBBB"] }), slides: JSON.stringify(uploadsGG) }, { first: true });
    ok("gg fixture publishes", p0.ok === true, "pub=" + JSON.stringify(p0).slice(0, 120));
    stripOverride(stGG);
    const rGG1 = loadVm(stubAuth(srvGG), stGG);
    const afterGG = getGG(rGG1);
    const secGG = JSON.parse(afterGG.sections);
    const liveGG = secGG.live;
    ok("override moves channel", liveGG.youtubeChannel === "@twocorg", "got " + liveGG.youtubeChannel);
    ok("override drops stray link", liveGG.youtubeId === "", "got " + liveGG.youtubeId);
    ok("override clears the guest", liveGG.externalYoutubeChannel === "", "got " + liveGG.externalYoutubeChannel);
    ok("override clears take-offs", Array.isArray(liveGG.hiddenReplays) && liveGG.hiddenReplays.length === 0, "got " + JSON.stringify(liveGG.hiddenReplays));
    ok("override replants welcome", Array.isArray(secGG.slides) && secGG.slides.length === 1 && secGG.slides[0].id === "welcome-home", "got " + (secGG.slides[0] || {}).id);
    ok("override stamps nothing", afterGG.notes === 361, "notes=" + afterGG.notes);
    const p1 = pubGG(rGG1, { live: JSON.stringify({ youtubeChannel: "@twocorg", youtubeId: "", externalYoutubeChannel: "@newevent", hiddenReplays: ["CCCCCCCCCCC"] }), slides: JSON.stringify([{ id: "easter", image: "x", headline: "Easter", line: "", active: true }]) });
    ok("gg second publish", p1.ok === true, "pub=" + JSON.stringify(p1).slice(0, 120));
    const rGG2 = loadVm(stubAuth(srvGG), stGG);
    const secGG2 = JSON.parse(getGG(rGG2).sections);
    ok("later edits survive reboot", secGG2.live.hiddenReplays.length === 1 && secGG2.slides.length === 1 && secGG2.slides[0].id === "easter" && secGG2.live.externalYoutubeChannel === "@newevent", "got " + secGG2.slides[0].id);
  } catch (e) {
    ok("override suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* HH. the last previous livestream stands in (note 363): the 15
     @twocorg services ship in the code for dead-proxy days, three cache doors
     fall to them, deployed visitors read through their own host, and the stuck
     jazz report is named so the office can prove it dead. */
  const rsHH = text["src/lib/recentstreams.ts"];
  const applyHH = text["APPLY_UPDATE.txt"];
  ok("fallback ships in code", has(rsHH, "DESIGNATED_FALLBACK_ITEMS") && has(rsHH, "export function designatedFallback()"), "the previous services must survive an empty bake + dead proxies");
  ok("fallback is the last service first", rsHH.indexOf("s4bLaGUNet4") > 0 && rsHH.indexOf("s4bLaGUNet4") < rsHH.indexOf("aT5IeCtJHFw"), "SUNDAY SERVICE, 11TH OCT. 2026 must lead");
  ok("three cache doors", has(rsHH, "if (!cached || !Array.isArray(cached.items)) return designatedFallback();") && has(rsHH, "cachedChannelId !== designated) return designatedFallback();") && has(rsHH, "if (!items.length) return designatedFallback();"), "empty, foreign and thin caches must all fall back");
  ok("same-origin read", has(rsHH, "fetchTextSameOrigin") && has(rsHH, "const sameOrigin = await fetchTextSameOrigin(url);") && !has(rsHH, "fetchTextLocal"), "deployed visitors must read through their own host");
  ok("jazz named", has(applyHH, "zJvgsAhpNlo") && has(applyHH, "small\n  village"), "the office must know exactly which video is poison");
  try {
    const ebHH = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebHH.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const tcHH = await ebHH.default.transform(rsHH, { loader: "ts", format: "cjs" });
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    const runHH = (store, designated) => {
      const stub = (id) => {
        if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useSyncExternalStore: () => ({}) };
        if (id === "./hooks") return { readStore: (k, fb) => (k in store ? store[k] : fb), writeStore: (k, v) => { store[k] = v; } };
        if (id === "./embed") return { parseYoutubeId: (u) => /([\w-]{11})/.exec(String(u || ""))?.[1] || "", cleanChannelInput: (v) => String(v || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "") };
        if (id === "./livestatus") return { liveTarget: () => ({ url: "https://www.youtube.com/@twocorg/live", kind: "channel" }), designatedChannelId: () => designated };
        if (id === "../data/live") return { LIVE: { youtubeChannel: "@twocorg" } };
        return {};
      };
      const mod = { exports: {} };
      new Function("module", "exports", "require", tcHH.code)(mod, mod.exports, stub);
      return mod.exports;
    };
    const withDes = runHH({}, OWNER);
    const empty = withDes.readRecentServices();
    ok("empty cache falls back", empty.items.length === 15 && empty.items[0].videoId === "s4bLaGUNet4" && empty.channelId === OWNER, "got " + empty.items.length + " first=" + (empty.items[0] || {}).videoId);
    const foreign = runHH({ "wom.recentstreams": { items: [{ videoId: "AAAAAAAAAAA", title: "Debug", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OTHER } }, OWNER);
    const f2 = foreign.readRecentServices();
    ok("foreign cache falls back", f2.items.length === 15 && f2.items[0].videoId === "s4bLaGUNet4", "debugging videos must not survive");
    const own = runHH({ "wom.recentstreams": { items: [{ videoId: "AAAAAAAAAAA", title: "Sunday", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OWNER } }, OWNER);
    ok("own cache kept", own.readRecentServices().items.length === 1, "a good list must stay");
    const nodes = runHH({}, "");
    ok("no designation, no fallback", nodes.readRecentServices().items.length === 0 && nodes.designatedFallback().items.length === 0, "anywhere else answers empty as before");
  } catch (e) {
    ok("fallback suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* II. the seed cannot go missing (note 365): the repo seed backs
     the bake, an empty bake fails the build out loud, recents ride every
     re-bake, and git force-tracks the seed. */
  const bakeII = text["scripts/bake-seed.mjs"];
  const statII = text["scripts/build-static.mjs"];
  const giII = text[".gitignore"];
  const applyII = text["APPLY_UPDATE.txt"];
  ok("guard wired", has(bakeII, 'from "./seed-guard.mjs"') && has(bakeII, "pickBakeSource(") && has(bakeII, "pickRecent("), "the bake must decide through the pure guard");
  ok("repo seed fallback", has(bakeII, "shipping repo seed.json") && has(bakeII, "target !== rootSeedPath"), "a backend-less build must ship the repo seed whole");
  ok("empty bake throws", has(bakeII, 'code = "EMPTY_BAKE"') && has(bakeII, "refusing to ship an empty bake"), "nowhere holding words must fail loud");
  ok("red build", has(statII, 'err.code === "EMPTY_BAKE"') && has(statII, "process.exit(1)"), "Render must go red, never deploy a silent shell");
  ok("recents ride along", has(bakeII, "carried = pickRecent(") && has(bakeII, "recent: fresh"), "a re-bake must never drop the previous livestreams");
  ok("seed force-tracked", has(giII, "!seed.json"), "no *.json rule may hide the seed again");
  ok("step zero lists dotfile", has(applyII, "maintenance-hold.txt and .gitignore"), "manual copies skip hidden files unless named");
  try {
    const ebII = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebII.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const tcII = await ebII.default.transform(text["scripts/seed-guard.mjs"], { loader: "js", format: "cjs" });
    const modII = { exports: {} };
    new Function("module", "exports", "require", tcII.code)(modII, modII.exports, () => ({}));
    const gII = modII.exports;
    const full = { sections: { live: {}, slides: [] }, recent: { items: [{ videoId: "AAAAAAAAAAA" }], at: 9, channelId: "UCQ0KIUXUV7gTZmDDlvd3ZcQ" } };
    ok("backend wins", gII.pickBakeSource({ backend: full, targetPrev: full, rootSeed: full }).kind === "backend", "a live backend bakes fresh words");
    ok("target kept", gII.pickBakeSource({ backend: { sections: {} }, targetPrev: full, rootSeed: full }).kind === "target", "an empty backend keeps the file at the target");
    ok("repo shipped", gII.pickBakeSource({ backend: null, targetPrev: { sections: {} }, rootSeed: full }).kind === "root", "a backend-less build ships the repo seed");
    ok("empty refused", gII.pickBakeSource({ backend: null, targetPrev: null, rootSeed: { sections: {} } }).kind === "empty", "nowhere holding words must refuse");
    ok("newest recents carried", gII.pickRecent({ items: [{ videoId: "A" }], at: 3 }, { items: [{ videoId: "B" }], at: 7 })?.items[0].videoId === "B" && gII.pickRecent({ items: [] }, null) === null, "the newest list rides, nothing invents one");
  } catch (e) {
    ok("guard suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* JJ. the server gates the relay (note 367): a closed tab's last word
     dies on the server for every version at once, and an outdated tab's
     answers stop steering the site the moment the new update is published. */
  const srvJJ = text["scripts/cms-server.js"];
  ok("relay gate exists", has(srvJJ, "function gatedReport()") && has(srvJJ, "function reportRelayable(rep, floor, now)") && has(srvJJ, "REPORT_RELAY_MS = 150_000"), "the read path must relay through the gate");
  ok("relay checks server age", has(srvJJ, "now - at > REPORT_RELAY_MS"), "freshness must use the arrival stamp, never the reporter's clock");
  ok("relay checks the update", has(srvJJ, "floor > 0 && notes < floor"), "an outdated tab must go silent once the new update publishes");
  ok("gated answers wiped", has(srvJJ, "if (LIVE_REPORT) LIVE_REPORT = null;"), "a dead answer must not wait in the store for later");
  try {
    const fnJJ = new Function("rep,floor,now,ms", "var REPORT_RELAY_MS = ms;\n" + srvJJ.slice(srvJJ.indexOf("function reportRelayable"), srvJJ.indexOf("function gatedReport")) + "\nreturn reportRelayable(rep, floor, now);");
    ok("fresh flows pre-publish", fnJJ({ at: Date.now(), notes: 341 }, 0, Date.now(), 150000) === true, "before the first publish any fresh answer still relays");
    ok("stale dies", fnJJ({ at: Date.now() - 151000, notes: 367 }, 367, Date.now(), 150000) === false, "a 5-minute-old answer relays to no version");
    ok("outdated dies", fnJJ({ at: Date.now(), notes: 341 }, 367, Date.now(), 150000) === false, "the 341 jazz report goes silent once 367 publishes");
    ok("current flows", fnJJ({ at: Date.now(), notes: 367 }, 367, Date.now(), 150000) === true, "the office's own 367 answer still relays");
    ok("nothing relays null", fnJJ(null, 367, Date.now(), 150000) === false, "no report must never become a report");
  } catch (e) {
    ok("relay suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const connJJ = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const openJJ = stubAuth(srvJJ.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");'));
    const rpcJJ = loadVm(openJJ, new Uint8Array(8 * 1024 * 1024));
    const wJJ = (payload) => JSON.parse(rpcJJ.liveReport({ conn: connJJ }, JSON.stringify(payload)));
    const rJJ = () => JSON.parse(rpcJJ.liveReport({ conn: connJJ }, ""));
    const repJJ = (notes) => ({ target: "https://www.youtube.com/@twocorg/live", state: "live", videoId: "xIH3-U6pG0M", title: "jazz", checkedAt: Date.now(), notes });
    wJJ(repJJ(341));
    ok("old answer relays pre-publish", rJJ().report && rJJ().report.videoId === "xIH3-U6pG0M", "before the publish nothing changes");
    const pJJ = JSON.parse(rpcJJ.publish({ conn: connJJ }, JSON.stringify({ sections: { live: JSON.stringify({ youtubeChannel: "@twocorg" }) }, by: "office", changed: ["live"], notes: 367, first: true })));
    ok("367 publishes", pJJ.ok === true, "pub=" + JSON.stringify(pJJ).slice(0, 120));
    const afterJJ = rJJ();
    ok("old answer dies on publish", afterJJ.ok === true && afterJJ.report === null, "the outdated tab is cut off the moment 367 publishes");
    wJJ(repJJ(367));
    ok("new answer flows", rJJ().report && rJJ().report.videoId === "xIH3-U6pG0M", "the current office still reports");
  } catch (e) {
    ok("relay round-trip", false, String((e && e.message) || e).slice(0, 200));
  }
  /* KK. every browser looks new (notes 369, 395): a 30-second poll with a
     retried reload onto newer code — and since 395 no cross-tab shout, no
     waiting number, and no accusing banner on the office tab. */
  const cmsKK = text["src/lib/cms.ts"];
  const appKK = text["src/App.tsx"];
  const admKK = text["src/pages/Admin.tsx"];
  ok("poll is faster", has(appKK, "}, 30_000);") && has(appKK, "checkStaleBuild"), "the host must be asked every 30 seconds, not 60");
  ok("no cross-tab shout", !has(cmsKK, "announceNewUpdate") && !has(cmsKK, "STALE_BC_NAME") && !has(cmsKK, "STALE_PING_KEY") && !has(cmsKK, "startStaleCoReload") && !has(appKK, "startStaleCoReload"), "no update-number shout may pass between tabs");
  ok("no waiting number", !has(cmsKK, "staleWaitingNotes"), "no banner may name the live update");
  ok("admin wears no wait", !has(admKK, "Update {cms.staleWaitingNotes()} is live") && !has(admKK, "This is an old copy") && !has(admKK, "cms.useStaleBuild()") && !has(admKK, "cms.useOlderCopy()"), "the office tab must not accuse the update");
  /* LL. notice numbers, fast feed, guaranteed still (note 371): the waiting
     page names its numbers, proxy doors fail fast with a baked resolve for
     the designated handle, and the cover stands in the last previous
     thumbnail by itself. */
  const layLL = text["src/components/layout.tsx"];
  const recLL = text["src/lib/recentstreams.ts"];
  const watchLL = text["src/pages/WatchLive.tsx"];
  ok("notice numbers retired", !has(layLL, "awaiting the office publish (last publish: update") && !has(layLL, "maint__notes"), "the waiting page must not print update numbers");
  ok("feed fails fast", has(recLL, "const TIMEOUT_MS = 8_000;"), "dead proxies must not hold the deployed feed a minute");
  ok("designated skips the read", has(recLL, "const designated = designatedChannelId(pasted);") && has(recLL, "if (designated) return designated;"), "@twocorg is known without any page read");
  ok("cover stands in the still", has(watchLL, "designatedFallback().items[0]?.thumb"), "the ended screen takes the last previous thumbnail with no read needed");
  /* MM. the boot banner diagnoses itself (note 373): a resource error names
     its file (never "[object Event]"), and a pre-boot file failure reloads
     once per tab instead of sitting black. */
  const htmlMM = text["index.html"];
  ok("boot names the file", has(htmlMM, "__womDescribeErr") && has(htmlMM, "could not load ") && has(htmlMM, "(url ? \" \" + url : \"\")"), "the banner must name the failed file");
  ok("boot never objects", has(htmlMM, "unknown boot error") && !has(htmlMM, "String((e && e.message) || e)"), "no path may stringify an event again");
  ok("boot heals once", has(htmlMM, "wom.boot.retried") && has(htmlMM, "window.location.reload()"), "a stale page or mid-deploy load must heal with one reload, never loop");
  /* NN. dead photos fall back to welcome (note 375): a wiped upload answers
     with a page, not a picture — the slide must paint welcome, never black. */
  const sNN = text["src/components/slides.tsx"];
  ok("slide-photo decision is pure", has(sNN, "export function resolveSlidePhoto(named: string, welcome: string, dead: boolean)"), "the choice must be unit-runnable");
  ok("every flat face goes through it", has(sNN, "const original = resolveSlidePhoto(named, welcome, useDeadPhoto(named))"), "no face may paint a named photo unasked");
  ok("probe skips non-photos", has(sNN, "isSlideVideoUrl(url) || url.startsWith(\"data:\") || url.startsWith(\"blob:\")"), "films and composed frames must never count as dead");
  try {
    const ebNN = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebNN.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const from = sNN.indexOf("export function resolveSlidePhoto(");
    let depthNN = 0, endNN = -1, openedNN = false;
    for (let i = from; i < sNN.length && endNN < 0; i++) {
      const ch = sNN[i];
      if (ch === "{") { depthNN++; openedNN = true; }
      else if (ch === "}") { depthNN--; if (openedNN && depthNN === 0) endNN = i + 1; }
    }
    const tcNN = await ebNN.default.transform(sNN.slice(from, endNN).replace("export function", "function"), { loader: "ts", format: "cjs" });
    const modNN = { exports: {} };
    new Function("module", "exports", tcNN.code + "\nmodule.exports = resolveSlidePhoto;")(modNN, modNN.exports);
    const decide = modNN.exports;
    ok("empty paints welcome", decide("", "W", false) === "W" && decide("", "W", true) === "W");
    ok("dead named paints welcome", decide("https://host/data/uploads/x.jpeg", "W", true) === "W");
    ok("live named keeps painting", decide("https://host/data/uploads/x.jpeg", "W", false) === "https://host/data/uploads/x.jpeg");
    ok("dead welcome stays welcome", decide("W", "W", true) === "W");
  } catch (e) {
    ok("slide-photo suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* OO. builds always exit (note 377): the follow loop is opt-in for serving
     processes — bakes must never start it, or static-host builds hang. */
  const locOO = text["scripts/cms-local.mjs"];
  const srvOO = text["scripts/serve.mjs"];
  const viteOO = text["scripts/vite-cms-backend.mjs"];
  const bsOO = text["scripts/bake-seed.mjs"];
  const brOO = text["scripts/bake-recent.mjs"];
  ok("host takes the follow flag", has(locOO, "createCmsHost(rootDir, opts)") && has(locOO, "if (opts && opts.follow)"), "the loop must be asked for, never assumed");
  ok("servers opt in", has(srvOO, "createCmsHost(ROOT, { follow: true })") && has(viteOO, "{ follow: true }"), "npm start and npm run dev keep following live");
  ok("dev-only follow", has(viteOO, "config.command === \"serve\" ? { follow: true } : undefined"), "the vite hook also runs for vite build, where no loop may start");
  ok("bakes stay loop-free", has(bsOO, "createCmsHost(rootDir);") && has(brOO, "createCmsHost(rootDir);") && !has(bsOO, "follow: true") && !has(brOO, "follow: true"), "no bake may start the minute timer");
  /* PP. temporary guest channel (note 379): a one-off livestream from another
     address plays while IT is live, never seeds recents, and everything falls
     back to the main channel when it ends. */
  const livePP = text["src/lib/livestatus.ts"];
  const watchPP = text["src/pages/WatchLive.tsx"];
  const blocksPP = text["src/components/blocks.tsx"];
  const editorPP = text["src/components/editor.tsx"];
  const autoPP = text["src/lib/autostop.ts"];
  const cmsPP = text["src/lib/cms.ts"];
  const schemaPP = text["src/lib/cmsSchema.ts"];
  const liveDefPP = text["src/data/live.ts"];
  const seedPP = text["seed.json"];
  ok("guest target reads its own field", has(livePP, "export function guestTarget(channelInput?: string)") && has(livePP, "LIVE.externalYoutubeChannel"), "the guest slot must never read the main channel");
  ok("guest stamp is its own gate", has(livePP, "export function isGuestTargetUrl(targetUrl: string, guestUrl: string)"), "only the guest's own answer may stand for the guest");
  ok("guest asked first, main decides the rest", has(livePP, "const guest = guestTarget()") && has(livePP, "const officeGuest = guest && officeRep && officeRep.target === guest.url") && has(livePP, "const guestLive = guestAns.state === \"live\""), "guest-live must win the screen; guest off/unknown must fall through");
  ok("guest never ends the main screen", has(livePP, "const targetUrl = (guestLive && guest ? guest.url : target?.url)"), "the stamp — and the report after it — must say the winner");
  ok("office reports the winner", has(livePP, 'const url = String(status.target || "") || liveTarget()?.url || ""'), "a guest-live answer must steer visitors to the guest");
  ok("retype still silences", has(livePP, 'url !== (liveTarget()?.url || "") && url !== (guestTarget()?.url || "")'), "a moved channel must never report");
  ok("screen plays the guest", has(watchPP, "const screenAir = guestLive ? guestAir : airForTarget") && has(watchPP, "const guestLive = guestAir.state"), "guest-live plays; its end returns the main screen");
  ok("guest follow is one tap", has(watchPP, "guestLive ? isGuestTargetUrl(screenAir.target, guestUrl)"), "a walled guest follows its own channel, never autoplay");
  ok("tap opens the guest", has(blocksPP, "guestTarget()?.url") && has(blocksPP, "isGuestTargetUrl(st.target"), "a tap on a guest-live screen must play, not wait");
  ok("guest never seeds recents", has(editorPP, "isGuestTargetUrl(aired.target") && has(autoPP, "isGuestTargetUrl(air.target"), "a guest ending files nothing");
  ok("guest pastes clean", has(cmsPP, "cleanChannelInput(value.externalYoutubeChannel)"), "a doubled @ must never break the guest slot");
  ok("drawer carries the slot", has(schemaPP, 'path: "externalYoutubeChannel"') && has(liveDefPP, "externalYoutubeChannel"), "the office needs the field; the code needs the default");
  ok("bake carries the slot", has(seedPP, '"externalYoutubeChannel":""'), "fresh copies must read an empty guest, never undefined");
  try {
    const ebPP = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebPP.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabPP = (src, name) => {
      const from = src.indexOf("export function " + name + "(");
      /* The body brace is the LAST "{" on the signature line: a return-type
         annotation may carry its own balanced braces earlier on the same
         line (e.g. `: { url: string; ... } | null {`). */
      const eol = src.indexOf("\n", from);
      const body = src.lastIndexOf("{", eol);
      let depth = 0, end = -1;
      for (let i = body; i < src.length && end < 0; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) end = i + 1; }
      }
      return src.slice(from, end).replace("export function", "function");
    };
    const setupPP = "function cleanChannelInput(s){ return String(s || \"\").trim().replace(/@@+/g, \"@\").replace(/\\s+/g, \"\"); }\nvar LIVE = { externalYoutubeChannel: \"\" };\n";
    const tcGuest = await ebPP.default.transform(setupPP + grabPP(livePP, "guestTarget") + "\nmodule.exports = guestTarget;", { loader: "ts", format: "cjs" });
    const modGuest = { exports: {} };
    new Function("module", "exports", tcGuest.code)(modGuest, modGuest.exports);
    const guestTargetFn = modGuest.exports;
    ok("guest handle resolves", guestTargetFn("@guestchan")?.url === "https://www.youtube.com/@guestchan/live" && guestTargetFn("@guestchan")?.kind === "channel");
    ok("guest empty is null", guestTargetFn("") === null && guestTargetFn("   ") === null);
    ok("guest doubled @ heals", guestTargetFn("@@guestchan")?.url === "https://www.youtube.com/@guestchan/live");
    ok("guest id resolves", guestTargetFn("UCQ0KIUXUV7gTZmDDlvd3ZcQ")?.url === "https://www.youtube.com/channel/UCQ0KIUXUV7gTZmDDlvd3ZcQ/live");
    const tcIsGuest = await ebPP.default.transform(grabPP(livePP, "isGuestTargetUrl") + "\nmodule.exports = isGuestTargetUrl;", { loader: "ts", format: "cjs" });
    const modIsGuest = { exports: {} };
    new Function("module", "exports", tcIsGuest.code)(modIsGuest, modIsGuest.exports);
    const isGuest = modIsGuest.exports;
    ok("own stamp stands", isGuest("https://www.youtube.com/@guestchan/live", "https://www.youtube.com/@guestchan/live") === true);
    ok("foreign stamp falls", isGuest("https://www.youtube.com/@twocorg/live", "https://www.youtube.com/@guestchan/live") === false);
    ok("empty guest waits", isGuest("https://www.youtube.com/@twocorg/live", "") === false && isGuest("", "https://www.youtube.com/@guestchan/live") === false);
  } catch (e) {
    ok("guest suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* QQ. quiet waiting page (note 381): the notice keeps waiting, but the
     update-numbers small print is gone at the church's request. */
  const layQQ = text["src/components/layout.tsx"];
  ok("numbers line gone", !has(layQQ, "maint__notes") && !has(layQQ, "awaiting the office publish"), "no update numbers anywhere on the waiting page");
  ok("notice still waits", has(layQQ, "We&rsquo;ll be right back") && has(layQQ, "Please check back shortly"), "the notice itself stays");
  ok("no dangling number reads", !has(layQQ, "BUILD_NOTES") && !has(layQQ, "publishedNotesVersion"), "unused number plumbing must go with the line");
  /* RR. publish lands everywhere, live plays by itself WITH SOUND (notes 383,
     387): a missed shout heals within the half minute on every copy; the live
     screen opens with no tap, and no live from a channel is ever silenced —
     the embeds take no mute and the player has no silent path. */
  const srvRR = text["scripts/cms-server.js"];
  const cmsRR = text["src/lib/cms.ts"];
  const embRR = text["src/lib/embed.ts"];
  const blocksRR = text["src/components/blocks.tsx"];
  const watchRR = text["src/pages/WatchLive.tsx"];
  const schemaRR = text["src/lib/cmsSchema.ts"];
  ok("rev stamp is public", has(srvRR, "contentRev: function (info)") && has(srvRR, "return ok({ rev: REV, notes: NOTES, at: AT });"), "visitors must read the stamp with no session");
  ok("every tab watches the stamp", has(cmsRR, "function startContentWatch()") && has(cmsRR, "socket.rpc.contentRev") && has(cmsRR, "30_000") && cmsRR.split("startContentWatch();").length >= 3, "local, mobile and desktop must all pull a missed publish");
  ok("watch pulls the guarded path", has(cmsRR, "r.rev !== rev") && has(cmsRR, "await syncFromServer()"), "the stamp must lead to the same sync the shout takes");
  ok("self-starts play with sound", has(blocksRR, "embedSrc(source, true)") && !has(blocksRR, "userOpened") && !has(blocksRR, "embedSrc(source, true, true)"), "no opening — tapped or self-started — may lose its audio");
  ok("screen autoplays live", has(watchRR, "autoPlay={streaming && watchable}"), "verified, follow or link — no poster while LIVE");
  ok("guest renamed", has(schemaRR, 'label: "Guest channel"') && !has(schemaRR, "Temporary guest channel"), "the drawer must not say Temporary");
  try {
    const ebRR = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebRR.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const teRR = await ebRR.default.transform(embRR, { loader: "ts", format: "cjs" });
    const modRR = { exports: {} };
    new Function("module", "exports", teRR.code)(modRR, modRR.exports);
    const yte = modRR.exports.youtubeEmbed;
    const che = modRR.exports.youtubeChannelEmbed;
    const srcOf = modRR.exports.embedSrc;
    const VID = "dQw4w9WgXcQ";
    const OWNER_RR = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    ok("no live ever silenced", yte(VID, true, true).indexOf("mute") === -1 && yte(VID, true).indexOf("mute") === -1, "even a legacy muted call must play with sound");
    ok("old outputs identical", yte(VID, true) === "https://www.youtube.com/embed/" + VID + "?rel=0&modestbranding=1&playsinline=1&autoplay=1" && yte(VID, false).indexOf("autoplay") === -1 && yte(VID, false).indexOf("mute") === -1, "two-arg calls must build exactly what they built");
    ok("channel never silenced", che(OWNER_RR, true, true).indexOf("live_stream?channel=" + OWNER_RR) !== -1 && che(OWNER_RR, true, true).indexOf("mute") === -1, "a followed channel must self-start with sound too");
    ok("channel default identical", che(OWNER_RR, false) === "https://www.youtube.com/embed/live_stream?channel=" + OWNER_RR + "&rel=0&modestbranding=1&playsinline=1", "the old two-arg channel build must not move");
    ok("sound src threads through", srcOf({ platform: "youtube", youtubeChannelId: OWNER_RR }, true, true).indexOf("mute") === -1 && srcOf({ platform: "youtube", youtubeChannelId: OWNER_RR }, true).indexOf("mute") === -1, "the player must never build a silent address");
    const connRR = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const stRR = new Uint8Array(8 * 1024 * 1024);
    const rpcRR = loadVm(stubAuth(srvRR), stRR);
    const rev0 = JSON.parse(rpcRR.contentRev({ conn: connRR }, ""));
    ok("stamp reads empty", rev0.ok === true && rev0.rev === 0 && typeof rev0.at === "number", "a fresh box stamps rev 0");
    const pubRR = JSON.parse(rpcRR.publish({ conn: connRR }, JSON.stringify({ sections: { live: JSON.stringify({ youtubeChannel: "@twocorg" }) }, by: "office", changed: ["live"], notes: 387, first: true })));
    const rev1 = JSON.parse(rpcRR.contentRev({ conn: connRR }, ""));
    ok("stamp follows publish", pubRR.ok === true && rev1.ok === true && rev1.rev === 1 && rev1.notes === 387, "the watch must see every publish move");
  } catch (e) {
    ok("publish-everywhere suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* SS. LIVE waits for the stream, every fix arrives clean, no take-over,
     close on any end (notes 385, 387): badges ask displayLive (stream or
     switch, never the bare clock) while cadence still asks onAir; the override
     stamp is 385 and clears the guest slot with the rest; untouched drafts and
     restores follow; a guest ending into a live main shuts the screen; note
     387 extends the shut to ANY end on the off reading (unknown never closes),
     and only a new live edge re-arms so starts still play with sound. */
  const storeSS = text["src/lib/store.ts"];
  const liveSS = text["src/lib/livestatus.ts"];
  const watchSS = text["src/pages/WatchLive.tsx"];
  const cmsSS = text["src/lib/cms.ts"];
  const srvSS = text["scripts/cms-server.js"];
  const edSS = text["src/components/editor.tsx"];
  const laySS = text["src/components/layout.tsx"];
  const homeSS = text["src/pages/Home.tsx"];
  const blocksSS = text["src/components/blocks.tsx"];
  const appSS = text["src/App.tsx"];
  const applySS = text["APPLY_UPDATE.txt"];
  ok("display predicate exists", has(storeSS, "export function displayLive(info?: NextServiceInfo | null): boolean") && has(storeSS, "if (!LIVE.isLive) return false;"), "badges need the stream-or-switch answer");
  ok("cadence still hears the clock", has(storeSS, "export function onAir(info?: NextServiceInfo | null): boolean") && has(appSS, "onAir(gathering)") && has(watchSS, "onAir(info) || info.msUntil"), "detection must stay armed around services");
  ok("badges ask displayLive", has(laySS, "displayLive(info)") && has(homeSS, "displayLive(info)") && has(blocksSS, "displayLive(info)") && has(watchSS, "displayLive(info) && !shutNow"), "pill, hero, card and panel must all wait for the stream");
  ok("bare clock lights nothing", !has(laySS, "const live = onAir(info);") && !has(homeSS, "{onAir(info) ? (") && !has(blocksSS, "const live = onAir(info);") && !has(watchSS, "const onAirNow = onAir(info);"), "no badge may read the clock answer");
  ok("screen shuts after an end", has(watchSS, "nextScreenShut(shut, shutPrevRef.current, guestUrl, screenAir.state") && has(watchSS, "const streaming = screenAir.state === \"live\" && !shutNow;") && has(liveSS, "export function nextScreenShut(") && has(liveSS, "export type ScreenShut") && has(watchSS, "screenAir.state === \"off\""), "any end must close the screen, never hand another channel over");
  ok("guest still clears", has(cmsSS, "healDraftGuest()") && has(cmsSS, "(draft as any).live = { ...dLive, externalYoutubeChannel: \"\" }") && has(cmsSS, "guestCleared: guestCleared || undefined") && has(edSS, "res.guestCleared"), "untouched drafts and restores must follow the clear");
  ok("drawer carries no promise text", !has(edSS, "the LIVE badge and the player wait for the stream itself") && !has(edSS, "Play and pause are one button") && !has(edSS, "the site is showing live by itself") && has(edSS, "Nothing is set to play yet"), "the promise paragraph is gone but functional — the unconfigured warning stays");
  ok("apply leads with the shut", has(applySS, "never plays another channel's livestream by itself"), "the office must meet the closed screen first");
  try {
    const ebSS = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebSS.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabSS = (src, name) => {
      const from = src.indexOf("export function " + name + "(");
      const eol = src.indexOf("\n", from);
      const body = src.lastIndexOf("{", eol);
      let depth = 0, end = -1;
      for (let i = body; i < src.length && end < 0; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) end = i + 1; }
      }
      return src.slice(from, end).replace("export function", "function");
    };
    const tcShut = await ebSS.default.transform(grabSS(liveSS, "nextScreenShut") + "\nmodule.exports = nextScreenShut;", { loader: "ts", format: "cjs" });
    const modShut = { exports: {} };
    new Function("module", "exports", tcShut.code)(modShut, modShut.exports);
    const shutFn = modShut.exports;
    const MAIN_SS = "https://www.youtube.com/@twocorg/live";
    const GUEST_SS = "https://www.youtube.com/@guestchan/live";
    const OTHER_SS = "https://www.youtube.com/watch?v=AAAAAAAAAAA";
    ok("take-over shuts", JSON.stringify(shutFn(null, GUEST_SS, GUEST_SS, true, MAIN_SS)) === JSON.stringify({ playing: MAIN_SS }));
    ok("guest end shuts", JSON.stringify(shutFn(null, GUEST_SS, GUEST_SS, false, "", true)) === JSON.stringify({ playing: GUEST_SS }));
    ok("main end shuts", JSON.stringify(shutFn(null, MAIN_SS, GUEST_SS, false, "", true)) === JSON.stringify({ playing: MAIN_SS }));
    ok("unknown never shuts", shutFn(null, MAIN_SS, GUEST_SS, false, "") === null);
    ok("main re-entry plays", shutFn(null, MAIN_SS, GUEST_SS, true, MAIN_SS) === null);
    ok("guest start plays", shutFn(null, MAIN_SS, GUEST_SS, true, GUEST_SS) === null);
    ok("no guest, no shut", shutFn(null, MAIN_SS, "", true, MAIN_SS) === null);
    const heldSS = { playing: MAIN_SS };
    ok("shut holds while it plays", shutFn(heldSS, MAIN_SS, GUEST_SS, true, MAIN_SS) === heldSS);
    ok("quiet stays shut", shutFn(heldSS, MAIN_SS, GUEST_SS, false, "") === heldSS);
    ok("shut survives quiet", shutFn(heldSS, "", GUEST_SS, false, "") === heldSS);
    ok("same channel restart plays", shutFn(heldSS, "", GUEST_SS, true, MAIN_SS) === null);
    ok("guest restart re-arms", shutFn(heldSS, MAIN_SS, GUEST_SS, true, GUEST_SS) === null);
    ok("other new edge re-arms", shutFn(heldSS, MAIN_SS, GUEST_SS, true, OTHER_SS) === null);
    const setupSS = "var LIVESS = { isLive: false, liveCut: 0, liveCommandAt: 0, liveSince: 0 };\nvar DETSS = { now: false, endedAt: 0 };\nfunction liveNow(){ return DETSS.now; }\nfunction liveEndedAt(){ return DETSS.endedAt; }\n";
    const tcDisp = await ebSS.default.transform(setupSS + grabSS(storeSS, "streamCut").replace(/LIVE/g, "LIVESS") + "\n" + grabSS(storeSS, "displayLive").replace(/LIVE/g, "LIVESS") + "\nmodule.exports = { displayLive: displayLive, __set: function (l, d) { Object.assign(LIVESS, l); Object.assign(DETSS, d); } };", { loader: "ts", format: "cjs" });
    const modDisp = { exports: {} };
    new Function("module", "exports", tcDisp.code)(modDisp, modDisp.exports);
    const dispFn = modDisp.exports.displayLive;
    const setSS = modDisp.exports.__set;
    const TSS = Date.now();
    setSS({ isLive: false, liveCut: 0, liveCommandAt: 0, liveSince: 0 }, { now: true, endedAt: 0 });
    ok("detected stream shows", dispFn({ isLive: false, at: new Date(TSS) }) === true);
    setSS({ isLive: true }, { now: false });
    ok("office switch shows", dispFn({ isLive: false, at: new Date(TSS) }) === true);
    setSS({ isLive: false }, {});
    ok("bare clock stays quiet", dispFn({ isLive: true, at: new Date(TSS) }) === false);
    ok("quiet stays quiet", dispFn({ isLive: false, at: new Date(TSS) }) === false && dispFn(null) === false && dispFn(undefined) === false);
    setSS({ isLive: true, liveCut: TSS, liveCommandAt: 0, liveSince: 0 }, { now: false, endedAt: TSS - 1000 });
    ok("stop holds through the gathering", dispFn({ isLive: true, at: new Date(TSS - 5000) }) === false);
    setSS({}, { now: true });
    ok("detected stream beats a stop", dispFn({ isLive: true, at: new Date(TSS - 5000) }) === true);
  } catch (e) {
    ok("shut-and-display suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* TT. sound on, ended screen on the main thumbnail (note 387): no embed
     address can carry silence, the player has no silent path, the Watch call
     passes the off reading so any end closes at once, and the ended screen
     stands on the main-owned still chain. */
  const embTT = text["src/lib/embed.ts"];
  const blocksTT = text["src/components/blocks.tsx"];
  const watchTT = text["src/pages/WatchLive.tsx"];
  const applyTT = text["APPLY_UPDATE.txt"];
  ok("embeds never silence", embTT.indexOf("mute") === -1, "no live address may carry a mute");
  ok("player drops the silent path", !has(blocksTT, "userOpened") && has(blocksTT, ": sourceKey;"), "every opening must play with its audio");
  ok("watch passes the off reading", has(watchTT, "screenAir.state === \"off\""), "guest, main or office stop — any end must close");
  ok("ended screen stands on the main still", has(watchTT, "airForTarget.endedAt && airForTarget.videoId && airForTarget.platform !== \"facebook\" ? youtubeThumb(airForTarget.videoId)") && has(watchTT, "designatedFallback().items[0]?.thumb"), "just-ended frame, else newest recent, else the last previous service");
  ok("apply leads with sound and the close", has(applyTT, "EVER MUTED") && has(applyTT, "closes immediately"), "the office must meet the sound and the closed screen first");
  /* UU. transport buttons by the channels, publish only sends a clicked
     command (note 389): the stopped card is gone, play/pause/stop sit under
     the channel fields, the guest helper is gone, and the on-air state
     travels only on a clicked command. */
  const edUU = text["src/components/editor.tsx"];
  const adminUU = text["src/pages/Admin.tsx"];
  const cmsUU = text["src/lib/cms.ts"];
  const schemaUU = text["src/lib/cmsSchema.ts"];
  const autoUU = text["src/lib/autostop.ts"];
  const applyUU = text["APPLY_UPDATE.txt"];
  ok("stopped card gone", !has(edUU, "LiveControlPanel") && !has(edUU, "Continue the livestream") && !has(edUU, "Start a new livestream") && !has(edUU, "The stream has been stopped"), "no stopped state may remain in the drawer");
  ok("transport sits by the channels", has(adminUU, "<LiveTransportButtons />") && has(edUU, "export function LiveTransportButtons()") && adminUU.indexOf('"externalYoutubeChannel"') !== -1 && adminUU.indexOf('"externalYoutubeChannel"') < adminUU.indexOf("<LiveTransportButtons />"), "play, pause and stop belong beside the addresses they command");
  ok("transport arms every click", has(edUU, "liveCommandAt: Date.now()") && has(edUU, "Pause the livestream") && has(edUU, "Play the livestream") && has(edUU, 'icon="stop"'), "play, pause and stop must all stamp the command");
  ok("guest helper gone", !has(schemaUU, "Leave empty otherwise") && has(schemaUU, 'path: "externalYoutubeChannel"'), "the field stays, the helper goes");
  ok("publish gates the command", has(cmsUU, "export function gateLiveCommand(") && has(cmsUU, "gateLiveSnapshot(fold.snapshot || applied)") && has(cmsUU, 'if (sectionId === "live") value = gateLiveCommand(value, publishedSection("live"))'), "full and per-section publishes must both hold unclicked state back");
  ok("natural end needs no publish", has(autoUU, "no need to publish") && !has(autoUU, "liveCommandAt: Date.now()"), "a natural end must stamp nothing and ask for no publish");
  ok("apply leads with the gate", has(applyUU, "PUBLISH ONLY SENDS A CLICKED COMMAND"), "the office must meet the click-to-send rule first");
  try {
    const ebUU = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebUU.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabUU = (src, name) => {
      const from = src.indexOf("export function " + name + "(");
      const eol = src.indexOf("\n", from);
      const body = src.lastIndexOf("{", eol);
      let depth = 0, end = -1;
      for (let i = body; i < src.length && end < 0; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) end = i + 1; }
      }
      return src.slice(from, end).replace("export function", "function");
    };
    const tcGate = await ebUU.default.transform(grabUU(cmsUU, "gateLiveCommand") + "\nmodule.exports = gateLiveCommand;", { loader: "ts", format: "cjs" });
    const modGate = { exports: {} };
    new Function("module", "exports", tcGate.code)(modGate, modGate.exports);
    const gate = modGate.exports;
    const T1 = 1000, T2 = 2000;
    ok("clicked command travels", gate({ isLive: true, liveSince: T2, liveCut: 0, liveCommandAt: T2, liveEndedBy: "office", youtubeChannel: "@twocorg" }, { isLive: false, liveCommandAt: T1 }).isLive === true, "a stamped click must send the on-air state");
    ok("unclicked publish keeps published", gate({ isLive: true, liveSince: T2, liveCut: 0, liveCommandAt: T1, liveEndedBy: "office", youtubeChannel: "@twocorg" }, { isLive: false, liveSince: 0, liveCut: 0, liveCommandAt: T1, liveEndedBy: "" }).isLive === false, "no click, no send");
    ok("natural end travels on no publish", gate({ isLive: false, liveCut: 1500, liveEndedBy: "channel", liveCommandAt: T1 }, { isLive: true, liveSince: 900, liveCut: 0, liveCommandAt: T1, liveEndedBy: "office" }).isLive === true, "an unstamped natural end stays out of every publish");
    ok("unstamped write still held", gate({ isLive: false, liveCut: 1500, liveEndedBy: "channel", liveCommandAt: T1 }, { isLive: true, liveSince: 900, liveCut: 0, liveCommandAt: T1, liveEndedBy: "office" }).isLive === true, "without a stamp, the gate still holds the on-air state");
    ok("other fields still travel", gate({ isLive: true, liveCommandAt: T1, youtubeChannel: "@twocorg" }, { isLive: false, liveCommandAt: T1 }).youtubeChannel === "@twocorg", "the gate holds only the on-air fields");
    ok("non-object passes through", gate(null, {}) === null && gate("x", {}) === "x", "nothing to gate, nothing touched");
  } catch (e) {
    ok("transport-gate suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* VV. one play/pause button plus stop, the buttons never gate a live end,
     the ended screen shows the main previous-service thumbnails (note 391):
     pause holds (play resumes the same session), stop ends (next play starts
     fresh), a natural end stamps its own command, and the ended screen carries
     up to six main-owned previous-service cards at once. */
  const edVV = text["src/components/editor.tsx"];
  const autoVV = text["src/lib/autostop.ts"];
  const watchVV = text["src/pages/WatchLive.tsx"];
  const cssVV = text["src/styles/pages.css"];
  const applyVV = text["APPLY_UPDATE.txt"];
  ok("play and pause share one button", has(edVV, "{onNow ? (") && has(edVV, "Pause the livestream") && has(edVV, "Play the livestream") && has(edVV, 'icon="stop"'), "a single toggle plus the separate stop");
  ok("pause holds, stop ends", has(edVV, "const heldSession = since > 0;") && has(edVV, "liveSince: 0, liveCut: Date.now()") && has(edVV, "Paused — play picks the same session back up."), "a hold resumes, an end starts fresh");
  ok("natural end stamps nothing", has(autoVV, "no need to publish") && !has(autoVV, "liveCommandAt: Date.now()"), "the buttons never gate a live end");
  ok("ended screen carries the thumbnails", has(watchVV, "const endedThumbs = (recentItems.length") && has(watchVV, "live-ended__thumbs") && has(watchVV, "<RecentServiceCard key={it.videoId} item={it} />") && has(cssVV, ".live-ended__thumbs"), "the main previous services show the moment a live ends");
  ok("apply leads with the buttons and the end", has(applyVV, "THE BUTTONS NEVER GATE A LIVE END") && has(applyVV, "PLAY/PAUSE IS ONE"), "the office must meet the two buttons and the self-armed end first");
  /* WW. the end needs no publish; play starts, pause holds, stop ends, each
     with a publish (note 393): autostop stamps nothing and the drawer says
     so, the gate holds every unstamped write out, and the checklist leads
     with the rule. */
  const edWW = text["src/components/editor.tsx"];
  const cmsWW = text["src/lib/cms.ts"];
  const applyWW = text["APPLY_UPDATE.txt"];
  ok("drawer teaches nothing extra", !has(edWW, "there is nothing to publish") && !has(edWW, "Play and pause are one button"), "the rule lives in the checklist now, not in the drawer");
  ok("gate holds the unstamped end", has(cmsWW, "a natural end stamps nothing and needs no publish"), "the next publish must move only what the office changed");
  ok("apply leads with the rule", has(applyWW, "A NATURAL END NEEDS NO PUBLISH") && has(applyWW, "pause to hold it, then publish") && has(applyWW, "stop to end one"), "the office must meet the rule first");
  /* XX. the fix arrives fresh with the notice on, the guest empty, no promise
     text, no stale numbers (note 395): the override stamp is this update, the
     guest slot ships and stays empty, the drawer paragraph is gone while the
     buttons and the gate still work, and no banner names an update. */
  const srvXX = text["scripts/cms-server.js"];
  const seedXX = text["seed.json"];
  const edXX = text["src/components/editor.tsx"];
  const applyXX = text["APPLY_UPDATE.txt"];
  ok("override is this update", has(srvXX, "OVERRIDE_NO_397 = 397") && has(srvXX, 'live397.externalYoutubeChannel = ""'), "first boot must re-run the clear, guest included");
  ok("guest ships empty", has(seedXX, '"externalYoutubeChannel":""'), "no copy may open with a guest set");
  ok("buttons still arm", has(edXX, "liveCommandAt: Date.now()") && has(edXX, "Pause the livestream") && has(edXX, "Play the livestream") && has(edXX, 'icon="stop"'), "removing the paragraph must not touch the transport");
  ok("promise text gone", !has(edXX, "Play and pause are one button") && !has(edXX, "there is nothing to publish"), "the drawer keeps only the unconfigured warning");
  ok("apply leads fresh", has(applyXX, "ARRIVES FRESH") && has(applyXX, "A NATURAL END NEEDS NO PUBLISH"), "the office must meet the fresh arrival first");
  /* YY. Facebook live plays as Facebook (note 397): its numeric video id must
     never enter the YouTube path, the screen prefers Facebook while IT is live,
     and the ended still stays YouTube-owned. The bake ships no stale cut. */
  const watchYY = text["src/pages/WatchLive.tsx"];
  const seedYY = text["seed.json"];
  const applyYY = text["APPLY_UPDATE.txt"];
  ok("facebook never enters youtube", has(watchYY, 'screenAir.platform !== "facebook" ? screenAir.videoId : ""') && has(watchYY, 'const fbLive = screenAir.state === "live"'), "a numeric facebook id must not open as youtube");
  ok("facebook live is watchable", has(watchYY, "|| fbLive ||") && has(watchYY, 'fbLive ? "facebook"'), "the screen must prefer facebook while it is live");
  ok("facebook live plays facebook", has(watchYY, "fbLive") && has(watchYY, '{ platform: "facebook", facebookUrl: LIVE.facebookUrl }'), "the player must embed facebook, with sound");
  ok("ended still stays youtube-owned", has(watchYY, 'airForTarget.platform !== "facebook" ? youtubeThumb(airForTarget.videoId)'), "a facebook ending must not seed the still");
  ok("bake ships no stale cut", has(seedYY, '"liveCut":0'), "fresh copies must not inherit a cut");
  ok("apply leads with the facebook fix", has(applyYY, "FACEBOOK"), "the office must meet the routing first");
  const notes = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  const apply = text["APPLY_UPDATE.txt"];
  ok("update number consistent", notes > 0 && has(apply, `APPLY THIS UPDATE (${notes})`), "hooks=" + notes);
  return out.join("\n");
}
