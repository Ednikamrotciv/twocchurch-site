# Merged livestream — standalone replaces the old check

Removed the first build's livestream code and replaced it with the second
attached file's (`watch-live-standalone` / `watch-live.html`).

## What was removed

- `src/lib/livestatus.ts` (old, ~69k): office-report polling, office-server
  proxy (`remoteserver.ts` door), guest-slot state (`guestIsLive`,
  `externalYoutubeChannel` answers), designated-channel follow, channel-watch
  fallbacks, autostop seeding, report sinks. Rewritten (same exports, ~400
  lines) on top of the standalone engine.
- `src/pages/WatchLive.tsx` screen state (old, ~41k): shut latch
  (`nextScreenShut`), guest/main override channels, designated gates,
  flap guards, office-stop holds, multi-platform picking for the live screen.
  Rewritten: page chrome + lists kept, the screen is now
  `<StandaloneLivePlayer>`.
- Old `VideoPlayer` autoplay/verify maze in `src/components/blocks.tsx` is
  bypassed for the live screen (the component itself is kept for replays, and
  it now verifies through the new `verifyYoutubeId`).

Kept as-is (still compile against the new shim): `src/lib/embed.ts`,
`src/lib/livefeed.ts`, `src/lib/recentstreams.ts`, `src/lib/autostop.ts`
(now inert), `src/components/liveclock.tsx`, admin transport buttons,
`scripts/live-follow.mjs`, `netlify/functions/yt.mjs` (unused by the player).

## What was added (from the second file)

- `src/lib/standaloneLive.ts` — pure port of the standalone script:
  `verifyYoutubeId` (noembed → oEmbed, 5-min cache / 60-s dead / 6-s timeout,
  inflight dedupe), `oembedPlayable`, `peekVerified` / `forgetVerified` /
  `forgetAllVerified`, `readLivePage`, `livePageUrl`, `checkChannelLive`
  (direct + allorigins + codetabs), `loadYtApi`.
- `src/components/standaloneLive.tsx` — React port of the standalone player:
  verifies first (never mounts blind), autoplays muted (browser policy),
  cover lifts only on PLAYING, dead ids → thumbnail + repair, walled networks
  → "network blocked" instead of spinning, 60-s mid-play re-verify,
  30-s self-heal, first-tap/click unmutes, Verify + play box, Check-if-live,
  Force repair, watch link, event log.
- `src/lib/livestatus.ts` — compatibility shim with identical exports;
  `checkLiveStream` = explicit `LIVE.youtubeId` verifies first, else
  `checkChannelLive(LIVE.youtubeChannel)`; `guestTarget()` = null (guest slot
  removed); `verifyYoutubeId`/`peekVerified` delegate to the standalone cache.

## CONFIG (shipped, not testing)

The standalone file shipped with TEST values (`@WorshipcultureTv-difference`
/ `FwlwESUwecA`). The merged site ships the church originals:

- channel: `@twocorg` (`src/data/live.ts` → `LIVE.youtubeChannel`)
- youtubeId: `""` (channel waiting mode; paste a live id to go live)
- fallback thumb: newest recent thumbnail → baked previous → sermon still → hero

To go live: set the live video's id/link in `LIVE.youtubeId` (admin console →
Live stream) or paste it in the player's Verify box. The `/live` scrape is a
hint only — the explicit id is the reliable switch.

## Behavior notes

- No office server needed for the check; no proxy to run.
- Facebook embeds unchanged (replay cards); the live screen is YouTube-first.
- Recent services / Previous sermons / Ways-to-watch unchanged.
