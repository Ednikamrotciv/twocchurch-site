# Livestream — fix v12 (v11 reference rebased onto the v9 fix set)

Your reference `church-site-livestream-fixed_11_.zip` (BUILD_NOTES 439,
code `unified439`) predates the whole v7→v9 livestream repair chain: its
`src/lib/livestatus.ts` is scrape-only (no published Play stamp, no
`/__live` Data API door, no guest API door, no hardened end-check), it races
a single public proxy, reads candidates in parallel (proxy rate-limit
mid-service), and its servers have no `/__live` door at all. On any deployed
host whose scrape is bot-walled that reads as "not live" straight through a
real service — the Watch screen sits on the waiting clock while the
broadcast is on air. That is the "livestream not working" in v11.

v12 takes your v11 tree as the base and ports the complete v9 livestream
set onto it (nothing else changes behavior). Files from v9:

- `src/lib/livestatus.ts` — published Play stamp fast path (office Play +
  Publish opens deployed visitors at once, verified through the CORS-open
  verifier); hardened `watchPageProvesEnded`/`stampedVideoEnded` (a
  readable-but-partial walled page never kills a live stamp; ends only on a
  full player model with no live marker); authoritative `/__live` Data API
  door (`YT_API_KEY` server-side only, 75s cache) asked same-origin → Netlify
  function → office server, for main AND guest slots; sequential candidate
  reads + 15s bounded resolve; 3 public proxies race; Netlify yt door.
- `src/lib/embed.ts` — `origin` on embeds (enablejsapi cross-origin fix) +
  muted channel autoplay (`youtubeChannelEmbed(id, autoplay, muted)`).
- `src/components/blocks.tsx` — muted channel motion at once under held
  sound + first-gesture sound restore; IFrame API error swap
  (100/101/105/150 → dead fallback, never the black frame); watchdog +
  verifier nets; repair/retry shared path.
- `src/pages/WatchLive.tsx` — SectionBoundary crash isolation, player API
  warm-up, fresh-Reload handling (drops cached dead verdicts first).
- `src/lib/recentstreams.ts` — 3-proxy race + Netlify yt door.
- `src/lib/routes.tsx` — chunk-failure-proof lazy pages (a deploy landing
  mid-visit reloads onto fresh code instead of the crash card).
- `src/components/ErrorBoundary.tsx` + `SectionBoundary` — in-place retry
  that drops stale live caches first; chunk/deterministic crashes go
  straight to reload.
- `src/lib/livefeed.ts`, `src/pages/Home.tsx`, `src/components/layout.tsx`,
  `scripts/security-checks.mjs` — base-path, image-fallback, and
  recent-only alert fixes from the same chain.
- `scripts/serve.mjs`, `scripts/vite-cms-backend.mjs` — `/__live` Data API
  door (same validation/cache/shape; needs `YT_API_KEY` in env).
- `netlify/functions/live.mjs` (NEW), `netlify/functions/yt.mjs` (NEW),
  `netlify.toml` (`[functions]` dir) — static-deploys doors.
- `package.json` — vite 6.4.5.
- `src/lib/hooks.ts` + `index.html` — code word `unified441` → `unified442`
  (unnumbered fix: `BUILD_NOTES` stays 440, same pattern as the `unified438`
  / `unified441` fixes).

## Verify (same as v9)

1. Walled scrape + fresh Play stamp: deployed Watch opens the broadcast and
   stays open; forgotten Stop ends on the next readable poll (12h cap).
2. Guest live + `YT_API_KEY`, no office press: guest auto-opens; ending
   returns to main, recents untouched.
3. `npm run dev` with `YT_API_KEY`: `/__live?channel=UC…` answers from the
   dev backend; without a key, 404 and stamp + scrape decide as before.
4. Netlify static + key: `/.netlify/functions/live?channel=UC…` answers.
5. Fresh profile, channel-follow live: motion starts muted at once; first tap
   restores sound; verified id upgrades behind it.
6. Pure suite (end-proof, shut latch, stop rule, oEmbed map,
   designated/owner gates, report gate) passes — livestatus.ts is
   byte-identical to the v9-verified file.

## Office setup

Same as v9: set `YT_API_KEY` in the Render/office-server env AND in the
Netlify function env (static) AND in the dev shell to exercise the
authoritative door locally. Otherwise: Play + Publish at service start,
Stop + Publish at the end. No keys in frontend code.
