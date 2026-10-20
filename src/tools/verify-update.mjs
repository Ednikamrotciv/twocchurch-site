/* verify-update.mjs — the pre-ship gate (note 293).
   The maintenance notice kept going missing on updates because a blessing
   leaked through the baked seed / the fallback / the auto-heal, opening new
   code with no office review. The invariants below lock the fail-safe rule:
   NOTHING blesses a copy except an explicit office action (publish, undo
   click, bless, offline flush) on its own server, a feed answer, or the local
   bless click. Section J (note 306) locks live-at-once: short cadence, urgent
   Watch check, moved-channel re-check on live and local, button re-asks, and
   offline Publish stamping. Section K (note 319) locks the office-reported
   on-air answer: public reads, admin-only writes, strict validation, fresh-
   for-same-target trust on visitors, office-only reporting. Section L (note
   321) locks the pasted-channel cleaning: a doubled "@" or stray spaces can
   never point the site at nothing again. Section M (note 323) locks the
   live follow: the Live tab's video is asked on its watch page before
   anything is called off, on-air chrome is read there, traps stay shut and
   unreadable pages stay unknown. Section N (note 325) locks verified
   candidates: no bare first-id fallback, ordered suggestions each asked on
   its watch page. Section O (note 329) locks the shipped default: @twocorg in
   the code default and in the fallback bake's words and recents. Section P
   (note 331) locks the walled-but-on-air channel follow: the owner's id with
   a clear margin or nothing, chrome with no verifiable video plays the
   channel (never a guessed video, never off), the player embeds the running
   broadcast, and the office report carries the channel id. Section Q (note 333) locks the two-way publish sync (live pulls home, Publish folds live in), the dead-video net (oEmbed verdict before play, fallback with a way out, gated autoplay), same-update office reports, the shipped maintenance hold, and the fresh @twocorg recents bake. Section R (note 335) locks the deployed update: the hold file deploys with git and step 0 lists every file (its Tools card retired in note 344 — the number lives in version.json + the console now). Section S (note 340) locks the deployed heal: the code outnumbers any mystery bundle, step 0 checks the bake's content, and the watched channel carries the reset recipe. Section T (note 342) locks the parity witness and the verified channel tap: the console tracks the live bake, and the channel tap plays a verified id or waits. Section U (note 344) locks the self-working publish (default live address, follow decision table, locked adopt door, player escape + re-ask, visible wakes, fresh @twocorg bake). Section V (note 346) locks the one-tap @twocorg reset, the publish-time recents refresh, the self-proving backup round-trip, and this line's missing dev doors. Section W (note 348) locks only-@twocorg shipping, the visitor's notice check, and the card staying gone. Section X (note 350) locks the handle-only livestream: stamped answers, skipped foreign videos, dropped old endings, and the channel-wins screen. Section Y (note 352) locks the ready channel: a stored debugging handle boots to @twocorg with no stamp, a later edit survives, empty boots clean, and the untouched draft follows. Section Z (note 354) locks the ready recents: the restore heals the channel (announced, kept dirty), @twocorg resolves with no page read, and a failed bake never wipes. Section AA (note 356) re-locks the four retained behaviors on the rebuilt tree: automatic publish on local, perfect livestream, sleep-free Render, blank-free local backups. Section BB (note 358) locks the designated-channel gate: @twocorg's baked id, candidate provenance, the gated channel follow, videoless reports never opening the player, office-only verified ids, and the designated-only screen and tap. Section CC (note 360) locks the clean recents and slides: foreign-channel caches dropped on read, stored take-offs cleared once, the lone welcome card replanted once, drafts healed, later edits never touched. Section DD (note 362) locks the override: the per-update stamp, the full clear, the draft + browser follow, and the same-update silence. Section EE (note 364) locks the last-service fallback: the 15 @twocorg services in code, the three empty-cache doors, the same-origin read, and the proven-foreign jazz report named. Section FF (note 366) locks the seed that cannot go missing: the repo-seed fallback, the red build on an empty bake, the recents riding every re-bake, and the force-tracked seed. Section GG (note 368) locks the server-side relay gate: fresh on the server clock, reporter at the published update or newer, wiped when gated out. Section HH (note 370) locks browsers looking new: the 30-second poll, the cross-tab shout, and the admin wait banner. Section II (note 372) locks the numbered notice, the fast feed, and the guaranteed still. Section JJ (note 374) locks the self-diagnosing boot banner. Run this before EVERY update zip — a single FAIL
   blocks the ship, no exceptions.
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
  ["src/components/editor.tsx", "tsx"],
  ["src/lib/hooks.ts", "ts"],
  ["src/data/photos.ts", "ts"],
  ["src/data/slides.ts", "ts"],
  ["src/lib/cmsSchema.ts", "ts"],
  ["src/lib/autostop.ts", "ts"],
  ["src/data/live.ts", "ts"],
  ["seed.json", null],
  ["src/lib/jobs.ts", "ts"],
  ["src/lib/pageMap.ts", "ts"],
  ["src/components/layout.tsx", "tsx"],
  ["src/components/blocks.tsx", "tsx"],
  ["src/components/ErrorBoundary.tsx", "tsx"],
  ["src/lib/store.ts", "ts"],
  ["src/pages/Home.tsx", "tsx"],
  ["src/components/slides.tsx", "tsx"],
  ["src/lib/uploadCache.ts", "ts"],
  ["src/lib/livefeed.ts", "ts"],
  ["src/App.tsx", "tsx"],
  ["scripts/build-static.mjs", "js"],
  ["scripts/serve.mjs", "js"],
  ["scripts/vite-cms-backend.mjs", "js"],
  ["scripts/bake-seed.mjs", "js"],
  ["scripts/bake-recent.mjs", "js"],
  ["scripts/auto-push.mjs", "js"],
  ["scripts/live-follow.mjs", "js"],
  ["scripts/instant-push.mjs", "js"],
  ["scripts/feed-spec.mjs", "js"],
  ["scripts/seed-guard.mjs", "js"],
  ["scripts/feed-mirror.mjs", "js"],
  ["scripts/cms-local.mjs", "js"],
  ["index.html", null],
  ["src/styles/admin.css", null],
  ["src/styles/pages.css", null],
  ["APPLY_UPDATE.txt", null],
  ["maintenance-hold.txt", null],
  ["clean-deploy.txt", null],
  [".gitignore", null],
];

function has(src, needle) {
  return typeof src === "string" && src.indexOf(needle) !== -1;
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
  /* J0. free-host sleep is harmless (note 303): Render's free tier wipes the
     live store on every sleep, which used to clear the admin publish
     (sections, stamp AND history) so the site looked like a new update until
     the office published again. The bake now carries the publish history
     with the stamp, and the fallback serves all of it — a wake re-serves the
     last publish with its history, no office action needed. */
  const bakeHist = text["scripts/bake-seed.mjs"];
  const pushHist = text["scripts/auto-push.mjs"];
  const seedBakerHist = text["scripts/bake-seed.mjs"];
  const fbHist = text["scripts/seed-fallback.mjs"];
  ok("bake carries the history", has(bakeHist, "note 303") && has(bakeHist, "log, by, at"), "a stamp-only bake clears Last published on every wake");
  ok("dev bake carries the history", has(backend, "note 303"));
  ok("fallback serves the history", has(fbHist, "out.log = good.log"), "words without history still clear Last published");
  try {
    const modJ0 = await import(
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
    const w = JSON.parse(modJ0.fallbackGetContent(wiped, baked));
    ok("wake re-serves words+stamp+history", w.seeded === true && w.rev === 15 && w.notes === 309 && JSON.parse(JSON.parse(w.sections).home).title === "Live words" && w.log.length === 1 && w.log[0].note === "Sunday update" && w.by === "office" && w.at === 1700000000000, "a wake must restore the whole publish");
    const bare = JSON.parse(modJ0.fallbackGetContent(wiped, { rev: 4, notes: 0, sections: { home: JSON.stringify({ t: 1 }) } }));
    ok("history-less bake stays safe", bare.seeded === true && Array.isArray(bare.log) && bare.log.length === 0 && bare.by === "" && bare.at === 0);
    const liveFull = JSON.stringify({ ok: true, rev: 16, at: 1, by: "office", notes: 309, sections: JSON.stringify({ home: JSON.stringify({ title: "Newer" }) }), log: [{ rev: 16 }], admin: false, pwgen: 3 });
    const lf = JSON.parse(modJ0.fallbackGetContent(liveFull, baked));
    ok("fallback leaves a live store alone", lf.sections !== undefined && JSON.parse(JSON.parse(lf.sections).home).title === "Newer" && lf.seeded !== true, "a healthy store must never be overlaid");
  } catch (e) {
    ok("wake suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* J1. the deploy must actually go out (note 307): a failed bake must say
     why instead of failing silently (a silent stale bake is how every sleep
     brought maintenance back), and a push broken by a huge upload must name
     the file size, not look like a login failure. */
  ok("bake uses the running node", has(pushHist, "process.execPath"), "a bare 'node' can miss PATH and fail every bake");
  ok("bake failure says why", has(pushHist, "bake said:") && has(pushHist, "npm run bake-seed"), "a silent bake failure leaves the live bake stale with no hint");
  ok("push failure names big files", has(pushHist, "100 MB") && has(pushHist, "data/uploads/"), "a video over the host limit looks exactly like a login failure");
  ok("bake CLI fails loudly", has(seedBakerHist, "bake-seed failed:") && has(seedBakerHist, "previous seed.json was kept"), "bake must never wipe a good seed on the way out");
  /* J2. uploads outlive every wipe (feed-backed durability): anything the
     office pushed lives on the public repo too — a public source repo at
     data/uploads/<name> (committed by auto-push), a private source's mirror
     at uploads/<name> (synced by feed-mirror.mjs). Copies paint the repo
     copy when the disk copy is gone and heal the server from it, so recovery
     needs no uploader's browser. Dormant with no feed configured. */
  const mirrorJ2 = text["scripts/feed-mirror.mjs"];
  const feedLib = text["src/lib/livefeed.ts"];
  const upCache = text["src/lib/uploadCache.ts"];
  const slidesJ2 = text["src/components/slides.tsx"];
  ok("mirror syncs uploads", has(mirrorJ2, '"clone"') && has(mirrorJ2, 'path.join(tmp, "uploads")') && has(mirrorJ2, "data\\/uploads"), "a seed-only mirror leaves uploads on the wiped disk");
  ok("mirror caps huge files", has(mirrorJ2, "90 * 1024 * 1024") && has(mirrorJ2, "100 MB"), "one huge video must not fail the whole mirror push");
  ok("feed bakes the uploads layout", has(staticBuild, "uploads: uploadsDir") && has(staticBuild, 'cfg.mirror ? "uploads"'), "copies must know where the repo keeps uploads");
  ok("upload fallback reads the feed", has(upCache, "feedUrlsForUpload") && has(upCache, "bakedFeedUploadsDir"), "the repo copy must be resolvable per session");
  ok("slides paint feed uploads", has(slidesJ2, "useFeedUploadUrl") && has(slidesJ2, "paintableFeed"), "a wiped disk must not blank visitors without a cache");
  ok("heal pulls from the feed", has(cms, "feedUrlsForUpload") && has(cms, "cacheUploadBlob(name, b)"), "any open copy must heal the server, not just the uploader's");
  try {
    const ebJ2 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebJ2.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const lfJ2 = await import(
      URL.createObjectURL(new Blob([(await ebJ2.default.transform(feedLib, { loader: "ts" })).code], { type: "text/javascript" }))
    );
    const spec = { owner: "mychurch", repo: "live", branch: "main" };
    const mu = lfJ2.feedUploadUrls(spec, "abc-photo.jpg", "uploads");
    const su = lfJ2.feedUploadUrls(spec, "abc-photo.jpg", "data/uploads");
    ok("feed upload urls are pure", mu.length === 2 && mu[0] === "https://raw.githubusercontent.com/mychurch/live/main/uploads/abc-photo.jpg" && su[0] === "https://raw.githubusercontent.com/mychurch/live/main/data/uploads/abc-photo.jpg" && lfJ2.feedUploadUrls(spec, "../evil", "uploads").length === 0 && lfJ2.feedUploadUrls(null, "a.jpg", "uploads").length === 0, "raw first, layout-aware, traversal refused");
  } catch (e) {
    ok("feed urls suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* J3. clean new deploys (option A): with clean-deploy.txt beside
     package.json a NEW deploy ships no words — fresh, new and clean until
     the office clicks Recover and Publish. Only the deploy bake goes clean
     (the root seed keeps its words, nothing is ever deleted); an unwiped
     store on the same deploy keeps re-serving through the fallback exactly
     as before. */
  const bakerJ3 = text["scripts/bake-seed.mjs"];
  const devJ3 = text["scripts/vite-cms-backend.mjs"];
  const serveJ3 = text["scripts/serve.mjs"];
  ok("clean flag empties only the deploy bake", has(bakerJ3, "clean-deploy.txt") && has(bakerJ3, "target !== rootSeedPath"), "the office root seed must keep its words");
  ok("clean bake ships loud", has(bakerJ3, "clean deploy requested") && has(bakerJ3, "REMOVE the file and rebuild"), "a wordless deploy must say how it ends");
  ok("dev bake honors the flag", has(devJ3, "clean-deploy.txt") && has(devJ3, "dev bake ships no words"), "the office preview must open clean too");
  ok("server names the flag", has(serveJ3, "clean-deploy.txt") && has(serveJ3, "Recover + Publish"), "a clean live site must never be a mystery");
  ok("build names the flag", has(staticBuild, "clean-deploy.txt") && has(staticBuild, "dist ships no words"), "the build log must state the clean truth");
  /* J4. live-led, clean-staged (office request): a live/admin publish takes
     effect on the office copy even when it never published on the running
     code (words record on the office disk, nothing blessed); a new code
     arrival stages clean — welcome-home slide only, no former publish —
     until Recover or an explicit Publish; the first publish consumes the
     clean-deploy flag so the next rebuild carries words; and a waking box
     primes its fallback from the pushed mirror, serving the first publish
     instead of the deploy-time bake. */
  const pushJ4 = text["scripts/auto-push.mjs"];
  const fbJ4 = text["scripts/seed-fallback.mjs"];
  ok("fresh code stages clean", has(cms, "cleanStageForNewCode") && has(cms, "codeChangedSinceBless"), "a new code arrival must not stage the former publish");
  ok("live adopt needs no blessing", has(cms, "stageInbound") && has(cms, "general control"), "a live publish must take effect on local unblessed copies too");
  ok("auto-adopt never stages clean", has(cms, "staged clean until Recover"), "recorded live words must not fill a clean stage by themselves");
  ok("clean stage ends on staging", has(cms, "clean-until-staged, never clean-forever"), "the first staged edit, fold or Recover must resume normal staging");
  ok("flag consumed by publish", has(pushJ4, "clean-deploy.txt") && has(pushJ4, "flagGone"), "clean-until-first-publish must end at the first publish");
  ok("server primes the mirror", has(serve, "primeMirrorSeed"), "a wake must ask the pushed mirror, not only the deploy bake");
  try {
    const modJ4 = await import(
      URL.createObjectURL(new Blob([fbJ4], { type: "text/javascript" }))
    );
    const bake = { rev: 10, notes: 413, sections: { home: { t: "Bake words" } } };
    const newer = { rev: 12, notes: 413, sections: { home: { t: "Published words" } } };
    const p1 = modJ4.preferMirrorSeed(bake, newer);
    const p2 = modJ4.preferMirrorSeed({ rev: 0, notes: 0, sections: {} }, newer);
    const p3 = modJ4.preferMirrorSeed(bake, { rev: 14, notes: 414, sections: { home: { t: 1 } } });
    const p4 = modJ4.preferMirrorSeed(bake, null);
    ok("wake prefers pushed mirror", p1.from === "mirror" && p2.from === "bake" && p3.from === "bake" && p4.from === "bake", "newer-same-update wins; clean bakes, newer updates and broken mirrors keep the bake");
  } catch (e) {
    ok("mirror-preference suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* J5. every deploy clean, wake after first publish (office request): the
     update ships clean-deploy.txt so a NEW deploy opens fresh — welcome-home
     slide only, unsaved changes empty; content rebuilds share the code, so
     the slides reset never re-marks them as unsaved; live/admin stays the
     general control (J4 lanes untouched); and a sleep-wake after the first
     publish serves it — an empty bake adopts the pushed mirror ONLY as its
     own deploy's first publish (same-deploy witness, running update or
     older), in the boot prime and in the feed follow alike. Retired mirrors,
     unstamped mirrors and newer-update mirrors never overlay a clean deploy. */
  const flagJ5 = text["clean-deploy.txt"];
  const localJ5 = text["scripts/cms-local.mjs"];
  ok("clean deploys ship the flag", typeof flagJ5 === "string" && flagJ5.length > 0 && has(flagJ5, "Recover"), "every update must open clean until Recover + Publish");
  /* J12 supersedes the old code-based reset rule (office request: every new
     deploy is fresh, clean and new): the reset is per-deploy — with the
     boot clean-stage (no dirty) and the fresh-joiner guard, so rebuilds
     still never re-mark slides as unsaved and new devices keep live words. */
  ok("slides reset is per-deploy", has(cms, '"d" + currentDeployId') && has(cms, "hadPriorBlessing"), "a new deploy must start over at welcome-only — code-based tokens let old slides ride rebuilds");
  ok("feed follow guards fresh mirrors", has(localJ5, "bakeEmpty") && has(localJ5, "seedDeploy"), "a retired mirror must not resurrect onto a clean deploy");
  ok("prime names its deploy", has(fbJ4, "deployId: myDeploy") && has(fbJ4, "mirror-takeover"), "the boot prime must prove the first publish is this deploy's own");
  try {
    const modJ5 = await import(
      URL.createObjectURL(new Blob([fbJ4], { type: "text/javascript" }))
    );
    const emptyBake = { rev: 0, notes: 0, sections: {} };
    const firstPublish = { rev: 5, notes: 413, sections: { home: { t: "First words" } }, publishedDeploy: "DEPLOY-N" };
    const t1 = modJ5.preferMirrorSeed(emptyBake, firstPublish, { deployId: "DEPLOY-N", buildNotes: 413 });
    const t2 = modJ5.preferMirrorSeed(emptyBake, firstPublish, { deployId: "DEPLOY-OTHER", buildNotes: 413 });
    const t3 = modJ5.preferMirrorSeed(emptyBake, { rev: 5, notes: 414, sections: { home: { t: 1 } }, publishedDeploy: "DEPLOY-N" }, { deployId: "DEPLOY-N", buildNotes: 413 });
    const t4 = modJ5.preferMirrorSeed(emptyBake, { rev: 5, notes: 413, sections: { home: { t: 1 } } }, { deployId: "DEPLOY-N", buildNotes: 413 });
    const t5 = modJ5.preferMirrorSeed(emptyBake, firstPublish);
    const t6 = modJ5.preferMirrorSeed({ rev: 10, notes: 413, sections: { home: { t: "Bake" } } }, { rev: 12, notes: 413, sections: { home: { t: "Mirror" } } }, { deployId: "DEPLOY-N", buildNotes: 413 });
    ok("takeover serves the first publish", t1.from === "mirror-takeover" && t2.from === "bake" && t3.from === "bake" && t4.from === "bake" && t5.from === "bake" && t6.from === "mirror", "own-deploy first publish wins; retired, newer-update, unstamped and opt-less mirrors keep the bake, worded bakes keep the rev rule");
  } catch (e) {
    ok("takeover suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* J6. the last publish saves its photos (office request): after a follow
     loop adopts sections, the upload files they point at are fetched home —
     office fetches off live, live fetches off the mirror — so a later sleep
     wipe restores the last publish on live AND local instead of dropping to
     the welcome photo. Only newly adopted sections are ever read (a clean
     deploy adopts nothing, so nothing old is resurrected); app-fallback HTML
     and oversize files are refused instead of breaking the push. */
  const followJ6 = text["scripts/live-follow.mjs"];
  ok("office fetches adopted photos", has(localJ5, 'backfillUploadFiles(rootDir, referencedUploads(patch), [origin + "/data/uploads/"]'), "a live publish must land its bytes in the office folder, not just its words");
  ok("live fetches adopted photos", has(localJ5, "spec.branch}/uploads/") && has(localJ5, '"feed follow"'), "a mirror adopt must land its bytes on the live disk");
  ok("backfill refuses junk", has(localJ5, "text/html") && has(localJ5, "BACKFILL_MAX_BYTES"), "fallback pages and giant files must never ride the push");
  ok("backfill reads adopted only", has(localJ5, "referencedUploads(patch)"), "only newly adopted sections may fetch — never a sweep that resurrects");
  try {
    const modJ6 = await import(
      URL.createObjectURL(new Blob([followJ6], { type: "text/javascript" }))
    );
    const refs = modJ6.referencedUploads({ slides: JSON.stringify([{ image: "/data/uploads/a.jpg" }, { image: "/data/uploads/a.jpg" }, { image: "/data/uploads/../evil" }]), home: JSON.stringify({ photo: "/data/uploads/b.png" }) });
    ok("upload refs extracted once", refs.length === 2 && refs.includes("a.jpg") && refs.includes("b.png"), "got " + JSON.stringify(refs));
    ok("upload refs empty-safe", modJ6.referencedUploads({}).length === 0 && modJ6.referencedUploads(null).length === 0, "nothing referenced means nothing fetched");
    ok("backfill capped at the mirror ceiling", modJ6.BACKFILL_MAX_BYTES === 90 * 1024 * 1024, "oversize bytes must stay published-in-place, not break the push");
  } catch (e) {
    ok("backfill suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* J7. photos, videos, everything rides — nothing sinks the words (office
     request: the last publish saves photos, videos, not just words, and all
     contents): office-disk content is only ever /data/uploads files (words
     carry the remote links themselves), the backfill announces big videos up
     front instead of downloading them to refuse them, and the push unstages
     files over GitHub's 100 MB refusal — named in the log — so the words
     always ride, whatever was uploaded. */
  const pushJ7 = text["scripts/auto-push.mjs"];
  ok("disk content is uploads-only", has(cms, "only /data/uploads/ files live on the office disk"), "one rule must cover photos, videos and audio alike");
  ok("backfill covers videos too", has(followJ6, "/data/uploads/") && has(cms, 'mp4: "video/mp4"'), "an uploaded sermon video is a /data/uploads file like any photo");
  ok("big videos skip the download", has(localJ5, "content-length") && has(localJ5, "announces"), "a hundred-megabyte video must not be fetched just to be refused");
  ok("oversize files leave the commit", has(pushJ7, "PUSH_FILE_MAX_BYTES") && has(pushJ7, "rm") && has(pushJ7, "--cached"), "an over-100 MB video must stay home, out of the push");
  ok("words always ride", has(pushJ7, "the words still ride") && has(pushJ7, "the words always ride"), "whatever was uploaded, the publish must go out");
  /* J8. the 5 stuck rows clear (office request: unsaved changes clean, clear
     and fresh): unnumbered updates kept the local dev token at "n413", so a
     new extract never proved a fresh deploy and the old draft/pending/dirty
     survived forever. The token now carries the code word (rotated to
     "cleanfresh" with this build), so every behavior update clears unsaved
     draft + pending + after-save once on boot — same-code rebuilds keep the
     token and never wipe unsaved work. */
  const hooksJ8 = text["src/lib/hooks.ts"];
  const indexJ8 = text["index.html"];
  ok("code word rotated", has(hooksJ8, 'CODE_ID = "cleanfresh"') && has(indexJ8, 'wom-code" content="cleanfresh"'), "the new word must retire the bundle that holds the 5 stuck rows");
  ok("dev token names the code", has(cms, '"n" + BUILD_NOTES + "c" + (runningCode'), "an unnumbered update must still prove a fresh deploy in local dev");
  ok("fresh clear takes after-save", has(cms, "localStorage.removeItem(AFTER_SAVE_KEY)"), "a queued publish-after-save must not republish stale words after the clear");
  /* J9. restore+publish reaches every copy (office request: works on one
     live/admin is not enough — visitors, admin copies and local/admin must
     all land it): the restore used to refuse file writes on a server-backed
     tab with no office address, publishing words that pointed at photos only
     the restoring tab could paint. Same-origin now counts, the office
     address still wins when set, and what is restored is cached in the
     restoring browser too. */
  ok("restore writes same-origin", has(cms, "reachable = !!(socket && status"), "live/admin talking to its own backend must save the photos there, not drop them");
  ok("office address still wins", has(cms, "still wins when one is set"), "a pointed copy must keep sending its files to the office");
  ok("restore caches what it restores", has(cms, "await cacheUploadBlob(name, blob)"), "the restoring tab must paint instantly and heal others, not depend on one disk");
  /* J10. every publish reflects everywhere (office request: visitors website,
     local website, live/admin, local/admin): the live box cannot reach a
     localhost office, so without a mirror an office publish waited out the
     rebuild. The publishing tab relays the same words (+ photos) straight to
     the live backend with its own session — live lands it in seconds via its
     own shout — and the follow loops skip identical words so the relay never
     answers itself. */
  /* J13 supersedes the fire-and-forget relay below (office request: a Publish
     click saves to the visitors website from either admin AND says what it
     reached): explicit clicks await the bounded word leg and report it, so
     the toast is the truth — everywhere at once, or here with live
     following. Background sends still never wait. */
  ok("publish relays to live", has(cms, "relayPublishWordsToLive") && has(cms, "/__cms/login?conn=") && has(cms, "/__cms/publish?conn="), "an office publish must reach the live backend in seconds, no feed or rebuild wait");
  ok("relay blesses live's deploy", has(cms, "own deploy") && has(cms, "/version.json?t="), "the relay must witness the deploy live actually serves, never ours");
  ok("relay carries the photos", has(cms, "/__restore-file?name=") && has(cms, "localUploadNames(sections)"), "relayed words must point at working photos at once, not after the mirror");
  ok("relay never breaks publish", has(cms, "never throws") && has(cms, "relayInBackground(sections, changed, note)"), "a relay that cannot land must leave the loops to carry the publish");
  ok("loops skip identical words", has(text["scripts/cms-local.mjs"], "nothing to write") && has(text["scripts/cms-local.mjs"], "JSON.stringify(localSections[id]) !== patch[id]"), "the relay lands the same words both stores hold — adopting them again would bump and log for nothing");
  /* J11. one click publishes to visitors + welcome-home on every new deploy
     (office request: no publishing "in everything" — one Publish click sends
     every changed section to the visitors website, from mobile or desktop;
     and every new deploy opens on the welcome-home slide): the offline
     publish waits a few seconds for the join on all three publish paths
     before settling for device-only; a queued device-only publish announces
     itself when it finally lands; the modal says so while offline; and the
     shipped drawer default is the lone welcome-home card (empty boxes heal
     to it, never blank). */
  const slidesData = text["src/data/slides.ts"];
  const joins = cms.split("await joinBeforePublish()").length - 1;
  ok("publish waits for the join", has(cms, "JOIN_BEFORE_PUBLISH_MS = 8000") && joins >= 3, "all three offline publish paths must try the join first, not strand as device-only");
  ok("queued publish lands loudly", has(cms, "queued changes are now live for every visitor"), "the office must hear when device-only words finally reach visitors");
  ok("modal names the queue", has(ed, "queued on this device and published by itself"), "the click-time notice must say what happens while offline");
  ok("shipped default is welcome-home", has(slidesData, 'id: "welcome-home"') && has(slidesData, 'headline: "Welcome home"'), "the drawer default must be the lone welcome card");
  ok("drawer restarts at welcome", has(cms, 'SLIDES.find((x) => x.id === "welcome-home")'), "a new deploy starts the drawer over at the welcome card only");
  ok("empty box heals to welcome", has(cms, "blank-black bug"), "an empty slides list is the bug — it heals to welcome, never blank");
  /* J12. every Publish click reaches visitors + every new deploy opens
     welcome-only (office request: clicking publish must apply to the
     visitors website — live and local — and the box slide must show only
     the welcome-home photo on every new deploy, since every new deploy is
     fresh, clean and new): a no-change Publish used to stop at this browser
     (stamp high locally while a wiped server / the live box's own deploy
     stayed unblessed), and a per-section publish with nothing changed never
     blessed at all — both now ride the same bless-only sendPatch as every
     other publish (server stamp, converge, live relay). And the clean stage
     plus the drawer reset were code-gated, so same-code rebuilds kept old
     slides — both are deploy-gated now (returning browsers only, so a fresh
     device joining live words is never clobbered, and with no dirty, so
     rebuilds never re-mark slides as unsaved). */
  ok("no-change publish sends the bless", !has(cms, "if (publishedNotes >= BUILD_NOTES)") && has(cms, "sendPatch({}, [], note.slice(0, 160), true, true)"), "a local-only early return leaves the server and the live box behind while the office sees success");
  ok("section publish blesses when unchanged", has(cms, "A no-change section Publish still blesses everywhere"), "a per-section publish with nothing changed must still lift the notice on the server and the live box");
  ok("offline bless ends the clean stage", has(cms, "An offline bless ends the clean stage on this copy too"), "an offline publish must not leave inbound words unstaged forever");
  ok("clean stage is per-deploy", has(cms, "freshDeploy && hadPriorBlessing()") && has(cms, "function hadPriorBlessing()"), "a returning browser on a new deploy must stage clean, not keep the former publish");
  ok("fresh joiners keep live words", has(cms, "A fresh device keeps what it adopted"), "a new device joining the live site must adopt its words, never clobber them to welcome");
  ok("deploy reset never re-marks unsaved", has(cms, "never re-mark slides as unsaved") && has(text["src/pages/Admin.tsx"], "quiet no-op that never re-marks slides as unsaved"), "the per-deploy reset must stay a quiet no-op on the staged welcome");
  /* J13. a Publish click saves to visitors + clears the notice, live AND
     local (office request: from live/admin it saves to the visitors website,
     from local/admin it saves to the visitors website, and the click clears
     the maintenance notice on live and local): the backend names the code
     word it runs, so an unstamped copy witnessing a publish proves it came
     from its own running code and lifts the number gate headless — a live
     publish clears the local notice with no tab open and no click needed.
     And explicit clicks await the bounded word relay and report it, so the
     toast is the truth — everywhere at once, or here with live following —
     while background sends never wait. */
  const srvJ13 = text["scripts/cms-server.js"];
  const hostJ13 = text["scripts/cms-local.mjs"];
  ok("backend names its code", has(hostJ13, "self.__codeWord") && has(hostJ13, "CODE_ID"), "the host must hand its running word to the server code");
  ok("answers attest the code", has(srvJ13, "code: publishCodeWord()") && has(srvJ13, "PUBLISH_CODE ||"), "getContent and the rev stamp must carry the word headless copies can prove");
  ok("witness needs the running word", has(cms, "function noteCodeWitness") && has(cms, "code !== runningCode"), "a missing or different word must prove nothing");
  ok("witness needs the publish", has(cms, "n < BUILD_NOTES"), "an unpublished word must never lift the notice");
  ok("sync takes the witness", has(cms, "noteCodeWitness((res as any).code, res.notes)"), "every server answer must try the witness, not just deploys");
  ok("publish carries its code", has(cms, "code: bless ? runningCode"), "every publish must stamp the word it was blessed from, so answers attest on any backend");
  ok("server keeps the publish code", has(srvJ13, "validCodeWord(payload.code)") && has(srvJ13, "publishCode: PUBLISH_CODE"), "the publish word must persist like the deploy it names");
  ok("waiting copies hurry", has(cms, "10_000") && has(cms, "if (!maintenanceShouldWait()) return;"), "a copy on maintenance must re-ask the stamp every 10 seconds, not only on the 30s loop");
  ok("witness re-evaluates the notice", has(cms, "notesLifted || deployLifted || codeWitnessed"), "a witnessed publish must re-render instead of sticking with first paint");
  ok("clicks await the word relay", has(cms, "awaitRelay = false") && has(cms, ", true, true)"), "explicit clicks must wait out the bounded relay; background sends never wait");
  ok("relay is bounded", has(cms, "25000") && has(cms, "relayFetch"), "awaiting the relay must never hold a click hostage on a stalled network");
  ok("result names live", has(cms, "live?: boolean") && has(cms, 'relay !== "missed"'), "the click result must say whether live visitors got it");
  ok("toasts tell the truth", has(ed, "The live site follows within a minute."), "a click live missed must say so, not claim every visitor");
  ok("undo relays too", has(cms, '"Undid the last publish"'), "an undo is a publish the other way — live must learn it at once");
  try {
    const mkRpc = (word) => {
      const fn = new Function("state", "self", "pubsub", "console", srvJ13 + "\nreturn self.rpc;");
      const self = { __codeWord: word };
      return fn(new Uint8Array(8 * 1024 * 1024), self, { publish() {} }, console);
    };
    const anon13 = { id: "anon-att", net: ["x", 0, 0], subscribe() {}, topics: new Set() };
    const rpcW = mkRpc("cleanfresh");
    const both = (rpc) => [JSON.parse(rpc.getContent({ conn: anon13 })), JSON.parse(rpc.contentRev({ conn: anon13 }))];
    const [cW, rW] = both(rpcW);
    ok("server attests its code", cW.ok === true && cW.code === "cleanfresh" && rW.ok === true && rW.code === "cleanfresh", "words=" + cW.code + " rev=" + rW.code);
    const [cE, rE] = both(mkRpc(""));
    ok("empty attestation proves nothing", cE.ok === true && cE.code === "" && rE.code === "", "an untold word must stay empty, never wrong");
  } catch (e) {
    ok("attestation suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* J. live shows at once, clock vanishes with it (note 306): the Watch page
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
  ok("app hurries on watch", has(app, "onWatchPage") && has(app, "expecting || onWatchPage"), "the header must follow the stream on the Watch page");
  ok("moved channel jumps the queue", has(live, "wom:live-target") && has(live, "noteLiveTargetMayHaveChanged") && has(live, "export function recheckLiveNow()") && has(cms, 'window.dispatchEvent(new Event("wom:live-target"))'), "a retyped channel must be re-checked at once on live and local");
  ok("office buttons re-ask", has(ed, "recheckLiveNow()") && has(ed, 'import { readLiveStatus, recheckLiveNow, guestTarget, isGuestTargetUrl, useLiveStream, liveTarget, isStatusForTarget, clearGuestOnStop } from "../lib/livestatus"'), "Start/Continue/Stop must ask the channel at once");
  ok("section publish stamps offline", has(cms, "An offline click still moves last-published on this copy"), "a per-section Publish while offline must move the stamp like the whole-site one");
  ok("bless caches offline", has(cms, "The stamp is cached with"), "a bless-only Publish while offline must cache the stamp with the words");
  /* K. office-reported on-air answer (note 319): the deployed server cannot
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
    const rpcR = loadVm(srvLive, new Uint8Array(8 * 1024 * 1024));
    const anon = { id: "anon-rep", net: ["x", 0, 0], subscribe() {}, topics: new Set() };
    const read0 = JSON.parse(rpcR.liveReport({ conn: anon }, ""));
    ok("report starts empty, reads public", read0.ok === true && read0.report === null);
    const denied = JSON.parse(rpcR.liveReport({ conn: anon }, JSON.stringify({ target: "https://www.youtube.com/@a/live", state: "live", videoId: "dQw4w9WgXcQ", title: "T", checkedAt: Date.now() })));
    ok("report write needs admin", denied.ok === false, "an anonymous write must be refused");
    const open = srvLive.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");');
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
  /* L. pasted-channel cleaning (note 321): the published channel once read
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
  /* M. the Live tab's video is asked before anything is called off (note 323):
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
  /* N. suggestions are verified, never trusted (note 325): no bare first-id
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
  /* O. the church's channel ships everywhere (note 329): @twocorg is the code
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
  /* P. walled-but-on-air channel follow (note 331): measured on a real
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
  /* Q. publish reaches both copies, no dead frame, same-update reports,
     hold-until-publish, fresh @twocorg recents (note 333): the live → local
     half this line never had (notes 308–309) lands here — a live/admin
     publish pulls itself home on the signed-in office copy, and every
     Publish folds live's newer words in — plus the note-333 net: a named
     video id that died never autoplays into the black frame, an old
     bundle's office report never steers this update, new builds hold fresh
     visitors on maintenance until the office publishes, and Recent services
     bake from the Oct-12 @twocorg feed. */
  const buildNotesQ = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  const liveQ = text["src/lib/livestatus.ts"];
  const blocksQ = text["src/components/blocks.tsx"];
  const watchQ = text["src/pages/WatchLive.tsx"];
  const srvQ = text["scripts/cms-server.js"];
  const edQ = text["src/components/editor.tsx"];
  ok("pull entry exists", has(cms, "export async function pullFromLive()") && has(cms, "function startLivePull()") && has(cms, "async function foldLiveInto("), "the sync needs its auto entry, its poller and its publish-time fold");
  ok("puller runs with the office", has(cms, "startLivePull();") && has(cms, "initialSyncDone.then"), "live publishes must pull themselves home while an office tab is open");
  ok("publish folds live in", has(cms, "await foldLiveInto(content || draft, undefined, 6000)") && has(cms, "await foldLiveInto(draft, sectionId, 6000)"), "every Publish (whole site and per-section) must fold live's newer words in first");
  ok("no hand pull button", !has(edQ, "Pull from live now") && !has(edQ, "pullFromLive(") && has(edQ, "folds into this publish"), "the card is gone — Publish does it, and says so");
  ok("same-update reports only", has(liveQ, "reportMatchesBuild") && has(liveQ, "notes: BUILD_NOTES") && has(liveQ, "notes: number"), "an old bundle's wrong id must never steer this update");
  ok("server keeps the reporter update", has(srvQ, "rep.notes") && has(srvQ, "notes: notes"), "the store must carry notes without trusting them");
  ok("player verifies before playing", has(blocksQ, "verifyYoutubeId") && has(blocksQ, "peekVerified") && has(blocksQ, "player--dead") && has(blocksQ, "can't be played here") && has(blocksQ, "Watch on YouTube"), "a dead video must say so with a way out, never the black frame");
  ok("watch plays live by itself", has(watchQ, "useYoutubeVerdict") && has(watchQ, "autoPlay={streaming && watchable}") && has(watchQ, "watchable"), "when the check says live the screen must open with no tap");
  ok("hold ships with the update", has(text["maintenance-hold.txt"], "hold") && has(text["scripts/build-static.mjs"], "maintenance-hold.txt"), "fresh visitors must wait on maintenance until the office publishes");
  try {
    const seed333 = JSON.parse(text["seed.json"]);
    const items333 = (seed333 && seed333.recent && seed333.recent.items) || [];
    const ids333 = items333.map((it) => it && it.videoId);
    ok("recents bake the church feed", seed333 && seed333.recent && seed333.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && items333.length >= 6 && ids333.indexOf("s4bLaGUNet4") === 0 && ids333.indexOf("aT5IeCtJHFw") === 1 && ids333.every((id) => /^[\w-]{11}$/.test(String(id || ""))), "six-plus @twocorg services, newest first from the Oct-12 feed");
  } catch (e) {
    ok("recents bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  try {
    const ebQ = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebQ.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tQ = await ebQ.default.transform(liveQ, { loader: "ts", format: "cjs" });
    const stubReqQ = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [typeof v === "function" ? v() : v, () => {}], useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { BUILD_NOTES: buildNotesQ, readStore: (k, fb) => fb, writeStore: () => true };
      if (id === "./embed") return { parseYoutubeId: (v) => { const s = String(v || "").trim(); if (/^[\w-]{11}$/.test(s)) return s; const m = /[?&]v=([\w-]{11})/.exec(s); return m ? m[1] : ""; }, cleanChannelInput: (v) => String(v || "") };
      return {};
    };
    const liveModQ = { exports: {} };
    new Function("module", "exports", "require", tQ.code)(liveModQ, liveModQ.exports, stubReqQ);
    const decidePlayQ = liveModQ.exports.oembedPlayable;
    const matchBuildQ = liveModQ.exports.reportMatchesBuild;
    const peekQ = liveModQ.exports.peekVerified;
    ok("oembed decision is strict", decidePlayQ(200) === true && decidePlayQ(400) === false && decidePlayQ(401) === false && decidePlayQ(403) === false && decidePlayQ(404) === false && decidePlayQ(410) === false && decidePlayQ(500) === null && decidePlayQ(0) === null, "200 plays, gone is gone, anything else waits");
    ok("same-update matching", buildNotesQ > 0 && matchBuildQ({ notes: buildNotesQ }) === true && matchBuildQ({ notes: buildNotesQ + 1 }) === false && matchBuildQ({}) === false && matchBuildQ({ notes: 0 }) === false, "only this update's office answers steer this update");
    ok("unasked is unknown", peekQ("dQw4w9WgXcQ") === null && peekQ("") === false, "no cache means ask, no id means dead");
    const rpcQ = loadVm(srvQ.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");'), new Uint8Array(8 * 1024 * 1024));
    const anonQ = { id: "anon-notes", net: ["x", 0, 0], subscribe() {}, topics: new Set() };
    const wQ = (payload) => JSON.parse(rpcQ.liveReport({ conn: anonQ }, JSON.stringify(payload)));
    const notedQ = { target: "https://www.youtube.com/@church/live", state: "live", videoId: "dQw4w9WgXcQ", title: "Sunday", channelId: "UCLg4NCAJxhIvD4IRV__LOFg", checkedAt: Date.now(), notes: buildNotesQ };
    ok("report stores the reporter update", wQ(notedQ).ok === true);
    const backQ = JSON.parse(rpcQ.liveReport({ conn: anonQ }, ""));
    ok("report reads the update back", backQ.ok === true && backQ.report && backQ.report.notes === buildNotesQ && backQ.report.channelId === notedQ.channelId, "visitors must inherit notes with the live answer");
  } catch (e) {
    ok("sync-and-player suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* R. the update lands on deployed and names itself (note 335): the hold
     file shipped in the zip but stayed git-ignored, so Render rebuilt
     without it — and nothing on either copy named its update. The hold
     must travel with git, step 0 must list every file, and Tools must show
     this console next to the live site with the recipe while behind. */
  const cmsR = text["src/lib/cms.ts"];
  const edR = text["src/components/editor.tsx"];
  const applyR = text["APPLY_UPDATE.txt"];
  const gitR = text[".gitignore"];
  const buildR = text["scripts/build-static.mjs"];
  ok("hold file deploys with git", gitR.split("\n").map((l) => l.trim()).indexOf("maintenance-hold.txt") === -1, "a git-ignored hold means Render rebuilds never wait");
  ok("step 0 lists every file", has(applyR, "maintenance-hold.txt") && has(applyR, "maintenance hold on"), "the deploy checklist must name the hold file and its build-log proof");
  ok("build holds git deploys", has(buildR, "NOT git-ignored") && has(buildR, "maintenance hold on"), "the builder must state the new truth, not the old clean-ship line");
  ok("office tracks the live update", has(cmsR, "liveSiteNotesVersion") && has(cmsR, "refreshLiveSiteNotes") && has(cmsR, 'base + "/version.json') && has(cmsR, "liveSiteNotes"), "Tools needs the live number without version.json spelunking");
  ok("live tick refreshes it", has(cmsR, "refreshLiveSiteNotes().catch"), "the office minute-tick must keep the number fresh");
  /* Note 344 retired the card (the office asked it gone): the number lives
     in version.json + the console now, and the trackers feed __maintState. */
  ok("site-update card removed", !has(edR, "Site update") && !has(edR, "liveSiteNotesVersion") && !has(edR, "refreshLiveBake"), "the office asked the card gone from Tools");
  ok("apply checks without the card", has(applyR, "version.json") && has(applyR, "/seed.json"), "deploy verification must not route through the removed card");
  /* S. the deployed copy heals (note 340): the box ran a mystery 337 with
     an empty bake and the old channel published — committing code alone
     changed nothing visible. The update must outnumber the mystery, step 0
     must check the bake's content, and Tools must show the watched channel
     with the @twocorg recipe while it names anything else. */
  const edS = text["src/components/editor.tsx"];
  const applyS = text["APPLY_UPDATE.txt"];
  /* Note 344 retired the card with the @twocorg recipe on it: the recipe
     lives in the APPLY instead (the office asked the card gone). */
  ok("reset recipe survives the card", has(applyS, "exactly `@twocorg`"), "the stuck channel's fix must survive the card's removal");
  ok("step 0 checks the bake content", has(applyS, '"sections":{}') && has(applyS, "copy seed.json") && has(applyS, "from THIS zip"), "an empty bake must be caught and recoverable at deploy time");
  ok("mystery bundle named", has(applyS, "337") && has(applyS, "matches no shipped update"), "a hand-edited folder must read as not-deployed");
  try {
    const seed340 = JSON.parse(text["seed.json"]);
    const items340 = (seed340 && seed340.recent && seed340.recent.items) || [];
    ok("shipped bake still church", !!seed340 && !!seed340.recent && seed340.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && items340.length >= 6, "the words that land must be @twocorg's");
  } catch (e) {
    ok("shipped bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* T. deployed matches local, no unavailable (note 342): parity had no
     witness (code without the bake is an empty shell), and the channel tap
     opened the embed blind. Tools must show the live bake, and the tap
     must verify first. */
  const cmsT = text["src/lib/cms.ts"];
  const edT = text["src/components/editor.tsx"];
  const blocksT = text["src/components/blocks.tsx"];
  const applyT = text["APPLY_UPDATE.txt"];
  ok("office tracks the live bake", has(cmsT, "liveBakeNotesVersion") && has(cmsT, "refreshLiveBake") && has(cmsT, 'base + "/seed.json') && has(cmsT, "liveBakeSections"), "parity needs a witness, not a version number alone");
  ok("bake watchdog runs itself", has(cmsT, "refreshLiveBake().catch"), "the minute-tick must keep it fresh");
  /* Note 344 retired the card: the witness lives on in the console. */
  ok("bake watch feeds the console", has(cmsT, "__maintState") && has(cmsT, "liveBakeNotes"), "the retired card's witness must live on in window.__maintState");
  ok("channel tap verifies first", has(blocksT, "checkLiveStream") && has(blocksT, "liveVideoId") && has(blocksT, "checkChannelThenPlay") && has(blocksT, "No broadcast right now"), "a blind channel embed is YouTube's unavailable waiting to happen");
  ok("push-land check in apply", has(applyT, "empty shell"), "the checklist must confirm the words landed, not just the code");
  /* U. publish reaches the office by itself; card gone; player always has a
     way out; sleep ends (note 344): the follow loop adopts live's newer
     words with no setup (the old cms-server.txt never survived a fresh
     folder), the Tools card is removed, every playing frame carries its way
     out, and a live publish lands in git instead of dying with the disk. */
  const cmsU2 = text["src/lib/cms.ts"];
  const edU2 = text["src/components/editor.tsx"];
  const localU2 = text["scripts/cms-local.mjs"];
  const srvU2 = text["scripts/cms-server.js"];
  const serveU2 = text["scripts/serve.mjs"];
  const viteU2 = text["scripts/vite-cms-backend.mjs"];
  const blocksU2 = text["src/components/blocks.tsx"];
  const cssU2 = text["src/styles/pages.css"];
  const applyU2 = text["APPLY_UPDATE.txt"];
  ok("no site-update card anywhere", !has(edU2, "Site update") && !has(edU2, "Live bake carries") && !has(edU2, "The site watches"), "the office asked it gone from Tools");
  ok("default live address", has(cmsU2, "DEFAULT_LIVE_ORIGIN") && has(cmsU2, "https://twocchurch-site.onrender.com") && has(localU2, "pickLiveOrigin"), "a fresh folder must know live with no setup file");
  ok("pull falls back to the default", has(cmsU2, "backend || DEFAULT_LIVE_ORIGIN"), "the browser pull used to die on an empty __live-url");
  ok("office backend follows live", has(localU2, "startLiveFollow") && has(localU2, "adoptLive") && has(localU2, "FOLLOW_MS") && has(localU2, "process.env.RENDER"), "no tab open must still bring a live publish home");
  ok("adopt door locked twice", has(srvU2, "adoptLive") && has(srvU2, "__adoptToken") && has(serveU2, "isLoopbackAddr") && has(viteU2, "isLoopbackAddr"), "token in the vm plus loopback at both http doors");
  ok("player always has a way out", has(blocksU2, "player__escape") && has(blocksU2, "Can't see the video? Watch on YouTube") && has(cssU2, ".player__escape"), "the frame never reports failure — the link is the permanent net");
  ok("playing videos re-asked", has(blocksU2, "5 * 60 * 1000") && has(blocksU2, "setDead(true)"), "a mid-play death must swap to the fallback, not sit black");
  ok("wakes are visible", has(serveU2, "cold start at") && !has(serveU2, "Admin > Tools shows the same number"), "the host log must show sleeps; nothing may point at the removed card");
  ok("apply keeps awake + follow", has(applyU2, "UptimeRobot") && has(applyU2, "live follow"), "sleep must be a non-event by recipe and by loop");
  try {
    const mod = await import(
      URL.createObjectURL(new Blob([text["scripts/live-follow.mjs"]], { type: "text/javascript" }))
    );
    const secs = (oo) => JSON.stringify(oo);
    const liveNew = { ok: true, notes: 344, at: 2000, rev: 9, seeded: false, sections: secs({ live: { a: 1 } }) };
    const localOld = { ok: true, notes: 344, at: 1000, rev: 4, sections: secs({}) };
    ok("follow adopts strictly newer", mod.shouldAdoptLive(localOld, liveNew, 344, false) === "adopt", "a live/admin publish must come home");
    ok("follow keeps ties", mod.shouldAdoptLive({ ...localOld, at: 2000 }, liveNew, 344, false) === "stale", "ties ride the office publish out");
    ok("follow never crosses updates", mod.shouldAdoptLive(localOld, { ...liveNew, notes: 999 }, 344, false) === "newer-update", "a newer live update waits for this copy");
    ok("follow refuses stale bakes", mod.shouldAdoptLive(localOld, { ...liveNew, at: 3000, seeded: true }, 344, false) === "seeded", "a wake bake must never regress office words");
    ok("follow heals fresh copies", mod.shouldAdoptLive({ ok: true, notes: 0, at: 0, rev: 0, sections: "{}" }, liveNew, 344, true) === "adopt", "a fresh extract may be restored from live");
    ok("follow ignores emptiness", mod.shouldAdoptLive(localOld, { ok: true, notes: 344, at: 3000, sections: "{}" }, 344, false) === "empty", "blank answers adopt nothing");
    ok("origin prefers the file", mod.pickLiveOrigin("https://office-tunnel.example/\n") === "https://office-tunnel.example", "an explicit cms-server.txt still wins");
    ok("origin defaults without a file", mod.pickLiveOrigin("") === "https://twocchurch-site.onrender.com" && mod.pickLiveOrigin("# only comments\n") === "https://twocchurch-site.onrender.com", "fresh folders must know live");
    ok("loopback gate knows its own", mod.isLoopbackAddr("127.0.0.1") && mod.isLoopbackAddr("::1") && !mod.isLoopbackAddr("8.8.8.8"), "the adopt door opens to this machine only");
    const patch = mod.adoptPatch(liveNew.sections);
    ok("adopt writes values only", Object.keys(patch).length === 1 && patch.live === JSON.stringify({ a: 1 }), "the parsed wire shape must store exactly like a publish");
  } catch (e) {
    ok("follow suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const seed344 = JSON.parse(text["seed.json"]);
    const items344 = ((seed344 && seed344.recent && seed344.recent.items) || []).map((it) => it && it.videoId);
    const want344 = ["s4bLaGUNet4", "aT5IeCtJHFw", "3uqJoUXKds4", "OV6XtrNPGgo", "BgF97PIYPe8", "rmdEvZ_ZOXo", "ddWq2WYrmZ8", "HmVTgKwA6rY", "eyGDEZplxJw", "akE7Klt3a8w", "KCGWV3jWROE", "_PD-k6SqPvg", "eu3xQ-XCHv4", "gVJP8wlL9dM", "suLunbMiN78"];
    const live344 = seed344 && seed344.sections && seed344.sections.live;
    ok("bake still @twocorg's", !!seed344 && !!seed344.recent && seed344.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && want344.every((id) => items344.indexOf(id) !== -1) && live344 && live344.youtubeChannel === "@twocorg", "recents must be the church's previous livestreams, all 15");
  } catch (e) {
    ok("bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* V. one-tap reset, recents on the same publish, backups that prove
     themselves (note 346): the box ran 339 with an empty bake and a
     debugging channel published — and this line's dev backend answered no
     restore door at all, so dev restores silently lost every upload. The
     console must offer the reset, a publish must refresh the recents
     itself, a backup must carry (or name) every photo and video, and the
     dev doors must exist. */
  const edV2 = text["src/components/editor.tsx"];
  const cmsV2 = text["src/lib/cms.ts"];
  const localV2 = text["scripts/cms-local.mjs"];
  const serveV2 = text["scripts/serve.mjs"];
  const viteV2 = text["scripts/vite-cms-backend.mjs"];
  const applyV2 = text["APPLY_UPDATE.txt"];
  ok("reset button offered", has(edV2, "Reset to @twocorg") && has(edV2, "resetChannel") && has(edV2, "youtubeChannel: \"@twocorg\""), "the office must fix the channel in one tap, not by retyping");
  ok("reset names the wrong channel", has(edV2, "not the church's channel"), "the wrong list must say what it follows");
  ok("publish refreshes recents", has(localV2, "noteRecentsDirty") && has(localV2, "bake-recent.mjs") && has(localV2, "process.env.RENDER"), "the new channel's services must ride the same deploy, never the next loop");
  ok("refresh only on real publishes", has(localV2, "method === \"publish\""), "reads must never schedule YouTube work");
  ok("backup embeds draft files", has(cmsV2, "allBackupNames") && has(cmsV2, "localUploadNames(draft)"), "a pre-publish backup must not strand unsaved uploads");
  ok("restore proves its writes", has(cmsV2, "verified") && has(cmsV2, "Read it back"), "a counted file must be a served file, never a hope");
  ok("restore takes audio", has(serveV2, "startsWith(\"audio/\")") && has(viteV2, "startsWith(\"audio/\")"), "refused kinds came back blank on both backends");
  ok("backup warns by name", has(edV2, "missingFiles") && has(edV2, "will be blank after a restore"), "a skipping backup must shout before the restore, not after");
  ok("dev restores exist", has(viteV2, "__restore-file") && has(viteV2, "__delete-file"), "dev restores silently lost every upload on this line");
  ok("live door answers everywhere", has(serveV2, "__live-url") && has(viteV2, "__live-url"), "the live→local pull never answered on this line");
  ok("apply leads with the box truth", has(applyV2, "Measured on the live box first"), "the checklist must start from the measured box, not the last zip");
  /* W. only @twocorg ships; the visitor's notice; the card stays gone (note
     348): the box runs 345 code with an empty bake and debugging channel(s)
     published — lately @zoelifemultimedia. The last other name in what
     ships must go, the APPLY must check the notice like a visitor, and no
     pointer at the removed card may survive. */
  const edW2 = text["src/components/editor.tsx"];
  const liveW2 = text["src/data/live.ts"];
  const viteW2 = text["scripts/vite-cms-backend.mjs"];
  const buildW2 = text["scripts/build-static.mjs"];
  const applyW2 = text["APPLY_UPDATE.txt"];
  const holdW2 = text["maintenance-hold.txt"];
  const notesW2 = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  ok("no site-update card anywhere", !has(edW2, "Site update") && !has(edW2, "Live bake carries") && !has(edW2, "The site watches"), "the office asked it gone from Tools");
  ok("no pointer at tools either", !has(viteW2, "Admin > Tools shows the same number") && has(viteW2, "version.json shows the same number"), "the dev boot line pointed at the removed card");
  ok("code default is @twocorg", has(liveW2, 'youtubeChannel: "@twocorg"') && has(liveW2, 'value: "@twocorg"'), "the fallback card must read the church, not the old handle");
  ok("no stray channel in code", ["src/lib/cms.ts", "src/components/editor.tsx", "src/data/live.ts", "src/components/blocks.tsx", "src/pages/WatchLive.tsx", "src/lib/livestatus.ts", "src/lib/embed.ts", "src/lib/recentstreams.ts"].every((p) => text[p].toLowerCase().indexOf("zoelifemultimedia") === -1), "@zoelifemultimedia must live only in published words, never in shipped code");
  ok("apply checks like a visitor", has(applyW2, "FRESH profile") && has(applyW2, "incognito") && has(applyW2, "Exit preview"), "the notice check must defeat the office's own bypasses");
  ok("reset recipe still in apply", has(applyW2, "exactly `@twocorg`") && has(applyW2, "Reset to @twocorg"), "the published handle only moves by reset plus publish");
  ok("hold still ships", holdW2.trim().length > 0 && has(buildW2, "maintenance hold on"), "fresh visitors wait until the publish");
  try {
    const seed348 = JSON.parse(text["seed.json"]);
    const live348 = seed348 && seed348.sections && seed348.sections.live;
    const cards348 = (live348 && live348.watchOptions) || [];
    const yt348 = cards348.filter((w) => w && w.icon === "youtube")[0] || {};
    const items348 = ((seed348 && seed348.recent && seed348.recent.items) || []).map((it) => it && it.videoId);
    ok("bake card reads @twocorg", !!live348 && live348.youtubeChannel === "@twocorg" && yt348.value === "@twocorg", "the shipped words must name no other channel");
    ok("bake notes leave room to hold", typeof seed348.notes !== "number" || seed348.notes < notesW2, "a bake stamped at/above this update would release fresh visitors");
    ok("recents still the church's", !!seed348 && !!seed348.recent && seed348.recent.channelId === "UCQ0KIUXUV7gTZmDDlvd3ZcQ" && items348.indexOf("s4bLaGUNet4") !== -1 && items348.length >= 6, "previous livestreams must be @twocorg's");
  } catch (e) {
    ok("bake parses", false, String((e && e.message) || e).slice(0, 160));
  }
  /* X. the livestream answers only for the handle (note 350): the candidate
     walk never asked whose video a suggestion was, answers outlived the
     channel, and a stray stream link could reach the screen. Answers are
     stamped with the checked address, foreign videos are skipped, old
     endings are dropped on a move, and the channel wins on the screen. */
  const liveX2 = text["src/lib/livestatus.ts"];
  const watchX2 = text["src/pages/WatchLive.tsx"];
  const blocksX2 = text["src/components/blocks.tsx"];
  ok("answers carry their address", has(liveX2, "target: string") && has(liveX2, "target: targetUrl"), "an unstamped answer cannot be told from the handle's");
  ok("candidates prove their owner", has(liveX2, "ownerAllowsCandidate(owner, watchChannelId(watchHtml))"), "a live suggestion from another channel must be skipped, not played");
  ok("old endings are dropped", has(liveX2, "inheritEnded(before, targetUrl, checkedAt, designatedChannelIdForTarget(targetUrl))"), "a moved channel must not seed the new handle's ended screen");
  ok("office never reports stale", has(liveX2, "isStatusForTarget(status, url)"), "the office must not steer visitors to the old handle's video");
  ok("screen gates on the stamp", has(watchX2, "isStatusForTarget(air, targetUrl)") && has(watchX2, "airForTarget"), "the screen must read unknown until the fresh check lands");
  ok("channel wins the screen", has(watchX2, "!hasChannel ? LIVE.youtubeId") && has(watchX2, "hasChannel ? targetUrl"), "a stray stream link must not reach the player while the channel is set");
  ok("tap re-asks the handle", has(blocksX2, "isStatusForTarget(st, liveTarget()?.url"), "a tap after a channel move must wait, not play the old video");
  try {
    const ebX2 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebX2.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tcX2 = await ebX2.default.transform(liveX2, { loader: "ts", format: "cjs" });
    const stubX2 = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      return {};
    };
    const modX2 = { exports: {} };
    new Function("module", "exports", "require", tcX2.code)(modX2, modX2.exports, stubX2);
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    const watchHtml = 'ytInitialData{"x":1} "videoDetails":{"videoId":"AAAAAAAAAAA","channelId":"' + OWNER + '","title":"T"}';
    ok("watch page names its owner", modX2.exports.watchChannelId(watchHtml) === OWNER && modX2.exports.watchChannelId('ytInitialData{"x":1}') === "", "the winner's own page must say whose video it is");
    const allows = modX2.exports.ownerAllowsCandidate;
    ok("own video allowed", allows(OWNER, OWNER) === true && allows("", OTHER) === true && allows(OWNER, "") === true, "unprovable either way still plays — a thin read never ends a service");
    ok("foreign video refused", allows(OWNER, OTHER) === false, "an ad or related upload is never the handle's broadcast");
    const forTarget = modX2.exports.isStatusForTarget;
    const ADDR = "https://www.youtube.com/@twocorg/live";
    ok("stamp gates the screen", forTarget({ target: ADDR }, ADDR) === true && forTarget({ target: "https://www.youtube.com/@other/live" }, ADDR) === false && forTarget({}, ADDR) === true, "another address never plays; older caches pass through");
    const inherit = modX2.exports.inheritEnded;
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
  /* Y. @twocorg arrives ready (note 352): stored words keep the last
     published channel across updates, so the office had to reset it by hand.
     The first boot of this update moves a stored non-@twocorg channel once —
     no stamp, no publish — a later edit is never touched, and an untouched
     draft follows the published words. */
  const srvY = text["scripts/cms-server.js"];
  const cmsY = text["src/lib/cms.ts"];
  const applyY = text["APPLY_UPDATE.txt"];
  ok("ready flag declared", has(srvY, "var CH_READY = false;"), "the one-shot needs memory");
  ok("ready flag persists", has(srvY, "chReady: CH_READY") && has(srvY, "CH_READY = parsed.chReady === true;"), "a later edit must never be re-moved");
  ok("boot moves the channel", has(srvY, 'readyObj.youtubeChannel = "@twocorg"') && has(srvY, "if (!CH_READY)"), "stored debugging handles must land on the church's");
  ok("empty stays empty", has(srvY, "stays empty (fresh copies read"), "fresh copies read the code default, not an invented section");
  ok("draft heals on read", has(cmsY, "healDraftChannel()") && has(cmsY, "if (!draft || dirty.live) return;"), "an untouched Live section follows the published words; office edits win");
  ok("apply needs no reset", has(applyY, "no reset tap") && has(applyY, "Only if it offers"), "the checklist must verify readiness, not tap the button");
  try {
    const connY = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pubY = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn: connY }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 352, ...(extra || {}) })));
    const getY = (rpc) => JSON.parse(rpc.getContent({ conn: connY }, ""));
    const stripReady = (st) => {
      const dvY = new DataView(st.buffer);
      const metaChars = dvY.getUint32(14, false);
      const secChars = dvY.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(st.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.chReady;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dvY.setUint32(14, nm.length, false);
    };
    /* a pre-352 store: debugging channel published, no flag. */
    const stY = new Uint8Array(8 * 1024 * 1024);
    const rY0 = loadVm(stubAuth(srvY), stY);
    const p0 = pubY(rY0, { live: JSON.stringify({ youtubeChannel: "@zoelifemultimedia", recentLimit: 6 }) }, { first: true });
    ok("y fixture publishes", p0.ok === true, "pub=" + JSON.stringify(p0).slice(0, 120));
    stripReady(stY);
    const beforeY = getY(rY0);
    const rY1 = loadVm(stubAuth(srvY), stY);
    const afterY = getY(rY1);
    const liveY = JSON.parse(afterY.sections).live;
    ok("boot moves the stored channel", liveY.youtubeChannel === "@twocorg" && liveY.recentLimit === 6, "got " + liveY.youtubeChannel);
    ok("boot stamps nothing", afterY.rev === beforeY.rev && afterY.notes === beforeY.notes && JSON.stringify(afterY.log) === JSON.stringify(beforeY.log), "a move is not a publish");
    /* a later intentional edit survives every later boot. */
    const p1 = pubY(rY1, { live: JSON.stringify({ ...liveY, youtubeChannel: "@otherhandle" }) });
    ok("y later edit publishes", p1.ok === true);
    const rY2 = loadVm(stubAuth(srvY), stY);
    const liveY2 = JSON.parse(getY(rY2).sections).live;
    ok("later edit survives reboot", liveY2.youtubeChannel === "@otherhandle", "got " + liveY2.youtubeChannel);
    /* empty boots invent nothing. */
    const rYE = loadVm(stubAuth(srvY), new Uint8Array(8 * 1024 * 1024));
    const gYE = getY(rYE);
    ok("empty boots clean", gYE.ok === true && !JSON.parse(gYE.sections).live, "no live section may be invented");
  } catch (e) {
    ok("ready suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* Z. recents ready on deploy (note 354): the restore re-put the debugging
     channel (the boot move never sees a draft), and resolving a handle needed
     a page read the wall eats. A restored non-@twocorg channel becomes
     @twocorg in the draft — announced, kept dirty — and @twocorg resolves to
     its id with no network. */
  const cmsZ = text["src/lib/cms.ts"];
  const edZ = text["src/components/editor.tsx"];
  const brZ = text["scripts/bake-recent.mjs"];
  const applyZ = text["APPLY_UPDATE.txt"];
  ok("restore heals the channel", has(cmsZ, "channelMoved") && has(cmsZ, '{ ...rl, youtubeChannel: "@twocorg" }'), "an old backup must not re-put the debugging handle");
  ok("restore stays visible", has(cmsZ, "restoring it must not re-put") && has(cmsZ, "channelMoved: channelMoved || undefined"), "the move must ride Review, not slip in silent");
  ok("empty channel untouched", has(cmsZ, "if (rc && rc.toLowerCase()"), "an unset channel reads the code default, never an invented one");
  ok("toast names the move", has(edZ, "res.channelMoved") && has(edZ, "set to @twocorg (change it back"), "the office must see what moved, with the way back");
  ok("twocorg needs no page read", has(brZ, "/^@?twocorg$/i") && has(brZ, 'return "UCQ0KIUXUV7gTZmDDlvd3ZcQ"'), "the bake must work exactly where the wall eats channel pages");
  ok("failed bake never wipes", has(brZ, "Never wipes"), "a walled read keeps the previous list, never blanks it");
  ok("apply restores without reset", has(applyZ, "also heals the channel"), "the checklist must end with @twocorg from any backup");
  /* AA. rebuilt from the office's base, every fix retained (note 356): the
     attached zip is the 309 site the office wants — publish must work
     automatically on local, the livestream must be perfect, Render must be
     sleep-free, and photo/video backups must restore blank-free on local. */
  const cmsAA = text["src/lib/cms.ts"];
  const liveAA = text["src/lib/livestatus.ts"];
  const srvAA = text["scripts/cms-server.js"];
  const localAA = text["scripts/cms-local.mjs"];
  const followAA = text["scripts/live-follow.mjs"];
  const pushAA = text["scripts/auto-push.mjs"];
  const serveAA = text["scripts/serve.mjs"];
  const viteAA = text["scripts/vite-cms-backend.mjs"];
  const fbAA = text["scripts/seed-fallback.mjs"];
  const edAA = text["src/components/editor.tsx"];
  const applyAA = text["APPLY_UPDATE.txt"];
  ok("follow adopts live", has(localAA, "startLiveFollow") && has(followAA, "shouldAdoptLive") && has(followAA, "adoptPatch"), "a live/admin publish must reach local with no tab open");
  ok("flag holds only fallback bakes", has(localAA, "only a fallback bake is held") && has(localAA, "live.seeded === true"), "a clean-deploy flag must not block a real live publish from reaching local");
  ok("late local lifts on live truth", has(cmsAA, "Late-joining local copy") && has(cmsAA, "noteCodeWitness((res as any).code, res.notes)"), "a local copy opened after the live publish must still clear its notice with no local click");
  ok("relay names its reason", has(cmsAA, "function relayStatus") && has(cmsAA, "Live login denied") && has(cmsAA, "retrying in the background"), "the office must see WHY live did not follow, not just that it missed");
  ok("status shows the live leg", has(edAA, "cms.relayStatus()") && has(edAA, "Live site"), "the Status tab must carry the last relay report");
  ok("relay asks the live password once", has(cmsAA, "submitLivePassword") && has(cmsAA, "relayNeedsPassword"), "a denied live box must get one typed password, not silence forever");
  ok("relay retry survives reloads", has(cmsAA, "wom.cms.relayPending") && has(cmsAA, "resumeRelayRetry"), "a closed tab must not strand the live site on maintenance");
  ok("status sends to live", has(edAA, "submitLivePassword") && has(edAA, "relayNeedsPassword"), "the Status tab must offer the password and the retry");
  ok("fold never holds a click", has(cmsAA, "foldGen") && has(cmsAA, "boundedMs"), "a sleeping live box must not stall a publish on its read");
  ok("joined tabs relay to live", has(cmsAA, "joinedBackendRoot") && has(cmsAA, "this tab publishes through"), "a live/admin tab joined to the office must still push the live box at once");
  ok("adopt door locked", has(srvAA, "adoptLive") && has(srvAA, "self.__adoptToken"), "only this machine's own loop may adopt");
  ok("publish folds live", has(cmsAA, "async function foldLiveInto") && has(cmsAA, "await foldLiveInto(draft, sectionId, 6000)"), "every Publish carries live's newer words by itself");
  ok("auto-push rides out", has(pushAA, "notePublished") && has(localAA, "notePublished"), "a local publish must deploy itself within minutes");
  ok("handle-only answers", has(liveAA, "ownerAllowsCandidate") && has(liveAA, "isStatusForTarget") && has(liveAA, "inheritEnded"), "no foreign video, no stale address, no stray link");
  ok("walled follow plus dead net", has(liveAA, "unverifiedChannelAnswer") && has(liveAA, "verifyYoutubeId"), "chrome with no video plays the channel; dead ids never play blind");
  ok("office reports gated", has(liveAA, "maybeReport") && has(srvAA, "LIVE_REPORT"), "only definitive same-target answers steer visitors");
  ok("fallback serves last publish", has(fbAA, "answerWithSeedFallback") && has(serveAA, "answerWithSeedFallback"), "a wake with no store still serves whole words, never blank");
  ok("wakes print, holds ship", has(serveAA, "cold start at") && has(applyAA, "UptimeRobot"), "every wake is visible; the keep-awake recipe rides along");
  ok("backups embed uploads", has(cmsAA, "allBackupNames"), "a backup must carry the photos and videos the words point at");
  ok("restore proves writes", has(cmsAA, "Read it back") && has(edAA, "missingFiles"), "a counted file must be a served file; missing ones shout by name");
  ok("dev doors open local", has(viteAA, "__restore-file") && has(serveAA, "__restore-file"), "a local restore must land uploads, not blank photos");
  /* BB. only the designated channel plays (note 358): until @twocorg itself
     is verified live the screen waits — no foreign video, no unverified
     channel follow, no stray link ever opens the player. The designation is
     baked (no page read, even through the wall); suggestions answer to it
     (the Live tab vouches where a walled watch page cannot); the office
     reports only verified ids and readers never open videoless live
     reports; the screen and the tap play only the designated channel. */
  const liveBB = text["src/lib/livestatus.ts"];
  const watchBB = text["src/pages/WatchLive.tsx"];
  const blocksBB = text["src/components/blocks.tsx"];
  ok("designation baked, never read", has(liveBB, '"@twocorg": "UCQ0KIUXUV7gTZmDDlvd3ZcQ"') && has(liveBB, "designatedChannelIdForTarget(target.url)"), "the gate must know whose video counts with no page read");
  ok("candidates prove designation", has(liveBB, "candidateStandsForDesignated(watchChannelId(watchHtml), designatedId, vid === liveTabId)"), "a suggestion must stand for @twocorg, not the grab-bag");
  ok("follow needs the designated owner", has(liveBB, 'extractChannelId(html, target.url) : "", designatedId'), "a chrome-only page follows nobody unnamed or foreign");
  ok("office reports verified ids only", has(liveBB, 'if (status.state === "live" && !status.videoId) return;'), "an unverified channel-live answer must stay local");
  ok("readers wait on videoless reports", has(liveBB, "officeRep.target === target.url && reportCarriesVideo(officeRep)"), "a live report with no video must never open the player");
  ok("screen plays only the designation", has(watchBB, "isDesignatedChannel(airForTarget.channelId, designatedId)") && has(watchBB, "designatedChannelIdForTarget(targetUrl)"), "the Watch page must wait until @twocorg is proven live");
  ok("tap plays only the designation", has(blocksBB, "isDesignatedChannel(st.channelId") && has(blocksBB, "st.channelId && (!designatedId || st.channelId === designatedId)"), "a tap must wait on foreign or videoless live answers");
  try {
    const ebBB = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebBB.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tcBB = await ebBB.default.transform(liveBB, { loader: "ts", format: "cjs" });
    const stubBB = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => fb, writeStore: () => true };
      if (id === "./embed") return { parseYoutubeId: () => "", cleanChannelInput: (v) => String(v || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "") };
      return {};
    };
    const modBB = { exports: {} };
    new Function("module", "exports", "require", tcBB.code)(modBB, modBB.exports, stubBB);
    const D = modBB.exports;
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
    const ADDR_BB = "https://www.youtube.com/@twocorg/live";
    const foreign = { state: "live", platform: "youtube", videoId: "BBBBBBBBBBB", title: "J", channelId: OTHER, target: ADDR_BB, checkedAt: 1, endedAt: 0 };
    ok("ended screen drops foreign videos", inh(foreign, ADDR_BB, 99, OWNER).videoId === "" && inh(foreign, ADDR_BB, 99, OWNER).endedAt === 0, "the new handle never inherits somebody else's service");
    const unprovable = { state: "live", platform: "youtube", videoId: "BBBBBBBBBBB", title: "J", channelId: "", target: ADDR_BB, checkedAt: 1, endedAt: 0 };
    ok("unprovable endings still stick", inh(unprovable, ADDR_BB, 99, OWNER).videoId === "BBBBBBBBBBB" && inh(unprovable, ADDR_BB, 99).videoId === "BBBBBBBBBBB", "a thin read keeps its cover; older callers behave as before");
  } catch (e) {
    ok("designated suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* CC. recents cleared to @twocorg, slides back to welcome (note 360): the
     card merged every old cached video into each fresh read, so debugging
     videos rode along forever. A foreign-channel cache now reads as empty;
     the first boot clears stored take-offs and replants the lone welcome
     card; untouched drafts heal; later edits are never touched. */
  const rsCC = text["src/lib/recentstreams.ts"];
  const srvCC = text["scripts/cms-server.js"];
  const cmsCC = text["src/lib/cms.ts"];
  const applyCC = text["APPLY_UPDATE.txt"];
  ok("foreign caches read empty", has(rsCC, "cachedChannelId !== designated) return designatedFallback();") && has(rsCC, "designatedChannelId()"), "a list saved for another channel must fall to the @twocorg fallback, never merged");
  ok("take-offs cleared once", has(srvCC, "MEDIA_CLEAN") && has(srvCC, "live360.hiddenReplays = []") && has(srvCC, "mediaClean: MEDIA_CLEAN"), "stored take-offs must go on first boot, later ones never touched");
  ok("welcome replanted once", has(srvCC, "WELCOME_SLIDE_360") && has(srvCC, 'String(slides360[0].id || "") === "welcome-home"'), "any stored slides but the lone welcome card must become it");
  ok("absent slides stay absent", has(srvCC, 'if (typeof SECTIONS.slides === "string")'), "a store with no slides keeps none — the fallback already shows welcome");
  ok("drafts heal on read", has(cmsCC, "healDraftRecents()") && has(cmsCC, "healDraftSlides()") && has(cmsCC, "(dirty as any).slides"), "a pre-clear draft must follow the words; office edits win");
  ok("apply backs up first", has(applyCC, "BACK UP FIRST (step 1)"), "the uploads survive only in the backup file");
  try {
    const ebCC = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try {
      await ebCC.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });
    } catch {
      /* already initialized above — transform works regardless */
    }
    const tcCC = await ebCC.default.transform(rsCC, { loader: "ts", format: "cjs" });
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    const cacheCC = {};
    const stubCC = (id) => {
      if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useSyncExternalStore: () => ({}) };
      if (id === "./hooks") return { readStore: (k, fb) => (k in cacheCC ? cacheCC[k] : fb), writeStore: (k, v) => { cacheCC[k] = v; } };
      if (id === "./embed") return { parseYoutubeId: (u) => /([\w-]{11})/.exec(String(u || ""))?.[1] || "", cleanChannelInput: (v) => String(v || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "") };
      if (id === "./livestatus") return { liveTarget: () => ({ url: "https://www.youtube.com/@twocorg/live", kind: "channel" }), designatedChannelId: () => OWNER };
      if (id === "../data/live") return { LIVE: { youtubeChannel: "@twocorg" } };
      return {};
    };
    const modCC = { exports: {} };
    new Function("module", "exports", "require", tcCC.code)(modCC, modCC.exports, stubCC);
    cacheCC["wom.recentstreams"] = { items: [{ videoId: "AAAAAAAAAAA", title: "Debug service", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OTHER };
    ok("foreign cache dropped", modCC.exports.readRecentServices().items[0].videoId === "s4bLaGUNet4", "debugging videos must not survive the read");
    cacheCC["wom.recentstreams"] = { items: [{ videoId: "AAAAAAAAAAA", title: "Sunday service", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OWNER };
    ok("own cache kept", modCC.exports.readRecentServices().items.length === 1, "@twocorg's list must stay");
    cacheCC["wom.recentstreams"] = { items: [{ videoId: "BBBBBBBBBBB", title: "Today's service", at: 0, ago: "", thumb: "", seeded: Date.now() }], at: 5, channelId: "" };
    ok("seeds pass through", modCC.exports.readRecentServices().items.length === 1, "a just-ended service still lists at once");
  } catch (e) {
    ok("recents-cache suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const connCC = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pubCC = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn: connCC }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 360, ...(extra || {}) })));
    const getCC = (rpc) => JSON.parse(rpc.getContent({ conn: connCC }, ""));
    const stripClean = (st) => {
      const dvCC = new DataView(st.buffer);
      const metaChars = dvCC.getUint32(14, false);
      const secChars = dvCC.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(st.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.mediaClean;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dvCC.setUint32(14, nm.length, false);
    };
    const uploadsCC = [
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv12fgp8-IMG_7180.jpeg", headline: "", line: "", active: true },
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv35c9g1-WhatsApp_Image_2026-10-10_at_5.09.06_PM_2", headline: "", line: "", active: true },
    ];
    const stCC = new Uint8Array(8 * 1024 * 1024);
    const rCC0 = loadVm(stubAuth(srvCC), stCC);
    const p0 = pubCC(rCC0, { live: JSON.stringify({ youtubeChannel: "@twocorg", hiddenReplays: ["AAAAAAAAAAA", "BBBBBBBBBBB"] }), slides: JSON.stringify(uploadsCC) }, { first: true });
    ok("cc fixture publishes", p0.ok === true, "pub=" + JSON.stringify(p0).slice(0, 120));
    stripClean(stCC);
    const rCC1 = loadVm(stubAuth(srvCC), stCC);
    const afterCC = getCC(rCC1);
    const secCC = JSON.parse(afterCC.sections);
    const liveCC = secCC.live;
    ok("take-offs cleared", Array.isArray(liveCC.hiddenReplays) && liveCC.hiddenReplays.length === 0 && liveCC.youtubeChannel === "@twocorg", "every take-off goes, the channel stays");
    ok("welcome replanted", Array.isArray(secCC.slides) && secCC.slides.length === 1 && secCC.slides[0].id === "welcome-home" && secCC.slides[0].headline === "Welcome home", "the uploads go, the welcome card stays");
    ok("clear stamps nothing", afterCC.notes === 360, "notes=" + afterCC.notes);
    /* a later take-off and a new slide survive every later boot. */
    const p1 = pubCC(rCC1, { live: JSON.stringify({ ...liveCC, hiddenReplays: ["CCCCCCCCCCC"] }), slides: JSON.stringify([{ id: "easter", image: "https://example.com/e.jpg", headline: "Easter", line: "", cta: "", link: "", design: "auto", active: true }]) });
    ok("cc later edits publish", p1.ok === true);
    const rCC2 = loadVm(stubAuth(srvCC), stCC);
    const secCC2 = JSON.parse(getCC(rCC2).sections);
    ok("later edits survive reboot", secCC2.live.hiddenReplays.length === 1 && secCC2.slides.length === 1 && secCC2.slides[0].id === "easter", "got " + secCC2.slides[0].id);
    /* a store with no slides section gains none. */
    const rCCE = loadVm(stubAuth(srvCC), new Uint8Array(8 * 1024 * 1024));
    ok("absent slides stay absent", !("slides" in JSON.parse(getCC(rCCE).sections)), "the fallback already shows welcome");
  } catch (e) {
    ok("clean-migration suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* DD. this update overrides the last one (note 404): the stamp carries the
     update number so the whole clear re-runs once per update, untouched drafts
     follow, browsers drop old caches on a proven new update, and old office
     reports go silent by themselves. */
  const srvDD = text["scripts/cms-server.js"];
  const cmsDD = text["src/lib/cms.ts"];
  const rsDD = text["src/lib/recentstreams.ts"];
  const lsDD = text["src/lib/livestatus.ts"];
  const applyDD = text["APPLY_UPDATE.txt"];
  ok("override stamp per-update", has(srvDD, "var OVERRIDE_CLEAN = 0;") && has(srvDD, "overrideClean: OVERRIDE_CLEAN") && has(srvDD, "OVERRIDE_NO_414 = 414") && has(srvDD, "OVERRIDE_CLEAN !== OVERRIDE_NO_414"), "the clear must re-run on every new update, not once ever");
  ok("override clears everything old", has(srvDD, "live414.youtubeChannel = \"@twocorg\"") && has(srvDD, "live414.youtubeId = \"\"") && has(srvDD, "live414.hiddenReplays = []") && has(srvDD, "live414.externalYoutubeChannel = \"\"") && has(srvDD, "live414.guestIsLive = false") && has(srvDD, "WELCOME_SLIDE_360") && has(srvDD, "String(slides414[0].id || \"\") === \"welcome-home\""), "channel, stray link, guest, guest switch, take-offs and slides must all go");
  ok("override never blesses", has(srvDD, "no rev bump") && has(srvDD, "later office work is never touched"), "the clear must not publish");
  ok("draft stray link heals", has(cmsDD, "healDraftStreamLink()") && has(cmsDD, "(draft as any).live = { ...dLive, youtubeId: \"\" }"), "an untouched draft must follow the words");
  ok("browser caches drop on new update", has(rsDD, "export function clearRecentCaches()") && has(cmsDD, "if (freshEyes) clearRecentCaches();"), "old cards must not ride into the new update");
  ok("old reports go silent", has(lsDD, "Number(rep?.notes) === BUILD_NOTES"), "a 360 answer must die when 362 lands");
  ok("apply leads with override", has(applyDD, "overrides the last one, so every old clears away"), "the office must meet the override first");
  try {
    const connDD = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const pubDD = (rpc, sections, extra) =>
      JSON.parse(rpc.publish({ conn: connDD }, JSON.stringify({ sections, by: "office", changed: Object.keys(sections), notes: 362, ...(extra || {}) })));
    const getDD = (rpc) => JSON.parse(rpc.getContent({ conn: connDD }, ""));
    const stripOverride = (st) => {
      const dvDD = new DataView(st.buffer);
      const metaChars = dvDD.getUint32(14, false);
      const secChars = dvDD.getUint32(26, false);
      const base = (34 + 64 * 48) / 2;
      const u16 = new Uint16Array(st.buffer);
      let meta = "";
      for (let i = 0; i < metaChars; i++) meta += String.fromCharCode(u16[base + secChars + i]);
      const m = JSON.parse(meta);
      delete m.overrideClean;
      const nm = JSON.stringify(m);
      for (let i = 0; i < nm.length; i++) u16[base + secChars + i] = nm.charCodeAt(i);
      dvDD.setUint32(14, nm.length, false);
    };
    const uploadsDD = [
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv12fgp8-IMG_7180.jpeg", headline: "", line: "", active: true },
      { id: "", image: "https://twocchurch-site.onrender.com/data/uploads/mv35c9g1-WhatsApp_Image_2026-10-10_at_5.09.06_PM_2", headline: "", line: "", active: true },
    ];
    const stDD = new Uint8Array(8 * 1024 * 1024);
    const rDD0 = loadVm(stubAuth(srvDD), stDD);
    const p0 = pubDD(rDD0, { live: JSON.stringify({ youtubeChannel: "@debugging", youtubeId: "AAAAAAAAAAA", externalYoutubeChannel: "@guestchan", hiddenReplays: ["BBBBBBBBBBB"] }), slides: JSON.stringify(uploadsDD) }, { first: true });
    ok("dd fixture publishes", p0.ok === true, "pub=" + JSON.stringify(p0).slice(0, 120));
    stripOverride(stDD);
    const rDD1 = loadVm(stubAuth(srvDD), stDD);
    const afterDD = getDD(rDD1);
    const secDD = JSON.parse(afterDD.sections);
    const liveDD = secDD.live;
    ok("override moves channel", liveDD.youtubeChannel === "@twocorg", "got " + liveDD.youtubeChannel);
    ok("override drops stray link", liveDD.youtubeId === "", "got " + liveDD.youtubeId);
    ok("override clears the guest", liveDD.externalYoutubeChannel === "", "got " + liveDD.externalYoutubeChannel);
    ok("override clears take-offs", Array.isArray(liveDD.hiddenReplays) && liveDD.hiddenReplays.length === 0, "got " + JSON.stringify(liveDD.hiddenReplays));
    ok("override replants welcome", Array.isArray(secDD.slides) && secDD.slides.length === 1 && secDD.slides[0].id === "welcome-home", "got " + (secDD.slides[0] || {}).id);
    ok("override stamps nothing", afterDD.notes === 362, "notes=" + afterDD.notes);
    const p1 = pubDD(rDD1, { live: JSON.stringify({ youtubeChannel: "@twocorg", youtubeId: "", externalYoutubeChannel: "@newevent", hiddenReplays: ["CCCCCCCCCCC"] }), slides: JSON.stringify([{ id: "easter", image: "x", headline: "Easter", line: "", active: true }]) });
    ok("dd second publish", p1.ok === true, "pub=" + JSON.stringify(p1).slice(0, 120));
    const rDD2 = loadVm(stubAuth(srvDD), stDD);
    const secDD2 = JSON.parse(getDD(rDD2).sections);
    ok("later edits survive reboot", secDD2.live.hiddenReplays.length === 1 && secDD2.slides.length === 1 && secDD2.slides[0].id === "easter" && secDD2.live.externalYoutubeChannel === "@newevent", "got " + secDD2.slides[0].id);
  } catch (e) {
    ok("override suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* EE. the last previous livestream stands in (note 364): the 15
     @twocorg services ship in the code for dead-proxy days, three cache doors
     fall to them, deployed visitors read through their own host, and the stuck
     jazz report is named so the office can prove it dead. */
  const rsEE = text["src/lib/recentstreams.ts"];
  const applyEE = text["APPLY_UPDATE.txt"];
  ok("fallback ships in code", has(rsEE, "DESIGNATED_FALLBACK_ITEMS") && has(rsEE, "export function designatedFallback()"), "the previous services must survive an empty bake + dead proxies");
  ok("fallback is the last service first", rsEE.indexOf("s4bLaGUNet4") > 0 && rsEE.indexOf("s4bLaGUNet4") < rsEE.indexOf("aT5IeCtJHFw"), "SUNDAY SERVICE, 11TH OCT. 2026 must lead");
  ok("three cache doors", has(rsEE, "if (!cached || !Array.isArray(cached.items)) return designatedFallback();") && has(rsEE, "cachedChannelId !== designated) return designatedFallback();") && has(rsEE, "if (!items.length) return designatedFallback();"), "empty, foreign and thin caches must all fall back");
  ok("same-origin read", has(rsEE, "fetchTextSameOrigin") && has(rsEE, "const sameOrigin = await fetchTextSameOrigin(url);") && !has(rsEE, "fetchTextLocal"), "deployed visitors must read through their own host");
  ok("jazz named", has(applyEE, "zJvgsAhpNlo") && has(applyEE, "small\n  village"), "the office must know exactly which video is poison");
  try {
    const ebEE = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebEE.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const tcEE = await ebEE.default.transform(rsEE, { loader: "ts", format: "cjs" });
    const OWNER = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    const OTHER = "UCxxxxxxxxxxxxxxxxxxxxxx";
    const runEE = (store, designated) => {
      const stub = (id) => {
        if (id === "react") return { useEffect: () => {}, useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useSyncExternalStore: () => ({}) };
        if (id === "./hooks") return { readStore: (k, fb) => (k in store ? store[k] : fb), writeStore: (k, v) => { store[k] = v; } };
        if (id === "./embed") return { parseYoutubeId: (u) => /([\w-]{11})/.exec(String(u || ""))?.[1] || "", cleanChannelInput: (v) => String(v || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "") };
        if (id === "./livestatus") return { liveTarget: () => ({ url: "https://www.youtube.com/@twocorg/live", kind: "channel" }), designatedChannelId: () => designated };
        if (id === "../data/live") return { LIVE: { youtubeChannel: "@twocorg" } };
        return {};
      };
      const mod = { exports: {} };
      new Function("module", "exports", "require", tcEE.code)(mod, mod.exports, stub);
      return mod.exports;
    };
    const withDes = runEE({}, OWNER);
    const empty = withDes.readRecentServices();
    ok("empty cache falls back", empty.items.length === 15 && empty.items[0].videoId === "s4bLaGUNet4" && empty.channelId === OWNER, "got " + empty.items.length + " first=" + (empty.items[0] || {}).videoId);
    const foreign = runEE({ "wom.recentstreams": { items: [{ videoId: "AAAAAAAAAAA", title: "Debug", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OTHER } }, OWNER);
    const f2 = foreign.readRecentServices();
    ok("foreign cache falls back", f2.items.length === 15 && f2.items[0].videoId === "s4bLaGUNet4", "debugging videos must not survive");
    const own = runEE({ "wom.recentstreams": { items: [{ videoId: "AAAAAAAAAAA", title: "Sunday", at: 5, ago: "", thumb: "", seeded: 0 }], at: 5, channelId: OWNER } }, OWNER);
    ok("own cache kept", own.readRecentServices().items.length === 1, "a good list must stay");
    const nodes = runEE({}, "");
    ok("no designation, no fallback", nodes.readRecentServices().items.length === 0 && nodes.designatedFallback().items.length === 0, "anywhere else answers empty as before");
  } catch (e) {
    ok("fallback suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* FF. the seed cannot go missing (note 366): the repo seed backs
     the bake, an empty bake fails the build out loud, recents ride every
     re-bake, and git force-tracks the seed. */
  const bakeFF = text["scripts/bake-seed.mjs"];
  const statFF = text["scripts/build-static.mjs"];
  const giFF = text[".gitignore"];
  const applyFF = text["APPLY_UPDATE.txt"];
  ok("guard wired", has(bakeFF, 'from "./seed-guard.mjs"') && has(bakeFF, "pickBakeSource(") && has(bakeFF, "pickRecent("), "the bake must decide through the pure guard");
  ok("repo seed fallback", has(bakeFF, "shipping repo seed.json") && has(bakeFF, "target !== rootSeedPath"), "a backend-less build must ship the repo seed whole");
  ok("empty bake throws", has(bakeFF, 'code = "EMPTY_BAKE"') && has(bakeFF, "refusing to ship an empty bake"), "nowhere holding words must fail loud");
  ok("red build", has(statFF, 'err.code === "EMPTY_BAKE"') && has(statFF, "process.exit(1)"), "Render must go red, never deploy a silent shell");
  ok("recents ride along", has(bakeFF, "carried = pickRecent(") && has(bakeFF, "recent: fresh"), "a re-bake must never drop the previous livestreams");
  ok("seed force-tracked", has(giFF, "!seed.json"), "no *.json rule may hide the seed again");
  ok("step zero lists dotfile", has(applyFF, "maintenance-hold.txt and .gitignore"), "manual copies skip hidden files unless named");
  try {
    const ebFF = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebFF.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const tcFF = await ebFF.default.transform(text["scripts/seed-guard.mjs"], { loader: "js", format: "cjs" });
    const modFF = { exports: {} };
    new Function("module", "exports", "require", tcFF.code)(modFF, modFF.exports, () => ({}));
    const gFF = modFF.exports;
    const full = { sections: { live: {}, slides: [] }, recent: { items: [{ videoId: "AAAAAAAAAAA" }], at: 9, channelId: "UCQ0KIUXUV7gTZmDDlvd3ZcQ" } };
    ok("backend wins", gFF.pickBakeSource({ backend: full, targetPrev: full, rootSeed: full }).kind === "backend", "a live backend bakes fresh words");
    ok("target kept", gFF.pickBakeSource({ backend: { sections: {} }, targetPrev: full, rootSeed: full }).kind === "target", "an empty backend keeps the file at the target");
    ok("repo shipped", gFF.pickBakeSource({ backend: null, targetPrev: { sections: {} }, rootSeed: full }).kind === "root", "a backend-less build ships the repo seed");
    ok("empty refused", gFF.pickBakeSource({ backend: null, targetPrev: null, rootSeed: { sections: {} } }).kind === "empty", "nowhere holding words must refuse");
    ok("newest recents carried", gFF.pickRecent({ items: [{ videoId: "A" }], at: 3 }, { items: [{ videoId: "B" }], at: 7 })?.items[0].videoId === "B" && gFF.pickRecent({ items: [] }, null) === null, "the newest list rides, nothing invents one");
  } catch (e) {
    ok("guard suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* GG. the server gates the relay (note 368): a closed tab's last word
     dies on the server for every version at once, and an outdated tab's
     answers stop steering the site the moment the new update is published. */
  const srvGG = text["scripts/cms-server.js"];
  ok("relay gate exists", has(srvGG, "function gatedReport()") && has(srvGG, "function reportRelayable(rep, floor, now)") && has(srvGG, "REPORT_RELAY_MS = 150_000"), "the read path must relay through the gate");
  ok("relay checks server age", has(srvGG, "now - at > REPORT_RELAY_MS"), "freshness must use the arrival stamp, never the reporter's clock");
  ok("relay checks the update", has(srvGG, "floor > 0 && notes < floor"), "an outdated tab must go silent once the new update publishes");
  ok("gated answers wiped", has(srvGG, "if (LIVE_REPORT) LIVE_REPORT = null;"), "a dead answer must not wait in the store for later");
  try {
    const fnGG = new Function("rep,floor,now,ms", "var REPORT_RELAY_MS = ms;\n" + srvGG.slice(srvGG.indexOf("function reportRelayable"), srvGG.indexOf("function gatedReport")) + "\nreturn reportRelayable(rep, floor, now);");
    ok("fresh flows pre-publish", fnGG({ at: Date.now(), notes: 341 }, 0, Date.now(), 150000) === true, "before the first publish any fresh answer still relays");
    ok("stale dies", fnGG({ at: Date.now() - 151000, notes: 368 }, 368, Date.now(), 150000) === false, "a 5-minute-old answer relays to no version");
    ok("outdated dies", fnGG({ at: Date.now(), notes: 341 }, 368, Date.now(), 150000) === false, "the 341 jazz report goes silent once 368 publishes");
    ok("current flows", fnGG({ at: Date.now(), notes: 368 }, 368, Date.now(), 150000) === true, "the office's own 368 answer still relays");
    ok("nothing relays null", fnGG(null, 368, Date.now(), 150000) === false, "no report must never become a report");
  } catch (e) {
    ok("relay suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const connGG = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const openGG = stubAuth(srvGG.replace('if (!admins.has(info.conn.id)) return fail("denied");', 'if (false) return fail("denied");'));
    const rpcGG = loadVm(openGG, new Uint8Array(8 * 1024 * 1024));
    const wGG = (payload) => JSON.parse(rpcGG.liveReport({ conn: connGG }, JSON.stringify(payload)));
    const rGG = () => JSON.parse(rpcGG.liveReport({ conn: connGG }, ""));
    const repGG = (notes) => ({ target: "https://www.youtube.com/@twocorg/live", state: "live", videoId: "xIH3-U6pG0M", title: "jazz", checkedAt: Date.now(), notes });
    wGG(repGG(341));
    ok("old answer relays pre-publish", rGG().report && rGG().report.videoId === "xIH3-U6pG0M", "before the publish nothing changes");
    const pGG = JSON.parse(rpcGG.publish({ conn: connGG }, JSON.stringify({ sections: { live: JSON.stringify({ youtubeChannel: "@twocorg" }) }, by: "office", changed: ["live"], notes: 368, first: true })));
    ok("368 publishes", pGG.ok === true, "pub=" + JSON.stringify(pGG).slice(0, 120));
    const afterGG = rGG();
    ok("old answer dies on publish", afterGG.ok === true && afterGG.report === null, "the outdated tab is cut off the moment 368 publishes");
    wGG(repGG(368));
    ok("new answer flows", rGG().report && rGG().report.videoId === "xIH3-U6pG0M", "the current office still reports");
  } catch (e) {
    ok("relay round-trip", false, String((e && e.message) || e).slice(0, 200));
  }
  /* HH. every browser looks new (notes 370, 396): a 30-second poll with a
     retried reload onto newer code — and since 396 no cross-tab shout, no
     waiting number, and no accusing banner on the office tab. */
  const cmsHH = text["src/lib/cms.ts"];
  const appHH = text["src/App.tsx"];
  const admHH = text["src/pages/Admin.tsx"];
  ok("poll is faster", has(appHH, "}, 30_000);") && has(appHH, "checkStaleBuild"), "the host must be asked every 30 seconds, not 60");
  ok("no shout function", !has(cmsHH, "announceNewUpdate"), "the learning tab must tell no other tab anything");
  ok("no co-reload shout", !has(cmsHH, "export function startStaleCoReload()") && !has(appHH, "startStaleCoReload()") && !has(cmsHH, "STALE_BC_NAME") && !has(cmsHH, "STALE_PING_KEY"), "no update-number shout may pass between tabs");
  ok("no waiting number", !has(cmsHH, "export function staleWaitingNotes()"), "no banner may name the live update");
  ok("admin wears no wait", !has(admHH, "Update {cms.staleWaitingNotes()} is live") && !has(admHH, "This is an old copy") && !has(admHH, "cms.useStaleBuild()") && !has(admHH, "cms.useOlderCopy()"), "the office tab must not accuse the update");
  /* II. notice numbers, fast feed, guaranteed still (note 372): the waiting
     page names its numbers, proxy doors fail fast with a baked resolve for
     the designated handle, and the cover stands in the last previous
     thumbnail by itself. */
  const layII = text["src/components/layout.tsx"];
  const recII = text["src/lib/recentstreams.ts"];
  const watchII = text["src/pages/WatchLive.tsx"];
  ok("notice numbers retired", !has(layII, "awaiting the office publish (last publish: update") && !has(layII, "maint__notes"), "the waiting page must not print update numbers");
  ok("feed fails fast", has(recII, "const TIMEOUT_MS = 8_000;"), "dead proxies must not hold the deployed feed a minute");
  ok("designated skips the read", has(recII, "const designated = designatedChannelId(pasted);") && has(recII, "if (designated) return designated;"), "@twocorg is known without any page read");
  ok("cover stands in the still", has(watchII, "designatedFallback().items[0]?.thumb"), "the ended screen takes the last previous thumbnail with no read needed");
  /* JJ. the boot banner diagnoses itself (note 374): a resource error names
     its file (never "[object Event]"), and a pre-boot file failure reloads
     once per tab instead of sitting black. */
  const htmlJJ = text["index.html"];
  ok("boot names the file", has(htmlJJ, "__womDescribeErr") && has(htmlJJ, "could not load ") && has(htmlJJ, "(url ? \" \" + url : \"\")"), "the banner must name the failed file");
  ok("boot never objects", has(htmlJJ, "unknown boot error") && !has(htmlJJ, "String((e && e.message) || e)"), "no path may stringify an event again");
  ok("boot heals once", has(htmlJJ, "wom.boot.retried") && has(htmlJJ, "window.location.reload()"), "a stale page or mid-deploy load must heal with one reload, never loop");
  /* KK. dead photos fall back to welcome (note 376): a wiped upload answers
     with a page, not a picture — the slide must paint welcome, never black. */
  const sKK = text["src/components/slides.tsx"];
  ok("slide-photo decision is pure", has(sKK, "export function resolveSlidePhoto(named: string, welcome: string, dead: boolean)"), "the choice must be unit-runnable");
  ok("every flat face goes through it", has(sKK, "const original = resolveSlidePhoto(named, welcome, useDeadPhoto(named))"), "no face may paint a named photo unasked");
  ok("probe skips non-photos", has(sKK, "isSlideVideoUrl(url) || url.startsWith(\"data:\") || url.startsWith(\"blob:\")"), "films and composed frames must never count as dead");
  try {
    const ebKK = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebKK.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const from = sKK.indexOf("export function resolveSlidePhoto(");
    let depthKK = 0, endKK = -1, openedKK = false;
    for (let i = from; i < sKK.length && endKK < 0; i++) {
      const ch = sKK[i];
      if (ch === "{") { depthKK++; openedKK = true; }
      else if (ch === "}") { depthKK--; if (openedKK && depthKK === 0) endKK = i + 1; }
    }
    const tcKK = await ebKK.default.transform(sKK.slice(from, endKK).replace("export function", "function"), { loader: "ts", format: "cjs" });
    const modKK = { exports: {} };
    new Function("module", "exports", tcKK.code + "\nmodule.exports = resolveSlidePhoto;")(modKK, modKK.exports);
    const decide = modKK.exports;
    ok("empty paints welcome", decide("", "W", false) === "W" && decide("", "W", true) === "W");
    ok("dead named paints welcome", decide("https://host/data/uploads/x.jpeg", "W", true) === "W");
    ok("live named keeps painting", decide("https://host/data/uploads/x.jpeg", "W", false) === "https://host/data/uploads/x.jpeg");
    ok("dead welcome stays welcome", decide("W", "W", true) === "W");
  } catch (e) {
    ok("slide-photo suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* LL. builds always exit (note 378): the follow loop is opt-in for serving
     processes — bakes must never start it, or static-host builds hang. */
  const locLL = text["scripts/cms-local.mjs"];
  const srvLL = text["scripts/serve.mjs"];
  const viteLL = text["scripts/vite-cms-backend.mjs"];
  const bsLL = text["scripts/bake-seed.mjs"];
  const brLL = text["scripts/bake-recent.mjs"];
  ok("host takes the follow flag", has(locLL, "createCmsHost(rootDir, opts)") && has(locLL, "if (opts && opts.follow)"), "the loop must be asked for, never assumed");
  ok("servers opt in", has(srvLL, "createCmsHost(ROOT, { follow: true })") && has(viteLL, "{ follow: true }"), "npm start and npm run dev keep following live");
  ok("dev-only follow", has(viteLL, "config.command === \"serve\" ? { follow: true } : undefined"), "the vite hook also runs for vite build, where no loop may start");
  ok("bakes stay loop-free", has(bsLL, "createCmsHost(rootDir);") && has(brLL, "createCmsHost(rootDir);") && !has(bsLL, "follow: true") && !has(brLL, "follow: true"), "no bake may start the minute timer");
  /* MM. temporary guest channel (note 380): a one-off livestream from another
     address plays while IT is live, never seeds recents, and everything falls
     back to the main channel when it ends. */
  const liveMM = text["src/lib/livestatus.ts"];
  const watchMM = text["src/pages/WatchLive.tsx"];
  const blocksMM = text["src/components/blocks.tsx"];
  const editorMM = text["src/components/editor.tsx"];
  const autoMM = text["src/lib/autostop.ts"];
  const cmsMM = text["src/lib/cms.ts"];
  const schemaMM = text["src/lib/cmsSchema.ts"];
  const liveDefMM = text["src/data/live.ts"];
  const seedMM = text["seed.json"];
  ok("guest target reads its own field", has(liveMM, "export function guestTarget(channelInput?: string)") && has(liveMM, "LIVE.externalYoutubeChannel"), "the guest slot must never read the main channel");
  ok("guest stamp is its own gate", has(liveMM, "export function isGuestTargetUrl(targetUrl: string, guestUrl: string)"), "only the guest's own answer may stand for the guest");
  ok("guest asked first, main decides the rest", has(liveMM, "const guest = guestTarget()") && has(liveMM, "const officeGuest = guest && officeRep && officeRep.target === guest.url") && has(liveMM, "const guestLive = guestAns.state === \"live\""), "guest-live must win the screen; guest off/unknown must fall through");
  ok("guest never ends the main screen", has(liveMM, "const targetUrl = (guestLive && guest ? guest.url : target?.url)"), "the stamp — and the report after it — must say the winner");
  ok("office reports the winner", has(liveMM, 'const url = String(status.target || "") || liveTarget()?.url || ""'), "a guest-live answer must steer visitors to the guest");
  ok("retype still silences", has(liveMM, 'url !== (liveTarget()?.url || "") && url !== (guestTarget()?.url || "")'), "a moved channel must never report");
  ok("screen plays the guest", has(watchMM, "const screenAir = guestLive ? guestAir : airForTarget") && has(watchMM, "const guestLive = guestAir.state"), "guest-live plays; its end returns the main screen");
  ok("guest follow is one tap", has(watchMM, "guestLive ? isGuestTargetUrl(screenAir.target, guestUrl)"), "a walled guest follows its own channel, never autoplay");
  ok("tap opens the guest", has(blocksMM, "guestTarget()?.url") && has(blocksMM, "isGuestTargetUrl(st.target"), "a tap on a guest-live screen must play, not wait");
  ok("guest never seeds recents", has(editorMM, "isGuestTargetUrl(aired.target"), "a guest ending files nothing");
  ok("guest pastes clean", has(cmsMM, "cleanChannelInput(value.externalYoutubeChannel)"), "a doubled @ must never break the guest slot");
  ok("drawer carries the slot", has(schemaMM, 'path: "externalYoutubeChannel"') && has(liveDefMM, "externalYoutubeChannel"), "the office needs the field; the code needs the default");
  ok("bake carries the slot", has(seedMM, '"externalYoutubeChannel":""'), "fresh copies must read an empty guest, never undefined");
  try {
    const ebMM = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebMM.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabMM = (src, name) => {
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
    const setupMM = "function cleanChannelInput(s){ return String(s || \"\").trim().replace(/@@+/g, \"@\").replace(/\\s+/g, \"\"); }\nvar LIVE = { externalYoutubeChannel: \"\" };\n";
    const tcGuest = await ebMM.default.transform(setupMM + grabMM(liveMM, "guestTarget") + "\nmodule.exports = guestTarget;", { loader: "ts", format: "cjs" });
    const modGuest = { exports: {} };
    new Function("module", "exports", tcGuest.code)(modGuest, modGuest.exports);
    const guestTargetFn = modGuest.exports;
    ok("guest handle resolves", guestTargetFn("@guestchan")?.url === "https://www.youtube.com/@guestchan/live" && guestTargetFn("@guestchan")?.kind === "channel");
    ok("guest empty is null", guestTargetFn("") === null && guestTargetFn("   ") === null);
    ok("guest doubled @ heals", guestTargetFn("@@guestchan")?.url === "https://www.youtube.com/@guestchan/live");
    ok("guest id resolves", guestTargetFn("UCQ0KIUXUV7gTZmDDlvd3ZcQ")?.url === "https://www.youtube.com/channel/UCQ0KIUXUV7gTZmDDlvd3ZcQ/live");
    const tcIsGuest = await ebMM.default.transform(grabMM(liveMM, "isGuestTargetUrl") + "\nmodule.exports = isGuestTargetUrl;", { loader: "ts", format: "cjs" });
    const modIsGuest = { exports: {} };
    new Function("module", "exports", tcIsGuest.code)(modIsGuest, modIsGuest.exports);
    const isGuest = modIsGuest.exports;
    ok("own stamp stands", isGuest("https://www.youtube.com/@guestchan/live", "https://www.youtube.com/@guestchan/live") === true);
    ok("foreign stamp falls", isGuest("https://www.youtube.com/@twocorg/live", "https://www.youtube.com/@guestchan/live") === false);
    ok("empty guest waits", isGuest("https://www.youtube.com/@twocorg/live", "") === false && isGuest("", "https://www.youtube.com/@guestchan/live") === false);
  } catch (e) {
    ok("guest suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* NN. quiet waiting page (note 382): the notice keeps waiting, but the
     update-numbers small print is gone at the church's request. */
  const layNN = text["src/components/layout.tsx"];
  ok("numbers line gone", !has(layNN, "maint__notes") && !has(layNN, "awaiting the office publish"), "no update numbers anywhere on the waiting page");
  ok("notice still waits", has(layNN, "We&rsquo;ll be right back") && has(layNN, "Please check back shortly"), "the notice itself stays");
  ok("no dangling number reads", !has(layNN, "BUILD_NOTES") && !has(layNN, "publishedNotesVersion"), "unused number plumbing must go with the line");
  /* OO. publish lands everywhere, live plays by itself WITH SOUND (notes 384,
     388): a missed shout heals within the half minute on every copy; the live
     screen opens with no tap, and no live from a channel is ever silenced —
     the embeds take no mute and the player has no silent path. */
  const srvOO2 = text["scripts/cms-server.js"];
  const cmsOO = text["src/lib/cms.ts"];
  const embOO = text["src/lib/embed.ts"];
  const blocksOO = text["src/components/blocks.tsx"];
  const watchOO = text["src/pages/WatchLive.tsx"];
  const schemaOO = text["src/lib/cmsSchema.ts"];
  ok("rev stamp is public", has(srvOO2, "contentRev: function (info)") && has(srvOO2, "return ok({ rev: REV, notes: NOTES, at: AT });"), "visitors must read the stamp with no session");
  ok("every tab watches the stamp", has(cmsOO, "function startContentWatch()") && has(cmsOO, "socket.rpc.contentRev") && has(cmsOO, "30_000") && cmsOO.split("startContentWatch();").length >= 3, "local, mobile and desktop must all pull a missed publish");
  ok("watch pulls the guarded path", has(cmsOO, "r.rev !== rev") && has(cmsOO, "await syncFromServer()"), "the stamp must lead to the same sync the shout takes");
  ok("self-starts play with sound", has(blocksOO, "embedSrc(source, true)") && !has(blocksOO, "userOpened") && !has(blocksOO, "embedSrc(source, true, true)"), "no opening — tapped or self-started — may lose its audio");
  ok("screen autoplays live", has(watchOO, "autoPlay={streaming && watchable}"), "verified, follow or link — no poster while LIVE");
  ok("guest renamed", has(schemaOO, 'label: "Guest channel"') && !has(schemaOO, "Temporary guest channel"), "the drawer must not say Temporary");
  try {
    const ebOO = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebOO.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const teOO = await ebOO.default.transform(embOO, { loader: "ts", format: "cjs" });
    const modOO = { exports: {} };
    new Function("module", "exports", teOO.code)(modOO, modOO.exports);
    const yte = modOO.exports.youtubeEmbed;
    const che = modOO.exports.youtubeChannelEmbed;
    const srcOf = modOO.exports.embedSrc;
    const VID = "dQw4w9WgXcQ";
    const OWNER_OO = "UCQ0KIUXUV7gTZmDDlvd3ZcQ";
    ok("no live ever silenced", yte(VID, true, true).indexOf("mute") === -1 && yte(VID, true).indexOf("mute") === -1, "even a legacy muted call must play with sound");
    ok("old outputs identical", yte(VID, true) === "https://www.youtube.com/embed/" + VID + "?rel=0&modestbranding=1&playsinline=1&autoplay=1" && yte(VID, false).indexOf("autoplay") === -1 && yte(VID, false).indexOf("mute") === -1, "two-arg calls must build exactly what they built");
    ok("channel never silenced", che(OWNER_OO, true, true).indexOf("live_stream?channel=" + OWNER_OO) !== -1 && che(OWNER_OO, true, true).indexOf("mute") === -1, "a followed channel must self-start with sound too");
    ok("channel default identical", che(OWNER_OO, false) === "https://www.youtube.com/embed/live_stream?channel=" + OWNER_OO + "&rel=0&modestbranding=1&playsinline=1", "the old two-arg channel build must not move");
    ok("sound src threads through", srcOf({ platform: "youtube", youtubeChannelId: OWNER_OO }, true, true).indexOf("mute") === -1 && srcOf({ platform: "youtube", youtubeChannelId: OWNER_OO }, true).indexOf("mute") === -1, "the player must never build a silent address");
    const connOO = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const stOO = new Uint8Array(8 * 1024 * 1024);
    const rpcOO = loadVm(stubAuth(srvOO2), stOO);
    const rev0 = JSON.parse(rpcOO.contentRev({ conn: connOO }, ""));
    ok("stamp reads empty", rev0.ok === true && rev0.rev === 0 && typeof rev0.at === "number", "a fresh box stamps rev 0");
    const pubOO = JSON.parse(rpcOO.publish({ conn: connOO }, JSON.stringify({ sections: { live: JSON.stringify({ youtubeChannel: "@twocorg" }) }, by: "office", changed: ["live"], notes: 388, first: true })));
    const rev1 = JSON.parse(rpcOO.contentRev({ conn: connOO }, ""));
    ok("stamp follows publish", pubOO.ok === true && rev1.ok === true && rev1.rev === 1 && rev1.notes === 388, "the watch must see every publish move");
  } catch (e) {
    ok("publish-everywhere suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* PP. LIVE waits for the stream, every fix arrives clean, no take-over,
     close on any end (notes 386, 388, 408): badges ask displayLive (pressed
     main, live guest or switch, never the bare clock — the main never opens
     unpressed) while cadence still asks onAir; the override
     stamp is 386 and clears the guest slot with the rest; untouched drafts and
     restores follow; a guest ending into a live main shuts the screen; note
     388 extends the shut to ANY end on the off reading (unknown never closes),
     and only a new live edge re-arms so starts still play with sound. */
  const storePP = text["src/lib/store.ts"];
  const livePP2 = text["src/lib/livestatus.ts"];
  const watchPP = text["src/pages/WatchLive.tsx"];
  const cmsPP = text["src/lib/cms.ts"];
  const srvPP = text["scripts/cms-server.js"];
  const edPP = text["src/components/editor.tsx"];
  const layPP = text["src/components/layout.tsx"];
  const homePP = text["src/pages/Home.tsx"];
  const blocksPP = text["src/components/blocks.tsx"];
  const appPP = text["src/App.tsx"];
  const applyPP = text["APPLY_UPDATE.txt"];
  ok("display predicate exists", has(storePP, "export function displayLive(info?: NextServiceInfo | null): boolean") && has(storePP, "if (!LIVE.isLive) return false;"), "badges need the stream-or-switch answer");
  ok("cadence still hears the clock", has(storePP, "export function onAir(info?: NextServiceInfo | null): boolean") && has(appPP, "onAir(gathering)") && has(watchPP, "onAir(info) || info.msUntil"), "detection must stay armed around services");
  ok("badges ask displayLive", has(layPP, "displayLive(info)") && has(homePP, "displayLive(info)") && has(blocksPP, "displayLive(info)") && has(watchPP, "displayLive(info) && !shutNow"), "pill, hero, card and panel must all wait for the stream");
  ok("bare clock lights nothing", !has(layPP, "const live = onAir(info);") && !has(homePP, "{onAir(info) ? (") && !has(blocksPP, "const live = onAir(info);") && !has(watchPP, "const onAirNow = onAir(info);"), "no badge may read the clock answer");
  ok("screen shuts after an end", has(watchPP, "nextScreenShut(shut, shutPrevRef.current, guestUrl, screenAir.state") && has(watchPP, "const streaming = screenAir.state === \"live\" && !shutNow && (guestLive || fbLive || !!LIVE.isLive);") && has(livePP2, "export function nextScreenShut(") && has(livePP2, "export type ScreenShut") && has(watchPP, "screenAir.state === \"off\""), "any end must close the screen, never hand another channel over");
  ok("guest still clears", has(cmsPP, "healDraftGuest()") && has(cmsPP, "(draft as any).live = { ...dLive, externalYoutubeChannel: \"\" }") && has(cmsPP, "guestCleared: guestCleared || undefined") && has(edPP, "res.guestCleared"), "untouched drafts and restores must follow the clear");
  ok("drawer carries no promise text", !has(edPP, "the LIVE badge and the player wait for the stream itself") && !has(edPP, "Play and pause are one button") && !has(edPP, "the site is showing live by itself") && has(edPP, "Nothing is set to play yet"), "the promise paragraph is gone but functional — the unconfigured warning stays");
  ok("apply leads with the shut", has(applyPP, "never plays another channel's livestream by itself"), "the office must meet the closed screen first");
  try {
    const ebPP2 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebPP2.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabPP2 = (src, name) => {
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
    const tcShut = await ebPP2.default.transform(grabPP2(livePP2, "nextScreenShut") + "\nmodule.exports = nextScreenShut;", { loader: "ts", format: "cjs" });
    const modShut = { exports: {} };
    new Function("module", "exports", tcShut.code)(modShut, modShut.exports);
    const shutFn = modShut.exports;
    const MAIN_PP = "https://www.youtube.com/@twocorg/live";
    const GUEST_PP = "https://www.youtube.com/@guestchan/live";
    const OTHER_PP = "https://www.youtube.com/watch?v=AAAAAAAAAAA";
    ok("take-over shuts", JSON.stringify(shutFn(null, GUEST_PP, GUEST_PP, true, MAIN_PP)) === JSON.stringify({ playing: MAIN_PP }));
    ok("guest end shuts", JSON.stringify(shutFn(null, GUEST_PP, GUEST_PP, false, "", true)) === JSON.stringify({ playing: GUEST_PP }));
    ok("main end shuts", JSON.stringify(shutFn(null, MAIN_PP, GUEST_PP, false, "", true)) === JSON.stringify({ playing: MAIN_PP }));
    ok("unknown never shuts", shutFn(null, MAIN_PP, GUEST_PP, false, "") === null);
    ok("main re-entry plays", shutFn(null, MAIN_PP, GUEST_PP, true, MAIN_PP) === null);
    ok("guest start plays", shutFn(null, MAIN_PP, GUEST_PP, true, GUEST_PP) === null);
    ok("no guest, no shut", shutFn(null, MAIN_PP, "", true, MAIN_PP) === null);
    const heldPP = { playing: MAIN_PP };
    ok("shut holds while it plays", shutFn(heldPP, MAIN_PP, GUEST_PP, true, MAIN_PP) === heldPP);
    ok("quiet stays shut", shutFn(heldPP, MAIN_PP, GUEST_PP, false, "") === heldPP);
    ok("shut survives quiet", shutFn(heldPP, "", GUEST_PP, false, "") === heldPP);
    ok("same channel restart plays", shutFn(heldPP, "", GUEST_PP, true, MAIN_PP) === null);
    ok("guest restart re-arms", shutFn(heldPP, MAIN_PP, GUEST_PP, true, GUEST_PP) === null);
    ok("other new edge re-arms", shutFn(heldPP, MAIN_PP, GUEST_PP, true, OTHER_PP) === null);
    const setupPP2 = "var LIVEP2 = { isLive: false, liveCut: 0, liveCommandAt: 0, liveSince: 0 };\nvar DETPP = { now: false, guest: false, endedAt: 0 };\nfunction liveNow(){ return DETPP.now; }\nfunction guestLiveNow(){ return DETPP.guest; }\nfunction liveEndedAt(){ return DETPP.endedAt; }\n";
    const tcDisp = await ebPP2.default.transform(setupPP2 + grabPP2(storePP, "streamCut").replace(/LIVE/g, "LIVEP2") + "\n" + grabPP2(storePP, "displayLive").replace(/LIVE/g, "LIVEP2") + "\nmodule.exports = { displayLive: displayLive, __set: function (l, d) { Object.assign(LIVEP2, l); Object.assign(DETPP, d); } };", { loader: "ts", format: "cjs" });
    const modDisp = { exports: {} };
    new Function("module", "exports", tcDisp.code)(modDisp, modDisp.exports);
    const dispFn = modDisp.exports.displayLive;
    const setPP = modDisp.exports.__set;
    const TPP = Date.now();
    setPP({ isLive: false, liveCut: 0, liveCommandAt: 0, liveSince: 0 }, { now: true, guest: false, endedAt: 0 });
    ok("main detection alone stays quiet", dispFn({ isLive: false, at: new Date(TPP) }) === false);
    setPP({ isLive: false, liveCut: 0, liveCommandAt: 0, liveSince: 0 }, { now: false, guest: true, endedAt: 0 });
    ok("guest detection opens", dispFn({ isLive: false, at: new Date(TPP) }) === true);
    setPP({ isLive: true }, { now: false, guest: false });
    ok("office switch shows", dispFn({ isLive: false, at: new Date(TPP) }) === true);
    setPP({ isLive: false }, { now: false, guest: false });
    ok("bare clock stays quiet", dispFn({ isLive: true, at: new Date(TPP) }) === false);
    ok("quiet stays quiet", dispFn({ isLive: false, at: new Date(TPP) }) === false && dispFn(null) === false && dispFn(undefined) === false);
    setPP({ isLive: true, liveCut: TPP, liveCommandAt: 0, liveSince: 0 }, { now: false, guest: false, endedAt: TPP - 1000 });
    ok("stop holds through the gathering", dispFn({ isLive: true, at: new Date(TPP - 5000) }) === false);
    setPP({ isLive: true, liveCut: TPP, liveCommandAt: 0, liveSince: 0 }, { now: true, guest: false, endedAt: TPP - 1000 });
    ok("main detection never beats a stop", dispFn({ isLive: true, at: new Date(TPP - 5000) }) === false);
  } catch (e) {
    ok("shut-and-display suite", false, String((e && e.message) || e).slice(0, 200));
  }
  /* QQ. sound on, ended screen on the main thumbnail (note 388): no embed
     address can carry silence, the player has no silent path, the Watch call
     passes the off reading so any end closes at once, and the ended screen
     stands on the main-owned still chain. */
  const embQQ = text["src/lib/embed.ts"];
  const blocksQQ = text["src/components/blocks.tsx"];
  const watchQQ = text["src/pages/WatchLive.tsx"];
  const applyQQ = text["APPLY_UPDATE.txt"];
  ok("embeds never silence", embQQ.indexOf("mute") === -1, "no live address may carry a mute");
  ok("player drops the silent path", !has(blocksQQ, "userOpened") && has(blocksQQ, ": sourceKey;"), "every opening must play with its audio");
  ok("watch passes the off reading", has(watchQQ, "screenAir.state === \"off\""), "guest, main or office stop — any end must close");
  ok("ended screen stands on the main still", has(watchQQ, "airForTarget.endedAt && airForTarget.videoId && airForTarget.platform !== \"facebook\" ? youtubeThumb(airForTarget.videoId)") && has(watchQQ, "designatedFallback().items[0]?.thumb"), "just-ended frame, else newest recent, else the last previous service");
  ok("apply leads with sound and the close", has(applyQQ, "EVER MUTED") && has(applyQQ, "closes immediately"), "the office must meet the sound and the closed screen first");
  /* RR. transport buttons by the channels, publish only sends a clicked
     command (note 390): the stopped card is gone, play/pause/stop sit under
     the channel fields, the guest helper is gone, and the on-air state
     travels only on a clicked command. */
  const edRR = text["src/components/editor.tsx"];
  const adminRR = text["src/pages/Admin.tsx"];
  const cmsRR = text["src/lib/cms.ts"];
  const schemaRR = text["src/lib/cmsSchema.ts"];
  const autoRR = text["src/lib/autostop.ts"];
  const applyRR = text["APPLY_UPDATE.txt"];
  ok("stopped card gone", !has(edRR, "LiveControlPanel") && !has(edRR, "Continue the livestream") && !has(edRR, "Start a new livestream") && !has(edRR, "The stream has been stopped"), "no stopped state may remain in the drawer");
  ok("transport sits by the channels", has(adminRR, "<LiveTransportButtons />") && has(edRR, "export function LiveTransportButtons()") && adminRR.indexOf('"externalYoutubeChannel"') !== -1 && adminRR.indexOf('"externalYoutubeChannel"') < adminRR.indexOf("<LiveTransportButtons />"), "play, pause and stop belong beside the addresses they command");
  ok("transport arms every click", has(edRR, "liveCommandAt: Date.now()") && has(edRR, "Pause the livestream") && has(edRR, "Play the livestream") && has(edRR, 'icon="stop"'), "play, pause and stop must all stamp the command");
  ok("guest helper gone", !has(schemaRR, "Leave empty otherwise") && has(schemaRR, 'path: "externalYoutubeChannel"'), "the field stays, the helper goes");
  ok("publish gates the command", has(cmsRR, "export function gateLiveCommand(") && has(cmsRR, "gateLiveSnapshot(fold.snapshot || applied)") && has(cmsRR, 'if (sectionId === "live") value = gateLiveCommand(value, publishedSection("live"))'), "full and per-section publishes must both hold unclicked state back");
  ok("no automatic end", !has(autoRR, "setSectionValue") && !has(autoRR, "askForRecentServices") && !has(autoRR, "liveCommandAt: Date.now()") && !has(autoRR, "fireToast"), "when the stream ends by itself nothing is written, filed, stamped or toasted");
  ok("apply leads with the gate", has(applyRR, "PUBLISH ONLY SENDS A CLICKED COMMAND"), "the office must meet the click-to-send rule first");
  try {
    const ebRR2 = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebRR2.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabRR = (src, name) => {
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
    const tcGate = await ebRR2.default.transform(grabRR(cmsRR, "gateLiveCommand") + "\nmodule.exports = gateLiveCommand;", { loader: "ts", format: "cjs" });
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
  /* SS. one play/pause button plus stop, the buttons never gate a live end,
     the ended screen shows the main previous-service thumbnails (note 392):
     pause holds (play resumes the same session), stop ends (next play starts
     fresh), a natural end stamps its own command, and the ended screen carries
     up to six main-owned previous-service cards at once. */
  const edSS2 = text["src/components/editor.tsx"];
  const autoSS = text["src/lib/autostop.ts"];
  const watchSS2 = text["src/pages/WatchLive.tsx"];
  const cssSS = text["src/styles/pages.css"];
  const applySS2 = text["APPLY_UPDATE.txt"];
  ok("play and pause share one button", has(edSS2, "{onNow ? (") && has(edSS2, "Pause the livestream") && has(edSS2, "Play the livestream") && has(edSS2, 'icon="stop"'), "a single toggle plus the separate stop");
  ok("pause holds, stop ends", has(edSS2, "const heldSession = since > 0;") && has(edSS2, "liveSince: 0, liveCut: at") && has(edSS2, "Pause holds the broadcast without ending it"), "a hold resumes, an end starts fresh");
  ok("watcher writes nothing", !has(autoSS, "stopForStream") && !has(autoSS, "clearIdleGuest") && !has(autoSS, "setSectionValue"), "the watcher is inert — only Stop writes an end");
  ok("ended screen keeps no duplicate recents (note 413)", !has(watchSS2, "const endedThumbs") && !has(watchSS2, "live-ended__thumbs") && has(watchSS2, 'id="recent-services"'), "only #recent-services may list recents — the ended screen keeps its still and buttons");
  ok("apply leads with the buttons and the end", has(applySS2, "THE BUTTONS NEVER GATE A LIVE END") && has(applySS2, "PLAY/PAUSE IS ONE"), "the office must meet the two buttons and the self-armed end first");
/* TT. the end needs no publish; play starts, pause holds, stop ends, each
     with a publish (note 394): autostop stamps nothing and the drawer says
     so, the gate holds every unstamped write out, and the checklist leads
     with the rule. */
  const edTT2 = text["src/components/editor.tsx"];
  const cmsTT = text["src/lib/cms.ts"];
  const applyTT2 = text["APPLY_UPDATE.txt"];
  ok("drawer teaches nothing extra", !has(edTT2, "there is nothing to publish") && !has(edTT2, "Play and pause are one button"), "the rule lives in the checklist now, not in the drawer");
  ok("gate holds the unstamped end", has(cmsTT, "a natural end stamps nothing and needs no publish"), "the next publish must move only what the office changed");
  ok("apply leads with the rule", has(applyTT2, "A NATURAL END NEEDS NO PUBLISH") && has(applyTT2, "pause to hold it, then publish") && has(applyTT2, "stop to end one"), "the office must meet the rule first");
  /* UU. the fix arrives fresh with the notice on, the guest empty, no promise
     text, no stale numbers (note 396): the override stamp is this update, the
     guest slot ships and stays empty, the drawer paragraph is gone while the
     buttons and the gate still work, and no banner names an update. */
  const srvUU2 = text["scripts/cms-server.js"];
  const seedUU = text["seed.json"];
  const edUU2 = text["src/components/editor.tsx"];
  const applyUU2 = text["APPLY_UPDATE.txt"];
  ok("override is this update", has(srvUU2, "OVERRIDE_NO_414 = 414") && has(srvUU2, 'live414.externalYoutubeChannel = ""'), "first boot must re-run the clear, guest included");
  ok("guest ships empty", has(seedUU, '"externalYoutubeChannel":""'), "no copy may open with a guest set");
  ok("buttons still arm", has(edUU2, "liveCommandAt: Date.now()") && has(edUU2, "Pause the livestream") && has(edUU2, "Play the livestream") && has(edUU2, 'icon="stop"'), "removing the paragraph must not touch the transport");
  ok("promise text gone", !has(edUU2, "Play and pause are one button") && !has(edUU2, "there is nothing to publish"), "the drawer keeps only the unconfigured warning");
  ok("apply leads fresh", has(applyUU2, "ARRIVES FRESH") && has(applyUU2, "A NATURAL END NEEDS NO PUBLISH"), "the office must meet the fresh arrival first");
    /* VV. Facebook live plays as Facebook (note 398): its numeric video id must
     never enter the YouTube path, the screen prefers Facebook while IT is live,
     and the ended still stays YouTube-owned. The bake ships no stale cut. */
  const watchVV2 = text["src/pages/WatchLive.tsx"];
  const seedVV2 = text["seed.json"];
  const applyVV2 = text["APPLY_UPDATE.txt"];
  ok("facebook never enters youtube", has(watchVV2, 'screenAir.platform !== "facebook" ? screenAir.videoId : ""') && has(watchVV2, 'const fbLive = screenAir.state === "live"'), "a numeric facebook id must not open as youtube");
  ok("facebook live is watchable", has(watchVV2, "|| fbLive ||") && has(watchVV2, 'fbLive ? "facebook"'), "the screen must prefer facebook while it is live");
  ok("facebook live plays facebook", has(watchVV2, "fbLive") && has(watchVV2, '{ platform: "facebook", facebookUrl: LIVE.facebookUrl }'), "the player must embed facebook, with sound");
  ok("ended still stays youtube-owned", has(watchVV2, 'airForTarget.platform !== "facebook" ? youtubeThumb(airForTarget.videoId)'), "a facebook ending must not seed the still");
  ok("bake ships no stale cut", has(seedVV2, '"liveCut":0'), "fresh copies must not inherit a cut");
  ok("apply leads with the facebook fix", has(applyVV2, "FACEBOOK"), "the office must meet the routing first");
  /* WW. the main channel starts by itself (note 400): no Play press and no
     Publish — the drawer keeps the short cadence on the main address and a
     seen-live main ending files itself unstamped, while the transport stays
     armed and the checklist leads with the self-start. */
  const autoWW = text["src/lib/autostop.ts"];
  const edWW2 = text["src/components/editor.tsx"];
  const applyWW2 = text["APPLY_UPDATE.txt"];
  ok("drawer watches nothing", !has(autoWW, "useLiveStream") && has(autoWW, "useAutoStopLive"), "the hook stays mounted but inert — the transport rows keep their own lights");
  ok("main ending files nothing itself", !has(autoWW, 'liveEndedBy: "channel"') && !has(autoWW, "askForRecentServices"), "an ended broadcast files nothing until the office presses Stop");
  ok("guest ending changes nothing", !has(autoWW, "clearIdleGuest") && !has(autoWW, "setSectionValue"), "a guest ending changes nothing by itself");
  ok("play is the manual override", has(edWW2, "Play is only the manual override") && has(edWW2, "liveCommandAt: Date.now()"), "the buttons keep working, the main needs no press");
  ok("apply leads with the self-start", has(applyWW2, "THE MAIN CHANNEL STARTS BY ITSELF"), "the office must meet the no-press rule first");
  /* XX. each field has its buttons, the guest empties itself, Delete answers
     first tap (note 402), labelless since note 404: the transport rows sit
     under their fields with no who-labels and no Clear button, every stop
     and every finished guest empties the guest slot, and the unsaved list's
     Delete answers on the first tap where it cannot publish. */
  const edXX = text["src/components/editor.tsx"];
  const autoXX = text["src/lib/autostop.ts"];
  const cmsXX = text["src/lib/cms.ts"];
  const adminXX = text["src/pages/Admin.tsx"];
  const cssXX = text["src/styles/admin.css"];
  const applyXX = text["APPLY_UPDATE.txt"];
  ok("each field has its row", has(edXX, "transport-row") && has(edXX, "export function GuestTransportButtons()") && has(adminXX, 'f.path === "youtubeChannel" && <LiveTransportButtons />') && has(adminXX, 'f.path === "externalYoutubeChannel" && <GuestTransportButtons />'), "small buttons must sit under each field");
  ok("no labels, no clear button", !has(edXX, "transport-row__who") && !has(edXX, ">Main channel<") && !has(edXX, ">Guest channel<") && !has(edXX, "Clear the guest channel"), "the rows must not name themselves or carry a clear");
  ok("guest row guards and clears", has(edXX, "Type the guest channel first") && has(edXX, 'externalYoutubeChannel: ""') && has(edXX, "hadGuest"), "an empty guest names its field, every guest stop empties the slot");
  ok("finished guest self-clears nothing", !has(autoXX, "clearIdleGuest"), "only the guest Stop button empties the slot");
  ok("delete answers first tap", has(cmsXX, "export function sectionHasPublishableRemovals(") && has(adminXX, "sectionHasPublishableRemovals(edit.sectionId)") && has(adminXX, "onClick={() => erase(edit)}"), "Delete must not look dead where it only drops the draft");
  ok("rows are styled compact", has(cssXX, ".transport-row"), "the two rows must fit the field area");
  ok("apply leads with the rows", has(applyXX, "EACH FIELD HAS ITS BUTTONS"), "the office must meet the per-field rows first");
  /* YY. each field commands its own slot, guest Play opens the channel
     (notes 404, 410): the main row never touches the guest slot and the
     guest row never touches the main switch, the guest keys gate on their own
     stamp, the badges hear the guest switch, and a published guest Play opens
     its commanded channel while the read is walled — a pressed main waits for
     detection. */
  const edYY = text["src/components/editor.tsx"];
  const cmsYY = text["src/lib/cms.ts"];
  const storeYY = text["src/lib/store.ts"];
  const watchYY = text["src/pages/WatchLive.tsx"];
  const liveYY = text["src/data/live.ts"];
  const seedYY = text["seed.json"];
  const applyYY = text["APPLY_UPDATE.txt"];
  ok("stop clears the guest, guest never touches main", has(edYY, "export function GuestTransportButtons()") && has(edYY, "write(clearGuestOnStop(") && has(edYY, "The stop also empties") && has(edYY, "write({ guestIsLive: true, guestCommandAt: Date.now() })"), "one Stop ends the live and empties the guest; the guest row still commands only its slot");
  ok("guest keys gated on their stamp", has(cmsYY, "out.guestIsLive") && has(cmsYY, "guestCommandAt"), "only a guest click may send the guest state");
  ok("badges hear the guest switch", has(storeYY, "(LIVE as any).guestIsLive"), "a forced guest must light LIVE too");
  ok("guest press opens its walled channel", has(watchYY, "const overrideId = ") && has(watchYY, "(!streaming && overrideId)") && has(watchYY, ") : overrideGuest && overrideId ? (") && !has(watchYY, ") : overrideId ? (") && has(watchYY, "(mainDetected && !officeStopped)"), "a published guest Play may open the channel, a detected main plays by itself — and only a live slot plays by itself");
  ok("follow is unknown-only", has(watchYY, 'airForTarget.state === "unknown"') && has(watchYY, 'guestAir.state === "unknown"'), "a verified off must stay on the clock");
  ok("guest keys ship false", has(liveYY, "guestIsLive: false") && has(seedYY, '"guestIsLive":false'), "no copy may open with a guest forced");
  ok("apply leads own-slot", has(applyYY, "EACH FIELD COMMANDS ITS OWN SLOT"), "the office must meet the independent rows first");
  try {
    const ebYY = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebYY.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const grabYY = (src, name) => {
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
    const tcGateYY = await ebYY.default.transform(grabYY(cmsYY, "gateLiveCommand") + "\nmodule.exports = gateLiveCommand;", { loader: "ts", format: "cjs" });
    const modGateYY = { exports: {} };
    new Function("module", "exports", tcGateYY.code)(modGateYY, modGateYY.exports);
    const gateYY = modGateYY.exports;
    const G1 = 1000, G2 = 2000;
    ok("guest click travels", gateYY({ guestIsLive: true, guestCommandAt: G2 }, { guestIsLive: false, guestCommandAt: G1 }).guestIsLive === true, "a stamped guest click must send the guest state");
    ok("unclicked guest stays held", gateYY({ guestIsLive: true, guestCommandAt: G1 }, { guestIsLive: false, guestCommandAt: G1 }).guestIsLive === false, "no guest click, no send");
    ok("main click arms main only", gateYY({ isLive: true, liveCommandAt: G2, guestIsLive: true, guestCommandAt: G1 }, { isLive: false, liveCommandAt: G1, guestIsLive: false, guestCommandAt: G1 }).guestIsLive === false, "a main click must not arm the guest");
  } catch (e) {
    ok("guest-gate suite", false, String((e && e.message) || e).slice(0, 200));
  }
    /* ZZ. the next broadcast names the screen, each slot lights its own
     dot (note 406): a Play press for a coming gathering names it instead of
     the standing headline (a forced guest keeps the headline), and each
     transport row carries its own blinking on-air light. */
  const watchZZ = text["src/pages/WatchLive.tsx"];
  const edZZ = text["src/components/editor.tsx"];
  const cssZZ = text["src/styles/admin.css"];
  const srvZZ = text["scripts/cms-server.js"];
  const applyZZ = text["APPLY_UPDATE.txt"];
  ok("press names the next gathering", has(watchZZ, "guestForcedOnly") && has(watchZZ, "info?.slot.name || LIVE.liveTitle"), "a midweek press must not read Sunday");
  ok("forced guest keeps the headline", has(watchZZ, "guestForcedOnly ? LIVE.liveTitle"), "the schedule never names a guest event");
  ok("each row lights its own slot", has(edZZ, "const mainLive = ") && has(edZZ, "const guestLiveNow = ") && has(edZZ, "transport-row__live") && has(edZZ, "isStatusForTarget(airNow, mainUrl)") && has(edZZ, "isStatusForTarget(guestAirNow, guestUrlNow)"), "one row must never light for the other");
  ok("dots blink without extra polling", has(edZZ, "useLiveStream()") && has(edZZ, "live-dot"), "the rows subscribe to the shared check");
  ok("dots sit at the row end", has(cssZZ, ".transport-row__live"), "the light must fit the field area");
  ok("override is this update", has(srvZZ, "OVERRIDE_NO_414 = 414"), "first boot must re-run the clear");
  ok("apply leads with naming and dots", has(applyZZ, "NEXT BROADCAST NAMES THE SCREEN") && has(applyZZ, "LIGHTS ITS OWN DOT"), "the office must meet the heading and the lights first");
  /* AAA. the main opens by itself, the guest arrives empty, the crash names
     itself (note 400): a detected main live opens badges and player with no
     press (a published Stop still holds); an unverified live main waits on
     the clock; the draft guest sweeps once per update; the boundary prints
     the route and logs the stack. */
  const storeAAA = text["src/lib/store.ts"];
  const liveAAA = text["src/lib/livestatus.ts"];
  const watchAAA = text["src/pages/WatchLive.tsx"];
  const cmsAAA = text["src/lib/cms.ts"];
  const edAAA = text["src/components/editor.tsx"];
  const boundAAA = text["src/components/ErrorBoundary.tsx"];
  const srvAAA = text["scripts/cms-server.js"];
  const applyAAA = text["APPLY_UPDATE.txt"];
  ok("main detection lights badges", has(storeAAA, "if (guestLiveNow()) return true;") && has(storeAAA, "mainLiveNow() && !officeStopActive(LIVE)"), "a detected main must light badges with no press; a published Stop still holds");
  ok("guest answer is pure", has(liveAAA, "export function guestLiveNow(): boolean"), "only the guest stamp counts");
  ok("main answer is pure", has(liveAAA, "export function mainLiveNow(): boolean"), "only the main stamp counts for the main");
  ok("detected main autoplays", has(watchAAA, "(mainDetected && !officeStopped)") && has(watchAAA, "const waitingForClick = !shutNow"), "a detected main must autoplay with no press; a published Stop still holds");
  ok("unpressed live waits, never ends", has(watchAAA, "!onAirNow && !waitingForClick ? ("), "something IS live — the clock, not the ended screen");
  ok("draft guest sweeps per update", has(cmsAAA, "function clearDraftGuestSlot()") && has(cmsAAA, "if (freshEyes) clearDraftGuestSlot();"), "no unsaved guest row rides in");
  ok("drawer promises self-start", has(edAAA, "no press needed, Play is only a manual override") && has(edAAA, "Play is only the manual override"), "the drawer must promise the no-press rule");
  ok("crash names its page", has(boundAAA, "componentStack") && has(boundAAA, "Page: ${this.state.route}"), "the next screenshot must name the page");
  ok("override is this update", has(srvAAA, "OVERRIDE_NO_414 = 414"), "first boot must re-run the clear");
  ok("apply leads with press and empty", has(applyAAA, "MAIN WAITS FOR THE PLAY PRESS") && has(applyAAA, "GUEST ARRIVES EMPTY"), "the office must meet the press rule first");
  /* BBB. autoplay when the main is live (note 400): a main with an unknown
     read waits on the clock — only the commanded guest slot opens walled; a
     detected main broadcast plays by itself with no press. */
  const watchBBB = text["src/pages/WatchLive.tsx"];
  const srvBBB = text["scripts/cms-server.js"];
  const applyBBB = text["APPLY_UPDATE.txt"];
  ok("main press never autoplays walled", has(watchBBB, ") : overrideGuest && overrideId ? (") && !has(watchBBB, ") : overrideId ? (") && has(watchBBB, "const overrideMain = "), "a pressed main must wait for detection, not open the channel");
  ok("detected main plays with sound", has(watchBBB, "(mainDetected && !officeStopped)") && has(watchBBB, "autoPlay={streaming && watchable}") && has(watchBBB, "const waitingForClick = !shutNow"), "detection must autoplay with sound, no press; a published Stop still holds");
  ok("guest press still opens walled", has(watchBBB, "const overrideGuest = ") && has(watchBBB, 'guestAir.state === "unknown"'), "a published guest Play must still open its channel");
  ok("override is this update", has(srvBBB, "OVERRIDE_NO_414 = 414"), "first boot must re-run the clear");
  ok("apply leads with detection-gated autoplay", has(applyBBB, "AUTOPLAY ONLY WHEN THE MAIN IS LIVE"), "the office must meet the detection rule first");
  /* CCC. the Watch page loads (note 412): `liveSource` reads `streaming`, so
     the answer must be declared first — reading a later declaration threw on
     every render (`Cannot access 'streaming' before initialization`). */
  const watchCCC = text["src/pages/WatchLive.tsx"];
  const srvCCC = text["scripts/cms-server.js"];
  const applyCCC = text["APPLY_UPDATE.txt"];
  ok("streaming declared before liveSource", watchCCC.indexOf("const streaming = ") !== -1 && watchCCC.indexOf("const streaming = ") < watchCCC.indexOf("(!streaming && overrideId)"), "the initializer must never read across the dead zone");
  ok("rule expression unchanged", has(watchCCC, "(guestLive || fbLive || !!LIVE.isLive)") && has(watchCCC, "autoPlay={streaming && watchable}") && has(watchCCC, ") : overrideGuest && overrideId ? ("), "the reorder must move the rule, never rewrite it");
  ok("override is this update", has(srvCCC, "OVERRIDE_NO_414 = 414"), "first boot must re-run the clear");
  ok("apply leads with the crash fix", has(applyCCC, "WATCH PAGE PLAYS AGAIN"), "the office must meet the fix first");
  /* GGG. update 414: unsaved Delete clears, one Recent services, verified livestream, sleep-free uploads (note 413). */
  const cmsGGG = text["src/lib/cms.ts"];
  const adminGGG = text["src/pages/Admin.tsx"];
  const watchGGG = text["src/pages/WatchLive.tsx"];
  const blocksGGG = text["src/components/blocks.tsx"];
  const upGGG = text["src/lib/uploadCache.ts"];
  const edGGG = text["src/components/editor.tsx"];
  const slidesGGG = text["src/components/slides.tsx"];
  const srvGGG = text["scripts/cms-server.js"];
  ok("unsaved compare is stable", has(cmsGGG, "function stableStringify") && has(cmsGGG, "function forceClearSection"), "key order must never fake a Live stream change and Delete must force-clear");
  ok("live transport named", has(cmsGGG, 'def.id === "live"') && has(cmsGGG, "On-air switch"), "generic changed must become named lines");
  ok("delete always clears", has(adminGGG, "forceClearSection(edit.sectionId)"), "Delete must clear even a generic change");
  ok("one recent services only", !has(watchGGG, "const endedThumbs") && !has(watchGGG, "live-ended__thumbs"), "the ended screen must not duplicate #recent-services");
  ok("livestream verified only", has(watchGGG, "idVerdict === true") && has(watchGGG, "verifiedFallbackId") && has(watchGGG, "checkingLiveId"), "unknown ids wait, dead never autoplays into unavailable");
  ok("player verifies autoplay", has(blocksGGG, "Autoplay never opens an unverified id"), "the frame must never open unverified");
  ok("uploads cached", has(upGGG, "wom-uploads") && has(edGGG, "cacheUploadBlob(kept"), "every upload must stay in this browser");
  ok("uploads heal", has(cmsGGG, "healMissingUploads") && has(slidesGGG, "useCachedUploadUrl"), "sleep must restore and paint cached, blank-free");
  ok("override is 414", has(srvGGG, "OVERRIDE_NO_414 = 414"), "first boot must re-run the clear");
  ok("maintenance locked per deploy", has(text["scripts/build-static.mjs"], "const DEPLOY_ID =") && has(text["scripts/build-static.mjs"], "hold: true, deployId"), "every build must hold on a fresh deploy id");
  ok("deploy id number-free", has(cmsGGG, "wom.cms.deployPublished") && has(cmsGGG, "wom-deploy") && has(srvGGG, "PUBLISH_DEPLOY"), "old or new code must look new without numbers");
  ok("publish releases its deploy", has(cmsGGG, "deploy: bless ? currentDeployId") && has(srvGGG, "publishDeploy: PUBLISH_DEPLOY"), "a publish from the deploy must release it");
  ok("fresh deploy resets slides", has(cmsGGG, "resetSlidesForNewDeploy") && has(adminGGG, "resetSlidesForNewDeploy()"), "every deploy must start the admin slides as welcome-only");
  ok("no-change publish blesses deploy", has(cmsGGG, "a no-change Publish still blesses THIS deploy"), "publish with nothing changed must still lift the notice");
  ok("live screen drops the escape link", has(watchGGG, "hideEscape") && has(blocksGGG, "!hideEscape"), "the live players must not print Can't see the video");
  /* HHH. straight stop rule (note 414): Stop stops the live, Publish clears
     the guest with it and the unsaved change too, and the stopped screen shows
     the main previous thumbnail — never the ticking clock. */
  const liveHHH = text["src/lib/livestatus.ts"];
  const cmsHHH = text["src/lib/cms.ts"];
  const edHHH = text["src/components/editor.tsx"];
  const watchHHH = text["src/pages/WatchLive.tsx"];
  ok("stop state is pure", has(liveHHH, "export function officeStopActive(live: any): boolean") && has(liveHHH, "export function clearGuestOnStop(live: any): any"), "Stop must read as stopped with no fetch");
  ok("pause never reads as stopped", has(liveHHH, "Number((live as any).liveSince) !== 0"), "a held session must keep its clock");
  ok("fresh copies never read as stopped", has(liveHHH, "liveCut: 0"), "the seed ships no cut");
  ok("main stop clears the guest", has(liveHHH, 'externalYoutubeChannel: "", guestIsLive: false') && has(edHHH, "write(clearGuestOnStop({ ...cms.getDraft().live, isLive: false, liveSince: 0"), "one Stop must end the live and empty the guest slot stamped");
  ok("section publish drops its unsaved row", has(cmsHHH, "(draft as any)[sectionId] = clone(publishedSection(sectionId))"), "publishing live must clear the unsaved change too");
  ok("stopped screen skips the clock", has(watchHHH, "const officeStopped = officeStopActive(LIVE)") && has(watchHHH, "&& !shutNow && !officeStopped ? (") && has(watchHHH, "const waitingForClick = !shutNow && !officeStopped"), "a stopped live must show the previous thumbnail, never the ticking clock");
  /* III. the notice holds on feed-backed copies (note 416): a standalone
     copy with a baked feed has visitors to protect like a server-backed one,
     so an unpublished deploy waits there too — pure static (no server, no
     feed) still never waits, since nothing could ever release it. */
  const buildIII = text["scripts/build-static.mjs"];
  const cmsIII = text["src/lib/cms.ts"];
  ok("feed stamps its signal", has(buildIII, "wom-feed") && has(buildIII, "feed meta stamped into dist/index.html"), "the gate must know at first paint that words can move");
  ok("gate hears the feed", has(cmsIII, "function feedFromMeta(): boolean") && has(cmsIII, "!serverInvolved() && !feedFromMeta()"), "an unpublished deploy must wait on feed-backed copies too");
  ok("pure static never waits", has(cmsIII, "Pure static never waits"), "a copy nothing can release must never hold");
  /* JJJ. @twocorg-proven recents and never-blank faces (note 418): the
     channel feed proves ownership — grid-only unknowns, dateless keeps and
     foreign bakes never paint on the designated channel — and a slide with
     no paintable photo paints no <img>, borrowing the welcome words when it
     has none of its own. */
  const recentJJJ = text["src/lib/recentstreams.ts"];
  const slidesJJJ = text["src/components/slides.tsx"];
  ok("fresh reads prove ownership", has(recentJJJ, ".filter((it) => !designatedRead || !!feed.dates[it.videoId])"), "a walled grid must not smuggle foreign uploads in");
  ok("merges evict the unproven", has(recentJJJ, "(!designatedRead || Number(it.at) > 0)"), "dateless keeps must go on the designated channel");
  ok("bakes prove their channel", has(recentJJJ, "bakedFor !== designatedChannelId()"), "a bake stamped for another channel must never paint");
  ok("caches paint proven only", has(recentJJJ, "!designated || Number(it.at) > 0 || (it.seeded"), "old wall garbage must die on the next read");
  ok("faces never blank", has(slidesJJJ, "const shownPhoto = ") && has(slidesJJJ, "{photo ? <img") && has(slidesJJJ, "welcome-home") && has(slidesJJJ, "never blank"), "an imageless face keeps gradient plus words");
const notes = Number((text["src/lib/hooks.ts"].match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
  const apply = text["APPLY_UPDATE.txt"];
  ok("update number consistent", notes > 0 && has(apply, `APPLY THIS UPDATE (${notes})`), "hooks=" + notes);
  ok("pre-bundle notes match", notes > 0 && has(text["index.html"], `name="wom-notes" content="${notes}"`), "the pre-bundle paint must know the running update");
  /* Unnumbered stale fix (no new number): the running code carries an opaque
     word — compared by equality, never ordered — so a stale stamp from older
     code can never release the fix on vscode or on deploy. */
  const codeId = (text["src/lib/hooks.ts"].match(/export const CODE_ID = "([A-Za-z0-9_-]+)"/) || [])[1] || "";
  const cmsTail = text["src/lib/cms.ts"];
  ok("code word unnumbered", codeId !== "" && !/\d/.test(codeId), "the fix must ship with no new number");
  ok("entry page names the code", has(text["index.html"], `name="wom-code" content="${codeId}"`), "the pre-bundle paint must know the running code");
  ok("entry gate holds unblessed code", has(text["index.html"], "wom.cms.codeBlessed"), "a stale stamp must never skip the early notice");
  ok("gates require the blessing", cmsTail.split("codeBlessedMatches()) return false").length - 1 >= 2, "both local gates must hold until Publish blesses this code");
  ok("publish blesses the code", has(cmsTail, "function blessRunningCode()") && has(cmsTail, "blessRunningCode();"), "an explicit Publish must bless, witnesses never except same-deploy");
  ok("reset clears the blessing", has(cmsTail, "CODE_BLESS_KEY,"), "an explicit office delete must unbless");
  ok("stale poll hears code drift", has(cmsTail, "codeIsNew") && has(cmsTail, "staleCodeMismatch"), "a different code in version.json must wait and reload like any newer update");
  ok("build stamps the code", has(text["scripts/build-static.mjs"], "code: codeWord") && has(text["scripts/build-static.mjs"], "code word stamped into dist/index.html"), "version.json and the entry page must name the code");
  ok("server warns on code drift", has(text["scripts/serve.mjs"], "DIST_CODE !== SRC_CODE"), "a dist baked from older code must never serve silent");
  /* KKK. publish lands everywhere at once (publish-at-once, unnumbered): the
     office hears live publishes in about a second over the event stream, the
     live box adopts the office mirror within about a minute without bumping
     its stamp, every publish converges all lanes immediately, and the slow
     lanes tick every minute. */
  const pushKKK = text["scripts/instant-push.mjs"];
  const specKKK = text["scripts/feed-spec.mjs"];
  const localKKK = text["scripts/cms-local.mjs"];
  const srvKKK = text["scripts/cms-server.js"];
  const cmsKKK = text["src/lib/cms.ts"];
  const autoKKK = text["scripts/auto-push.mjs"];
  ok("stream framing is pure", has(pushKKK, "export function splitSse") && has(pushKKK, "export function openInstantPush"), "the push must stay runnable anywhere");
  ok("office hears live at once", has(localKKK, "openInstantPush") && has(localKKK, "officefollow"), "a live/admin publish must reach the office in about a second");
  ok("follow stamp is seconds", has(localKKK, "STAMP_MS") && has(localKKK, "/__cms/contentRev"), "local must hear a live publish in seconds even with the stream down");
  ok("live box follows the mirror", has(localKKK, "startFeedFollow") && has(localKKK, "process.env.RENDER") && has(localKKK, "FEED_FOLLOW_MS"), "a local/admin publish must reach live without a rebuild");
  ok("feed adopt never churns", has(srvKKK, "adoptFeed: function (info, raw)") && has(srvKKK, "never bumps the revision"), "the stamp must stay the feed's own");
  ok("feed address is pure", has(specKKK, "export function parseFeedSpec") && has(specKKK, "export function feedSeedUrls") && has(specKKK, "export async function peekFeedSeed"), "the live box must resolve the mirror like the tabs do");
  ok("publish converges now", has(cmsKKK, "function convergeNow()") && has(cmsKKK, "if (bless) convergeNow();"), "every bless must pull all lanes at once");
  ok("slow lanes tick fast", has(cmsKKK, "syncFromFeed().catch(() => {}), 60 * 1000"), "server-less copies must read the mirror every minute");
  ok("push rides faster", has(autoKKK, "DELAY_MS = 60000"), "the words must push a minute after the last save");
  try {
    const ebKKK = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await ebKKK.default.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    const tcPush = await ebKKK.default.transform(pushKKK, { loader: "js", format: "cjs" });
    const modPush = { exports: {} };
    new Function("module", "exports", tcPush.code)(modPush, modPush.exports);
    const split = modPush.exports.splitSse;
    const two = split('data: {"rev":9}\n\ndata: {"rev":10}\n\n');
    ok("frames split messages", two.messages.length === 2 && two.rest === "", "got " + JSON.stringify(two.messages));
    const beat = split(':\n\n');
    ok("heartbeats ignored", beat.messages.length === 0 && beat.rest === "", "a beat must emit nothing");
    const half = split('data: {"rev":');
    const full = split(half.rest + '11}\n\ntrailer');
    ok("rest kept across chunks", half.messages.length === 0 && full.messages.length === 1 && full.rest === "trailer", "a split frame must wait for its end");
    const tcSpec = await ebKKK.default.transform(specKKK, { loader: "js", format: "cjs" });
    const modSpec = { exports: {} };
    new Function("module", "exports", tcSpec.code)(modSpec, modSpec.exports);
    const parsed = modSpec.exports.parseFeedSpec("ownerx/repo-y@main");
    ok("feed spec parses", !!parsed && parsed.owner === "ownerx" && parsed.repo === "repo-y" && parsed.branch === "main" && modSpec.exports.parseFeedSpec("nope") === null, "owner/repo@branch or nothing");
    const urls = modSpec.exports.feedSeedUrls(parsed);
    ok("mirror first", urls.length === 2 && urls[0].indexOf("cdn.jsdelivr.net") !== -1 && urls[1].indexOf("raw.githubusercontent.com") !== -1, "fastest host first");
  } catch (e) {
    ok("instant-push suite", false, String((e && e.message) || e).slice(0, 200));
  }
  try {
    const openKKK = stubAuth(srvKKK) + '\nself.__adoptToken = "t";';
    const rpcKKK = loadVm(openKKK, new Uint8Array(8 * 1024 * 1024));
    const connKKK = { id: "t", net: ["local", 0, 0], subscribe() {}, topics: new Set() };
    const feed = (payload) => JSON.parse(rpcKKK.adoptFeed({ conn: connKKK }, JSON.stringify(payload)));
    const good = { token: "t", sections: { home: JSON.stringify({ title: "Feed words" }) }, notes: 413, at: 1700000000000, by: "office", deploy: "" };
    const r1 = feed(good);
    const g1 = JSON.parse(rpcKKK.getContent({ conn: connKKK }, ""));
    ok("feed adopt writes words", r1.ok === true && JSON.parse(g1.sections).home.title === "Feed words", "pub=" + JSON.stringify(r1).slice(0, 120));
    ok("feed adopt never churns", g1.ok === true && g1.rev === 0 && g1.at === 1700000000000 && g1.notes === 413, "rev=" + g1.rev + " at=" + g1.at);
    ok("feed adopt needs the token", feed({ ...good, token: "wrong" }).ok === false, "a forged write must be refused");
    ok("feed adopt needs words", feed({ token: "t", sections: {} }).ok === false, "blank answers adopt nothing");
    ok("feed adopt validates", feed({ token: "t", sections: { home: "not-json" } }).ok === false, "junk must never store");
  } catch (e) {
    ok("adopt-feed suite", false, String((e && e.message) || e).slice(0, 200));
  }
  return out.join("\n");
}
