# Maintenance-stuck fix — visitors always live (2026-10-19)

## What was wrong
Every `npm run build` stamped a FRESH opaque deploy ID and held every fresh
browser on "We'll be right back" until an office Publish FROM THAT EXACT
deploy landed:

- `index.html` pre-bundle gate painted maintenance when
  `localStorage wom.cms.notes < meta wom-notes` or
  `wom.cms.codeBlessed != meta wom-code` — true on EVERY fresh device.
- `src/lib/cms.ts` deploy-lock (`maintenanceShouldWait`/`useMaintenance`)
  required `publishedDeployId == currentDeployId` OR a server/feed witness
  with `serverAt > deployFirstSeenAt`. A device arriving AFTER the publish
  has `deployFirstSeenAt > publishAt`, so it still holds.
- Publish stamps (`wom.cms.deployPublished`, `wom.cms.codeBlessed`,
  `wom.cms.notes`, `wom.cms.publishAt`) are localStorage-only: one admin
  click only unlocked THAT admin's browser. Other browsers need the Render
  server (`cms-server.txt`) or the live feed (`publish-feed.txt`) to hear
  about it.
- Your repo has a server (`https://twocchurch-site.onrender.com`) but NO
  feed (publish-feed.txt empty), the server sleeps (free tier), and
  `clean-deploy.txt` is present so every deploy ships EMPTY words + the
  server wipes on boot. Result: ~2 admin browsers (the ones that clicked
  Publish) go live, every other phone/browser stays on maintenance.

## What this fix changes (4 files)
1. `index.html` — pre-bundle gate now paints ONLY for explicit
   `?maintenance=1` / `?showMaintenance=1` (query or after #). All
   shipped-update / code / version.json checks removed.
2. `src/lib/cms.ts` — `maintenanceShouldWait()` and `useMaintenance()`
   now return `maintenanceForced()` only (false unless ?maintenance=1).
   Clean-stage for new deploys disabled (`if (false)`) so returning browsers
   keep baked words instead of parking on welcome-only.
3. `src/pages/../App.tsx` (`src/App.tsx`) — stale-build waiting no longer
   shows maintenance; the reload still runs in background.
4. `scripts/build-static.mjs` — stamps `hold:false` (never hold fresh
   visitors). `scripts/bake-seed.mjs` — ignores `clean-deploy.txt`
   (always bakes words).

## How to apply
1. Back up first: `npm run backup` on the office computer (and keep a copy
   of `data/cms-state.bin`).
2. Copy these 4 fixed files over your repo (same paths), OR extract this
   whole fix zip over a copy of your repo:
   - index.html
   - src/lib/cms.ts
   - src/App.tsx
   - scripts/build-static.mjs
   - scripts/bake-seed.mjs
3. DELETE `clean-deploy.txt` beside package.json (the fix ignores it, but
   delete so `npm start` stops warning and the server stops boot-wiping).
   Keep `maintenance-hold.txt` or delete — it no longer controls anything.
4. On the office computer with your real words:
   `npm install && npm run build`
   then upload the CONTENTS of `dist/` to your static host (same as before).
5. Hard-refresh stuck devices once (or clear site data): the old bundle cached
   the old gate. One normal reload is enough — entry files send
   `no-store, must-revalidate` via _headers/.htaccess.

## Emergency unblock WITHOUT redeploying (stuck phones right now)
On each stuck browser, open the site and run ONE of these in the address bar
or devtools console, then reload:

- Quick view (no change, per-tab): add `?preview=1` to the URL, e.g.
  `https://YOUR-SITE/?preview=1` — bypasses maintenance on that tab.
- Full release on that browser (console):
  `Object.keys(localStorage).filter(k=>k.startsWith('wom.cms.')).forEach(k=>localStorage.removeItem(k)); sessionStorage.clear(); location.reload();`
  then if it still waits, use ?preview=1 above until you redeploy the fix.

## After the fix
- Visitors NEVER see "We'll be right back" unless you open
  `?maintenance=1` deliberately to preview it.
- Deploys carry baked words; no Recover+Publish needed after every deploy.
  Publish only when you actually change content.
- Recommended next: set up the live feed (DEPLOY.md "The live feed", 2 min)
  so publishes reach deployed copies in minutes without rebuilds, and use a
  non-sleeping backend or a persistent disk for uploads. Without the feed you
  still need `npm run build` + re-upload after each publish.
