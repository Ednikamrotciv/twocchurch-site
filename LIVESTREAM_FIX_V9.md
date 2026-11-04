# Livestream — fix v9 (on top of v8)

Follow-up to LIVESTREAM_FIX_V7.md / V6 / V5. Six bugs, all in the live path.
CMS/admin, accounts, publishing, design untouched. No new dependencies.
No keys in frontend code.

## 1. End-check killed live stamps on walled reads (critical)

`stampedVideoEnded()` (v8) treated "readable page with no live marker" as
proof the broadcast ended. But a bot-walled watch page is exactly that:
readable (`ytInitialData` present) with the player markers stripped (note
322) — and `fetchPage` already filters login walls, so this page reaches the
check. On a deployed host with a walled scrape, the v8 end-check killed a
healthy office stamp mid-service and the screen fell to the scrape (OFF or
unknown) — the clock/ended screen through a live service.

Fix: new pure `watchPageProvesEnded(html, videoId)` — the stamp falls
through ONLY when the full player model for that video loaded
(`"videoDetails":{..."videoId":"<stamp>"}` present) AND no live marker.
Partial/walled reads prove nothing: the stamp stands, the verifier + player
stay the net. A forgotten Stop still ends on the next readable poll, and the
12h stamp expiry still caps it.

## 2. Guest slot never used the Data API

`fetchLiveApiFor()` was only raced for the main target. A guest live with a
walled scrape and no office press depended on the scrape alone — and the
office's Play refine (which races this same `checkLiveStream`) could never
stamp the guest video either. Fix: `apiGuestP` races alongside the guest
stamp/scrape; a live API answer wins like a stamp. An API "off" with an
unreadable scrape stays `unknown` for the guest (unlike the main slot): the
guest's off must never move the main screen.

## 3. `npm run dev` had no `/__live` door

`scripts/vite-cms-backend.mjs` proxied `/__yt` but answered nothing on
`/__live`, so every dev check silently exercised scrape-only and the Data
API door went unverified until deploy. Fix: ported the `/__live` handler
(same channel format, same `YT_API_KEY` env, same 75s cache, same shapes).
Set `YT_API_KEY` in the dev shell to verify locally.

## 4. Channel-follow autoplay sat paused under held sound

A live with no verified video id plays through the plain iframe
(`youtubeChannelEmbed`), which — unlike the API path — cannot drop to muted
autoplay by itself. On a fresh profile (sound held), the channel frame sat
paused instead of moving. Fix: `youtubeChannelEmbed(id, autoplay, muted)` —
live channel autoplay opens muted for motion the same second, and the first
gesture anywhere swaps the sound back on in-gesture (the navigation happens
inside the visitor's tap, so the browser permits audio). The resolver still
upgrades to the verified video id (full sound path) behind it. Bare videos
unchanged (API path already handled this in v6). Repair/retry/source-change
reset to muted.

## 5. Netlify static deploys had no live-data door

Same-origin `/__live` on Netlify static answers the SPA fallback (200
index.html, read as null) — the only Data API path was the joined office
server. Fix: new `netlify/functions/live.mjs` (same validation, same cache
shape, `YT_API_KEY` from function env), asked between same-origin and the
office server in `fetchLiveApiFor`. Netlify setup: Site settings →
Environment variables → `YT_API_KEY` → redeploy.

## 6. Code word rotated: `unified440` → `unified441`

Behavior update, so the word retires stale bundles per the project's own
rule (unnumbered fix — `BUILD_NOTES` stays 440, same pattern as the
`unified438` fix). `src/lib/hooks.ts` + `index.html` meta stamp together.

## Files changed (v9)

- `src/lib/livestatus.ts` — `watchPageProvesEnded` + hardened
  `stampedVideoEnded`, `readLiveApiPayload` + `fetchLiveApiNetlify`, Netlify
  door in `fetchLiveApiFor`, guest `apiGuestP`/`apiGuestAns` in
  `checkLiveStream`.
- `src/lib/embed.ts` — muted param on `youtubeChannelEmbed`.
- `src/components/blocks.tsx` — `plainMuted` state, muted channel address,
  first-gesture sound restore, repair/source resets.
- `scripts/vite-cms-backend.mjs` — `/__live` dev door + cache.
- `netlify/functions/live.mjs` — NEW live-data function for static deploys.
- `src/lib/hooks.ts` + `index.html` — code word `unified441`.

## Verify

1. Walled scrape + fresh Play stamp: deployed Watch opens the broadcast
   (no clock), and stays open — the end-check no longer kills it.
2. Forgotten Stop (stamp, ended broadcast, readable network): screen ends
   on the next poll via the proven-ended path; with a wall it caps at 12h.
3. Guest live + `YT_API_KEY`, no office press: guest auto-opens through the
   new guest API door; ending returns to the main still, recents untouched.
4. `npm run dev` with `YT_API_KEY` set: `/__live?channel=UC…` answers from
   the dev backend (200 live/off), without it 404.
5. Netlify static + key: `/.netlify/functions/live?channel=UC…` answers;
   without a key the stamp + scrape decide as before.
6. Fresh profile, channel-follow live (no verified id yet): motion starts
   muted at once; first tap anywhere restores sound; verified id upgrades
   behind it to the full sound path.
7. Pure suite (27 checks: end-proof, shut latch, stop rule, oEmbed map,
   designated/owner gates, report gate) passes — run before repack.
8. Cold load, throttled 4G, Render-after-idle: still paints <1s, status
   upgrades behind it; no new console errors (`church player:` warnings
   only for real failures).

## Office setup

Same as v7 plus: if the site is on Netlify static, set `YT_API_KEY` in the
Netlify function env too (Render env alone only feeds the office server).
Devs: export `YT_API_KEY` in the shell before `npm run dev` to exercise
the authoritative door locally. Otherwise: Play + Publish at service start,
Stop + Publish at the end, as before.
