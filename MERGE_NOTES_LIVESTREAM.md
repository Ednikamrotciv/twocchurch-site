Merged build v3 — second (fixed_7_) retained + first (old) livestream gating, masked player.

Base: church-site-fixed_7_.zip (all security + everything else retained).
Changed: src/pages/WatchLive.tsx + src/components/blocks.tsx (VideoPlayer) ONLY.

Two complaints, one root design: v2 waited for the verifier before mounting.
- Slow/blocked verifier -> stuck on the ticking clock even though live started.
- Every re-verify flipped clock <-> player ("keeps stopping").
- And any blind mount risked YouTube's black "This video is unavailable".

v3 fix (mount-now, masked, capped repair):
1. The screen mounts the player the moment there is anything to play (detected id,
   published liveVideoId/guestVideoId, live channel follow, named link). Only a
   proven-dead verdict (false) or a session ban blocks a mount. Unknown (checking /
   offline / probe down) mounts too — nothing ever waits on the verifier.
2. The raw frame NEVER shows: the live player stays covered by the warm still until
   the frame itself reports PLAYING. Slow frames get a "Connecting…" label only
   after 4s. Dead/refused frames swap to a card, never the black frame.
3. No more endless "Connecting…": after ~6 silent auto-tries (~20s) on the SAME
   frame the screen rests on "This broadcast isn't playing here right now." +
   Watch on YouTube + Try again. A NEW broadcast (new video id) still opens by
   itself; Try again retries by hand; the office Reload press clears all bans.
4. Autoplay immediate + with sound kept: muted-first paint + auto-unmute loop, so
   the picture is instant and sound rejoins by itself (no tap, no reload).
5. Guest one-off: verified or unverified-but-live guest video plays at once; a guest
   press with nothing behind it waits on the clock (never a blind channel frame).

Office checklist (if it waits instead of playing while YouTube is live):
1. Start the YouTube broadcast FIRST, then press Play/Live in the console (Play
   captures the live video id at press time — pressing early captures nothing).
2. If you pressed early, press Play again (or Reload) once YouTube is actually live.
3. Visitors pick it up by itself in seconds — no reload needed.
