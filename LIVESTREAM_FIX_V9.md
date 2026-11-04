# Livestream — fix v9 (on top of v5–v8)

Follows LIVESTREAM_FIX_V7.md / V6 / V5. No behavior change to the v5–v8 player
contract — this update removes the remaining dead ends and drift around it:

## What was wrong

1. **Dev backend had no live door.** `scripts/serve.mjs` answers `GET /__live`
   (YouTube Data API, `YT_API_KEY` in server env only, 75s server cache), but
   `scripts/vite-cms-backend.mjs` (the `npm run dev` backend) never did — its
   `/__yt` proxy was ported, `/__live` was not. In dev the live-API client hit
   the Vite fallback (200 index.html), burned a JSON-parse miss, and fell back
   to stamp + scrape. Production was unaffected; dev live detection lagged it.
2. **Live-API client trusted any 200.** `fetchLiveApiOnce` parsed whatever the
   same-origin door returned. On static hosts `/__live` IS the SPA fallback
   (200 index.html) — a wasted parse on every poll before falling through.
3. **WAF did not name `/__live`.** `endpointCategory` mapped `/__yt`, `/__geo`,
   `/__rates` to `api` but not `/__live`, so the live door rode the generic
   bucket instead of the API one it belongs with.
4. **Dead YT event.** `VideoPlayer` passed `onAutoplayBlocked` to
   `new YT.Player(...)`. The YT IFrame API has no such event — it is ignored —
   while the comment claimed the browser "answers with onAutoplayBlocked". The
   real net was always the 2.5s PLAYING watch below it. Dead code, misleading
   comment, now removed.
5. **Recents body check missed a marker.** `isExpectedBody` accepted channel
   pages carrying `lockupMetadataViewModel` / `ytInitialData` / `videoDetails`
   but not pages carrying only `ytInitialPlayerResponse` (walled reads). Those
   reads were dropped as "not YouTube" and the list waited a round.
6. **Version drift.** Code shipped 440/unified440 while APPLY_UPDATE still said
   438/unified438 and the verifier J8 still expected unified438 — the verifier
   failed on the current code and the docs misled the deploy. Bumped to
   441/unified441 everywhere (notes + code word + entry-page metas + verifier),
   which also retires every stale bundle and forces the fresh-deploy hold.

## What changed (v9)

- `scripts/vite-cms-backend.mjs` — new `GET /__live` handler: same UC-id guard,
  same `YT_API_KEY` env, 404 with no key, live/off JSON like production. No
  server cache in dev (single office user — quota irrelevant; production keeps
  its 75s cache).
- `src/lib/livestatus.ts` — `fetchLiveApiOnce` returns null at once for
  non-JSON answers (SPA fallback falls through to stamp + scrape immediately).
- `scripts/waf.mjs` — `endpointCategory` maps `/__live*` to `api`.
- `src/components/blocks.tsx` — removed the `onAutoplayBlocked` handler and
  fixed the comment (2.5s PLAYING watch is the net). No behavior change.
- `src/lib/recentstreams.ts` — `isExpectedBody` also accepts
  `ytInitialPlayerResponse`.
- `src/lib/hooks.ts` + `index.html` + `src/tools/verify-update.mjs` +
  `APPLY_UPDATE.txt` — 441 / unified441.

CMS/admin, accounts, publishing, design, maintenance-hold, clean-deploy,
wipeOldWakes, DEPLOY_SEEN unsaved-clear, clean-stage, live-relay, feed, and all
other features untouched. No new dependencies. No keys in frontend code.

## Verify on production (not localhost)

1. Cold load Watch: still paints instantly (<1s), LIVE badge, motion fast.
2. Fresh profile (sound held): video moves muted within ~3s, first tap
   anywhere → sound on. No button, no black hold.
3. Office Play + Publish mid-service → deployed Watch shows the broadcast
   within seconds (stamp fast path, no scrape wait), with sound per v6 rules.
4. Stop + Publish → ended screen + latest recording; restart re-opens by itself.
5. With `YT_API_KEY` set: start a live with no office press → auto-opens
   (may lag the API ~1–2 min). Without key + no press + walled scrape → clock
   (unchanged, correct: nothing verified live).
6. Grey arrow (kill the live / bad id): 15s self-heal reopens a live broadcast
   by itself; admin Reload reopens it at once. Sleep 5 min on arrow → wake →
   repairs itself (≤1/min).
7. `/admin/watch-live` + all routes: throttle + mid-visit redeploy → no crash
   card; if forced, Reload-first-tap recovers.
8. New deploy: maintenance notice holds for fresh visitors until the office
   Publish; one Publish clears every browser/device; unsaved opens new/empty;
   old service-worker/cache wakes never paint the old shell; live-relay +
   sleep-wake serve the last publish whole.
