# Livestream — instant-open fix (v10, on top of v7/v8/v9)

## What was still wrong (measured in code, not guessed)

1. **Play+Publish stamped NOTHING when detection hadn't confirmed.**
   `LiveTransportButtons.play()` only stamped `liveVideoId` when
   `readLiveStatus()` already said live *with* a video id. Pressing Play
   ahead of YouTube (or behind the bot wall, where the read says `unknown`)
   wrote `isLive:true` with an empty `liveVideoId` — so every visitor fell
   back to the slow bot-walled scrape: the ticking clock that took too long
   and still never opened.
2. **The stamp path blocked the live start on two probes.** `publishedStamp()`
   awaited an oEmbed `verifyYoutubeId` (up to 4s) and `checkLiveStream()`
   awaited a 1.5s end-check grace before playing the stamp. Play→Publish
   sat on the clock for seconds even though the office had already named
   the broadcast.
3. **Walled channel pages read as OFF instead of UNKNOWN.** A login-walled
   channel page (zero candidate videos, no live marker) fell through
   `resolveYoutube()` to `off` — parking Watch on the ended screen and
   killing the Play channel-override in `WatchLive.tsx`, which only opens
   while the read says `unknown`. Thin reads must wait, never end.
4. **Two timeouts regressed from v6.** `CHECK_TIMEOUT_MS` was 8s (v6 set 4s
   with the comment "3.5s is plenty"), the `/__live` door was 8s, and the
   urgent Watch poll waited 8s between re-asks — each holding a fresh start
   off the screen for a full extra beat.

## What changed (3 files, same props/API/CSS, no new dependencies)

- `src/lib/livestatus.ts`
  - `CHECK_TIMEOUT_MS` 8s → 4s (comment restored to match), urgent poll
    8s → 4s, `/__live` door 8s → 5s.
  - `publishedStamp()` returns a fresh stamp (<12h, office on-air) AT ONCE
    with no blocking verify — the stamp IS the office's intent and the
    player verifies behind the frame (dead ids render the poster fallback,
    never the black frame, per note 333). Proven-ended stamps still fall
    through via the end-check; slow/unreadable end-checks leave the stamp
    standing and the next poll (≤20s) corrects a truly-ended pin.
  - End-check grace 1.5s → 0.8s.
  - `resolveYoutube()`: zero candidates → `unknown` (thin read); all
    candidate watch-pages unreadable → `unknown`, never `off`. Only a
    readable page that accounts for every named video settles to `off`.
- `src/components/editor.tsx`
  - `play()` falls back to the office's own stream-link id when no
    confirmed broadcast is in hand, so Play+Publish ALWAYS carries a
    playable video. The background refine still replaces it with the
    detected broadcast id when the read lands.
- `src/lib/hooks.ts` + `index.html`
  - Update 440 → 441, code word `unified440` → `unified441` (metas to
    match) so the maintenance hold arrives fresh on every copy: new deploys
    hold visitors on the notice until the office's Publish, one Publish
    clears every browser/device, fresh deploys wipe old wakes + open
    unsaved-clean/new/empty, live-relay stays intact, staging is clean
    (welcome-home slide only) until Recover + Publish.

## Office routine (unchanged, now fast)

1. Start the stream on YouTube, press **Play** in the console, then
   **Publish**. Visitors open the broadcast within ~1–2s — no scrape wait.
2. Press **Stop + Publish** at the end as usual (clears the stamp).
3. Optional auto-detect without any press: set `YT_API_KEY` (YouTube Data
   API v3) in the Render dashboard → Environment → Save (see v7 notes).

## Verify on production (not localhost)

1. Play + Publish mid-service → deployed Watch plays in ~1–2s with sound.
2. Stop + Publish → ended screen + latest recording within one poll.
3. Walled read + Play with no stream link → channel opens at once (one tap
   path untouched: verified ids autoplay, unverified follows stay one tap).
4. New deploy → maintenance notice on fresh visitors until Publish; one
   Publish lifts every browser/device; unsaved list opens empty; old
   service-worker/cache wakes gone.
