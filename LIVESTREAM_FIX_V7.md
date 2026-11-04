# Livestream — fix v7: ticking clock instead of live on deployed

## Why the deployed site showed the clock mid-service

The visitor on-air check depended **100% on scraping YouTube channel/watch
HTML** through proxy doors (`/__yt`, the Netlify function, 3 public CORS
proxies). On deployed hosts that scrape routinely fails: datacenter IPs get
bot-walled (login wall, no live markers, 502s), public proxies flap, Render
cold-starts. Every door misses → `unknown` → ticking clock.

Meanwhile the office's Play press already stamps the **exact verified
broadcast id** (+title/channel/at) into the published words
(`LIVE.liveVideoId`) — but nothing on the visitor side ever read it. So the
site sat on the clock through a properly started service.

## What changed

- `src/lib/livestatus.ts`
  - **Published-stamp fast path:** a fresh office-on-air stamp (`isLive` /
    `guestIsLive` + id + press < 12h old) is verified playable through the
    CORS-open verifier (works on deployed hosts) and wins **at once** — no
    scrape wait. A proven-ended stamp falls through (fix v8: the stamped
    video's own watch page is re-read, and readable-with-no-live-marker ends
    the pin so the scrape's OFF + ended screen take over; office Stop clears
    the stamp). Stamps older than 12h fall back to the scrape, so a forgotten
    Stop can never pin a recording as "live" forever.
  - **Authoritative Data API door:** same-origin `__live` (then the joined
    office server on split deploys), answered from the YouTube Data API.
    A live answer plays immediately; an off answer only counts when the
    scrape yields unknown (a readable scrape always wins).
- `scripts/serve.mjs` — new `GET /__live?channel=UC…` endpoint (YouTube Data
  API `search.list`, `eventType=live`). Key lives **only in server env**
  (`YT_API_KEY`), never in frontend code. split server-side cache (live 75s / off 15min — v9 quota fix) → a quiet week costs ~96 searches/day (~9.6k units, inside the free 10k/day); 100 visitors still share one cached answer. No key → 404 → stamp + scrape, as before.
  YouTube-only channel format (same SSRF guard shape as `/__yt`).

CMS/admin, accounts, publishing, design untouched. No new dependencies.

## Office setup (do both; either alone fixes most cases)

1. **Working-from-now (no key needed):** run the service exactly as before —
   office presses **Play** (stamps the broadcast id) then **Publish**.
   Deployed visitors now open the exact video at once, even with the scrape
   fully walled. Press **Stop + Publish** at the end as usual (clears it).
2. **Automatic detection without any press:** create a YouTube Data API v3
   key (Google Cloud Console → enable *YouTube Data API v3* → API key;
   restrict it to that API + your server IP if you like), then Render
   dashboard → your service → Environment → add `YT_API_KEY` → Save (auto
   redeploy). The auto-open path (`@twocorg` live with no press) now works
   on deployed too. Quota (v9 corrected): search.list costs 100 units per call, so the old flat 75s cache would have cost ~115k units/day (11× the free 10k/day). With the split cache (live 75s, off 15min) a quiet week costs ~96 calls/day (~9.6k units, inside free tier); errors back off 60s and quota trips 10min and fall back to stamp + scrape. If the key ever trips quota, live still opens via the Play stamp. Rotate like any credential; it never ships to browsers.

## Verify on production

1. Live service + Play + Publish → deployed Watch shows the broadcast (not
   the clock) within seconds, with sound per the v6 rules.
2. Stop + Publish → deployed shows the ended screen + latest recording.
3. With `YT_API_KEY` set: start a live on the channel with NO office press →
   deployed auto-opens it (may lag the API ~1–2 min).
4. No key + no press + walled scrape → clock (unchanged, correct: nothing
   verified live).
5. Stale stamp (>12h, no stop): falls back to scrape, never a stuck "live".
