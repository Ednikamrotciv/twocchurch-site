# Specification — church website for The World Overcomers' Ministries Inc.

> Recorded from the user's brief and kept up to date so the intent survives any handoff.
> See `README.md` for architecture and the build recipe.

## Original request

> Create a React TypeScript website for a church: it should feature the about, giving,
> locations, watch sermons, contact. On the main page the **watch sermon** button which leads to
> a different page of its own, same as the **locate our family** button which leads to a
> different page of its own showing the branches' locations of the church with a **direction
> button**. Also on the main page the **prayer request** button, and **share testimonies** with a
> **share with us** button. The attached file image is the logo of the website — use that exact
> image as the logo. Add more advanced criteria to the website.

## Requirements → where they live

| # | Requirement | Implementation |
| --- | --- | --- |
| 1 | React + TypeScript | `src/**/*.tsx`, bundled by `src/tools/build.mjs` (esbuild-wasm) into `src/bundle.js` |
| 2 | About page | `src/pages/About.tsx` — mission, vision, anchor verse, 8 convictions, story timeline, 8 beliefs, leadership bios, FAQs, global stats |
| 3 | Giving page | `src/pages/Giving.tsx` — six preset amounts, 6 funds, two ways to give (bank transfer, in person), an *Account details* tab with only the Lagos account, allocation breakdown, giving FAQs (also served at `#/give` and `#/donate`) |
| 4 | Locations page | `src/pages/Locations.tsx` — 7 branches, region filter + search, geolocation distance sorting, OpenStreetMap embed, weekly rhythm, languages, **Get directions** button per branch |
| 5 | Watch sermons page (separate page) | `src/pages/Sermons.tsx` + `src/pages/SermonDetail.tsx` — featured player, filters (speaker/year/sort/search), per-sermon page with notes, discussion questions, save/mark-watched, downloads |
| 6 | Contact page | `src/pages/Contact.tsx` — four contact cards, topic-routed message form, office hours with live open/closed state, department table, map, emergency pastoral line, FAQs |
| 7 | Home "Watch sermons" button → its own page | Hero CTA + quick tile → `#/sermons` |
| 8 | Home "Locate our family" button → its own page | Hero CTA + quick tile → `#/locations` |
| 9 | Each branch location with a direction button | `BranchCard` (`src/components/blocks.tsx`) → `directionsUrl()` builds a Google Maps directions deep link from each branch's coordinates |
| 10 | Home "Prayer request" button | Hero CTA + quick tile + topbar link → `#/prayer` |
| 11 | Share testimonies with a "Share with us" button | Home CTA + testimonies page CTA + page-head button → `#/testimonies?share=1` opens the submission form (name, city, category, title, story, photo, anonymity, consent) |
| 12 | Use the attached image as the logo | `src/assets/logo.png` is the exact uploaded file and the source of truth; `src/assets/logo-mark.png` is an auto-derived transparent-background cutout of it (see README) which the header, footer and splash use so it blends into the page background. |
| 13 | "More advanced criteria" | theme switching, command palette (⌘K), live service detection + countdowns, geolocation, .ics calendar export, image compression, per-sermon notes, reading plan, visit-pass wizard, prayer wall + private tracker, testimony gallery with amens, accessibility + reduced motion, responsive down to 390 px, error boundary, no console errors |

## 441. One unified update; all old updates removed

Office request: delete all old updates and retain new in new zip. Maintenance notice still
active at new deploy; cleared when Publish is clicked by admin; new deploy wipes old
wakes; unsaved changes clean; live-relay intact; new empty; new deploy fresh, clean
and new.

What this build does (single unified contract, supersedes all prior notes):

1. MAINTENANCE HOLDS EVERY NEW DEPLOY, ONE PUBLISH CLEARS IT. Each build stamps a fresh
opaque deploy ID (`version.json` + `seed.json` + entry-page `wom-deploy` meta carry the
same ID; `maintenance-hold.txt` ships as marker, lock is in code). Fresh visitors wait
on the two-line notice ("We'll be right back / The site is being updated.") until a
publish from that deploy lands: explicit office Publish on the copy, same-deploy
witness, same-code attestation, publish clock, server verdict, feed/seed witness.
No-change Publish still blesses through bless-only `sendPatch`, so the first click
clears even with nothing to publish. `/admin` is never gated. `?preview=1` bypasses
for review; `?maintenance=1` forces the page locally.

2. NEW DEPLOY WIPES OLD WAKES + OPENS UNSAVED-CLEAN/NEW/EMPTY. First boot per deploy ID
unregisters retired service workers, drops HTTP caches, clears draft + pending +
after-save + history + edit undos + preview + relay debt + drawer place, ends stamped
sessions (dev-boot restarts keep session), stages clean (welcome-home slide only) for
returning browsers until Recover + Publish. Fresh profiles (never blessed) still adopt
live words. No-change Publish now also clears dirty/undos/preview/stored-draft
(`src/lib/cms.ts`), so the unsaved list stays empty after the clearing click instead
of resurrecting on reload.

3. ONE PUBLISH WORKS EVERYWHERE, BOTH DIRECTIONS. Bottom-bar Publish and dialog Publish
now share `performPublish → runPublishAction → cms.publish`. Live/admin → local/admin
is automatic like local/admin → live/admin already was (public live re-read, rebase
keeps dirty sections, owed-record guard, durable office record follows when signed in
with clean desk). Relay (`relayPublishWordsToLive` + `fillBlessRelay` + retry), feed
mirror, converge, server shout, 30s watch (10s while waiting) carry it. Device-only
clicks lift every tab of the browser and queue/relay in background.

4. SIGN-IN + SLEEP-WAKE STAY ACTIVE. Deploy-bound idle-expiring sessions (15 min);
accounts persist server-side across deploys. Sleeping box serves baked words; wake
re-serves last publish whole from bake/mirror; missing uploads heal from browser
cache/mirror. Publish ≡ Publish now.

5. LIVESTREAM INTACT. Poster-first `VideoPlayer` verifies YouTube ids via oEmbed before
play (dead ids show poster + Watch on YouTube, never the black frame); walled-but-on-air
channel follow plays `live_stream?channel=`; `@twocorg` default + baked recents; urgent
Watch check + short cadence + moved-channel re-check + office-report trust.

Proof: `window.__womBuild = { notes: 441, code: "unified441" }`; verifier U441 passes.
Files: `src/lib/hooks.ts` (441/unified441) + `index.html` (wom-notes/code),
`src/lib/cms.ts` (hold/clear/fresh/relay), `scripts/build-static.mjs` (fresh deploy ID
+ hold + clean flag + code word), `src/tools/verify-update.mjs` (U441 only).
Old docs removed: `LIVESTREAM_FIX_*.md`, `MERGE_NOTES.md`, all prior SPEC notes,
all prior verifier sections.
