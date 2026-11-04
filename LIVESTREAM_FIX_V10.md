# Livestream — fix v10 (on top of v7/v6/v5)

Fixes every remaining livestream bug found in `church-site-livestream-fixed-v9_2_`:

## 1. Live broadcasts no longer verify as "dead"
YouTube oEmbed answers 401/403 for LIVE broadcasts (and for
private/embedding-disabled/age-gated videos). `oembedPlayable` mapped
401/403 → false, and `noembedVerdict` mapped mirror `error` → false — so a
real live was judged dead. The Play-stamp path then fell through to the
walled scrape, and Watch treated the live id as dead → ticking clock /
fallback through a real service.
- `oembedPlayable`: 401/403 → unknown (`null`); only 400/404/410 are dead.
- `noembedVerdict`: `error` → unknown; dead needs the direct oEmbed read to
  agree (400/404/410). The player in-frame error + watchdog remain the net,
  with the poster up until the first PLAYING frame, so nothing flashes black.

## 2. Login/consent walls no longer end services
`parseLivePage` treated any page with `ytInitialData` as readable, and the
door validators accepted it. A datacenter login wall (has the model, names
no broadcast) then read `off` → ended screen / autostop mid-service, and a
walled door could beat the door carrying the real page.
- New `isLoginWall()` (consent.youtube.com, ServiceLogin, signin/loginwall/
  consent bump, tiny bodies).
- `parseLivePage`: wall → unreadable (`unknown`, never `off`); readable needs
  model + video/channel scaffolding (videoDetails/browseId/channelId/
  liveBadge/playabilityStatus/watching-now/grid).
- `isYoutubeHtml` (livestatus) and `isExpectedBody` (recentstreams): same
  wall rejection + scaffold requirement.

## 3. Play override no longer mounts "unavailable" for a proven-off channel
`overrideMain`/`overrideGuest` fired on `unknown OR off`. Play + proven-off
mounted `live_stream?channel=` blind → YouTube's own "unavailable" frame.
Now `unknown` only; verified off waits on the clock.

## 4. Static hosts get the authoritative door
`fetchLiveApiFor` only tried same-origin `/__live` + office server. Netlify/
static deploys have no `/__live`, so without an office join the Data API
never answered. New `netlify/functions/live.mjs` (same validation, split
TTL live 75s / off 15min, quota backoff, capped cache, `YT_API_KEY` in
function env only) + frontend race: same-origin, Netlify function, office
server — first usable wins. Same-origin `/__live` now checks content-type
JSON so the SPA fallback can never parse as a live answer.

## 5. Faster failure path
`fetchPageSameOrigin` / `fetchTextSameOrigin` tried `/__yt` then Netlify
sequentially (2×8s worst per page, ×3 candidates + feed). Both doors now
race in parallel, first valid wins.

## 6. `parseYoutubeId` hardening
Trailing `(?![\w-])` boundary on every pattern (a 12+ char token no longer
donates its first 11 chars into an "unavailable" embed) + `youtube.com/v/`
and attribution-redirect (`u=/watch?v=`) forms.

## 7. Player API retry + cache caps
`loadYtPlayerApi` cleared its cached promise on a 10s miss so back-online
retries instead of replaying the miss forever. `liveApiCache` capped at 50
entries in both servers.

## Version
`BUILD_NOTES` 440→441, `CODE_ID` unified440→unified441,
`index.html` metas to match. Rebuild (`npm run build`), restart the office
backend, hard refresh, Publish once, reload admin tabs. Static deploys: set
`YT_API_KEY` in both the server host AND Netlify function env (same key).

## Verify (production, not localhost)
1. Live + Play + Publish → deployed Watch opens broadcast in seconds, with sound.
2. Stall the scrape (or kill the key) → still opens via stamp; no clock mid-service.
3. Stop + Publish → ended screen + latest recording; no ghost reopen.
4. Proven-off + Play pressed → clock, never the black "unavailable" frame.
5. Fresh profile, sound held → motion fast, first tap restores sound, no overlay.
6. Grey arrow (kill live / bogus id) → 15s self-heal reopens a live broadcast.
7. Mobile 390×844 + desktop 1920×1080, throttled 4G, Render-after-idle.
