# Livestream — the clock is never a dead end (v11, on top of v10)

## The report

Watch shows the ticking clock ("The service is on / We will be live here
shortly") through the service, never the broadcast.

## Two measured traps behind that clock

1. **A published Play could never reopen the screen.** An earlier ended
   broadcast latches the shut latch (`nextScreenShut`) for its target — and
   the latch only ever lifted on a *different* target. A Play pressed for the
   SAME channel afterwards re-armed nothing: `shutNow` stayed latched, which
   blocks `streaming`, both channel overrides and the live badge at once. The
   visitor sat on the clock through a published Play with no error anywhere.
2. **Detection can miss a real broadcast with nothing left to tap.** Bot wall
   (no `isLiveNow`), no `YT_API_KEY`, office never pressed Play — every
   autoplay path needs a confirmed `live`, so the screen waited. A bare clock
   is a dead end: the visitor's own browser could play the channel fine (real
   residential IP, YouTube's own player — no scrape, no wall), but nothing
   offered it.

## What changed (4 files, same props/CSS classes otherwise, no new deps)

- `src/lib/livestatus.ts` — new `officePressFresh()`: a Play published
  within the stamp's 12h window is a new live edge for the SAME address. A
  forgotten Stop (>12h) never re-arms anything.
- `src/pages/WatchLive.tsx`
  - A fresh office Play lifts `shutNow`, so the Play channel-override fires
    and the screen re-arms on the published press.
  - The waiting screen is never bare: a crimson **Watch live now** button
    opens the channel's live embed in-gesture (sound allowed), plus a ghost
    **Watch on YouTube** way out to the channel's `/live` page. Guest slot
    taps its own channel while IT is the pressed address. The tap frame
    yields the moment the check settles (live → autoplay player, ended →
    ended screen) and never shows while the office has stopped the stream.
- `src/components/liveclock.tsx` — `LiveWaiting` takes an optional `action`
  node under the words.
- `src/styles/pages.css` — `.live-wait__action` spacing (ghost-on-dark
  readability already existed).
- Update 441 → 442, code word `unified441` → `unified442` (metas to match),
  so the maintenance hold + fresh-deploy contract re-arrive as new code on
  every copy: notice until Publish, one Publish clears all, wakes wiped,
  unsaved clean, relay intact, staging clean.

## Office routine (unchanged)

Play → Publish opens visitors in ~1–2s (autoplay paths) or one tap (the new
buttons) — even with no API key and even after an earlier ended broadcast.
Stop + Publish ends as before. Optional no-press auto-detect still needs
`YT_API_KEY` on the backend.

## Verify on production

1. During service with nothing pressed: clock + both buttons; **Watch live
   now** plays the live broadcast with sound in one tap.
2. Play + Publish after an earlier ended service: screen opens (no stuck
   clock), visitors follow within seconds.
3. Truly offline channel: tap shows YouTube's own offline card (honest), and
   the check's ended screen still takes over with its recording list.
4. Stop + Publish mid-service-time: no tap buttons, no autoplay (Stop
   respected); next Play re-arms.
5. New deploy: maintenance notice until Publish; one Publish clears every
   browser/device; unsaved opens empty.
