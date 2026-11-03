# Livestream — fix v11 (on top of v10)

Keeps everything v10 does (poster-first, autoplay with sound, muted-fallback +
first-gesture upgrade, no tap button, grey repair arrow everywhere, admin
Reload shares the same repair, ErrorBoundary/SectionBoundary cache clearing,
lazyRetry chunks, stamps 440/440 untouched, maintenance gate untouched).

What changed (1 file, `src/components/blocks.tsx`):

1. **Repair now re-resolves for ANY YouTube live, not just channel follows.**
   Before, tapping the grey arrow on a bare-video live (playableId /
   verifiedFallbackId path) just remounted the same old id — so if the office
   ended the stream and started a new one (new video id), the arrow replayed
   the dead id and stuck. Now any `live && platform === "youtube"` repair
   re-asks what's live now and plays the fresh verified id. Facebook/upload
   lives still remount (their frames are not YouTube verdicts).

2. **Office Reload calls the latest repair, never a stale closure.** The
   `reloadSignal` effect now goes through a `repairRef`, so a press that lands
   after ids changed still forgets/re-resolves with fresh ids.
