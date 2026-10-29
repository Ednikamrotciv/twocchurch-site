# Livestream "This video is unavailable" — fix notes

## What you saw
The Watch Live player showed YouTube's black **"This video is unavailable"** frame
(screenshot `45.jpg`). I reproduced the cause: right now the channel `@twocorg`
(`UCQ0KIUXUV7gTZmDDlvd3ZcQ`) is **offline**, and YouTube's
`https://www.youtube.com/embed/live_stream?channel=UC…` endpoint answers an
"unavailable" page whenever the channel has no live broadcast. Any code path
that mounts that channel embed while the channel is offline paints exactly your
screenshot.

## Root causes found (all in the Watch Live screen)
1. **Blind autoplay mount.** `VideoPlayer` mounted a bare channel follow
   (`youtubeId: ""` + `youtubeChannelId`) immediately on render — including from
   a stale cached live-status and from the guest-slot override — before any
   fresh on-air check confirmed the channel was actually live.
2. **Grace replay of a channel embed.** After a channel-only (walled) broadcast
   ended, the 25s "flap guard" replayed the now-dead channel embed, showing the
   error frame for the whole window instead of the ended screen.
3. **No ongoing verification for channel embeds.** Once mounted, a bare channel
   embed was never re-checked, so a stale/false live could sit on the error
   frame indefinitely (verified video ids already had a 60s re-check).

## What this fix changes
- `src/components/blocks.tsx` (`VideoPlayer`):
  - A bare channel follow never autoplays blind. It shows the waiting poster
    ("Connecting…") and mounts only after a fresh check confirms the channel
    is live — a verified broadcast id plays by id (full error reporting), a
    confirmed-but-unverifiable (walled) broadcast follows the channel as before.
  - Bare channel embeds are re-checked every 30s while playing: a proven-off
    channel falls to the retry fallback, a newly named broadcast upgrades to
    its verified id. Unproven reads keep playing so a thin network never ends
    a walled service.
- `src/pages/WatchLive.tsx`:
  - The end-of-stream grace replay only replays a verified broadcast (video id
    or Facebook). After a channel-only live ends, the screen closes straight
    onto the ended still.

Behavior while the channel is offline is now: ended/waiting screens and posters,
never the black error frame. Tapping a card still verifies first; unknown reads
still play (by design), with the retry arrow as the net.

## Redeploy (2 min, per DEPLOY.md)
```sh
npm install   # once
npm run build # → dist/
```
Upload the *contents* of `dist/` to your static host (Netlify / Cloudflare /
cPanel / S3). No settings needed. If your host builds from git, push this zip's
contents and use build `npm run build`, publish dir `dist`, Node 24.

## Admin-console checklist (do this on the live site after redeploy)
1. **Live stream → guest slot:** if the one-off guest event is over, press
   **Stop** on the guest row and Publish. A guest channel left "on" is the most
   likely source of the screenshot (it auto-opened an offline channel).
2. **Live stream → main switch:** should read off outside service times. If it
   was left on, press **Stop** and Publish.
3. Open `/watch-live` in a private window while offline: you should see the
   ended screen + countdown, never the black frame. Tap a recent service card:
   it plays or shows the retry fallback, never the black frame.

## Files changed vs the attached zip
- `src/components/blocks.tsx` (2 spots, each marked with a comment)
- `src/pages/WatchLive.tsx` (grace replay, marked with a comment)
- Everything else byte-identical; this note added at the zip root.
