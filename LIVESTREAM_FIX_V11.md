# LIVESTREAM FIX V11 — the black "YOUTUBE + LIVE" box

Symptom (screenshot 15.jpg): the Watch screen shows a 16:9 black box with the
`YOUTUBE` pill top-left and the red `LIVE` pill top-right, no picture, no
spinner, no retry. It sits there indefinitely.

## Root cause (two defects compounding)

1. `VideoPlayer`'s live poster branch (`playing === false`, `live === true`)
   rendered `{still ? <img/> : null}` — nothing — over the `.player` black
   background, plus the two badges. A channel-follow source carries no video
   id, so `posterFor()` returns `""`, and the Watch screen passed no `poster`
   prop — so while the on-air check was in flight (up to ~15s worst case) or
   unanswered (probe down), the screen was a bare black box. Worse, the branch
   ignored the `checking` / `notLive` states entirely and was a dead `<div>`,
   so a slow or failed check left the badges-over-black with no feedback and
   no way out.

2. `WatchLive` never passed its already-computed `cover` still (ended
   thumbnail / recent-service thumb / sermon still / hero) to either live
   `VideoPlayer` (`streaming` branch and Play-override branch), even though
   `cover` exists precisely to keep the screen on a meaningful still.

## Fix

- `src/components/blocks.tsx` — the live poster branch is now a tappable
  `<button>` (same `open()` the autoplay uses, so a tap re-runs the check):
  always paints the platform still as a floor when there is no poster, shows
  the spinner + `Connecting to the live broadcast…` while checking, shows
  `No broadcast right now — tap to check again.` when the read says off, and
  otherwise names the broadcast. Badges unchanged. The frame still opens by
  itself with sound the moment it can.
- `src/pages/WatchLive.tsx` — both live players get `poster={cover}`, so a
  channel follow opens on the last broadcast still instead of black.

## Gate

Repo ship-gate `src/tools/verify-update.mjs`: 733 checks, 80 FAIL before and
after this fix, zero introduced vs the pristine baseline run (its remaining
FAILs are pre-existing baseline rot — stale `APPLY_UPDATE.txt` checklist
prose etc. — byte-identical sets apart from a same-worker esbuild-init
artifact on the baseline side only). Both edited files compile clean
(the gate esbuild-compiles every file it checks).
