Merged build v2 — second (fixed_7_) retained + first (old) livestream gating, verified-only mount.

Base: church-site-fixed_7_.zip (all security + everything else retained).
Livestream: src/pages/WatchLive.tsx ONLY.

Why "This video is unavailable" showed: the screen mounted a YouTube iframe with nothing
actually playable — a lone live_stream?channel= embed for a channel with no running
broadcast (bare office press, walled read, or stale id), or a video id mounted before
YouTube confirmed it (verdict unknown) that later proved dead/private/embedding-disabled.
YouTube answers all of those with its black "This video is unavailable" frame, and the
embed-time failure is invisible to the pre-check (oEmbed), so the frame stuck.

v2 fix (verified-only mount):
- A YouTube iframe mounts ONLY for an id YouTube itself just confirmed plays (verdict === true):
  detected broadcast id, published liveVideoId/guestVideoId, or named stream-link id.
- Unknown (still checking / offline / probe down) shows the ticking clock (LiveWaiting)
  with the last-stream still — and mounts BY ITSELF the moment the verifier says true
  (about a second, no tap, no reload). Dead never mounts.
- NO lone channel embed is ever mounted (youtubeChannelId always undefined on the live
  screen). A press alone, a walled read alone, or a stale id alone all wait on the
  clock instead of opening the black frame.
- Autoplay immediate + with sound kept: muted-first paint + auto-unmute loop
  (blocks.tsx + embed.ts untouched from fixed_7_), published video id opens at once
  with no scrape wait, detected live opens at once with no Play press.
- Safety nets kept (livestatus.ts + blocks.tsx untouched): session dead-id ban,
  IFrame API onError swap, auto-repair loop, Reload-press unban.
- Guest one-off: verified guest video plays immediately; a guest press with no verified
  video waits on the clock (no lone guest-channel embed anymore).
- Everything else byte-identical to fixed_7_.

Office checklist (if it now waits instead of playing):
1. Start the broadcast on YouTube FIRST, then press Play/Live in the console (Play captures
   the live video id at press time — pressing before going live captures nothing).
2. If you pressed early, press Play again (or Reload) once YouTube is actually live.
3. The Watch page picks it up by itself in seconds — no visitor reload needed.
