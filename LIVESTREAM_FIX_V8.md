# Livestream — fix v8: every error and bug (on top of v7)

Found by auditing the full on-air path (WatchLive — livestatus — VideoPlayer —
Recent services — serve.mjs — Netlify function — Admin Play/Stop). Each item
was a measured or code-proven failure, not a guess.

## Bugs fixed

1. **Walled channel page misread as OFF (service ended mid-service).**
   `resolveYoutube` returned `off` for a readable channel page with no live
   marker even when zero candidates were readable (empty Live tab, every watch
   read 502/unreachable). A bot-walled mid-service page looks exactly like
   that. Now: no readable candidate = `unknown`, never `off`. Only a
   verified-readable non-live candidate counts toward off.
   (`src/lib/livestatus.ts`)

2. **Play override for the channel never actually played (walled).**
   The override opened a channel-follow player that re-ran the same walled
   scrape (`checkChannelThenPlay`) and parked on its poster. Autoplay for a
   live channel follow now mounts at once — the visitor's browser reaches
   YouTube directly (never datacenter-walled); the error nets + 20s re-ask
   still catch a truly-off channel. Office-commanded overrides pass `trusted`
   (no re-verify, longer 15s watchdog).
   (`src/components/blocks.tsx`, `src/pages/WatchLive.tsx`)

3. **Play override only worked for @twocorg.** `overrideId` and the idless
   follow came from `designatedChannelIdForTarget` alone (map has one
   handle). Non-designated handles/UC pastes fell through to the waiting
   clock. Now: designated → UC-in-URL → resolved published id, guest slots
   never inherit the main id.
   (`src/pages/WatchLive.tsx`, `src/lib/livestatus.ts`)

4. **Stamp pinned ended broadcasts; API answer ignored while stamped.**
   A fresh stamp beat the authoritative Data API answer, and the scrape only
   started after the stamp resolved. Now: API and stamp race together, an API
   OFF kills the stamp, an API LIVE wins with no scrape wait, and the channel
   scrape only fires on a full miss (saves ~6 proxy reads per poll while live).
   (`src/lib/livestatus.ts`)

5. **Unknown-stretch retired a stamped live after 3 minutes.** The
   UNKNOWN_CAP retire fired even with a fresh Play stamp (the stamp IS the
   confirmation when the scrape is walled). Retire is now skipped while
   Play + fresh verified id are published.
   (`src/lib/livestatus.ts`)

6. **Authoritative door missing / broken on static + split deploys.**
   - New `netlify/functions/live.mjs`: Data API door for Netlify/Vercel
     static hosts (YT_API_KEY in function env, never the browser).
   - Visitor tries same-origin `/\__live`, then `/.netlify/functions/live`,
     then the joined office server.
   - `/\__live` OFF cache 20s (was 75s — every live start was delayed up
     to 75s for the whole congregation), LIVE cache 75s, concurrent misses
     coalesced (a cold-start herd no longer burns a day's quota in a minute).
   - `/\__yt` + `/\__live` now answer CORS (`*` + OPTIONS) so joined
     office doors work cross-origin; `/\__yt` gained a 12s shared cache +
     coalesced misses (one upstream read per congregation poll).
   (`scripts/serve.mjs`, `netlify/functions/live.mjs`)

7. **Ended grace replayed a dead frame after office Stop.** The 25s flap guard
   (`offFresh`) kept the player mounted after a proven Stop. The ended
   branch now excludes `officeStopped` — Stop closes onto the ended screen
   at once; the guard still covers walled flaps.
   (`src/pages/WatchLive.tsx`)

8. **Guest ending detected up to 90s late.** `useAutoStopLive` polled the
   quiet-week cadence. Now the Watch-page cadence.
   (`src/lib/autostop.ts`)

9. **Small robustness:** `/v/` YouTube URLs recognized; preconnects added
   for the public proxy doors.
   (`src/lib/embed.ts`, `index.html`)

## What was deliberately NOT changed

- Maintenance hold still gates fresh deploys until Publish (by design — stale
  code must not serve a live). Publish once after deploying.
- No new dependencies, no keys in frontend code, no design/CMS changes.
- Facebook-only services still need a tap when unwalled detection misses
  (Facebook pages are unreadable off-network by design).

## Verify (production, not localhost)

1. Play + Publish mid-service → deployed Watch opens the broadcast in
   seconds (channel Play with no video id, and bare video-id Play, both).
2. Stop + Publish → ended screen + latest recording at once (no 25s dead frame).
3. Start a live with NO office press (YT_API_KEY set) → auto-opens (~20s max
   after start, was 75s+).
4. Kill the key / unplug office press on a walled network → waiting clock
   (correct: nothing verified live), never a false "ended".
5. Guest channel live → main screen plays guest; guest ends → screen closes
   onto the MAIN still within seconds, recents untouched.
6. Cold load + throttled 4G: still < 1s, LIVE badge, motion fast, sound on
   first gesture where the browser holds autoplay.
