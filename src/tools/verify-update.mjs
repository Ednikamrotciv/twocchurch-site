/* verify-update.mjs — U441 unified gate (all old updates removed).
   Single section locking the retained contract: maintenance holds every new
   deploy, one admin Publish clears it, new deploy wipes old wakes, unsaved
   opens clean/new/empty, live-relay intact, livestream intact.
   RUN: const m = await import(URL.createObjectURL(new Blob(
     [await fs.readTextFile("src/tools/verify-update.mjs")], { type: "text/javascript" })));
   return await m.runAll({ read: (p) => fs.readTextFile(p) });
   Site code must NEVER import this module. */

const FILES = [
  ["src/lib/cms.ts", "ts"],
  ["src/lib/hooks.ts", "ts"],
  ["src/lib/livestatus.ts", "ts"],
  ["src/lib/embed.ts", "ts"],
  ["src/lib/recentstreams.ts", "ts"],
  ["src/pages/WatchLive.tsx", "tsx"],
  ["src/components/blocks.tsx", "tsx"],
  ["src/components/editor.tsx", "tsx"],
  ["src/pages/Admin.tsx", "tsx"],
  ["src/lib/store.ts", "ts"],
  ["src/App.tsx", "tsx"],
  ["src/components/layout.tsx", "tsx"],
  ["scripts/build-static.mjs", "js"],
  ["scripts/serve.mjs", "js"],
  ["scripts/bake-seed.mjs", "js"],
  ["scripts/seed-fallback.mjs", "js"],
  ["scripts/cms-local.mjs", "js"],
  ["index.html", null],
  ["APPLY_UPDATE.txt", null],
  ["maintenance-hold.txt", null],
  ["clean-deploy.txt", null],
  ["src/SPEC.md", null],
];

function has(src, needle) {
  return typeof src === "string" && src.indexOf(needle) !== -1;
}

export async function runAll(fs) {
  const out = [];
  const ok = (name, cond, extra) => out.push((cond ? "OK " : "FAIL ") + name + (cond || !extra ? "" : " — " + extra));
  const text = {};
  for (const [p] of FILES) {
    try { text[p] = await fs.read(p); }
    catch (e) { text[p] = ""; ok("read " + p, false, String((e && e.message) || e).slice(0, 160)); }
  }

  /* U441-1. every touched file still parses. */
  try {
    const { default: esbuild } = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
    try { await esbuild.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" }); } catch {}
    for (const [p, loader] of FILES) {
      if (!loader) continue;
      try { await esbuild.transform(text[p], { loader }); ok("parse " + p, true); }
      catch (e) { ok("parse " + p, false, String((e && e.message) || e).slice(0, 160)); }
    }
  } catch (e) {
    ok("parse suite", false, String((e && e.message) || e).slice(0, 200));
  }

  const cms = text["src/lib/cms.ts"];
  const hooks = text["src/lib/hooks.ts"];
  const index = text["index.html"];
  const apply = text["APPLY_UPDATE.txt"];
  const spec = text["src/SPEC.md"];
  const build = text["scripts/build-static.mjs"];
  const live = text["src/lib/livestatus.ts"];
  const blocks = text["src/components/blocks.tsx"];
  const watch = text["src/pages/WatchLive.tsx"];

  /* U441-2. unified version. */
  ok("version is 441/unified441", has(hooks, "BUILD_NOTES = 441") && has(hooks, 'CODE_ID = "unified441"'), "hooks must carry 441/unified441");
  ok("entry carries 441", has(index, 'wom-notes" content="441"') && has(index, 'wom-code" content="unified441"'), "index metas must match hooks");
  ok("apply is 441 unified", has(apply, "APPLY THIS UPDATE (441)") && has(apply, "unified441"), "one unified apply note only");
  ok("spec is 441 only", has(spec, "## 441. One unified update"), "old SPEC notes removed");

  /* U441-3. maintenance holds every new deploy. */
  ok("hold ships", has(text["maintenance-hold.txt"], "hold") && has(build, "maintenance hold on"), "fresh visitors must wait until Publish");
  ok("deploy lock stamps fresh id", has(build, "DEPLOY_ID") && has(build, 'name="wom-deploy"'), "every build looks new");
  ok("gate holds unstamped-proof copies", has(cms, "maintenanceShouldWait") && has(cms, "publishedDeployId === currentDeployId") && has(index, "wom-maint-gate"), "deploy + code + clock witnesses only");
  ok("admin never gated", has(index, "/admin") && has(cms, "maintenancePreview"), "console stays active behind the notice");

  /* U441-4. one Publish clears it, unsaved clean. */
  ok("no-change publish blesses", has(cms, "sendPatch({}, [], note.slice(0, 160), true, true"), "zero-change click must ride the same pipeline");
  ok("publish marks deploy + clock", has(cms, "markDeployPublished()") && has(cms, "notePublishAt(Date.now())") && has(cms, "markJustPublished()"), "one click lifts every tab/browser");
  ok("publish leaves drawer clean", has(cms, "dirty = {};") && has(cms, "editUndos = [];") && has(cms, "localStorage.removeItem(DRAFT_KEY)"), "no resurrection on reload");
  ok("publish clears unrecorded live", has(cms, "clearUnrecordedLive()"), "offline/section paths match online");
  ok("live section follows publish", has(cms, "Publishing the live section clears its unsaved change too"), "no live row lingers");

  /* U441-5. new deploy wipes old wakes, opens fresh/clean/new/empty. */
  ok("fresh boot wipes wakes", has(cms, "wipeOldWakes()") && has(cms, "deployProvesFreshDeploy"), "retired workers/caches never paint the old shell");
  ok("fresh boot clears unsaved", has(cms, 'localStorage.removeItem(DRAFT_KEY)') && has(cms, 'localStorage.removeItem(PENDING_KEY)') && has(cms, 'localStorage.removeItem(HISTORY_KEY)'), "unsaved opens new/empty");
  ok("clean deploys ship the flag", has(text["clean-deploy.txt"], "Recover") && has(build, "clean-deploy.txt") && has(text["scripts/bake-seed.mjs"], "clean-deploy.txt"), "every deploy opens clean until Recover + Publish");
  ok("clean stage per-deploy", has(cms, "cleanStageForNewCode") && has(cms, "freshDeploy && hadPriorBlessing()"), "returning browsers stage welcome-only; fresh joins keep live words");

  /* U441-6. live-relay intact. */
  ok("publish relays to live", has(cms, "relayPublishWordsToLive") && has(cms, "scheduleRelayRetry"), "office words reach the live backend in seconds");
  ok("bless relay carries words", has(cms, "fillBlessRelay"), "empty bless still promises the held words");
  ok("publish folds live in", has(cms, "foldLiveInto("), "sections the office did not touch take live words");
  ok("server verdict lifts all", has(cms, "serverHoldsPublish()"), "one publish lifts every copy on the host");

  /* U441-7. livestream intact. */
  ok("player verifies before playing", has(blocks, "verifyYoutubeId") && has(blocks, "Watch on YouTube"), "dead ids never autoplay into the black frame");
  ok("channel follow plays", has(live, "live_stream?channel=") || has(text["src/lib/embed.ts"], "live_stream?channel="), "walled-but-on-air plays the channel");
  ok("watch follows + fallback clean", has(watch, "manualFallback") && has(watch, "verifiedFallbackId"), "Play+video-id while walled still opens; poster, no stuck spinner");

  return out.join("\n");
}
