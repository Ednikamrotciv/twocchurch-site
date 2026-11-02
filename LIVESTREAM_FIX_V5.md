# Livestream player — production fix (v5)

## What was wrong (root causes, verified in code)

1. **Blind frame mount → "This live is unavailable".**
   `VideoPlayer` mounted the YouTube iframe/API player the moment the status
   read `live` (`playing=true` initial state for live, channel embed mounted
   before verification). A channel embed (`live_stream?channel=…`) while the
   channel is actually offline, or a stale/dead video id, makes *YouTube
   itself* render "This live is unavailable" inside the frame. The old
   watchdogs took 7–12s to swap it out — that is the persistent error.
2. **Sound autoplay was requested but never handled.**
   `autoplay=1` with sound was sent, but browsers (Chrome/Safari desktop and
   mobile) hold sound autoplay until the visitor interacts. There was no
   `onAutoplayBlocked` handler, no PLAYING detection, and no tap-to-unmute
   control — playback just sat paused with no clear CTA.
3. **Poster removed too early.** The still was removed the moment
   `playing=true`, before the first real video frame — black/blank flash.
   `iframeKey` bumps destroyed and recreated the iframe on every source
   change/repair (reload churn, layout shift).
4. **Unbounded status wait.** `resolveYoutube` does up to 3 sequential
   watch-page reads (3 × 8s) plus a Render cold-start `/__yt` wait. The
   player waited on it instead of painting instantly.
5. **Incomplete preconnects.** `googlevideo.com`, `ytimg.com`,
   `youtube.com`, `youtube-nocookie.com` were missing.

## What changed (6 files, same props API, same design/CSS classes)

- `src/components/blocks.tsx` — `VideoPlayer` is now **poster-first**:
  never mounts a frame blind; channel follows verify before mount; the still
  stays over the frame until the first real PLAYING frame; sound requested at
  full volume on ready; if the browser holds sound autoplay, a single
  **"Tap to watch live with sound"** overlay appears (in-gesture restart, one
  automatic attempt only, no retry loop); single YT.Player instance per video;
  `onAutoplayBlocked` + 3.5s PLAYING watch; error codes 100/101/105/150/5/2
  → dead fallback; bounded visibility-aware re-asks (10/20/40/60s).
- `src/lib/embed.ts` — added `YOUTUBE_PRECONNECTS` + muted-preview helpers
  (live path stays sound-first; muted path is preview-only, never presented
  as sound-on).
- `src/pages/WatchLive.tsx` — full preconnect set on page open.
- `index.html` — full preconnect/dns-prefetch set in `<head>`.
- `src/lib/livestatus.ts` — `resolveYoutubeBounded` (15s cap; timeout reads
  `unknown`, never `off`, never a guess), used for main + guest resolves.
- `src/styles/pages.css` — `.player__cover`, `.player__spin`,
  `.player__tap*` overlay styles (responsive, reduced-motion aware).

CMS/admin, accounts, publishing, design, and all other features are
untouched. No new dependencies. No API keys in frontend code.

## How to apply

1. Back up (Tools → backup), extract this zip over BOTH copies (office
   computer + always-on host), including `index.html`.
2. `npm run dev:fresh` + restart the office backend, hard refresh.
3. Publish ONCE from a signed-in admin copy; reload admin tabs.
4. Keep-alive: ping `/version.json` every ~5 min (UptimeRobot) so Render
   cold-start never fronts a Sunday service.

## Test matrix (do all 8 before calling it done)

1. **Active public embeddable live** (e.g. a 24/7 stream that allows
   embedding while testing): open Watch — still paints instantly, LIVE badge,
   playback starts with sound where the browser permits.
2. **Blocked autoplay**: fresh profile, no prior interaction — the
   "Tap to watch live with sound" control appears within ~4s; one tap starts
   sound. No muted-silent playback, no loop.
3. **Scheduled (upcoming) stream**: waiting clock + still, no player, no
   "unavailable" anywhere.
4. **Offline/ended**: ended screen + latest recording in Recent services;
   starting a broadcast re-opens the player by itself.
5. **Invalid video id** (paste a bogus id in console): grey-arrow fallback,
   never the black YouTube error frame.
6. **Embedding-disabled video**: same fallback + "Watch on YouTube" way out.
7. **Mobile + desktop viewports** (390×844 and 1920×1080): 16:9 box stable,
   no layout shift, tap target ≥ 44px.
8. **Production URL** (not just localhost): cold load, throttled 4G, and
   Render-after-idle — first paint is the still in <1s; status upgrades
   behind it. Confirm in DevTools that no request blocks the still.

Console during all of the above: `church player:` warnings only for real
failures (video id + reason, no tokens/URLs). A merely-starting or
reconnecting stream never logs an error and never shows one.
