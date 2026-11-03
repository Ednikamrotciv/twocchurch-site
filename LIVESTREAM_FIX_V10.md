# Livestream — fix v10 (on top of v9)

User-confirmed behavior kept: no tap-for-sound button; livestream opens automatically
with sound (muted fallback + first-gesture upgrade, v6 rules, untouched).

What changed (2 files):

- `src/components/blocks.tsx` — the live playing frame now always carries the small
  grey circular repair arrow (corner, translucent, spins while repairing). YouTube's
  own "unavailable" text is cross-origin invisible, so without it an error inside a
  healthy-looking frame had no control. It calls the same `repair()` as the big
  dead/empty-branch arrow and the office admin Reload (`liveReloadAt`): drops stale
  verdicts, re-asks status, remounts fresh. No autoplay/sound logic touched.
- `src/components/ErrorBoundary.tsx` — `SectionBoundary` "Try again" now drops the
  same volatile live caches as the page-level retry (`wom.livestatus`,
  `wom.recentstreams`, `wom.ytchannel`, `wom.live.targetNote`, in-memory verdicts),
  so a poisoned live answer can never re-crash the section. The page-level
  "Reload the page" behavior is unchanged (in-place retry first, full reload on
  deterministic/chunk errors, second tap always reloads).

Not changed: version stamps (hooks 440 / index 440), maintenance gate, CMS/admin/auth/
publishing, sound path, status detection, preconnects. No new dependencies, no keys.
