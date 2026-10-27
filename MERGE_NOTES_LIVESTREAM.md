Merged build — second (fixed_7_) retained + first (old) livestream gating restored.

Base: church-site-fixed_7_.zip (all security + everything else retained).
Livestream: first-build gating restored in src/pages/WatchLive.tsx ONLY:
- Bare office press with no verified video no longer mounts a lone channel embed
  (that lone live_stream?channel= embed is what showed YouTube's black "This video
  is unavailable" when the channel had no running broadcast).
  Press alone now waits on the ticking clock (LiveWaiting); the screen plays the
  moment the scrape proves live OR the publish carries a real verified video id.
- Immediate autoplay kept: published liveVideoId/guestVideoId opens at once (no
  scrape wait), detected live opens at once, muted-first paint + auto-unmute
  (src/components/blocks.tsx + src/lib/embed.ts untouched from fixed_7_) so the
  picture is instant and sound rejoins by itself (no tap, no reload, stays on site).
- "Video unavailable" fix kept: verifier + session ban + IFrame API onError swap +
  auto-repair loop (src/lib/livestatus.ts + blocks.tsx untouched from fixed_7_).
  Dead ids never mount raw; channel safety net only when truly live; fallback
  poster + Watch-on-YouTube instead of the black frame.
- Guest one-off immediate channel (overrideGuest branch) kept as in first build.
- Everything else byte-identical to fixed_7_ (security, publish, recent services,
  admin, styles, assets).
