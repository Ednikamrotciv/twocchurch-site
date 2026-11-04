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

## No API key needed (v9 — keyless auto-open, supersedes the key setup below)

No YouTube API key is needed for the livestream to work perfectly — not for
Play + Publish, not for press-free auto-open, not for endings. The keyless
/__live2 door (YouTube's own channel-/live redirect + page read, same TTLs
and shape as the old Data door) is now primary on every backend:

- scripts/serve.mjs + scripts/vite-cms-backend.mjs answer GET
  /__live2?channel=UC… (75s LIVE / 20s OFF cache, coalesced misses, CORS *).
- netlify/functions/live2.mjs answers the same for static hosts; the old
  netlify/functions/live.mjs answers keyless too when no key is set (Data API
  stays as a bonus while a key exists — never required).
- src/lib/livestatus.ts races keyless + Data doors: either live wins at
  once, either off ends a stale pin and turns an unreadable scrape into off.
- The admin transport row always shows "Auto-open is on — …no key and no
  press needed" once the backend answers; /__live-status answers
  {ok, keyless, autoOpen} (hasKey kept for back-compat only).
- render.yaml no longer prompts for YT_API_KEY. npm run set-key still exists
  as a harmless optional bonus, but nothing reads its result as required.

New/changed files (v9): scripts/live-keyless.mjs (new),
netlify/functions/live2.mjs (new), scripts/serve.mjs (/__live2, status, boot
log, OPTIONS), scripts/vite-cms-backend.mjs (dev-parity /__live2, status),
netlify/functions/live.mjs (keyless fallback), src/lib/livestatus.ts
(keyless race, always-on status), src/components/editor.tsx (keyless note),
render.yaml (prompt removed).

## Key setup is now automatic (v8.1 — optional since v9)

The old finish step — hand-setting `YT_API_KEY` in two dashboards — is gone
as a manual chore:

- **Office computer: one command.** `npm run set-key -- <key>` validates the
  key against YouTube (1 quota unit, fails loudly on a bad key) and writes
  `.env`, which both backends (`npm start`, `npm run dev`) pick up on their
  next boot — no file editing, no restarts to configure. `npm run key-status`
  shows on/off without ever printing the key. `.env` is git-ignored; real
  environment always wins over the file, so dashboards keep working.
- **Render: prompted at deploy.** `render.yaml` declares `YT_API_KEY` with
  `sync: false`, so Render asks for the value at deploy time instead of
  needing a separate dashboard trip. The backend logs `live auto-detect:
  ON/OFF` at boot (presence only, never the value).
- **Admin console: shows it.** The transport row now carries an auto-open
  line — green dot + "Auto-open is on" when the backend has the key, amber
  note + the exact one-command fix when it does not. The office never has to
  read docs to know which it is.
- **No key still works.** Play + Publish opens the stream with zero setup —
  the key only adds press-free auto-open. The status line says exactly that.

New/changed files: `scripts/dotenv.mjs`, `scripts/set-key.mjs`,
`scripts/serve.mjs` (`/__live-status`, dotenv load, boot log),
`scripts/vite-cms-backend.mjs` (dotenv load, dev-parity `/__live` +
`/__live-status`), `netlify/functions/live.mjs` (`?status=1` probe),
`src/lib/livestatus.ts` (`useLiveKeyStatus`), `src/components/editor.tsx`
(status line), `package.json` (`set-key`, `key-status`), `.gitignore`
(`.env`), `render.yaml` (`sync: false` prompt).

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
3. Start a live with NO office press and NO key anywhere → auto-opens
   (~20s max after start, was 75s+). Repeat with a key set too (bonus door
   must agree, never fight).
4. Kill the key / unplug office press on a walled network → waiting clock
   (correct: nothing verified live), never a false "ended".
5. Guest channel live → main screen plays guest; guest ends → screen closes
   onto the MAIN still within seconds, recents untouched.
6. Cold load + throttled 4G: still < 1s, LIVE badge, motion fast, sound on
   first gesture where the browser holds autoplay.
