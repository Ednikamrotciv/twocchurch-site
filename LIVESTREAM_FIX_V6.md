# Livestream player — production fix v6 (on top of v5)

Follow-up to LIVESTREAM_FIX_V5.md. Addresses, point by point:

## 1. "Something went wrong on our side" (esp. Page: /admin/watch-live)

Two layers, both fixed:

- **It should never show.** Most of these cards are broken dynamic chunk
  imports (a deploy landing mid-visit, a blip, a pruned bundle: React.lazy
  caches the rejection, so any plain retry crashes straight into the card).
  `src/lib/routes.tsx` now wraps every page in `lazyRetry`: the import is
  retried once behind the scenes; only a truly-gone chunk reaches the
  boundary, and that path reloads onto the fresh deploy.
- **If it ever shows, the first tap fixes it.** `src/components/ErrorBoundary.tsx`
  `retry()` now clears ALL volatile live caches (`wom.livestatus`,
  `wom.recentstreams`, `wom.ytchannel`, `wom.live.targetNote`,
  in-memory verdicts) and goes straight to a full `window.location.reload()`
  for any deterministic render crash (ReferenceError incl.
  "before initialization", TypeError, SyntaxError, chunk errors — re-rendering
  the same tree could only crash again). Anything else still retries in place
  first; the second tap always reloads.

## 2. "This video is unavailable" black frame

- The player stays poster-first (never mounts blind), still lifts only on the
  first real PLAYING frame — YouTube's own error text can no longer be the
  first thing painted.
- **Grey-arrow fallback now fixes itself faster:** live self-heal 30s → 15s
  (visibility-aware, still stops for truly-ended broadcasts), plus a wake-up
  retry (tab visible / online / focus re-runs one bounded repair, max
  1/minute) — the "arrow stuck after sleep" case heals with no tap.
- **Admin Reload still fixes everything:** published `liveReloadAt` drops all
  verdicts, clears the shut latch, re-asks status and remounts fresh (unchanged
  path, now feeding the faster player above).

## 3. Sound is automatic, no tap-for-sound button

The v5 blocking overlay is REMOVED. New behavior:
- Every opening requests full-volume sound (`unMute` + volume 100 + play).
- If the browser holds sound autoplay (Chrome/Safari policy — no site can
  bypass this), the player drops to **muted autoplay the same second**: motion
  and first frame appear immediately, never a held black frame.
- The **first gesture anywhere on the page** (any tap/click/key) restores full
  sound automatically, in-gesture so the browser permits it. YouTube's own
  volume control is always available too.
- No overlay, no extra button, no retry loop, no fake-muted state.

## 4. Faster transmission

- Playable-check timeout 6s → 4s (noembed mirror raced first, unchanged).
- Held-autoplay watch 3.5s → 2.5s; channel-follow re-ask first tick 10s → 5s.
- Status resolve still capped at 15s (unknown, never off/guess).
- Watch page warms the YouTube IFrame API on open (idle), alongside the
  existing full preconnect set — a verified live id creates its player with
  no script wait. Render cold-start still never blocks first paint (the still
  is instant; status upgrades behind it). Keep the /version.json keep-awake
  ping from v5.

## Files changed (v6)

- `src/components/blocks.tsx` — muted-fallback + first-gesture upgrade,
  removed tap overlay, 15s self-heal, wake-up retry, exported
  `loadYtPlayerApi`, 5s follow re-ask.
- `src/pages/WatchLive.tsx` — warm the player API on open.
- `src/components/ErrorBoundary.tsx` — deterministic-first-tap reload,
  fuller volatile-cache clear.
- `src/lib/routes.tsx` — `lazyRetry` for all page chunks.
- `src/lib/livestatus.ts` — 4s verify timeout.
- `src/styles/pages.css` — unchanged v5 overlay classes kept (harmless,
  reusable); no new styles needed since the overlay was removed.

CMS/admin, accounts, publishing, design, and all other features untouched.
No new dependencies. No keys in frontend code.

## Verify on production (not localhost)

1. Cold load Watch: still instantly (<1s), LIVE badge, motion fast.
2. Fresh profile (sound held): video moves muted within ~3s, first tap
   anywhere → sound on. No button, no black hold.
3. Grey arrow (kill the live / bad id): 15s self-heal reopens a live
   broadcast by itself; admin Reload reopens it at once.
4. Sleep tab 5 min on arrow → wake → repairs itself (≤1/min).
5. /admin/watch-live + all routes: throttle + mid-visit redeploy → no crash
   card; if forced, Reload-first-tap recovers.
6. Mobile 390×1080 ... 390×844 and desktop 1920×1080, throttled 4G.
