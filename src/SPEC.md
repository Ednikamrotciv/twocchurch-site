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
| 5 | Watch sermons page (separate page) | `src/pages/Sermons.tsx` + `src/pages/SermonDetail.tsx` — featured player, filters (speaker/year/sort/search), per-sermon page with notes, discussion questions, save/mark-watched, downloads (the series filter, series grid and the *Sermon series* section were removed at the office's request — SPEC note 123) |
| 6 | Contact page | `src/pages/Contact.tsx` — four contact cards, topic-routed message form, office hours with live open/closed state, department table, map, emergency pastoral line, FAQs |
| 7 | Home "Watch sermons" button → its own page | Hero CTA + quick tile → `#/sermons` |
| 8 | Home "Locate our family" button → its own page | Hero CTA + quick tile → `#/locations` |
| 9 | Each branch location with a direction button | `BranchCard` (`src/components/blocks.tsx`) → `directionsUrl()` builds a Google Maps directions deep link from each branch's coordinates |
| 10 | Home "Prayer request" button | Hero CTA + quick tile + topbar link → `#/prayer` (the red `header__cta` button was removed on request — see revision notes) |
| 11 | Share testimonies with a "Share with us" button | Home CTA + testimonies page CTA + page-head button → `#/testimonies?share=1` opens the submission form (name, city, category, title, story, photo, anonymity, consent) |
| 12 | Use the attached image as the logo | `src/assets/logo.png` is the exact uploaded file and the source of truth; `src/assets/logo-mark.png` is an auto-derived transparent-background cutout of it (see README) which the header, footer and splash use so it blends into the page background. The wordmark text beside the header logo was removed (the logo already contains the name), and the hero emblem was removed from the home page. |
| 13 | "More advanced criteria" | theme switching, command palette (⌘K), live service detection + countdowns, geolocation, .ics calendar export, image compression, per-sermon notes, reading plan, visit-pass wizard, prayer wall + private tracker, testimony gallery with amens, accessibility + reduced motion, responsive down to 390 px, error boundary, no console errors |

## Revision notes (user follow-ups, newest last)

1. **Logo blends with the page.** The uploaded logo has a flat black backdrop, so it used to read
   as a black box. `src/assets/logo-mark.png` (auto-derived transparent cutout, see README) is now
   used in the header, footer and loading splash; no border, box or radius. Light theme flips the
   header logo with `invert(1) hue-rotate(180deg)` so the white logo text stays readable on cream.
2. **Wordmark removed from the header.** The `{SITE.short}` + "Ministries Inc. · est. 1999" text
   next to the logo is gone — the logo artwork already contains the name.
3. **Hero emblem removed from the home page.** The `.hero__emblem` logo above the headline was
   deleted and the hero's `min-height`/padding tightened so it does not look hollow.
4. **The menu is now a dropdown, not a full-screen drawer.** Below 1080 px the hamburger opens
   `.menu-pop` — a compact portrait panel (~266 × 373) anchored under the button with a caret,
   the 8 nav links plus *Plan your visit* and *Prayer request*, closed by outside click, `Escape`,
   the button itself, or navigating. It no longer locks body scroll. Implemented by
   `MenuDropdown` in `src/components/layout.tsx`.
5. **The red `header__cta` "Prayer request" button was removed** from the header bar (it
   duplicated the topbar link and the hero CTA). Prayer is still reachable from the topbar link,
   the hero CTA, the quick tiles and the new dropdown.
6. **Topbar renamed and extended.** The strip's "Give" link is now **Donate** (→ `/donate`, an
   alias of the giving page) and a **Volunteer** link was added (→ `/ministries?volunteer=1`,
   which auto-scrolls to the serving form — `Ministries.tsx` reads the `volunteer` query). The
   wording was carried through to the footer ("Donate online", "Volunteer", bottom-bar "Donate").
   The same action also fixed a latent bug: the footer used to strip query strings, so
   "Missions & outreach" (`?fund=missions`) and "Share a testimony" (`?share=1`) lost their
   parameters — `layout.tsx` now forwards them.
7. **Giving FAQ redesigned, and the `Accordion` primitive was actually styled.** The accordion
   had React markup but *no CSS at all* (grep `accordion` in the old `app.css` returned nothing),
   so every FAQ block on the site was rendering as raw grey `<button>` boxes. `global.css` now has
   a full accordion skin — rounded panels, gold spine on the open row, gold question text, a
   circular chevron that flips, and a real `grid-template-rows: 0fr → 1fr` expand/collapse
   animation (the answer stays mounted, so closing is smooth too). New `numbered` prop adds the
   `01…05` index. The giving FAQ itself became a two-column block: sticky intro + "Still unsure?"
   help card (email the finance team / phone) on the left, the accordion on the right
   (`.faq-layout` in `pages.css`), single column under 980 px.
8. **Removed the "Is online giving secure?" question** from the giving FAQ; about/contact carried
   the near-identical "Is my giving secure and how is it used?", which was reworded to
   "Where does my giving actually go?" so no security question remains anywhere.
9. **"Find a branch near you" phrasing.** The home page's "Our family" section heading changed from
   "Find a campus near you" to "Find a branch near you", and every other "Find a campus" call to
   action was matched to it: the Locations nav description, the footer "Worship with us" link, the
   ministries hero's ghost button, and the 404 page's button. Body copy and entity names (e.g. the
   "Campus & Young Adults" ministry, "seven campuses", "Set as my campus") keep the word "campus".
10. **Site-wide terminology switch: "campus" → "branch".** Supersedes note 9. Every user-facing
   occurrence of "campus"/"campuses"/"Campus"/"Campuses" is now "branch"/"branches"/"Branch"/
   "Branches" — all page copy, section headings, eyebrows, buttons, filter labels, table headers,
   toasts, email/ICS bodies, the `$meta` description and tags, plus the matching code identifiers
   (`campusId`→`branchId`, `setCampusId`→`setBranchId`, the local `campus` variable, the contact/
   ministries `campus` form field), the `localStorage` key (`wom.campus`→`wom.branch`), the CSS
   class/id names (`.branch-chip`, `.branch-detail`, `.mini-branch`, `.schedule-table__branch`,
   `.home-branches`, `#branch-detail`) and the docs. Anything a visitor can read now says "branch".
11. **Removed the "Annual report (PDF)" button** from the giving page header (it had no destination).
    The giving page head now carries a single action, "Give now".
12. **New tagline and hero copy.** The tagline "Raising overcomers in every nation" became
    **"Where Champions are raised in Christ"** everywhere it appears (`main.pjs` `churchTagline`, the
    `$meta.title` suffix, the `SITE.tagline` fallback, the `index.html` splash, and therefore the
    footer). The home hero headline is now "Where *Champions* / are raised in Christ" and its lede
    paragraph became the CARE statement: "We are Christ-centered, People of Accountability &
    integrity, Relationship designed and We are people of Excellence (CARE)."
13. **Hero now has a light-theme background.** The hero was hard-wired to a dark photo scrim in
    both themes, so on the light theme it read as a black block on an otherwise cream page. It is
    now theme-aware. Dark theme is unchanged (photo at 0.34, near-black gradient scrim, light copy).
    Light theme (all under `[data-theme="light"] .hero*` in `pages.css`) becomes a bright parchment
    band: a cream gradient base, the photo dropped to `opacity: .12` with `mix-blend-mode: multiply`
    so it reads as a faint warm texture, a cream scrim + a white radial wash behind the copy, a
    stronger gold glow, dark speck grain, and dark copy/`--gold` coming from the light-theme tokens
    (no pinning needed). The hero-only hard-coded colours got light variants too: `.hero__lede`,
    `.hero__meta`, `.hero__next`, `.hero__live`, `.hero__verse` and the `.hero .btn--ghost/--quiet`
    scrims. `.page-head .btn--ghost/--quiet` got the same treatment, since the page heads already
    switch to a cream scrim in the light theme.
14. **Removed the statistics strip from the home page.** The `STATS` block ("Branches worldwide" /
    "Members in covenant" / … ) that trailed the `.home-next` section is gone; that section now holds
    just the next-service and verse cards. `StatStrip` and `STATS` are untouched — the About page
    still renders the same block under its "Where we are, by the numbers" heading.
15. **Removed the quick-action tile grid from the home page.** The four cards ("Watch sermons",
    "Locate our family", "Send a prayer request", "Share your testimony") repeated the hero CTAs, so
    the `QUICK_ACTIONS` const and its `<Section className="home-quick">` are gone; the home page now
    runs straight from the hero into the welcome/mission split section. The `.quick-*`/`.home-quick`
    CSS rules are left in `pages.css` (unused but harmless — the tile markup can be restored from
    SPEC/README notes if wanted).
16. **Removed the "Did this message speak to you?" card** from the sermon detail sidebar — the
    panel that sat under the "More in {series}" list and offered **Prayer request** / **Share a
    testimony** buttons. The sidebar now holds only the sticky series list and the previous/next
    card. (`.side-cta` is still used by Ministries, Giving and Devotional, so its styles stay.)
17. **Sermon-page pager row rebuilt.** The sidebar's "Series overview" button used to sit at the
    bottom of the series card while a *sticky* `.sticky-panel` slid down over the prev/next card as
    you scrolled (the two boxes collided, and since the cards are translucent the "Series overview"
    pill showed through between "Previous" and "Next"). Fixed by making the prev/next row a real,
    single pager line: `‹ Previous / title` — `Series overview` — `Next / title ›`, all in one
    `.side-nav` flex row, vertically centred; the panel lost its sticky positioning (nothing to
    stick past now) and the class was renamed `.sticky-panel` → `.side-panel`. Below 560 px and in
    the ≥1024 px two-column layout (where the aside is only ~420 px wide) the overview button wraps
    to its own full-width row, so the two titles keep their room.
18. **Fixed sideways scroll on the sermon page at phone widths.** The `.tabs` strip's intrinsic
    width was stretching the `.sermon-detail-grid` (page was 491 px wide in a 390 px viewport);
    `.sermon-detail-grid > * { min-width: 0 }` lets the tabs scroll inside their own box instead.
19. **Sermon page footer section is now "Previous sermons".** The strip under a sermon was "Related
    messages" and always showed the other three messages *from the same series*, so every card
    carried the identical badge (e.g. "Overcoming the World" ×3). It is now titled **Previous
    sermons** (eyebrow "From the archive") and picks the newest message from each of three
    *different* series — newest first, the current series excluded, topped up from the archive if
    there are not three others — so the cards always show three different series headings.
20. **The parchment band now stays light in the light theme.** `tone="light"` sections (the
    "Get involved" ministries band and the "Walk through a series" band on the home page, plus the
    same band on About, Sermons, Watch-live and Testimonies) used to flip to a near-black slab in
    the light theme — it read as a dark block cutting through a light page. The light theme now
    keeps the band light: `--band-invert-*` in `[data-theme="light"]` are friendly cream/parchment
    values with dark ink, and `[data-theme="light"] .section--light` adds a warm radial wash, a
    top-to-bottom cream gradient, hairline gold edges and a soft shadow (see
    `src/styles/global.css`). The scoped `.section--light .eyebrow / .badge--* / .muted / .tag …`
    accent overrides pick up the same dark inks because the light theme's `--on-light-*` tokens now
    match the dark theme's (those tokens are only ever used inside `.section--light`). The dark
    theme's band is untouched.
21. **Button ink is no longer swallowed by normalize.css.** The platform injects
    `normalize.css` ahead of `app.css`, and its `button:not([disabled]) { color: inherit }` rule
    has specificity (0,1,1) — so every *single-class* colour declaration (`.btn`, `.btn--crimson`,
    `.btn--ghost`, `.chip--active`, `.amount-btn--active`, `.to-top`, …) was silently ignored on
    real `<button>` elements while `a.btn` links kept their ink. Consequences fixed: `<a>` and
    `<button>` versions of the same button now match; the gold chevron on the dark "to top" bubble
    and the gold "tap for today's verse" overlay (`--gold-on-dark`) are no longer dark-on-dark in
    the light theme; the active chip and the selected giving amount are dark ink on gold instead of
    washed-out light-on-gold in the dark theme. All of it lives in one commented block in
    `src/styles/global.css` that re-states those colours with `:not([disabled])`, placed before the
    hero/page-head and `.section--light` overrides so those still win.
22. **Removed the "More in series" button** from the featured-message panel on `/sermons` (the
    panel now offers just "Full notes & player"; the series filter pills lower down still cover the
    same need).
23. **Theme-parity audit across every page (light + dark).** All 16 routes were swept in both themes
    with a scripted audit (effective-background compositing + WCAG contrast per text node +
    horizontal-overflow check) and visual spot checks; the fixes that came out of it:
    - **Dark chrome now keeps dark-surface ink in the light theme.** The top bar and the footer are
      deliberately dark in *both* themes, but their children read `--gold`/`--muted`/`--faint`,
      which flip to dark values in light mode — so the gold countdown, LIVE pill, footer headings,
      links and verse went dark-on-dark. `[data-theme="light"] .topbar` / `.footer` now re-declare
      the dark-surface tokens (plus new theme-independent `--muted-on-dark` / `--line-on-dark`).
    - **Badges on photos** (`.split__badge`, `.event-card__date`) use `--gold-on-dark` /
      `--muted-on-dark` / `--line-on-dark`, so the number *and* its label stay readable in both
      themes.
    - **Gold fills use a light sheen in both themes**: new `--gold-sheen` token
      (`color-mix(--gold-ui 82%, #fff)`) replaces `--gold-2` as the first gradient stop in `.btn`,
      `.amount-btn--active` and `.monogram--gold`. `--gold-2` is a *dark* shade in the light theme,
      so those buttons used to run dark-brown → gold under dark ink.
    - **Caption contrast** raised to AA: `--faint` lightened in the dark theme (#7a746b → #948d81)
      and darkened in the light theme (#8d867b → #6d665c); light `--muted` and the light-theme
      `--sky`/`--emerald` accents nudged a shade darker; dark `--crimson-2` nudged lighter
      (#e0505c → #e35f6b) so `badge--crimson` clears 4.5:1.
    - **The "tap for today's verse" curtain is theme-aware** — a parchment veil in the light theme,
      the dark curtain in the dark theme.
    Result: zero sub-AA text, zero horizontal overflow on all 16 routes in both themes.
24. **"Join a small group" removed from the devotional sidebar.** The third entry in the
   *Go deeper* list on `/devotional` ("Join a small group / Bible study in a living
   room near you", linking to `/ministries`) was deleted, leaving the two sermon-series links.
   Small-group mentions
   elsewhere (the Locations page's connect form, the Sermons lede, the About-page history entry)
   were left in place — only this side-list item was in scope.
25. **The `⌘K` shortcut badge removed from the header Search button.** `layout.tsx:137` no longer
   renders `<kbd>⌘K</kbd>`; the pill is now just the magnifier icon + "Search" (and still opens the
   command palette). The `.search-trigger kbd` / `.kbd` rule and its ≤1080 px hide-rule stay in
   `global.css` (harmless, and `.kbd` is a general utility). The palette footer's "⌘K toggle" hint
   was left as-is — it is only visible once the palette is already open.
26. **The "What should I wear?" FAQ removed.** Dropped from `FAQS` in `src/data/site.ts`; the
   list now runs from "I've never been to church" straight to "How long is a service?" (7 items,
   down from 8). `/visit` takes `FAQS.slice(0, 5)`, so its "First-timer questions" accordion now
   ends with the accessibility question rather than the dress question.

27. **Church admin console added at `#/admin`.** The office can now edit every content
   section of the site without touching code: church profile, leadership, contact desks, FAQs,
   weekly services, branches (with per-branch service times), ministries, events & activities,
   announcements, sermon series, sermons, the verse pool, giving funds/breakdown/bank details,
   values, statement of faith, our story and the headline numbers — 19 sections, all driven by
   the field schema in `src/lib/cmsSchema.ts`, with a dashboard, activity log, draft/preview,
   publish, JSON backup + restore, undo and "restore the shipped content".
   Content is stored on a new server-plugin content server in `index.html` (one UTF-16 blob per
   `section` in durable `state`, patched on publish, nudged to every visitor over pub/sub) and
   gated behind a SHA-256-hashed admin password. New content type `src/data/announcements.ts`
   renders as a dismissible notice strip under the header. See `README.md` §"The church admin
   console" for the architecture and the password-rotation recipe.

28. **Everything is now editable from the console, and the stream can be YouTube or Facebook.**
   Two follow-ups from the office:
   - *"The admin should be able to edit every content, apart from the name of the church and the
     logo in the main page UI."* The 19 data sections covered lists and structured records, but the
     prose that lives in the page components (headings, ledes, card paragraphs, button labels) was
     still hard-coded. That copy now lives in **`src/data/copy.ts`** (~350 strings across 16 page
     groups) and is exposed to the console as one **"Page text"** section per page (16 more
     sections, so **49 sections in 8 groups**). Values accept light inline markup — `*italic*`,
     `**bold**`, `[label](/route)`, `{{tokens}}` — rendered by the new `<Rich>` component in
     `src/components/ui.tsx`; `ct(id, vars?)` is the accessor every page calls. **Deliberately still
     locked:** the church name and the logo. The `site` section's Church-name field was removed and
     its `read()`/`bind()` strip and never write `name`, so `SITE.name` (surfaced from `main.pjs`
     via `pick()`) cannot be overwritten; the logo has no field at all and continues to come from
     `src/assets/logo*.png`.
   - *"The streams should be YouTube and Facebook option stream."* New **`src/data/live.ts`**
     (the mutable `LIVE` record: default provider, YouTube id/link, Facebook link, on-air flag,
     headline, broadcast partners, "ways to watch" cards) plus **`src/lib/embed.ts`** (pure helpers:
     `parseYoutubeId`, `youtubeEmbed/watch/thumb`, `isFacebookVideoUrl`, `facebookEmbed`, `hasVideo`,
     `embedSrc`, `posterFor`, `platformLabel`). `VideoPlayer` now takes a `VideoSource` and renders
     the right embed, a platform pill, an on-air badge, and a gradient poster (labelled by platform)
     when there is no thumbnail — Facebook supplies none. `/watch-live` shows a
     **YouTube ⇄ Facebook** segmented switch whenever both are configured (if only one is set it
     just plays, and if neither is set the panel falls back to the most recent message), and sermon
     cards/detail pages carry an optional `platform` + `facebookUrl` so a message can also be a
     Facebook video. All of it is editable in the console's new **"Live stream"** section
     (Live & broadcasts group) — publish a provider/URL and the player follows, no reload needed.
   Two smaller fixes on the way: the console's `<select>` fields used to store the option *index*
   instead of the option's value (so editing e.g. a branch region could corrupt it) — selects are
   now value-based with a `numberValues` flag for numeric option lists, and read-only fields render
   locked; and `.giving-grid` no longer overflows horizontally on a 390 px screen (single column is
   now `minmax(0, 1fr)`).
   While testing in both themes: the console follows the theme the visitor picked on the site (its
   `data-theme` is inherited), so the *unsaved-generator* strip and the read-only fields, which used
   dark-surface inks over theme-following surfaces, were unreadable in the light theme. The strip
   now uses theme-adaptive tokens (`--muted`, `--gold`, `--line`) and the locked fields are dimmed
   with a dashed border — the latter taken with `:not([disabled])` because the platform ships
   `input:not([disabled]) { color: inherit }`. Both themes now pass the WCAG contrast audit on the
   console and on the login gate.

29. **Photos are editable, and the console is written for non-technical staff.**
   Two follow-ups: *"let the admin be editable in a layman way"* and *"the cover images and all
   images should be editable by any photos of the editor's choice."*
   - **Photos.** New **`src/data/photos.ts`** is the register of every picture: 20 bundled slots,
     each with a friendly name ("Home banner", "Choir") and a plain sentence saying where it is
     used. `img(name)` is now `photoSrc(name)`, so banners and the home hero follow a change the
     moment it is applied; records that carry their own photo (branches, ministries, leadership,
     events, series, sermons) are re-pointed in place at apply time, but only while they still hold
     the bundled original — a branch or person given their own photo keeps it. The console's new
     **Photos & covers** group (4 sections: Main photos, Ministries & programmes, Leadership photos,
     Sermon series covers) shows the picture currently in place and offers three ways to change it:
     **upload a photo** from the device (shrunk in the browser by the new `compressImageBlob` and
     hosted via `uploadPlugin`, imported in `main.pjs` — only the URL is stored, so a published
     revision stays a few KB), pick one of the bundled photos, or paste a link. Empty means "use the
     original", with a *Use the original photo* button. The **logo and the church name stay
     locked**, as before.
   - **Layman-friendly console.** The dashboard now opens with a **Start here** card — the six jobs
     the office actually does (change a photo, set the live stream, change the words on the home
     page, update service times, add an activity, post a notice), each jumping to the right section;
     the sidebar gained its own **Find a section** box (53 sections is a lot to scroll); page-text
     entries lost their read-only "Text key" row and gained a plain description line rendered by a
     new `static` field type, with Add/Duplicate/Delete/reorder hidden for those sections
     (`fixed` sections — those entries are defined by the code, not the office); and the friendlier
     wording runs through the labels ("What this text is", "A note for you about this line —
     visitors never see it.").
   - **Bug fixed on the way:** the content server in `index.html` validated section ids with
     `/^[a-zA-Z][a-zA-Z0-9]{0,31}$/`, which rejected **every hyphenated id** — so the 16 page-text
     sections (ids like `copy-home`) could never be published; publishing failed with `bad-id`.
     The rule is now `/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/` in both places it is applied (the ids are just
     string keys in the durable index, so hyphens are safe), and editing page text was verified end
     to end: draft → publish → the new headline, with its `*italic*` markup, live on the page.

30. **A finished live stream files itself into previous sermons.**
   *"after a live stream is done it saves the live to previous sermons."*
   - **One source of truth.** A finished service becomes an ordinary sermon, so it lands in the
     sermon archive (filters, series, years, search, library, share links) *and* in the “Previous
     sermons” strip on the Watch live page — no second copy to maintain. `Sermon` gained two
     fields: `date` (`YYYY-MM-DD`, which now wins over the drifting `weeksAgo`) and `fromLive`
     (plus an internal `liveKey` fingerprint). Ordering everywhere is by real date
     (`newestFirst`), so a service filed today sits at the top of the archive.
   - **How it is built.** New **`src/data/broadcasts.ts`** is pure data work: it reads the live
     configuration (see below), picks the platform the office chose, and returns the archive with
     the service at the top. It is **idempotent** — the fingerprint is `day|youtubeId|facebookUrl`,
     so re-filing the same Sunday, or switching which platform opens by default, can never produce a
     duplicate. Facebook-only services get the series cover as their still image (Facebook offers no
     thumbnail), and the venue reads “Broadcast live from <HQ city>”.
   - **The trigger.** The *Live stream* section gained the archive fields (title for the archive,
     preacher + role, series, summary, date, length) and two switches: **“we are on air right now”**
     and **“file it in previous sermons when the service ends”** (default on). Switching the first
     one **off** files the service automatically, with a toast; the same section carries a
     **When the service ends** panel (`LiveArchivePanel` in `src/pages/Admin.tsx`) that shows the
     state — *Add a video* / *You are on air* / *Ready* / *Already filed: “…”, Tuesday 22 September*
     — and a button to file by hand, plus a shortcut into *Sermons*.
   - **Public side.** `/watch-live` gained a **Previous sermons** section
     (*“Services we have broadcast”*, copy keys `live.past.*`) listing the three most recent filed
     services, and the section under it no longer repeats them. Sermon cards and the sermon page
     carry a small **Broadcast** tag; a filed service with no notes or discussion questions shows a
     friendly line instead of empty lists.
   - **Two bugs fixed on the way.** (1) `/sermons/<id>` had been throwing
     `ytWatch is not defined` — `SermonDetail.tsx` used a helper it never imported, so **every**
     sermon page was broken; it now uses `sermonWatchUrl(sermon)`, which also makes the “Watch:”
     line in the downloadable outline correct for Facebook-hosted messages. (2) A stored draft or
     published snapshot saved before a section gained fields/entries showed those fields blank in
     the console; `mergeSection()` in `src/lib/cms.ts` now fills object sections from the shipped
     defaults and keeps fixed-entry sections (page text) in the code's order, adding any line the
     site has gained since — so an update never looks like an unsaved change the office never made.

31. **The console wears the site's clothes.**
   *"Redesign the admin page following every segment just as it is in the main page."*
   - **The console is now a page of the site, not a separate app.** `#/admin` renders inside the
     site's own chrome — skip link, top bar (with the search trigger and the theme toggle), header,
     announcement strip, footer and scroll-to-top — and the second and third square-black areas of
     the editor were removed in favour of the site's own segments: a **`PageHead` banner** (photo,
     eyebrow, serif `h1`, lede, breadcrumbs `Home / Church office [/ section]`, actions *Dashboard*
     / *Open the site* / *Tools & backups*), then the site's **`Section` band** carrying a
     **`SectionHeading`** per block. The dashboard reads *Start here* → *The numbers* →
     *Publishing* → *Recent activity*, each with the same eyebrow/heading/lede rhythm the public
     pages use, and its cards are the site's `Card` (so both themes come for free).
   - **The editor follows the site's list pattern too.** A list section opens with the same
     `SearchBox` pill the sermon archive uses (in place of a bare rectangular input), the count
     line matches `.result-count` (`--muted`, 0.9rem), and Add is the site's gold `Btn`. Nothing
     in the console invents a control the site does not already have.
   - **The gate is a page as well.** When signed out the console shows the same banner (h1
     *Church staff area*) with the sign-in `Card` in the section below it, so a colleague who
     follows a stale `#/admin` link still sees the church, not a bare form.
   - **Root-class gotcha (keep it; superseded by revision 32, where the root became `admin eshell`).**
     The console root was `className={"admin console" + …}` — it must keep **both** classes: the whole stylesheet's rules are scoped `.admin X` (and the
     layout rules live under `.console`), so renaming it to `.console` alone silently drops every
     `.admin …` rule (nav buttons revert to the platform's button styling and overlap two-per-row).
   - **Responsive:** the sticky section sidebar collapses behind an *All sections · N sections*
     toggle at ≤1040px; verified at 390×844 (no horizontal overflow, panel opens/closes with
     `aria-expanded`) and at desktop widths.
   - **Also fixed here:** the draft/publish bar was re-themed onto the site's tokens
     (`color-mix(--ink-2)`, `--line`, the site's container width) so it reads correctly in light
     theme, and its *Preview draft* pill got `white-space: nowrap`.

32. **The editor *is* the website.** (`#/admin` = the real pages, editable in place.)
   *"the admin should be an entire different page, it should be the same as the exact main website
   but the version that can be edited all through the pages"*
   - **No console.** The old sidebar/topbar dashboard is gone as the *primary* surface. Every route
     under the prefix (`#/admin`, `#/admin/sermons`, `#/admin/sermons/<id>`, `#/admin/giving`, …)
     renders **the same page components** as the public site — through the shared route table in
     `src/lib/routes.tsx` (`ROUTES` / `resolvePath`) — with the office's tools laid on top. The old
     dashboard survives only as the drawer's **Overview** tab (its jobs now jump into the drawer's
     sections instead of scrolling the old page).
   - **Click-to-edit words.** While the route is under `/admin`, `src/lib/router.tsx` calls
     `setEditMode(true)` as it reads the location (before render), and `ct()` in `src/data/copy.ts`
     then wraps every page string in invisible private-use marks carrying its copy key. A
     post-commit pass (`src/lib/editdom.ts`: one sweep on mount + a `MutationObserver`) finds those
     marks in text nodes, wraps the words in `<span class="ed-copy" data-copy="…">`, tags each
     `<img>` whose `src` matches a photo slot with `data-photo`, and strips the marks out of any
     attribute they leaked into (`placeholder`, `title`, `document.title`). One delegated
     capture-phase click listener opens the popover in `src/pages/Admin.tsx`. Outside `#/admin`
     nothing is marked, so the **public output is byte-identical** to before this revision.
   - **Two load-bearing conventions (do not "simplify" them).**
     1. **The original text node is moved into the span, not replaced** (`cleanTextNode`): React
        holds a reference to that node, so detaching it would make React's later updates go
        nowhere. `<Rich>` handles the nested case itself via `parseMark`; a single text node holding
        two marks is left alone (those lines stay editable from the drawer).
     2. **The shell root must carry both classes: `className="admin eshell"`.** Nearly every rule in
        `src/styles/admin.css` is scoped `.admin …` while the new shell rules live in
        `src/styles/edit.css` under `.eshell`/`.epbar`; dropping either class silently unstyles a
        whole layer (field controls, or the bar/drawer).
   - **Live draft.** Typing in a popover writes through `setCopyValue`/`setPhotoValue`; with
     `setAutoPreview(true)` the draft is applied to the live data modules so the page updates *as you
     type*, on both the admin route and (in the same browser) the public route. Because of that,
     `applied()` shows the **draft** while editing, so `pendingSections()` compares the draft
     against **the last published** overrides (`publishedSection`), never against `applied` — the
     "N unsaved changes" count and the publish patch both depend on this.
   - **A drawer, not a form.** The bottom bar's pencil opens `.epanel` with three tabs: **This page**
     (the ordered section ids for the current route, from `src/lib/pageMap.ts`: its page text, the
     records it prints, its photos), **Everything** (all 53 sections in 9 searchable groups) and
     **Overview** (the dashboard). Records (sermons, branches, events, leadership …) can be added,
     reordered, duplicated and deleted in place.
   - **Staying in the edit.** `buildUrl(..., {absolute})` in the router prefixes every internal
     link while the route is under `/admin` (including `?share=1` and hash targets);
     `absoluteLink()` (share links, QR codes) deliberately does **not**, and "Open the live site"
     passes `{ plain: true }`.
   - **The bar.** `.editbar` carries the **EDITING** tag, the page name, the unsaved-changes pill, a
     live-server status pill, the pencil, Discard (two-step), the gold **Publish** button and the
     tools/"open the live site" icons; it measures its own height into `--editbar-h`, which pads the
     page and lifts the scroll-to-top pill. Signed out, it shows **Sign in to edit** and clicking a
     word opens the sign-in modal (`LoginGate` from `src/components/editor.tsx`, now with an
     `onExit` back to the live site) instead of the popover.
   - **Verified live**: home `#/admin` shows 34 copy targets + 14 tagged photos with **no mark
     leakage** and no console/platform errors; click-to-edit changed the h1 as typed and persisted
     to the draft; click-to-replace swapped the hero photo and reverted; publish → rev 1 → *Undo the
     last publish* → restore all worked; the public route never showed draft content; drawer lists
     (19 sermons, field controls, Move/Duplicate/Delete) and all three tabs worked; 390×844 has no
     horizontal overflow and the drawer is full-width.

33. **Every word is editable — except the buttons.**
   *"let the admin be able to edit every text apart from all the buttons"*
   - **The gap.** Revisions 31/32 gave the office the *curated* strings (the 350-odd headlines,
     ledes and paragraphs in `src/data/copy.ts`), but plenty of words were still hard-coded in the
     components: "Donate", "Clear filters", "Speaker", "Your name", a placeholder, a tooltip. Those
     were unreachable.
   - **The collector.** `src/tools/auto-copy.mjs` parses every page and component with the
     TypeScript parser, finds each JSX string literal a visitor can read (text children plus the
     display attributes `label / placeholder / title / aria-label / ariaLabel / alt / hint /
     eyebrow / lede / text`) plus the display-valued object properties that feed breadcrumb, tab,
     option and command-palette lists (`label / title / sub / text / hint / tip / caption / note /
     body`) and rewrites each to `ct("auto.<page>.<hash>")`, writing the
     matching defaults into `src/data/autocopy.ts` (which `copy.ts` merges into `COPY_PAGES`).
     **536 strings** were claimed across 19 files. Property *values* only — `id`/`value`/`icon`/
     `group` stay code. Keys are content-addressed —
     `hash(file | words | occurrence)` — so re-ordering code can never slide an override onto
     different words, and the tool is idempotent (a re-run only picks up what is new). It also skips
     its own furniture (any element carrying `data-copy` / `data-ed-ui`).
   - **Buttons and links stay pressable.** `CONTROL_SELECTOR` in `src/lib/editdom.ts`
     (`button, [role=button|switch|tab|menuitem|option], a[href], .btn, summary`) is never turned
     into a click target: inside it the marks are stripped and the click is left alone, so a hero
     CTA still submits and a nav link still navigates while editing. The wording is still editable —
     it sits in the drawer with that page's other text. This is also what keeps the top bar and the
     nav usable inside `#/admin`.
   - **The sweep covers the whole document.** `startEditDom` is now handed `document.body` rather
     than the page wrapper, because the header, the footer and portaled modals live outside
     `.epage` — without that, a marked word in the footer would have rendered its marks as tofu.
     `walk` also no longer bails out on `data-ed-ui` (it strips there instead), and `cleanAttrs`
     strips marks inside chrome too.
   - **Three bugs found and fixed on the way.**
     1. **The sibling walk was cut short.** Wrapping a text node *moves* it into the new span, so
        `for (child = el.firstChild; child; child = child.nextSibling)` stopped after the first
        wrap and left every later word on that line wearing its marks (9 of them on the home page,
        e.g. "in", "h", "m" in the countdown). `walk` now snapshots the child list first.
     2. **`after` landed in the wrong place.** `host.insertBefore(…, node.nextSibling)` was
        evaluated *after* `span.appendChild(node)` cleared `node.nextSibling`, so any text that
        followed a wrapped word inside the same node was appended at the end of the parent. The true
        next sibling is captured before the move.
     3. **An open popover could resurrect a discarded edit.** `CopyEditor` flushed its last
        keystrokes on unmount unconditionally; discarding with a popover open put the words back.
        It now records the last value it actually wrote (`applied`) and refuses to write when the
        draft has moved on, and `Discard` closes any open popover (`onDiscarded`).
     The popovers also carry `key={pick.id}` now, so clicking one line and then another shows the
     second line's words rather than the first's.
   - **Two missing spaces fixed** (pre-existing authoring slips the new keys made obvious): the hero
     countdown read "at Dallasin 1d" and the top-bar pill read "Study in1d" — both now have the
     space they were written to have.
   - **The command palette searches plain text.** Its scorer built its haystack from the entry's
     title/sub — which in edit mode carry their copy key — so a marked entry matched everything and
     nothing at once. It now compares `stripMarks(title)`, a no-op on the public site.
   - **Verified live:** zero mark leakage on all 14 `#/admin` routes (15–52 click targets each,
     44 on the home page); clicking an auto entry opens its popover with a plain-language label,
     typing updates the header/pill live, the bar counts "1 unsaved change" and the publish modal
     names *Site-wide text* as the changed section; Discard clears it and closes the popover; the
     drawer shows 53 sections in 9 groups with all 16 page-text groups; no console or platform
     errors; 390×844 has no horizontal overflow.

34. **The admin, redesigned around jobs — one search box over the whole site.**
   *"redesign the admin for any updates for the website but make it easily editable for anyone"*
   - **What was wrong.** The drawer opened on a list of *sections* — "Verse pool", "Headline
     numbers", "Calendar filters" — which is how the site is built, not how the office thinks. A
     volunteer arriving at `#/admin` saw one pencil button and no idea where to start.
   - **`src/lib/jobs.ts` — the translation.** `JOBS` is eleven everyday jobs (the words on every
     page, photos & banners, service times & campuses, sermons & the live stream, events & notices,
     giving, church details & contact, ministries & serving, about/beliefs/numbers, prayer &
     testimonies, devotional & verses). **Every one of the 53 sections belongs to a job** —
     `sectionsWithoutJob()` is the guard to re-run after editing the list. The panel prepends a
     twelfth, dynamic job: *Everything on this page*, built from `pageMap`.
   - **The Update tab is the default.** It leads with a one-off welcome card (dismissible, remembered
     in `localStorage`), a "Two ways to change anything" card (click the words / click a photo, and
     *nothing is live until you press Publish*), the search box, the current-page card, then the job
     grid. Picking a job drills into a back-linked view of just that job's sections; the same works
     for a single section. The drawer **auto-opens on the first visit** (until the welcome is
     dismissed), so nobody has to find the button first.
   - **One search box over everything.** `searchEverything(query, draft)` looks at the *current
     draft* and returns hits in four groups: the words on the site (536 copy entries, matched on
     both their label and their wording), the items the office has added (sermons, branches, events,
     leadership …), the photos (by their friendly name), and the sections themselves. Clicking a
     result navigates to the right page, opens the right section, **opens the matched record and
     scrolls it into view** (`pitem.is-focus`) — or, for a line of page text, highlights that line.
     A hit for another page survives the route change via a `keepView` ref, so the drawer does not
     snap back to its landing view.
   - **Per-edit Undo.** `src/lib/cms.ts` now keeps a stack of the previous value of each section
     (`pushEditUndo`, coalescing bursts within 1.6 s so typing a sentence is one undo) and exposes
     `undoEdit()` / `state.canUndoEdit`. The bar's **Undo** button takes back the last change; the
     stack is cleared on discard, import and a successful publish. *Discard* is still the
     throw-everything-away action, so the two are distinct.
   - **The bar.** `Editing + page name + unsaved pill`, then the gold **"What do you want to
     change?"** (the way into the drawer), then Undo, Discard, Publish, a **Guides** toggle that
     hides the dotted underlines and photo outlines (`[data-guides="off"]`, persisted) so the office
     can look at the finished page, the connection pill (now "Connected" / "This device only"), a
     **help** button, and the grouped backup / open-live-site pair.
   - **The help modal** ("How to update the website") is five numbered steps in the office's words,
     the guides checkbox, and the note that only the church name and the logo are fixed. It is
     reachable from the bar *and* from the drawer.
   - **Signed out, the drawer is gated** (`canEdit`): instead of the job list it shows a lock, "Sign
     in to change the website" and the sign-in button — so the panel never offers editing the office
     cannot publish.
   - **Three bugs found on the way.** (1) The drawer's full-width mode used `width: 100vw`, which
     includes the scrollbar, so on a phone-width layout it hung 15 px off the left edge and ate its
     own left padding — now `width: min(520px, 100%)` (the ICB excludes the scrollbar). (2)
     `LoginGate` never closed its modal on a successful sign-in — it takes an `onDone` now. (3) A
     `.ehelp b { display: block }` rule turned every inline `<b>` *inside* the help paragraphs into a
     block, shredding the sentences — scoped to `.ehelp__title`.
   - **Also tidied:** the dashboard's six "quick job" shortcuts and their CSS were removed (the
     Update tab supersedes them), the drawer's tabs are **Update / Everything / Status** (was *This
     page / Everything / Overview*), the Status tab now leads with publishing state and its wording
     is plain ("Published version", "Waiting to publish"), and the drawer body scrolls to the top on
     every view change.
   - **Verified live:** fresh visit auto-opens the drawer with the welcome card; the 12 job cards
     cover all 53 sections; a search for "sunday" returned words, records and sections in groups and
     clicking a *Watch live page* line navigated there, opened *Watch live page text* and highlighted
     the matched line; a record hit opened its item and scrolled to it; editing a field showed
     "1 unsaved change" and **Undo** restored it and disabled itself; the Guides toggle removed the
     dotted underline (`data-guides=off`) and round-tripped; the help modal, all three tabs (53
     blocks under *Everything*), the sign-in gate and the sign-in flow all worked; no console or
     platform errors and **no mark leakage**; 390×844 has no horizontal overflow, a single-column
     job list and a correctly inset panel, and the dark theme holds up.

35. **Every word, in full.** *"all text on the website should only be edited in the web editor"*
   - **The last gap.** Revisions 33/34 collected JSX text, display attributes and display-valued
     object properties, but a string that sat in an *expression* — the fallback in
     `name.trim() || "Friend"`, a caption written as `{ready && "Ready"}`, a sentence built from a
     template with a plain-value hole — was still invisible to the office. `src/tools/auto-copy.mjs`
     now collects those too:
     - **expression positions.** A literal that a visitor reads but that is neither a JSX text child
       nor a known display attribute (and not a comparison, a call argument to markup/data helpers,
       a property name, a storage key …) becomes its own copy line. The walk up from the literal to
       the root, tracking whether it is *rendered* (`{…}` directly in JSX) or merely *called with*,
       is what decides it: `classify()` returns `expr` only when the operator/JSX context shows the
       words reach the screen.
     - **template literals.** `` `Map of ${city}` `` becomes `ct("auto.<page>.<hash>", { city })`
       with the default stored as `Map of {{city}}`; a hole that is a call/arrow/await or carries a
       quote is refused, and a hyphenated or CSS-looking frame is refused (those are class names).
     - **logical wrappers.** A `binary` ancestor is now only fatal for **comparisons and arithmetic**
       (`kind === "video"`, `count + " items"`); `cond && …`, `x || "…"` and `v ?? "…"` are walked
       *through*, because they are how conditional rendering and fallbacks are written — this is
       what recovered the `|| "Friend"` / `?? "—"` style of fallback.
   - **What it recovered:** 55 new lines (682 → 737 auto entries; 10 files rewritten), all of them
     genuine visitor text — the search box placeholder, the "Open/Close menu" labels, the giving
     toasts and reference messages, the standing-order and legacy-gift letter drafts, the prayer
     wall states ("You are praying", "Mark answered", "Answered!"), the sermon note headings
     (SUMMARY / KEY POINTS / DISCUSSION QUESTIONS / MY NOTES), the watch-live region tabs, the
     ministry meeting cadences. Reviewed before applying (dry run + edit log) — no class name, key
     or comparison was caught.
   - **Deliberately still computed.** A DOM sweep of all 16 routes in `#/admin` (every visible text
     node, minus `[data-ed-ui]`, checked against a corpus of the copy and record values) leaves only
     derived text: clock and relative dates ("Wednesday", "7:00 PM", "in 4 days"), weekday names,
     countdown units ("hrs"/"min"/"sec"), durations ("2 hr"), monogram initials (AO, JK), money
     ("US$25") and record text truncated to an ellipsis. Nothing hard-coded and readable remains
     outside the copy layer and the records.
   - **The drawer's text field** now warns that a `{{name}}` token is filled in by the page and must
     be kept where the value should appear (`cmsSchema.ts`). Verified live: build green, all routes
     render with no console or platform errors.

36. **All editing happens in the panel — the page itself is read-only.**
   *"every edit should be done in the everything part of the website editor, even the text changes
   should be done there, remove the underlined text that shows on the preview"*
   - **What changed.** The in-place click-to-edit layer is gone. `ct()` (`src/data/copy.ts`) now
     returns plain text and never wraps a string in its copy key, so nothing on the page is marked;
     `src/pages/Admin.tsx` no longer starts the post-commit DOM pass, and the two modules that
     implemented it — `src/lib/editstate.ts` (the private-use marks) and `src/lib/editdom.ts` (the
     pass that turned them into `<span class="ed-copy">` click targets and tagged photos) — were
     deleted. `Router` no longer calls `setEditMode`, and `<Rich>` (`src/components/ui.tsx`) renders
     its markup straight into the page with no `data-copy` wrapper.
   - **No preview decoration.** With no marks there is nothing to wrap, so the dotted gold
     underlines, the photo outlines and the `.ed-active` ring never appear — the editor shows the
     page exactly as a visitor sees it. The bar's **Guides** toggle and the help modal's
     "Show the dotted underlines" checkbox were removed (they could no longer do anything), as was
     the "Two ways to change anything" tip card.
   - **The drawer is the only door.** The drawer now opens on **Everything** (`PanelMode` defaults
     to `all`): all 53 sections in 9 groups, with the same search box. Opening a section from a
     search hit, from a cross-reference or from the Status tab lands in that tab too. The words of
     every page are ordinary fields there (*Page text*), the photos are rows in *Photos & covers*,
     and the records are the rest of the sections — so text, photos and records are all edited the
     same way.
   - **The click editors are gone with it.** `CopyEditor`, `PhotoEditor`, `Popover`, `useAnchor` and
     `rectOf` were removed from `src/pages/Admin.tsx`; the copy markup hint is unchanged (the
     drawer's text field still names `*italics*`, `**bold**` and links), and the help modal now
     describes the drawer flow instead of clicking the page.
   - **Verified live:** every route renders with zero `[data-copy]`/`.ed-copy` nodes, no stray
     private-use characters and no underlines, in both the editor and the public site; editing the
     giving hero headline from the drawer's *Page text* list changed the page as it was typed
     (emphasis preserved) and reverting it cleared the unsaved-changes count; the help modal shows
     four drawer steps; no console or platform errors.

## 37. Segment-by-segment editing, fixed buttons & titles, and video that plays on the page

> *"this is not the website editor i want, i want an editor where every segment can be edited
> leaving nothing behind, only buttons, page titles, each segment titles of the page cannot be
> edited, in the watch live put a screen that can be watch directly from the website which can be
> edited for youtube and facebook stream, remove the tune in segment, for last message and previous
> sermons put a youtube and facebook link that shows the video directly from this website and also
> an option to upload videos"*

- **Page text now arrives grouped into the page's own segments.** A text section no longer prints one
  flat list: `copySegmentsOf(pageId)` (`src/data/copy.ts`) groups the lines by the first two dotted
  parts of their id — `home.sermons.title` → *Latest sermon*, `live.watch.*` → *Watch here* — keeps
  the groups in page order, names each one from the first entry's label (the part before an em-dash,
  minus words like *headline* / *paragraph* / *button 1*), and puts the recovered chrome last as
  *Buttons, labels & small words*. `ListBlock` in `src/pages/Admin.tsx` renders those groups as
  headed sub-lists, so the office works through a page the way a visitor reads it and nothing on the
  page is missing from the panel.
- **Buttons, page titles and section titles are fixed.** `CopyEntry.role` is `button` | `pageTitle` |
  `sectionTitle`; `inferRole()` works it out for the hand-written ids (a `.head.title` / `.head.eyebrow`
  is a page title, a label saying *button* is a button, any other `.title` / `.eyebrow` is a section
  title) and `roleOf()` in `src/tools/auto-copy.mjs` records it for the recovered ones from the
  element they sit in (`<Btn>` / `<IconBtn>` / `<button>` / a `btn` class, a `label`–`aria-label`–`title`
  on one, a direct child of `<h1>`–`<h6>`, a heading prop on `SectionHeading` / `PageHead`). 428 lines
  are fixed, 700 editable. A fixed line is **shown but not editable** — dimmed with a `Fixed · Button
  caption` tag and its value in plain text — so "nothing is left behind" still holds. Enforced in
  four places: the drawer renders the read-only row, `setCopyValue()` refuses a fixed id,
  `bindCopyPage()` never stores one (and drops a stale stored one), and `mergeSection()` in
  `src/lib/cms.ts` ignores a stored fixed value from an older save. `copyPageList()` reports the
  shipped wording, so what the code ships is what everyone sees.
- **Watch live is a screen that plays on the page.** The panel keeps the LIVE badge / next-service
  countdown, but under it the player is always there: the configured YouTube or Facebook stream when
  one is set (with the existing segmented switch when both are), otherwise the most recent message,
  otherwise the *stream opens here* notice. A button row under the player opens either platform, and
  the live section's fields are now named *YouTube stream link* / *Facebook stream link* with hints
  that the stream plays on the site.
- **The "Tune in" segment is gone.** The *Broadcast partners* section (eyebrow *Where to tune in*)
  was removed from `/watch-live`; `LIVE.broadcasts`, its schema field and its five copy lines were
  deleted with it. The *Ways to watch* cards (`watchOptions`) stay.
- **Last message & previous sermons play in place, from YouTube or Facebook.** New `SermonWatch`
  (`src/components/blocks.tsx`): a card whose player is on the card — the visitor never has to leave
  the site — with a button per configured platform (`YouTube` / `Uploaded video`) that switches the
  player's source, a *Notes & discussion* link to the message page, and an *Open on …* link out. It
  is used for *Last message*, *Previous sermons* (the broadcast archive), *Recent services* (catch
  up) on `/watch-live` and for the *Previous sermons* strip on a sermon page. The message already
  playing at the top is filtered out of the lists below it so nothing appears twice.
- **Videos can be uploaded.** `VideoSource`/`VideoPlatform` gained `upload`; `fileSrc()` returns the
  file address and `VideoPlayer` renders a `<video controls playsinline preload="metadata">` for it
  (YouTube and Facebook still use an `<iframe>`). The sermon section gained a `video` field type with
  `uploadUrl`, wired to `VideoUpload` in `src/components/editor.tsx`, which uploads through
  `root.uploadPlugin` and — if the file is too large for permanent storage — retries with a one-year
  expiry and tells the office the date, pointing them at YouTube/Facebook for a permanent home.
- **Verified live:** `/watch-live` renders six sections in the right order with no *Where to tune in*
  / *Broadcast partners*, four in-place cards (Last message + three recent services) each with a
  player and two styled buttons; the platform switch swaps the iframe for a `<video>` when a sermon
  has both a YouTube id and an uploaded file; the drawer's *Watch live page text* section shows 17
  named segments with `Fixed · Page title` / `Fixed · Section title` / `Fixed · Button caption` rows
  read-only and everything else editable (typing in a segment updates the page as you type); a search
  hit for a fixed line reports *fixed section title* and opens its segment; every route renders with
  no console or platform errors and no pending changes on a stale draft.

## 38. YouTube "Error 153" — the player now opts back in to sending a referrer

> *"fix the youtube video player configuration error Error 153"*

- **Cause, measured on the live page, not guessed.** The platform page runs with
  `<meta name="referrer" content="no-referrer">`, so *every* request leaves the page with **no
  `Referer` header at all** (proved by echoing the headers back from `httpbin.org/headers`) — and the
  YouTube embed refuses to boot without one: it answers `onError 153`. The exact embed address the
  site is using (`…/embed/<id>?rel=0&modestbranding=1&playsinline=1&autoplay=1`), loaded in the page
  and listened to over the player's own postMessage widget channel, reports
  `readyToListen → initialDelivery → onReady → onError:153`; the same address with
  `referrerpolicy="strict-origin-when-cross-origin"` on the `<iframe>` reports `onReady` and plays,
  with no error.
- **The fix is one attribute in one place.** `EMBED_REFERRER_POLICY` in `src/lib/embed.ts` holds
  `"strict-origin-when-cross-origin"` and the player `<iframe>` in `VideoPlayer`
  (`src/components/blocks.tsx`) applies it, so YouTube — and equally a Facebook plugin iframe — gets
  the domain it needs. A per-element `referrerpolicy` overrides the inherited document policy
  (verified: an iframe pointed back at the page reads `document.referrer` as `""` plain,
  `"https://<publicId>.platform.org/<name>"` with the attribute), which is why the rest of the page
  can stay `no-referrer`. Uploaded videos play in a `<video>` and were never affected.
- **Verified live:** `/watch-live`'s real player iframe carries
  `referrerpolicy="strict-origin-when-cross-origin"`, its address no longer produces `onError 153`,
  the poster and all five thumbnails load, every route renders with no console or platform errors.

## 39. The "Watch here" heading is gone from `/watch-live`

> *"remove this:The screen plays on this page / The service is streamed straight into this page —
> press play and watch without leaving the site. Choose YouTube or Facebook if one of them loads
> better where you are."*

- The first `<Section>` on `/watch-live` no longer opens with a `SectionHeading`: the player panel
  now starts the section, directly under the page head, with the section's own top padding (90px)
  above it — exactly the space the heading used to sit in. The three copy lines behind it
  (`live.watch.eyebrow`, `live.watch.title`, `live.watch.lede`) were deleted from
  `src/data/copy.ts` with it, so the drawer has no dead segment to offer. The two buttons under the
  player are unchanged, but their labels are now *Player buttons — button 1/2* (their segment was
  named after the heading that no longer exists).
- `bindCopyPage()` now also drops a stored wording whose id the code no longer knows
  (`!PAGE_OF[id]`), alongside the old rule for buttons and titles — a removed segment can never
  leave a stale value behind in a saved draft.
- **Verified live:** neither the headline, the paragraph nor the eyebrow appears anywhere in the
  rendered HTML (even with a draft in storage that still carries them); the panel is still one card
  with the stage and the side list side by side (656px / 410px at 1280px); the drawer's *Watch live
  page text* section lists the segments without the removed one; every route renders with no console
  or platform errors.

## 40. Wrong addresses now find their page (and the 404 says what was asked for)

> *"fix this :404 — This page has gone to glory / The link you followed does not exist …"*

- **First, the audit.** Every address the site can produce was checked: all 15 routes, all 51
  `#/…` links rendered across those pages, every literal path in the source (`to=`, `to:`,
  `navigate()`, `href=`), every path in the saved draft, and the drawers' search-hit routes. Not one
  of them lands on the 404. So the page the office saw came from an address typed by hand, an
  outdated bookmark or a link from somewhere else — which is what `resolvePath()` now handles.
- **`resolvePath()` is forgiving** (`src/lib/routes.tsx`): it trims `.html`, doubled and trailing
  slashes, then (1) matches the route table as before, (2) drops extra segments off the end — never
  a purely numeric one, so `/sermons/2024/03/the-storm` is the sermon list while
  `/sermons/the-storm/notes` is the message — and (3) reads the address like a person would, first
  as a known alias (`live`, `home`, `about-us`, `plan-a-visit`, `prayer-request`, `sermon-archive`,
  …) and then by the words it contains (`giving-online` → `/giving`, `locate-us` → `/locations`).
  When it resolves to a different address, `App`/`Admin` rewrite the address bar to the real one, so
  a refresh or a copied link works from then on. `#/admin/live` follows the same rule and stays in
  edit mode. Aliases are only read from the whole address and its first segment — the parts that
  name the page — so junk like `/totally-made-up/address` still reaches the 404 rather than being
  rescued by a stray word. A real route is never rewritten, and an unknown message id is never
  quietly turned into the archive — that stays a 404 on purpose.
- **A message link survives a rough trip.** `sermonById()` (`src/data/sermons.ts`) matches a message
  id exactly first, then with case, spaces and punctuation ignored (`plainId`), so
  `/sermons/Overcoming In Christ` finds the message a chat app mangled. If the "id" names a
  *series* instead — `/sermons/grace`, `/sermons/house-of-faith`, `/sermons/the-school-of-prayer` —
  `SermonDetail` replaces the address with `/sermons?series=…` and shows that series' messages, which
  is what the visitor was asking for.
- **The 404 page now tells you what failed.** It prints the address that was asked for in a dashed
  pill (trimmed to 80 characters, `site.notFound.asked`) and adds a **Search the whole site** button
  (`site.notFound.search`) that opens the header's command palette through
  `OPEN_SEARCH_EVENT` (`src/components/ui.tsx` → `Header`), so a dead end is one tap from a live
  search. The existing ways out (home, sermons, locations, prayer, four cards, the contact link)
  are unchanged.
- **Verified live:** `/live`, `/home`, `/WatchLive`, `/about-us`, `/sermon-archive`,
  `/giving-online`, `/plan-a-visit`, `/locate-us`, `/prayer-request`, `/directions`, `/en/about`,
  `/giving-online-2026`, `/sermons/2024/03/the-storm` and `/sermons/overcoming-in-christ/notes` all
  land on the intended page and rewrite the address; the five series names and `/sermons/grace`
  reach their filtered list; `/sermons/Overcoming-In-Christ` shows the message; `/foo`,
  `/totally-made-up/address` and a bad message id still 404 and show the address that was asked for;
  the search button opens and closes the palette; every real route is untouched, all 51 links still
  resolve, and there are no console or platform errors at 1280 px or 390 px.

## 41. "#/ministries/admin" is the ministries page with the tools on

> *"the 404 is still showing in the admin website fix"*

- **Found by looking at the live page, not the code.** The preview was sitting on
  `#/ministries/admin`: the word `admin` at the *end* of the address. `readLocation()` only
  recognised the prefix form (`#/admin/ministries`), so that address was read as the site path
  `/ministries/admin`, matched nothing, and — since the last revision — did not even reach the
  forgiving resolver, because `/ministries/admin` is exactly the shape `/sermons/<id>` taught it
  *not* to trim. Nothing in the site builds such a link; it is how a person writes "this page, in the
  office's view", so the router now reads it that way.
- **`readLocation()` (`src/lib/router.tsx`) treats `admin` as the office's word wherever it sits:**
  every segment equal to `admin` is taken out, the order of the rest is kept, and the result is the
  page in edit mode. So `#/ministries/admin`, `#/about/Admin`, `#/admin/ministries/admin` and
  `#/ministries/admin/edit` are all the ministries page with the drawer, and the new
  `RouteState.movedAdmin` flag tells the admin shell to settle the URL on the tidy spelling
  (`#/admin/ministries`) so the address bar, a refresh and every link followed from there agree.
  Only the exact word `admin` counts — `/administrator` and `/admin-x` are untouched, and no page
  path contains it.
- **Verified live:** `/ministries/admin` → `#/admin/ministries` (Ministries page, drawer reading
  *Editing · Ministries page*), `/about/Admin` → `#/admin/about`, `/admin/watch-live/admin` →
  `#/admin/watch-live`, `/admin/live` → `#/admin/watch-live`, `/admin/home` → `#/admin`; all 34
  links inside the admin resolve with no 404; every site route still renders in the site shell
  (never the admin shell) with all 51 links resolving, the forgiving addresses from §40 unchanged,
  and no console or platform errors.

## 42. Every photo and cover on the site is uploadable and reversible

> *"make sure the website can upload and edit photos and cover images"*

- **Audited the whole picture pipeline rather than one screen.** There are 20 shared photos
  (`PHOTO_SLOTS`) in four drawer sections (*Main photos*, *Ministries & programmes*,
  *Leadership photos*, *Sermon series covers*) plus a photo of its own on every record —
  leadership, branches, ministries, events, series covers and per-message covers. All of them go
  through one control (`ImageField`, `type: "image"` in `src/components/editor.tsx`), and every one
  of them was walked in the live editor: an upload button, a box for pasting an address, and a
  caption saying which picture is in use.
- **Uploading is verified end to end**, not just read: a file pushed through the real file input
  (`DataTransfer` → `change`) is shrunk by `compressImageBlob`, hosted by `upload-plugin`, stored
  by `cms.setSectionValue`, and appears on the page — tested on a shared slot (the home banner) and
  on a record (a ministry photo), then reverted.
- **Only two ways to set a picture, by request.** The shared-photo strip and the dropdown of names
  are both gone (`ImageField`, `src/components/editor.tsx`): the control is now the preview, a
  caption saying which picture is in use, **Upload a photo**, and a box for pasting the address of
  one. The pasted-address box stays empty while a photo of ours is in use, so the raw bundled path
  is never shown to the office.
- **New: nothing breaks when a picture is cleared.** `photoOr(value, fallbackKey)`
  (`src/data/photos.ts`) renders a bundled photo when a record has none — branches, events,
  ministries, series covers, the feature banner and the Locations banner all use it — and a
  message's card falls back to its series cover. Before this, clearing a branch's photo put
  `<img src="">` on the page. The drawer shows the same fallback in its preview and says so
  (`fallbackPhoto` / `emptyNote` on the field definition, e.g. *“No photo of its own — the site's
  own picture shows here.”*, or *“…their initials are shown instead.”* for a person).
- **Fixed wording that misled:** a message's picture was labelled *Still image (optional)* with
  the hint *“Used on the card when the video is not on YouTube”* — but it is the cover everywhere
  (`sermonThumb` → `posterFor` puts it on the card and behind the player). It is now
  **Cover image**, with a hint and an empty-note that say what an empty value means.
- **Verified live:** all 10 image-bearing sections render the control (upload, paste box, caption)
  with no console or platform errors; the upload and the revert path each move the rendered page;
  a 12-route sweep shows no broken images; at 390 px the control stacks (photo above the controls —
  `@media (max-width: 620px)`) with no page overflow.

## 43. An uploaded video makes its own cover picture

> *"for the uploaded videos create a cover image from the uploaded videos"*

- **The gap.** A message that plays from YouTube gets a still from YouTube, and a message that
  plays from Facebook gets its series cover — but a message whose video the office *uploaded* had
  nothing: `posterFor()` returns the fallback for `platform: "upload"`, so the card showed the
  series cover and the player opened on a blank frame until the office found a picture by hand.
  Now the cover is taken out of the video itself.
- **How the picture is taken** (`captureVideoFrames`, `src/lib/store.ts`). The file is played in a
  hidden `<video>` (a `blob:` address for a file the office just chose, so the canvas is never
  tainted; a plain URL for a video already hosted, fetched with `crossOrigin="anonymous"` — the
  upload host allows it). It steps through five moments between 10 % and 85 % of the running time,
  draws each on a canvas at up to 1280 px, encodes it as JPEG, and scores it on brightness spread
  (the liveliest, best-exposed frame wins — not a black frame or a fade-in). Files that hide their
  length (a WebM straight out of a recorder reports `Infinity`) are measured by seeking past the
  end first, which is what makes more than one frame available at all.
- **Where it lands.** The sermon's *Upload the video* field now declares `coverPath: "poster"`
  (`src/lib/cmsSchema.ts`), and the new `VideoField` (`src/components/editor.tsx`) writes the
  chosen frame into the record's **Cover image** field on the same record — the two fields write
  through `getSibling` / `setSibling`, so nothing about the cover pipeline changed: the card
  (`sermonThumb`), the player poster and the drawer's own `ImageField` all read the same value.
- **The office stays in charge.** A video uploaded with no cover of its own gets one straight
  away; a message that already has a cover keeps it, and the control then offers *Take a cover
  from this video*. A dashed *Cover picture for this message* panel shows the picture, how far
  into the video it is (*“about 4 minutes in”*), a **Use a different moment** button that cycles
  through the frames already found (no re-reading of the video), and **Remove the cover**. Every
  frame is uploaded only when it is chosen, and a video on a site that refuses cross-origin reads
  says so plainly instead of failing silently.
- **Bug fixed on the way:** two writes to one section inside an async flow (the video address,
  then the cover) could lose the first. `patch()` in `Admin.tsx` rebuilt the section from the copy
  the *render* was given, and no render happens between two awaited writes — the cover write put
  back a version of the record that predated the video. It now patches the newest draft
  (`cms.getDraft()`), which is correct for any two edits landing close together.
- **Verified end to end:** a real WebM driven through the file input (`DataTransfer` → `change`)
  uploaded, produced five moments, wrote both the video address and a cover, and the sermon page
  then rendered `<video src="…webm" poster="…jpg">`; cycling to another moment swapped the cover
  and kept the video; *Remove the cover* cleared the picture and left the video alone; a *pasted*
  file address took a cover too (the CORS path). Checked visually at desktop and 390 px.

## 44. Publish saves the website itself, so the content is live for everyone

> *"when the publish is click the admin website is automatically saved and visible in the main website"*

- **The gap.** While the generator itself is unsaved it has no public address, and the content server
  `#/admin` talks to is the preview emulator — which forgets everything on the next reload. So a
  publish could look successful and still reach nobody. Now pressing **Publish** does both jobs:
  it saves the website, then publishes the content to the saved site's permanent server, where it
  is live for every visitor and survives reloads.
- **How the save is asked for.** The preview is a frame inside the platform editor tab, so the
  generator cannot save itself — but the editor listens for one message from the frame it hosts
  (`saveKeyboardShortcut`) and then runs its own "is this browser allowed to save this generator?"
  check. `cms.requestWebsiteSave()` posts exactly that (only when `window.parent !== window`, i.e.
  only inside the editor), and `websiteIsUnsaved()` reads the platform's `generatorIsUnsaved`.
- **The content travels across the save.** Saving swaps the preview server for the permanent one,
  which reloads this page — so the publish is written down first
  (`wom.cms.publishAfterSave`: the note plus a full snapshot of what the office was looking at) and
  finished on the next load by `resumePlannedPublish()` (`src/lib/cms.ts`), called once the socket
  is up and the tab's session is restored. If the editor saves without reloading, the modal's own
  loop finishes it in place. `publish(note, content)` gained the optional snapshot for exactly this.
- **Nothing is lost in the swap.** `syncFromServer` now notices the first time it meets a permanent
  server that knows nothing while this browser still holds published content (the office saved from
  the editor's own toolbar instead of pressing Publish): it queues that content as *pending* and
  sends it, rather than letting the site quietly fall back to the shipped words.
- **It is honest when it cannot.** The Publish dialog says up front that the website is not saved
  yet and that publishing saves it; while saving it shows a spinner and the button reads *Saving
  the website…*. With nothing to publish the button reads *Save the website* and still asks for the
  save — saving the site is the point of Publish while it is unsaved. If the save does not happen
  within ~14 s (not the owner, not signed in to platform, no editor around) it says so, keeps the
  draft **and** the waiting publish, and asks for the editor's own **Save** (Ctrl+S) — the publish
  finishes by itself after that.
- **Verified end to end** in the live editor, without ever saving the user's generator: the message
  posted to the parent frame was captured (`{type:"saveKeyboardShortcut"}`); the plan held the note
  and all 53 sections including the edit; on the "website is saved" signal the publish ran (rev
  bumped, the override carried the edit, the modal closed with *“Saved, and published — every
  visitor sees the new content right away.”*); the reload path was exercised through a forced
  reconnect; and the not-saved fallback appeared after its timeout with the draft and the plan both
  kept. The notice that used to sit at the top of every drawer tab was removed at the church's
  request — the Publish dialog is the one place that says the website is not saved yet.

## 45. The Page text sections open on the paragraphs

> *"in the page text like only the ones with paragraphs"*

- **What the office sees.** Each *Page text* section (and the *The words on every page* job) now
  opens on the lines that are actually paragraphs — the church's own wording, under its own segment
  headings (*Hero*, *Welcome*, *Latest sermon* …), each in a box as tall as its sentence so the whole
  thing can be read while it is edited.
- **Everything else is one click away, never gone.** The site's own buttons and titles (which cannot
  be reworded) and the small words around them — labels, placeholders, tooltips, button captions and
  the email templates behind the forms — collect into a single closed group at the foot of the
  section, *The small words, buttons & titles (N)*, which opens on click. Nothing became
  uneditable, and the drawer's search still finds all of it.
- **The line decides, not the typing.** `copyIsParagraph(id)` judges from the *shipped* wording (a
  newline, 80+ characters, or a sentence of 40+), so a box can never change shape, or a line move
  between the two halves, while someone is mid-sentence. A line the office has already reworded
  always stays up top (`copyIsEdited`), wherever it lives.
- **Verified live:** with the paragraphs up top and the closed group below, editing still writes
  through to the draft (a test edit to a hidden small word showed the drawer's "1 unsaved change"
  and reached the draft, and was then undone); the closed row renders as one tidy row with a
  *Show* affordance; every page-text section keeps its segment headings.

## 46. Only the lines themselves, in the Page text sections

> *"remove this: Home page text / Page text / The hero, the welcome section and every section heading
> on the front page. While you type, \*stars\* … Lines marked Fixed are the site's own buttons and
> titles. / Hero / Hero paragraph / We are Christ-centered, …"*

- **The help paragraph is gone.** The markup reminder (*\*italic\*, \*\*bold\*\*, `[a label](/giving)`,
  `{{curly braces}}`) sat at the top of all sixteen page-text sections and said the same thing every
  time; the sections worth of it is removed, and the one place it is still useful — the drawer's **?**
  *How to update the website* note — carries a single line of it.
- **The segment headings went too.** Each line already says where it belongs (“Hero paragraph”,
  “Ministries — paragraph”), so printing *Hero* above *Hero paragraph* was the same words twice. The
  lines still come in page order; they are simply one flat list under the section's own title now.
- **Nothing else changed:** the section (title, its lines, their captions and boxes) is exactly as it
  was, the boxes no longer clip a long sentence (`field-sizing: content`, with `rows` from the shipped
  wording as the fallback), and the closed *The small words, buttons & titles (N)* group at the foot
  of each page still holds everything that is not a paragraph.

## 47. The hero paragraph became furniture — and left the editor

> *"remove this: Hero paragraph / We are Christ-centered, People of Accountability & integrity,
> Relationship designed and We are people of Excellence (CARE)."*

- **The row is gone from the drawer.** The hero's lede no longer appears in the *Home page text*
  section (or in the **Everything** tab, or in the search box): that section now opens on
  *Welcome — paragraph*, *Latest sermon — paragraph*, … — six paragraphs instead of seven, with the
  closed *The small words, buttons & titles (42)* group still at its foot. Nothing was left behind:
  the entry is filtered out of the section's segments (`copyIsLocked`) *before* the prose list and
  the closed group are built, so no empty box or stray caption remains.
- **The sentence itself stays on the hero.** It was not deleted from the site: visitors still read
  the CARE statement under *Where **Champions** are raised in Christ*, exactly as before. The line
  simply stopped being the office's to reword.
- **Why a new `locked` flag rather than a `role`.** The three roles are *shown* (dimmed, in the
  closed group) because the office should still be able to see the button captions and titles the
  code owns. This line was asked to be *removed*, so it needed the opposite: a fourth kind of
  furniture — a line marked `locked: true` in `src/data/copy.ts` — which `copyIsLocked(id)` reports
  and which the drawer's page-text section drops entirely.
- **Locked means locked everywhere.** `copyIsFixed(id)` now answers true for a locked line as well
  as for the three roles, which is the one question `setCopyValue()` (refuses the write),
  `bindCopyPage()` (drops a stored wording, and no longer counts it as a real change when deciding
  whether a published page means "put the originals back"), and `mergeSection()` in `src/lib/cms.ts`
  (ignores a stored value from an older save) all ask — so a stale draft or an old published blob
  can never put a different sentence back in the hero. `searchEverything()` skips locked lines, so
  searching for *Christ-centered* or *Excellence* returns no hit that could not be opened. Verified
  live: the drawer shows no such row anywhere, the hero still shows the sentence, editing another
  line still writes through to the draft and undoes cleanly (`pendingLocal: false`), and the console
  and the engine reported nothing.

## 48. The watch-live page's paragraphs left the editor too

> *"remove this: Page — paragraph / Every Sunday we go live from the Cathedral … / Last message —
> paragraph / … / Player — hint under the player / Both streams are the same service … / No stream
> set — text / … / Live — paragraph / … / Streaming note under the player / … / Live — notice under
> the player / … / Catch up — paragraph / … / Previous sermons — paragraph / … / The small words,
> buttons & titles (76) / Put this back to the original"*

- **What was pasted.** A drag-selection of the whole *Watch live page text* section as the drawer
  shows it: its nine paragraph rows in the order the drawer lists them (`live.head.lede`,
  `live.last.lede`, `live.platform.hint`, `live.fallback.text`, `live.live.lede`, `live.where.text`,
  `live.preview.note`, `live.replay.lede`, `live.past.lede`), then the closed group's own summary
  line and the section's *Put this back to the original* button — i.e. everything visible from the
  first row to the foot of the section.
- **The nine lines are now locked furniture** (`locked: true` in `src/data/copy.ts`, SPEC note 47's
  mechanism, so `copyIsLocked()` reports them, `copyIsFixed()` protects them, and
  `searchEverything()` skips them). The *Watch live page text* section therefore opens with no
  paragraph rows at all: it shows its closed *The small words, buttons & titles (76)* group and the
  reset button, and nothing named above appears in the drawer, in the **Everything** tab or in the
  search box.
- **The live page itself is untouched** — the same treatment as the hero paragraph: visitors still
  read every one of those nine lines exactly where they were (`/watch-live` verified live: the page
  head's paragraph, the preview notice under the player and the rest all still render, and the
  page's buttons, titles and small labels were never in question). If the church wants any of them
  *off the page* rather than merely out of the editor, the fix is two lines per line: drop the entry
  from `COPY_PAGES` in `src/data/copy.ts` and remove the element that renders it in
  `src/pages/WatchLive.tsx` (`ct("live.where.text")` and friends) — the copy is quoted above so
  nothing is lost.
- **Unlocking** is the same as for the hero: delete `locked: true` and the line is the office's
  again (it returns to the top of the section, `copyIsParagraph` deciding whether it gets a box).

## 49. Twenty-five more paragraph rows out of the editor

> *"remove this: Accountable, approachable and available. Our pastors and deacons are not
> celebrities — they are shepherds with phone numbers. / The small words, buttons & titles (26) /
> Put this back to the original. Watch live page text / Page text. Sermons page text … [the dump
> runs on through every remaining page-text section] … My library page text / Page text. Site-wide
> text / Page text"*

- **What the paste was.** A drag-selection of the *The words on every page* panel from the About
  text section down to the last section — so it carried the section titles, the *Page text* group
  labels and every closed group's summary line along with the rows. As with SPEC note 48, the part
  that is an *item* rather than the panel's own frame is the paragraph rows, so those are what went.
- **The 25 rows locked** (`locked: true`, the mechanism of SPEC note 47) are the ones the selection
  actually contained — the rows of the sections that were open as it was made: `about.leaders.lede`
  (*Leadership — paragraph*), all three of the Sermons page's paragraphs, both of the Sermon page's,
  all four of the Events page's, all nine of the Testimonies page's, and all six of the Plan a visit
  page's. Those six sections now open on nothing but their closed *The small words, buttons &
  titles (N)* group and the reset button, and none of the 25 captions or sentences appear in the
  drawer or in the search box any more.
- **What was deliberately left alone.** The sections the selection only *named* (their rows were
  collapsed and so were never in it) still show their paragraphs: *Giving* (17), *Prayer* (14),
  *Contact* (6), *Locations* (7), *Ministries* (6), *Devotional* (6), *My library* (5) and
  *Site-wide* (4); so do the four About rows above the one that was pasted (*Page — paragraph*,
  *Pledge under the cards*, *Our story — paragraph*, *Beliefs — paragraph*) and the Home page's six.
  Locking a line the church never pointed at would be a *bigger* change than the one asked for, and
  it is one word of instruction away — say so and it goes the same way.
- **The website is untouched.** As with the hero paragraph and the live page's paragraphs before it,
  the copy stayed on the site: `/about` still shows *Accountable, approachable and available …*,
  `/sermons` its page lede and series lede, `/events` its newsletter paragraph, `/testimonies` its
  page lede and share paragraph — all verified live, with the draft clean (`pendingLocal: false`).
  If any of it should come *off* a page rather than out of the editor, the recipe is in SPEC note 48.
- **How a locked line behaves** is untouched by this change: `copyIsFixed()` protects it from a
  stored wording (`bindCopyPage` / `mergeSection`), `copyIsLocked()` keeps the drawer's page-text
  section from listing it, and `searchEverything()` skips it so a search can never return a hit that
  cannot be opened.

## 50. The remaining page-text paragraphs left the editor

> *"remove this: Watch live page text / Page text / Sermons page text / Page text / Sermon page text
> / Page text / Events page text / Page text / Giving page text / Page text / Prayer page text /
> Page text / Testimonies page text / Page text / The small words, buttons & titles (71) / Put this
> back to the original / Plan a visit page text / Page text / The small words, buttons & titles (74)
> / Put this back to the original / Contact page text / Page text / Locations page text / Page text /
> Ministries page text / Page text / Devotional page text / Page text / My library page text /
> Page text / Site-wide text / Page text"*

- **What the paste was.** This is the answer to SPEC note 49's closing offer — *“the sections the
  selection only named … still show their paragraphs: Giving (17), Prayer (14), Contact (6),
  Locations (7), Ministries (6), Devotional (6), My library (5) and Site-wide (4) … it is one word
  of instruction away”*. It is a drag-selection of the **Everything** tab's *Page text* group from
  the *Watch live* block down to the last one, so it carries the sixteen blocks' own titles and
  `Page text` group labels (the panel's frame) plus the closed-group summary and *Put this back to
  the original* button of the two blocks that happened to be open (*Testimonies*, *Plan a visit* —
  empty since SPEC note 49). No paragraph row is in it, because the six sections it starts with have
  no rows left. The named sections are therefore the instruction, and the rows they still hold are
  what goes.
- **The 65 rows locked** (`locked: true`, the mechanism of SPEC note 47):
  - *Giving* (17) — `giving.head.lede`, `giving.reference.note`, `giving.reference.qrText`,
    `giving.reference.warning`, `giving.alloc.note`, `giving.alloc.audit`, `giving.bank.note`,
    `giving.standing.text`, `giving.mobile.text`, `giving.legacy.text`, `giving.integrity.text`,
    `giving.log.note`, `giving.verse.text`, `giving.help.text`, `giving.faq.text`,
    `giving.faq.still.text`, `giving.thanks.text`;
  - *Prayer* (14) — `prayer.head.lede`, `prayer.side.how.1`–`.4`, `prayer.side.urgent.text`,
    `prayer.mine.note`, `prayer.wall.empty.text`, `prayer.wall.note`, `prayer.scriptures.lede`,
    `prayer.intercessors.text`, `prayer.learn.text`, `prayer.answered.text`, `prayer.sent.text`;
  - *Contact* (6) — `contact.head.lede`, `contact.card2.note`, `contact.card4.note`,
    `contact.form.lede`, `contact.privacy`, `contact.side3.text`;
  - *Locations* (7) — `locations.head.lede`, `locations.noMatch`, `locations.geo.denied`,
    `locations.groups.lede`, `locations.card1.text`, `locations.card2.text`, `locations.card3.text`;
  - *Ministries* (6) — `ministries.head.lede`, `ministries.list.lede`, `ministries.teams.lede`,
    `ministries.form.lede`, `ministries.fit.text`, `ministries.safeguard.text`;
  - *Devotional* (6) — `devotional.head.lede`, `devotional.read.note`, `devotional.reflect.text`,
    `devotional.memory.note`, `devotional.streak.text`, `devotional.mail.lede`;
  - *My library* (5) — `library.head.lede`, `library.saved.empty`, `library.notes.empty`,
    `library.privacy`, `library.clear.text`;
  - *Site-wide* (4) — `site.notFound.lede`, `site.appsTip`, `site.toastClipboardFailed`,
    `site.toastStorageFull`.
  The other six sections the paste names (*Watch live*, *Sermons*, *Sermon*, *Events*,
  *Testimonies*, *Plan a visit*) hold no paragraph rows already, so they are unchanged; there are
  now **100 locked lines** in `src/data/copy.ts`. Each of the eight emptied sections opens on
  nothing but its closed *The small words, buttons & titles (N)* group and the reset button — and
  those N are unchanged (78, 93, 64, 33, 48, 48, 55, 211), so not one label, placeholder or tooltip
  was lost.
- **Home and About are untouched on purpose** — the paste does not name them, so their paragraphs
  stay the office's: *Home page text* still opens on six rows and *About page text* on four
  (`about.head.lede`, `about.pledge`, `about.story.lede`, `about.beliefs.lede`). Locking a line the
  church never pointed at would be a bigger change than the one asked for; naming them is one
  message away.
- **The website is untouched.** As with SPEC notes 47–49, only the editor changed: verified live
  that `/giving` still shows *Your tithes and offerings keep the lights on…*, *Bring ye all the
  tithes…* and *Because of your generosity last year…*; `/prayer` its page lede and *Nothing
  strengthens the family…*; `/contact` its page lede and the emergency text; `/locations` its page
  lede and the small-groups paragraph; `/ministries` its page lede and *Take the Next Steps
  class…*; `/devotional` and `/library` their page ledes — with the draft clean (`pendingLocal:
  false`, `rev 1`, overrides `["live"]` only) and nothing on the console or in the engine's report.
- **The search box agrees.** A search for a locked sentence (*don't wait on a form*, *four
  continents*, *audited and published annually*, *Every Sunday we go live*) returns no *Words on the
  site* hit at all, while a Home or About one (*Seven branches across North America*, *God has been
  faithful at every stage*) still finds its line — so no hit can lead somewhere the office cannot
  open.
- **Unlocking** is the same as ever: delete the entry's `locked: true` in `src/data/copy.ts` and
  rebuild — the line returns to the top of its section (`copyIsParagraph` deciding whether it gets a
  box). To take a sentence *off a page* rather than out of the editor, the recipe is in SPEC note 48.

## 51. The page-text sections left the editor (and the photos left the Everything list)

> *"remove this: Sermons page text / Page text / The small words, buttons & titles (30) / Put this
> back to the original / Sermon page text / Page text / The small words, buttons & titles (51) / …
> / My library page text / Page text / The small words, buttons & titles (55) / Put this back to the
> original / Site-wide text / Page text / The small words, buttons & titles (211) / Put this back to
> the original / Photos & covers / Main photos / Photos & covers / Ministries & programmes / Photos &
> covers / Leadership photos / Photos & covers / Sermon series covers / Photos & covers"*

- **What the paste was.** A drag-selection of the **Everything** tab from the *Sermons page text*
  block down to the last block in the list — so it carries the thirteen page-text blocks' own titles
  and `Page text` group labels (every one of them open, so each contributes its closed
  *The small words, buttons & titles (N)* summary and its *Put this back to the original* button),
  then the `Photos & covers` **group heading** and its four sections. It is the answer to SPEC note
  50's closing offer — *“If you actually meant remove those page-text sections themselves from the
  panel, tell me and I'll hide them”* — and it is the tail of the list: Home page text and About page
  text are the two blocks above it, and they stay (a follow-up removed *Watch live page text* too —
  see the last bullet below).
- **A section can now be “not offered”.** Two new flags on `SectionDef` (`src/lib/cmsSchema.ts`):
  `hidden` — the section is dropped from the **Everything** tab, from its **job**, from *Everything
  on this page* (a card that has since left the landing — note 52) and from the **search box**; and
  `everythingHidden` — dropped from the **Everything**
  tab only, still reachable from its job. Both are read through `sectionIsHidden(id)` /
  `sectionIsEverythingHidden(id)`, and the filtering happens in exactly four places: the `groups`
  map and `defsById()` in `src/pages/Admin.tsx`, `searchEverything()` and `sectionsWithoutJob()` in
  `src/lib/jobs.ts`, and the Status tab's pending-section chips in `src/components/editor.tsx`.
  **Nothing in `src/lib/cms.ts` filters anything** — a hidden section's content still loads, still
  applies, still publishes, and still renders on the page; only the drawer stops offering it.
- **The page-text sections are `hidden`** (`HIDDEN_COPY_PAGES` in `cmsSchema.ts`): *Watch live,
  Sermons, Sermon, Events, Giving, Prayer, Testimonies, Plan a visit, Contact, Locations, Ministries,
  Devotional, My library* and *Site-wide* — fourteen of the sixteen. The **Update → The words on every
  page** job now lists only *Home page text* and *About page text*, and the Everything tab's *Page
  text* group holds only those two. The church's sentences are untouched — the paragraph rows were
  already locked (SPEC notes 47–50), and the small words those sections held (labels, placeholders,
  tooltips, email templates) simply stop being the office's to reword. Any one comes back by deleting
  its id from `HIDDEN_COPY_PAGES`.
- **The four photo sections are `everythingHidden`, not `hidden`** — they are gone from the
  Everything tab's list, but *Photos & covers* is now reachable only from **Update → Photos &
  banners**, where all four (*Main photos*, *Ministries & programmes*, *Leadership photos*, *Sermon
  series covers*) still work exactly as before, upload and paste-a-link boxes included. That is
  deliberate: **the church asked for photo editing** (*“make sure the website can upload and edit
  photos and cover images”*, SPEC note 42) and the office has to be able to swap a series cover or a
  photo of a person, so the capability was kept while the list it was pointed at lost the entries. If
  the whole group should leave the drawer as well, add `hidden: true` beside `everythingHidden` (or
  move the four ids into a hidden set) — it is one word of instruction away.
- **The website is untouched**, as with every request of this kind: verified live that `/giving`,
  `/prayer`, `/contact`, `/locations`, `/ministries`, `/devotional` and `/library` all still render
  the sentences those sections hold, the drawer's draft is clean (`rev 1`, overrides `["live"]`,
  `pendingLocal: false`, `dirty: false`), and nothing reached the console or the engine's report.
- **The search box agrees.** A line from a hidden section (*Scan to share this giving page*) returns
  no hit at all, while a Home or About line (*years of ministry*) still finds its own — so a search
  can never lead somewhere the office cannot open.
- **A follow-up took *Watch live page text* too.** The very next message was *"remove this: Watch live
  page text / Page text"* — exactly the boundary this note flagged — so `"live"` joined
  `HIDDEN_COPY_PAGES`, making **fourteen** hidden page-text sections; the drawer now offers only *Home
  page text* and *About page text*. Verified live: both the Everything tab's *Page text* group and
  Update → *The words on every page* list just those two; a search for *Join us, wherever you are*,
  *Both streams are the same service* or *Every Sunday we go live* returns nothing; `/watch-live` is
  untouched (its head and its sections still render, and the two lines that were absent — the *both
  streams* hint and the *Previous sermons* band — were already conditional on the stream/broadcast
  data, which nothing here changes).

## 52. The landing stopped offering "everything on this page"

**The message, verbatim:**

> remove this:On this page right now
>
> Everything on this page
> Home page — its words, the items it shows and its photos.

A drag-selection of the top of the **Update tab's landing** (`UpdateHome` in `src/pages/Admin.tsx`):
the heading *On this page right now* and, under it, the wide card *Everything on this page* with its
blurb `Home page — its words, the items it shows and its photos.` (built from `page.label` — the page
the office happens to be looking at). Both are gone from the panel.

- **What left.** The `<p class="epanel__group-title">On this page right now</p>` line, the
  per-route job card, the `thisPageJob` object in the drawer (the job lookup now reads `JOBS`
  directly) and the `page` prop of `UpdateHome`, which was only there to name the card's page. The
  landing is now the welcome note (until dismissed), a single group heading and the eleven whole-site
  jobs.
- **The heading above the jobs had to change too.** It read *"Or pick a job for the whole site"* —
  the "Or" pointed at the per-page card, so with the card gone it reads **"Pick a job for the whole
  site"**. The drawer header still names the page the office is on (*Home page*, *Giving page*, …), so
  they can still see where they are.
- **Nothing became unreachable.** The per-page listing in `src/lib/pageMap.ts` names the blocks each
  page prints, and every one of those ids is also in a whole-site job (`src/lib/jobs.ts`: *the words
  on every page*, *photos & banners*, *service times & campuses*, …) and in the Everything tab, which
  is the drawer's default tab anyway. Verified live that all eleven jobs still open their sections
  (e.g. *Giving* → Giving funds / Where giving goes / Bank details / Ways to give / Giving questions),
  that the back link returns to the landing, and that the Update landing renders the same on
  `#/admin`, `#/admin/giving` and `#/admin/sermons` with the right page name in the header.
- **The help text was lying, so it was rewritten.** *"read how this works"* step 1 said *"browse the
  site and press **Everything on this page**"* — that button no longer exists. It now reads: *"…then
  pick the job that sounds closest — the words on every page, the photos, the service times, the
  giving. The box at the top searches every word, photo and detail…"*.
- **`pageMap.ts` keeps its `sections` data** even though nothing reads it now: it is the honest
  description of what each page is made of, and putting the card back is one block in `UpdateHome`
  plus the `page` prop. Its header comment and the `JOBS` comment were updated to say so.
- **The website is untouched**, as with every request of this kind: `/` and `/giving` still render
  their full content (hero, welcome, giving steps and questions), the drawer's draft is clean (`rev 1`,
  overrides `["live"]`, `pendingLocal: false`, `dirty: false`), and neither the console nor the engine
  reported anything on a fresh load. Checked visually too: the panel shows the new heading, no
  *Everything on this page* card, and all eleven job cards intact.

## 53. The drawer's words changed (and a "found section" bug it uncovered)

**The message, verbatim:**

> the Website editor should be replaced with Admin Access, Update button should be replaced with Edit,
> the Everything button should be replaced with Update

Three labels, one panel (`src/pages/Admin.tsx`):

| Where | Was | Now |
| --- | --- | --- |
| Drawer header (`epanel__brand b`) | *Website editor* | **Admin Access** |
| First tab (the office's job list, `PanelMode` `"edit"`) | *Update* | **Edit** |
| Second tab (every section, `PanelMode` `"list"`) | *Everything* | **Update** |
| Welcome note on the landing (`EditHome`) | *Welcome to your website editor* | **Welcome to Admin Access** |

- **Everything else that named a tab followed.** The empty-search line read *"Try fewer words, or the
  **Everything** tab to browse"* — the tab it means is now called *Update*, so that is what it says.
  The help modal's step 1 no longer names a tab at all (it was already rewritten in note 52).
- **The internals were renamed to match**, so a future reader is not sent to the wrong tab: the mode
  union is now `"edit" | "list" | "status"` (was `"update" | "all" | "status"`, where `"update"` opened
  the tab now labelled *Edit*), `UpdateHome` became `EditHome`, and the comments that named the tabs
  were updated. Two things deliberately **keep their old word**: the `everythingHidden` flag and
  `sectionIsEverythingHidden()` (they mean "kept out of the full list"), and `searchEverything()`.
  Their doc comments now say so.
- **The bug it uncovered.** While re-checking that each tab still opened what it should, a search hit
  turned out to open **nothing**: the drawer's render branch tested `mode === "list"` (the whole
  section list) *before* `view.kind === "section"`, so the single-section view built by `openHit()`
  was drawn and immediately discarded. The same swallowed three other paths — the **Status** tab's
  *"Home page text"* pending-change chips (`openSection` from `Dashboard`) and the live archive's
  *open the sermons* (`LiveArchivePanel`). The section branch now comes first, with a comment saying
  why, so a found section renders as *one* block with its *"We found this for you"* lede and the
  *All the things you can change* link back to the full list. This is what several earlier notes
  promised for the search box; it was simply not being drawn.
  Verified live: a same-page hit (*years of ministry* → *Home page text*, one block, back link back
  to the 8 groups / 35 sections), a hit for **another** page (*Talk to a pastor* → navigates to
  `#/admin/about`, opens *About page text*, the matched entry highlighted, and `keepView` keeps the
  view through the route change), and a Status-tab chip after a real edit (then **Discard** →
  *Really discard?* → draft clean again: `rev 1`, `dirty: false`, the line back to *years of
  ministry*).
- **Nothing else moved.** The three tabs each still render what they did (the job list with its
  eleven cards, the 8 groups / 35 sections, the Status dashboard), a job still opens and its back
  link returns to the landing, the drawer header still names the page (*Home page*, *Giving page*,
  *Watch sermons page*), the panel's default tab is still the full list, and the website itself is
  untouched (the draft stayed `rev 1`, and a fresh load reports nothing to the console or the engine).
- **When reading older notes (≤ 52), translate**: their *Update tab* is the *Edit* tab, their
  *Everything tab* is the *Update* tab, and their *Website editor* is *Admin Access*. Notes are kept
  as written.

## 54. The "signing your edits" field left, and the jobs heading got a label

**The message, verbatim:**

> remove this: Signing your edits
> e.g. Pastor Michael
> Shown in the activity log beside each publish. replace this with EDITOR'S OPTION:Pick a job for the
> whole site

Two changes, read as: *take the signing field out of the Status tab, and label the jobs heading
"EDITOR'S OPTION:"*.

- **The signing field is gone.** The whole `Field` — its label *Signing your edits*, its input with
  the `e.g. Pastor Michael` placeholder, and its hint *"Shown in the activity log beside each
  publish."* — left the first card of the Status dashboard (`src/components/editor.tsx`). The card now
  runs *Where things stand → the four rows → the pending-change chips (when there are any)*. The
  `<h3>` and the `<dl>` are all that is left of it.
- **The heading was relabelled, not rewritten.** "Pick a job for the whole site" is the Edit tab's
  landing label, so it now reads **EDITOR'S OPTION: Pick a job for the whole site** — the same words
  after the colon, which is how the message was written (`EDITOR'S OPTION:Pick a job for the whole
  site`). `.epanel__group-title` is `text-transform: uppercase`, so it renders **EDITOR'S OPTION: PICK
  A JOB FOR THE WHOLE SITE**, which is how the request was typed. In the drawer's real width (~460 px
  beside the page) the label wraps onto a second line; the words are kept exactly as given, so
  splitting it into a small label + heading is a one-line change if wanted.
- **The other reading, noted for the record.** If the second half meant "put that sentence where the
  field was, in the Status tab", it is a one-line insert in the Dashboard — it was not done, because a
  sentence about picking a job has no place in *Where things stand*.
- **Nothing broke with the name gone.** `state.editor` and `cms.setEditorName()` stay in
  `src/lib/cms.ts` (the setter now has no caller) so the field can return, and the places that print
  the name were already defensive — `entry.by ? " · " + entry.by : ""` in the activity log and
  `state.updatedBy ? " by " + state.updatedBy : ""` in the Status card — so a browser that never signed
  simply shows an unsigned publish. Checked live: the Status dashboard, the *Tools & backups* modal,
  the nine-group *Update* tab, the job landing with its eleven cards, and the site itself (home hero,
  welcome, latest sermon) all render, with nothing on the console or the engine's report, and the
  draft still clean (`rev 1`, `dirty: false`, `pendingLocal: false`).

## 55. "EDITOR'S OPTION" stands alone, and the Status tab jumps like the job list

**The message, verbatim:**

> remove this :Pick a job for the whole site. Everything clicked on the ediors option goes directly to
> the exact update area, it should apply to the status too

- **The heading is now just `EDITOR'S OPTION`.** Note 54 had put the label in front of the old
  wording (*"EDITOR'S OPTION: Pick a job for the whole site"*); the sentence after the colon is what
  the office asked out, colon included, so the Edit tab's landing reads **EDITOR'S OPTION** above the
  eleven cards — the same shape as the drawer's other group labels (short, colon-less). Nothing else
  about the landing changed.
- **The Status tab now behaves the way the request describes.** Clicking a job card has always opened
  that job's sections; note 53 had already made a *found section* render, which fixed the Status
  tab's chips, *Edit this activity*, *Manage announcements* and the four *Manage* links. What was
  still missing was everything that **named** site content without being clickable at all:
  - **The four "At a glance" cards** (`Branches`, `Sermons`, `Upcoming activities`, `Ministries`): the
    lede says *"tap one to manage it"*, but only the small *Manage* control was live. The control is
    now stretched over the whole card (`.admin__stat` is `position: relative`, its `button::after` is
    `inset: 0`), so the number and the label open the same section, with hover/focus feedback and an
    `aria-label` (`Manage Branches`, …).
  - **The activity log** printed its changed sections as raw ids — *"…· live"*. Each entry now shows
    labelled chips that open that section (the same `admin__chip` the pending list uses, via
    `sectionById`), and an id the drawer no longer offers falls back to plain text so the history
    still records it.
- **A chip bug fell out of that**: in the log's narrow row the chip shrank to its longest word and
  "Live stream" broke inside the pill. `.admin__chip` is now `white-space: nowrap; flex: none`, so a
  chip is one word-group and the row wraps whole chips instead (checked: one line, 85×29).
- **Verified live**, every Status target: *Edit this activity* → Events & activities, *Manage
  announcements* → Announcements, the four cards → Branches / Sermons / Events & activities /
  Ministries, the log chip → Live stream — each landing on the exact section with its back link; the
  card surfaces were checked with `elementFromPoint` (the number and the label both hit the card's own
  button). The Edit landing still opens its eleven jobs in place (Giving → its five sections), the
  *Update* tab still shows 8 groups / 35 sections, the draft stayed clean (`rev 1`, `dirty: false`,
  `pendingLocal: false`), and the site itself is untouched.

## 56. Every jump lands on the thing itself (and the job cards land in *Update*)

**The message, verbatim:**

> this should take you to where this is in the update when edit this activity is clicked:21 Days of
> Prayer & Fasting / In 1 day · 19:00 · Every branch & online / Edit this activity. this too when
> manage announcements is clicked:2 notices showing on the site / Manage announcements. all this too
> when clicked:&lt;all eleven job cards with their blurbs&gt; remove this:, or read how this works

Reading: **a jump should land on the thing that was clicked, not just its section** — the event the
Status card named, the notice it counted, and (for a job card) that job's content *inside the Update
tab*.

- **The event and the notice are now opened and highlighted.** *Edit this activity* passes the event's
  own id as the entry key (`onOpen("events", nextEvent.id)`) and *Manage announcements* passes the
  first live notice (`onOpen("announcements", live[0].id)`); `Dashboard`'s `onOpen` is typed
  `(id, entryKey?)`. `ListBlock` already knew how to do the rest — it opens that entry, marks it
  `is-focus` and scrolls it in — so the office now arrives on *21 Days of Prayer & Fasting* with its
  fields open and a gold outline, and on *"21 Days of Prayer & Fasting begins this week"* for the
  notices, instead of on a closed section header.
- **The scroll is aligned to the top, not the middle.** The entry is often a long form, and centring
  it pushed its own title off the top — the one thing that says "this is the one you clicked".
  `scrollIntoView` now uses `block: "start"` with `scroll-margin-top: 0.6rem` on `.pitem.is-focus`, and
  the note in the drawer says *"We found this for you — it is highlighted below."*
- **A job card now takes the office into the *Update* tab**, at that job's sections — the same
  destination as a section jump, with the same back link to the full list. The *Edit* tab is the index
  that launches it. Mechanically: the `job` branch moved **above** the full-list branch (where the
  section branch already sits, note 53) and `openJob()` sets `PanelMode` `"list"`. Verified for
  *The words on every page* (2 sections), *Ministries & serving* (5), *Photos & banners* (4) and
  *Giving* (5), each landing in the *Update* tab with the job's heading and blurb, and the back link
  returning to the 8 groups / 35 sections.
- **The landing's last line lost its link.** *"Not sure where something lives? Use the search box
  above, or read how this works."* → **"Not sure where something lives? Use the search box above."**
  (`EditHome`'s now-unused `onHelp` prop went with it). The help screen is still one click away from
  the drawer header's ⓘ button.
- **Verified live**, nothing else moved: the *Edit* tab still shows **EDITOR'S OPTION** with its eleven
  cards, a search hit still opens its exact section and entry, the Status chips and the four *At a
  glance* cards still open theirs, the draft stayed clean (`rev 1`, `dirty: false`, `pendingLocal:
  false`), and the site itself is untouched.

## 57. Two job cards left the landing, and "campus" left the panel

**The message, verbatim:**

> anything campuses should be changed to branches in the admin access. remove this: The words on every page
> Headlines, paragraphs and the small notes — page by page, segment by segment.
>
> Photos & banners
> The pictures across the whole site — upload your own, or paste the address of one.

Two requests in one message: the word *campus* becomes *branch* everywhere the office can read it in
the admin access, and the **first two cards of the *Edit* landing** — *The words on every page* and
*Photos & banners*, each with its blurb — leave the panel. (The paste also carries the heading and the
foot line the drag swept up; those stay, as with every request of this kind.)

- **What left.** The `words` and `photos` entries were deleted from `JOBS` (`src/lib/jobs.ts`), so
  **EDITOR'S OPTION** now lists **nine jobs** in this order: *Service times & branches*, *Sermons &
  the live stream*, *Events & notices*, *Giving*, *Church details & contact*, *Ministries & serving*,
  *About, beliefs & numbers*, *Prayer & testimonies*, *Devotional & verses*. The heading, the welcome
  note, the foot line and the search box above them are unchanged. Both jobs had become thin: the
  *words* card could only reach the two page-text sections the drawer still offers, because the other
  fourteen are `hidden` (SPEC note 51).
- **The photo sections had to move, or the office would have lost the photos.** They were
  `everythingHidden` — kept out of the *Update* list *because* the *Photos & banners* card carried
  them — so with that card gone they would have been reachable only by searching for a photo by name,
  which is not a way to swap a banner. `everythingHidden: true` came off the four photo sections
  (`src/lib/cmsSchema.ts`), so the **Update** tab offers them again under its *Photos & covers* group:
  **9 groups / 39 sections** (was 35), which is now every section the drawer offers. The flag itself
  stays on the type, unused, documented as such. Verified live: *Main photos* opens with its fourteen
  rows, the upload and paste-a-link boxes and the *"The original photo is in use."* note intact, and a
  search for *home banner* still returns the photo and opens *Main photos*.
- **Nothing else became unreachable.** The two surviving page-text sections (*Home page text*, *About
  page text*) were already in the *Update* tab's *Page text* group, which is where they stayed.
- **The coverage guard was re-cut to mean the new thing.** `sectionsWithoutJob()` used to ask "is this
  section in a job?" — a question with no answer once a landing has fewer cards than the content has
  homes. It now asks **"is this section either named by a job, or printed in the full list?"**, and
  skips the `hidden` ones (which are offered nowhere by the church's own request). It reports nothing.
- **"campus" → "branch" in the panel was two strings**: the job title *Service times & campuses* →
  ***Service times & branches*** (`src/lib/jobs.ts`) and the *Branches* section's blurb *"Every campus
  with its address, map coordinates, pastor and local service times."* → *"Every branch with its
  address…"* (`src/lib/cmsSchema.ts`). Every other word in the drawer already said branch (SPEC note
  10): verified live that the panel's rendered text contains *campus* **zero** times — the landing's
  nine cards, the job view, the *Branches* list and an opened branch (whose fields read **BRANCH
  NAME**, **BRANCH PASTOR**, …), the search box and the Status tab. The public site is the same (note
  10 swept it); the two above were the last survivors, both inside the drawer.
- **One "campus" was left on purpose, because the office never sees it:** the `campus` prefix in
  `PREFIXES` (`src/lib/routes.tsx`) only exists so that an old address that still says `#/campus`
  lands on `/locations` — it is a redirect convenience, not wording. The page itself is *Find your
  branch* (verified live: `/locations` renders with no instance of the word at all).
- **The help screen had to follow.** Its step 1 named the two jobs that just left — *"pick the job that
  sounds closest — the words on every page, the photos, the service times, the giving"* — and now
  reads *"…the service times, the sermons, the giving, the church details — or open the **Update** tab
  for the full list of everything in this panel. The box at the top searches every word, photo and
  detail…"*.
- **The website is untouched**, as with every request of this kind: `/` still renders its hero and
  announcement strip and `/locations` its branches, and the drawer's draft is clean (`rev 1`,
  override `["live"]`, `pendingLocal: false`, `dirty: false`) on a fresh load, with nothing in the
  console or the engine's report.

## 58. Every job reaches everything again (the two cards' content moved into the jobs)

**The message, verbatim:**

> fix the error in the edit: i should still be able to make any update by clicking all the options in the edit

Note 57 removed *The words on every page* and *Photos & banners* from the *Edit* landing and, to keep
the photos reachable, put the four photo sections back into the *Update* tab's full list. That left the
drawer honest (everything was reachable *somewhere*) but the ***Edit* tab incomplete**: the words and
the photos were behind no card at all, so "click through the jobs" stopped being a complete way to
change the site. That is the error the office hit, and this note is the fix.

- **The promise, restored.** Every section the drawer offers — 39 — belongs to **exactly one job**
  again, so any change there is can be made by clicking the cards. Nothing was put back as it was: the
  two broad cards stayed gone and the content they carried was folded into the jobs that already look
  after that part of the site.
- **What each job gained** (the rest of the nine are unchanged):

  | Job | gained |
  | --- | --- |
  | *Sermons & the live stream* | *Sermon series covers* (`photos-series`) |
  | *Ministries & serving* | *Ministries & programmes* (`photos-ministries`) |
  | *About, beliefs & numbers* | *About page text* (`copy-about`), *Leadership photos* (`photos-leadership`) |
  | *The home page* (**new tenth job**) | *Home page text* (`copy-home`), *Main photos* (`photos-main`) |

  The three blurb lines that changed say so in the office's words (*"…and the covers they use"*,
  *"…first-timer questions — and their photos"*, *"…headline numbers — and the page's own words and
  photos"*).
- **A job is a *part of the site*, not only its items.** That is the principle the fold follows: the
  office meets the leadership photos where it meets the leadership team, and the ministry photos where
  it meets the ministries. It also means a job's sections are no longer all the same *kind* of thing —
  a list of records, or a page's text, or a group of photos — which is deliberate: the drawer's
  *Update* tab is where "things by type" live, and the cards are where "things by place" live.
- **The tenth job is *The home page*** (icon `home`, last in the list): *"The words on the page visitors
  land on first — and the big photos behind the headlines."* It carries the front page's text section
  and the *Main photos* group — the home banner plus the shared photos used behind the headlines on
  several pages — which is what was left over once the ministry, leadership and series photos had gone
  to their own jobs. It is an **addition**, not a return of the two cards; it is the one card the office
  has not asked for, and the two sections in it are the only ones in the drawer with no other card, so
  if it should go, they need somewhere to go with it.
- **The photos left the raw list again.** With the jobs carrying the four photo sections, `everythingHidden`
  went back on them (SPEC note 57 had taken it off), so the *Update* tab prints its **8 groups / 35
  sections** again and *Photos & covers* is the jobs' business. Verified live that every photo section
  still opens **from its job** with all its controls — *Upload a photo*, *…or paste a photo link*, *Put
  this back to the original* — and that pasting a link into one writes it to the draft
  (`photos-ministries.youth` appeared with **dirty** true), then Discard → *Really discard?* returned the
  draft to clean (`rev 1`, `dirty: false`, `pendingLocal: false`).
- **The guard was sharpened to the promise.** `sectionsWithoutJob()` now asks the strong question — *is
  this section in exactly one job?* — so it reports a section missing from the jobs **and** a section
  listed twice (a photo reachable from two cards would be edited from two places). It is empty today,
  and a new `sectionsInSeveralJobs()` reports duplicates alone. Verified live by clicking all ten cards:
  the union of their section blocks is the 39 the drawer offers, no title appears twice, and the four
  photo sections are the only sections not in the raw list.
- **The help screen says the promise out loud.** Step 1 now ends *"Between them the jobs hold every word,
  item and photo on the site, so whatever you need to change is behind one of them."*
- **The website is untouched**: `/` still renders (hero, twenty images, the announcement strip), and a
  fresh load reached neither the console nor the engine's report.

## 59. A job card opens its sections where the office is standing

**The message, verbatim:**

> instead of coming here when i click the edit options it goes directly to the update for the changes:All the things you can change
> Events & notices
> Conferences, classes and outreaches — and the notice strip under the header.

The paste is what the office saw after clicking the **Events & notices** card: the *All the things you
can change* back link, the job's heading and its blurb — i.e. the job view, but drawn in the **Update**
tab, because SPEC note 56 had `openJob()` set `PanelMode` to `"list"`. Clicking a card therefore threw
the office out of the list they were clicking in and made them change tabs to make the change. That is
what this note fixes: **a job card now stays in the *Edit* tab.**

- **One flag.** `openJob()` in `src/pages/Admin.tsx` sets `PanelMode` `"edit"` (it was `"list"`). The
  render branches were already ordered so that a `kind: "job"` view wins over the landing (note 56), so
  the job's heading, its blurb and its section blocks now draw *inside* the *Edit* tab, with the *Edit*
  tab highlighted, the search box above them and the same *All the things you can change* back link —
  which returns to the ten cards (it always did; it returns to the landing, and the landing is
  whichever tab you are in).
- **A search hit keeps the tab it was made from**, for the same reason: `openHit()` now *keeps* the
  current mode when it is `"edit"` and falls back to `"list"` otherwise. So a hit found from the *Edit*
  tab opens its section in the *Edit* tab, and a hit found from the *Update* tab opens it in the raw
  list — the office is never moved between tabs by something they clicked inside one.
- **What deliberately stays as it was:** the Status tab's jumps (`openSection` — *Manage branches*,
  *Edit this activity*, the pending-change chips, the live archive's *open the sermons*) still open
  their section in the *Update* tab's list, because the office came from a third tab and the raw list
  is the view that section belongs to. Section views and job views both still sit **ahead of** the
  full-list branch (SPEC notes 53 and 56), which is what lets either tab draw them.
- **Verified live** by clicking through the drawer: *Events & notices* → active tab **Edit**, back link
  *All the things you can change*, heading *Events & notices* with its blurb, its three blocks (*Events
  & activities*, *Calendar filters*, *Announcements*); opening *Events & activities* lists its eleven
  entries and typing into one marks the draft dirty (then Discard → *Really discard?* → clean again,
  `rev 1`, `dirty: false`); the back link returns to **EDITOR'S OPTION** with all ten cards; a search
  for *midweek* from the *Edit* tab opens *Weekly services* with the *Edit* tab still active; and a
  Status-tab jump still lands in the *Update* tab.
- **The website is untouched**, as always: only the drawer's own navigation moved, and a fresh load
  reached neither the console nor the engine's report.

## 60. The drawer's rows can no longer be squeezed (the "empty bars")

**The message, verbatim** (with a screenshot of the top of the *Service times & branches* job view — the
back link, the heading and its blurb, then two **empty** white bars where the section cards should be):

> fix this it should bring an option where i can update from here and for every other editors option

- **What the bars were.** The job's two section cards — *Weekly services* and *Branches* — collapsed to
  slivers. Measured live in that state: `.pblock` **14.7px** tall while its own `.pblock__head` was
  still **67px** tall, so `.pblock { overflow: hidden }` clipped the title and the group name away and
  all that was left was a blank white bar. The office read that, correctly, as "there is nothing here to
  update" — and, because every card opens the same kind of view, as a fault in "every other editors
  option" too.
- **The cause was the drawer body's grid, not the cards.** `.epanel__body` is a one-column grid
  (`flex: 1; min-height: 0; overflow-y: auto; display: grid`). In a grid whose container is shorter than
  its content, `auto` rows are shrunk toward their **min-content** size, and a box with
  `overflow: hidden` has an automatic minimum content size of **0** — so the rows were squeezed instead
  of the body scrolling. Measured at a 759×417 window: `grid-template-rows` was
  `50.4px 31.8px 46.2px 14.7px 14.7px` with `scrollHeight === clientHeight === 243` — nothing to scroll
  and nothing readable. At a tall window the content fits, which is why every earlier check (and the
  notes before this one) looked right.
- **The fix is one line**: `grid-auto-rows: max-content` on `.epanel__body` (`src/styles/edit.css`).
  The drawer's rows *are* its content, so they now keep their natural height and the body scrolls; a
  `max-content` track has no `auto` max sizing function to absorb the deficit.
- **Verified at four window sizes** (the fix, and that nothing else moved):
  *759×417* (the short pane of the report) — the job view's blocks 69px each, `scrollHeight` 350 vs
  243, the Edit landing's ten cards 74–91px, the *Update* list's 35 blocks 69px with `scrollHeight`
  3105; *1084×430* (≈ the office's own window) — the same, plus the Status dashboard 1651px and a
  search's 14 hits 57–76px; *900×300* — blocks 69px, an opened section's rows 42px, body scrolls
  (717 vs 123); *390×844* (phone, drawer full-width) — no horizontal overflow, blocks and rows intact.
  Checked visually too: a capture of the *Service times & branches* view reads *Admin Access*, *Home
  page*, the three tabs, the search box, *All the things you can change*, *Service times & branches*,
  the blurb and **"Weekly services / Services & activities"** inside the first bar — no empty bars, no
  clipped titles.
- **Nothing else changed**: all ten Edit cards still open their sections with the *Edit* tab active
  (SPEC note 59), a section still opens its fields where it stands, the draft stayed clean (`rev 1`,
  `dirty: false`) and `/giving` still renders.

## 61. Editing no longer hangs: the live preview is paced, and the page is never remounted

**The message, verbatim:**

> theres still an error in the edit, it hangs while making changes

- **What "hangs" was.** Every keystroke ran the whole update path: the draft write, a `localStorage`
  write of the entire draft, **re-binding all 53 sections**, and then both a React re-render *and a
  remount* of the whole page behind the drawer (`<main key={state.version}>` — the key changed on
  every `applySnapshot`, and `applySnapshot` ran per keystroke). Measured live on the Home page text
  section, one paragraph line: **35–50ms per keystroke, rising to 157ms as the paragraph grew, with a
  481ms spike** — and the cost tracks the *length* of what you are typing. On a slower machine that is
  hundreds of milliseconds per letter, which is exactly "it hangs while making changes".
- **Two fixes, both in the preview pipeline.**
  1. **The live preview is paced** (`applyDraftLiveSoon` in `src/lib/cms.ts`): the first change waits
     for a pause in the typing, and a long paragraph can never leave the page more than
     `PREVIEW_MAX_MS` (600ms) behind. The drawer reads the **draft**, so its fields still update on the
     spot; only the page behind them needs the applied snapshot. `undoEdit` applies at once (it is a
     discrete step, not typing) and `applyOverrides` **drops** a waiting preview, so publishing,
     discarding, leaving `#/admin` and a server sync can never be overwritten by a stale one.
  2. **The page is memoised and cloned, not remounted** (`src/pages/Admin.tsx`): the `<main>` node is
     `useMemo`'d on `[resolved.to, state.version]` and holds `cloneElement(resolved.element)`, so the
     drawer's own re-renders (every keystroke) **bail out of the page entirely**, and an applied
     preview re-draws it without throwing it away. Before this, the page was also re-rendered on every
     Admin render — `resolvePath` returns a fresh element each time.
- **Measured after the fix, same section, same machine:** 25 keystrokes → **avg 9ms, max 14ms, none
  over 200ms** (was avg 25–50ms, max 481ms); a 30-character burst with the field updating instantly,
  the page catching up after the pause, `dirty` still true, no remount (the textarea node and the
  drawer's open blocks survive). Slow typing (a character every 100ms) keeps the page chasing within
  the `PREVIEW_MAX_MS` window and the draft clean after **Discard → Really discard?** (`rev 1`,
  `dirty: false`, overrides `["live"]`).
- **Checked that the pacing did not break what depends on the applied data**: pasting a photo link
  from a job still writes the draft (`photos-main.hero`), adding a series still reaches the applied
  data the drawer's selects are built from (draft 6 rows / applied 6 rows 700ms later), undo reverts
  field **and** page, and the public route (`#/`) still shows only published content — never the
  draft — when you leave `#/admin`.
- **A note on the older notes.** Note 60's `grid-auto-rows: max-content` is kept: measured against a
  block layout and against `min-height: min-content`, it is the cheapest of the three (avg 12ms vs 34ms
  vs 28ms per keystroke) *and* the one that cannot squeeze. The occasional 60–85ms keystroke left in
  the numbers is browser layout when the field grows by a line, not our code.

## 62. The two cards came back to the landing, and the page name left the header and the bar

**The message, verbatim:**

> add the two options i removed from the editors option. remove the homepage near the admin access and near the editing

Two requests. (1) The two cards note 57 took off the *Edit* landing — *The words on every page* and
*Photos & banners* — stand at the top of **EDITOR'S OPTION** again, with the words the office pasted
when he removed them. (2) The line that named the page the office was looking at — *Home page* on
`#/admin` — is gone from both places it appeared: under **Admin Access** in the drawer header, and
next to **Editing** in the bar at the foot of the page.

- **The two cards are back, verbatim** (`src/lib/jobs.ts`): *The words on every page* — *"Headlines,
  paragraphs and the small notes — page by page, segment by segment."* (icon `pencil`) — and *Photos
  & banners* — *"The pictures across the whole site — upload your own, or paste the address of one."*
  (icon `camera`) — in the first two places, so **EDITOR'S OPTION** shows **eleven cards** in the order
  the office first met them.
- **The note-58 fold was undone, not left in place.** The content note 58 had moved into other jobs
  went back: *The words on every page* carries the page-text sections again (the sixteen `copy-*` ids;
  fourteen are still `hidden` from SPEC note 51, so the card opens on *Home page text* and *About page
  text*), and *Photos & banners* carries all four photo sections again, so *Sermons & the live stream*,
  *Ministries & serving* and *About, beliefs & numbers* lost the covers/photos/words they had gained
  and their blurbs lost their *"— and the covers they use"* tails. The tenth card note 58 invented,
  *The home page*, is **gone** — its two sections are the two the restored cards carry.
- **Everything is still reachable exactly once.** Every section the drawer offers — 39 — belongs to
  exactly one job again (2 + 4 + 2 + 3 + 3 + 5 + 5 + 5 + 4 + 3 + 3 = 39), the four photo sections went
  back to `everythingHidden`, so the **Update** tab is its **8 groups / 35 sections** again, and
  `sectionsWithoutJob()` / `sectionsInSeveralJobs()` report nothing.
- **The page name left the drawer header.** `.epanel__brand` printed the current page's label as a
  second line (`pageInfoFor(resolved.to).label` — *Home page* on `#/admin`), and the bar printed the
  same label after **Editing** (`.editbar__page`). Both are gone, with the two now-unused props
  (`PagePanel`'s and `EditBar`'s `page`) and the `pageInfoFor` import; the drawer header reads **Admin
  Access** alone and the bar goes straight from **Editing** to the *What do you want to change?*
  button. The two CSS rules (`editbar__page`, `epanel__brand em`) went with them. Nothing else in the
  drawer named a page, so *Home page* now appears in the panel only inside a photo's hint ("…on the
  home page"), which says where a picture is used, not what is being edited.
- **The website is untouched** — `/` still renders its hero and its images — and a fresh load reached
  neither the console nor the engine's report. Verified live: eleven cards in order with the two
  restored blurbs verbatim, each card opening its sections at their natural height (69px closed), the
  *Photos & banners* card opening *Main photos* with all its rows and its upload/paste controls, and
  the Update tab printing 8 groups / 35 sections.

## 63. The help note lost its fine print, and the bar lost two buttons

**The message, verbatim:**

> remove this:While you type: *stars* make a word italic, **two stars** make it bold, [a label](/giving) makes a link, and {{curly braces}} stand for something the page fills in — a date, a count, a name. Keep them where they are.
>
> What stays fixed: the church name and the logo, and the site's buttons together with the title of each page and of each section. They are part of the design. Every other word a visitor reads is yours to change — and every segment is in this panel, so nothing is hidden from you. remove the how to update icon button close to the publish and remove close the tools button

Three removals in one message, all of them wording the office no longer wants on screen.

- **The help note's last two blocks are gone** (`HelpModal` in `src/pages/Admin.tsx`): the
  *"While you type: \*stars\* …"* paragraph (the markup reminder, once `COPY_HINT` on every page-text
  section) and the *What stays fixed:* notice. **How to update the website** is now the intro line,
  the four numbered steps and *Got it* — nothing else. The `Notice` import went with the second block.
  The rule the reminder stated still holds in the code (`<Rich>` in `src/components/ui.tsx` reads
  `*italic*`, `**bold**`, `[label](/route)` and `{{token}}`), so it is now written down only in
  `README.md` for whoever writes copy.
- **The ⓘ *How to update the website* button left the bar** — it was the icon-only button standing
  immediately right of **Publish**. The help note is still one click away: the drawer header's own
  **ⓘ**, and the signed-out gate's *How does this work?*. `EditBar` lost its `onHelp` prop, so the
  bar's icon buttons are now Undo, *Backups and tools* and *Open the live site*.
- **The bar's button no longer says *Close the tools*.** It was the one gold/pencil toggle that read
  *What do you want to change?* while the panel was shut and *Close the tools* while it was open; the
  office asked for the second form to go, so the button is now **drawn only while the panel is
  closed** and always reads *What do you want to change?*. Nothing became unreachable: with the panel
  open it is closed by the drawer header's **✕** (whose accessible name is still *Close the tools*),
  and the way in is the button that comes back when it closes.
- **Verified live:** with the panel shut the bar reads *Editing · What do you want to change? · Undo ·
  Publish* (both icon buttons to the right, no ⓘ); opening the panel removes the toggle and leaves the
  ✕ in the drawer header, which closes it again and brings the toggle back; the drawer's ⓘ still opens
  **How to update the website**, whose body no longer contains `*stars*` or *What stays fixed* and
  whose four steps are all present with no horizontal overflow; the site itself is untouched and a
  fresh load reached neither the console nor the engine's report.

## 64. The home page's small words and the About paragraphs left the editor

**The message, verbatim** (one long drag-selection; its middle is elided in the quotation below —
every line it named is listed in the bullets that follow):

> remove all of this :The small words, buttons & titles (42)
> Hero headline
> Section title
> Where Champions
> are raised in Christ
>
> Hero button 1
> Button caption
> Watch sermons
>
> … *every row of the group, down to* …
>
> See all
> Button caption
> See all
>
> ministries
> Button caption
> ministries
>
> Put this back to the original
>
> About page text
> Page text
> Page — paragraph
> {{church}} exists to raise a generation of world overcomers — believers who know Christ, walk in the
> Spirit and carry the gospel to every nation. This is who we are and what we believe.
> Pledge under the cards
> Our mission is not to fill a building but to build people — every sermon, every ministry, every
> branch measured by one question: **are people becoming more like Jesus?**
> Our story — paragraph
> God has been faithful at every stage. Here are the milestones we remember with gratitude.
> Beliefs — paragraph
> We are unapologetically Bible-believing and joyfully Spirit-filled. These eight statements summarise
> the faith once delivered to the saints.
>
> The small words, buttons & titles (26)
> Put this back to the original

- **What the paste was.** A drag-selection of two *Page text* sections as the drawer shows them: the
  *Home page text* section from its expanded *The small words, buttons & titles (42)* group down to
  the section's *Put this back to the original* button, then the whole *About page text* section —
  its four paragraph rows, its own (collapsed) small-words group's summary line and its reset button.
  As with SPEC notes 48 and 49, **the items in the selection are what went**; the section titles, the
  group caption and the *Put this back to the original* buttons are the panel's own frame and are
  still there.
- **The 42 rows of the home page's small-words group are gone from the editor** — the site's own
  button captions and section titles (`home.hero.title`, the four hero buttons, every `— eyebrow`,
  `— headline` and `— button`, `home.hero.stream`, `home.welcome.badge` — 27 hand-written lines) and
  the 15 recovered ones (`home.*.auto`: the live pill, the countdown's *Next:* / *at* / *in* / *d* /
  *h* / *m*, the picture's description, *Browse every series*, *Read all*, *testimonies*, the two
  volunteering lines and the email template, *See all*, *ministries*). The *Home page text* section
  therefore opens on its **six paragraphs** and nothing else — the closed group has no rows left, so
  it is not printed at all.
- **The four About paragraph rows are gone too** — `about.head.lede`, `about.pledge`,
  `about.story.lede` and `about.beliefs.lede`, the four note 49 explicitly left behind because the
  selection that time only *named* them. *About page text* now opens on nothing but its closed
  *The small words, buttons & titles (26)* group and the reset button, exactly like the six sections
  note 49 locked.
- **The About small-words group was left as it was.** Only its *summary line* was in the paste — the
  group was closed as the selection passed it — and a summary line is frame, not an item (the same
  reading notes 48 and 49 applied). It still holds its 26 rows. Say the word and it goes the same way.
- **Two mechanisms, because half of these lines are generated.** The 27 hand-written home lines and
  the four About ones carry `locked: true` in `src/data/copy.ts` (the flag of SPEC note 47). The 15
  recovered ones cannot: `src/data/autocopy.ts` is generated and the collector reads only
  `id`/`label`/`value`/`role` back out of it (`readExisting` in `src/tools/auto-copy.mjs`), so a flag
  written there would be dropped the next time the tool runs. They are named in a new `LOCKED_AUTO`
  set in `copy.ts` instead, which the same `LOCKED` guard reads, so `copyIsLocked()`,
  `copyIsFixed()`, `bindCopyPage()` and `searchEverything()` all treat them like any other locked
  line. **Copying these lines into `copy.ts` is what matters**: re-running the collector cannot put
  them back.
- **Every word stays on the site.** As always with a *remove this* request, the copy was not touched:
  `/` still shows *Where Champions are raised in Christ*, every hero button caption, *Stream details*,
  *Browse every series* and the picture's description, and `/about` still shows all four paragraphs —
  verified live on both pages. The published overrides hold only the *live* section, so nothing was
  reverted either.
- **Locked lines now number 146** (was 100): 43 on the home page, 5 on About, and the rest as before
  (SPEC notes 47–50). Verified live: the drawer's *The words on every page → Home page text* opens on
  its six paragraphs with no closed group, *About page text* on its 26-row group alone, neither the
  hero headline nor the *Pledge* sentence appears anywhere in the panel (nor in the search box, which
  skips locked lines), the site renders untouched on `/` and `/about`, the draft stayed clean
  (`rev 1`, `dirty: false`) and a fresh load reached neither the console nor the engine's report.

## 65. The About page text section left the editor too

**The message, verbatim:**

> remove this:About page text
> Page text
> The small words, buttons & titles (26)
> Put this back to the original

- **What the paste was.** Everything that was left of one section: its title, its *Page text* caption,
  its (closed) small-words group and its *Put this back to the original* button. Note 64 had taken the
  section's four paragraphs and note 65's paste names the section itself, so this time the request is
  not about a line inside it — there was nothing inside it but the frame.
- **So the section left the drawer whole.** `about` was added to `HIDDEN_COPY_PAGES`
  (`src/lib/cmsSchema.ts`), the list SPEC note 51 set up for exactly this: the section is dropped from
  the *Update* tab, from its job (**The words on every page**) and from the search box, while the
  About page's words carry on being read by every visitor. **Fifteen** page-text sections are hidden
  today; only *Home page text* is offered.
- **What the drawer shows now.** **The words on every page** opens its single section, *Home page
  text* (six paragraphs); the *Update* tab prints **8 groups / 34 sections** (was 35); a search for
  something only About said — *Talk to a pastor*, *Read bio*, *A house built on the Rock* — reports
  *Nothing matches*, exactly as note 51 intended for a section the church has taken out.
- **The note-64 locks on About's four paragraphs stay.** They are no longer load-bearing (a hidden
  section is not offered at all, so nothing shows those lines whatever their flag says) but they are
  harmless and they record what the church asked for — if the section is ever brought back by deleting
  `"about"` from `HIDDEN_COPY_PAGES`, its paragraphs come back locked, not editable. Its 26 small
  words are untouched (only the group's own frame was in the paste), so bringing it back returns the
  section as note 64 left it.
- **The website is untouched.** `/about` renders exactly as before — verified live: the page head, its
  four paragraphs, *Talk to a pastor*, *Read bio*, *Contact the team* and all twelve of its links are
  still there, the site's own counts unchanged. The drawer's draft stayed clean (`rev 1`,
  `dirty: false`) and a fresh load reached neither the console nor the engine's report.

## 66. About page text came back into the editor

**The message, verbatim:**

> add the about text page

- **The section returns.** `"about"` came back out of `HIDDEN_COPY_PAGES` (`src/lib/cmsSchema.ts`), the
  one-line reversal the flag was built for (SPEC note 51's "deleting an id here brings a section
  back"): *About page text* is offered again in the **Update** tab's *Page text* group and in the
  **The words on every page** card, and the search box finds its lines again.
- **It comes back exactly as it left.** Note 65 removed the section, not its contents, so nothing
  inside it was restored or re-locked: its 26 small words are untouched and its four paragraphs are
  still `locked` from note 64 (and `about.leaders.lede` from note 49). The section therefore opens on
  its closed *The small words, buttons & titles (26)* group and its *Put this back to the original*
  button — the same picture the office had before it was taken out. **The four paragraphs are one
  word away** if the church wants them editable again: delete `locked: true` from `about.head.lede`,
  `about.pledge`, `about.story.lede` and `about.beliefs.lede` in `src/data/copy.ts`, or say so and it
  is done.
- **Counts are back where note 64 left them:** the *Update* tab prints **8 groups / 35 sections** and
  the two page-text sections it offers are *Home page text* and *About page text*. Verified live: the
  card opens both sections, Home with its six paragraphs and no closed group, About with its 26-row
  group and no paragraph rows; the draft stayed clean (`rev 1`, `dirty: false`) and a fresh load
  reached neither the console nor the engine's report. The website was never touched (SPEC note 65
  verified `/about` after the section left, and the section itself never affected the page).

## 67. About page text taken out again

**The message, verbatim:**

> remove the about text page

- **The section goes.** `"about"` went back into `HIDDEN_COPY_PAGES` (`src/lib/cmsSchema.ts`) — the
  one-line change SPEC note 51 built the flag for, and the exact reversal of note 66 one request
  earlier. *About page text* is no longer offered in the **Update** tab's *Page text* group, in the
  **The words on every page** card, or by the search box. That card now opens on **Home page text**
  alone (its six paragraphs), and the *Update* tab prints **8 groups / 34 sections**.
- **Nothing inside the section was touched.** A hidden section is simply not offered, so the flags on
  its lines are inert and were left exactly as note 64 and note 49 set them: its 26 small words stay
  unlocked, its four paragraphs stay `locked`, and `about.leaders.lede` stays `locked` from note 49.
  Hidden is also not deleted — one word (`"about"` out of the set) brings the whole section back, its
  group and its lines intact, which is how note 66 restored it.
- **The page itself is untouched.** The About page's headings, paragraphs, labels and small notes still
  load, apply, publish and render; only the drawer stops listing them (the same note-65 finding — the
  four `everythingHidden` photo sections have behaved this way since note 51). Verified live: the words
  card lists only *Home page text*, `/about` renders as before, the draft stayed clean (`rev 1`,
  `dirty: false`), and a fresh load reached neither the console nor the engine's report.
- Also verified: `sectionsWithoutJob()` and `sectionsInSeveralJobs()` stay clean (the sixteen `copy-*`
  ids remain listed in the *Words* job's `words` array and are filtered by `defsById`, as the other
  fourteen hidden pages already were).

## 68. The live screen follows the real broadcast

**The message, verbatim:**

> in the watch live page for the next broadcast the stream screen should show live has ended but when
> a live stream starts on youtube the screen starts automatically and the next broad cast should
> change to live now and a red dot blinking

- **What the page did before.** The Watch live panel guessed. `onAir` was `LIVE.isLive ||
  info.isLive` — the office's manual switch, or the *service clock* (a scheduled slot, start →
  `minutes`, default 120). Nothing ever asked YouTube anything, so the badge said *Next broadcast*
  and the frame played the most recent service as a "preview" (`live.preview.note`) right through the
  real broadcast, and the panel went "live" on a Wednesday whether or not anybody was streaming.
- **`src/lib/livestatus.ts` is the new answer.** `liveTarget()` turns the office's
  `LIVE.youtubeChannel` (a `@handle`, a bare handle, a channel id or any channel link) into that
  channel's `/live` page — the address that serves the running broadcast while there is one and the
  channel's own Live tab when there is not — and falls back to `LIVE.youtubeId` when no channel is
  set. `parseLivePage()` reads the one marker YouTube prints only while broadcasting
  (`"isLiveNow":true` in the player's microformat — the exact marker, and the traps around it, are
  settled in SPEC note 112: `"isLive":true` also sits in the view-count renderer of a finished or
  scheduled broadcast and must never be read as "on air") and takes the
  broadcast's own video id (the canonical watch link) and headline (`<meta name="title">`) out of the
  same page. `"isLiveContent":true` is deliberately **not** used: a finished stream keeps it forever,
  so it would leave the screen saying "Live now" all week.
- **Why the check is not a `fetch`.** YouTube sends no CORS headers, and a browser `fetch` of
  youtube.com is refused ("Failed to fetch" — verified live). The check therefore goes through
  platform's proxy: `main.pjs` now imports `super-fetch-plugin` as `superFetch`, read as
  `window.root.superFetch` (the pattern `src/components/editor.tsx` already uses for `uploadPlugin`).
  `checkLiveStream()` times the request out at 15s and returns **`unknown`** on any failure — never
  `off` — so a flaky proxy can only fall back to the old behaviour, never fake an ended stream.
- **The screen has three states now** (`src/pages/WatchLive.tsx`):
  - **live** — `onAir` is true and a source exists: `VideoPlayer` gets the new `autoPlay` prop, so
    the embed is created on the first render with `autoplay=1` and the service opens **by itself**
    (and again if the visitor arrives before the stream and it starts under them). The detected id
    wins over `LIVE.youtubeId`, so the office only needs the channel; the panel's heading becomes the
    stream's own title; the badge is *Live now* (`live.live.prefix`) with the blinking red dot.
  - **not on air** — the frame holds the new **`live-ended`** screen: a dimmed still of the most
    recent service (`.live-ended__bg` + scrim) under a grey dot, the heading **Live has ended**, the
    line *Nothing is streaming right now. When the broadcast starts, this screen plays it by itself.*
    and two buttons (*Watch the last message*, *See previous sermons*). It is the player's place and
    the player's shape (16:9), dark in both themes, so its ink and its outline button are fixed
    colours rather than theme tokens — the light theme's `--muted` is a dark brown and would have
    vanished into the box (the same trap `[data-theme="light"] .topbar` documents).
  - **on air with nothing to play** — kept exactly as it was: the last message's preview plus
    `live.preview.note`. That is the only case that notice still appears in (`live.fallback.*` is
    untouched and shows when there is no message to preview either).
- **`onAir` is honest first, forgiving second.** `LIVE.isLive` (the office's switch) still wins, then
  the detected answer; the service clock only speaks when there is nothing to check (no channel and
  no stream link) or when the check could not be made — so the page can never be *worse* informed
  than before. The clock-driven "Happening now" pill in the header and on the home page is a
  different question (is a gathering on the schedule) and was left alone.
- **Cadence, caching and politeness.** The answer is cached in `localStorage` (`wom.livestatus`) so a
  reload paints the last known truth before the network answers; it is re-checked every **45s** while
  a service is on the clock or a stream is running and every **3 minutes** otherwise (a check is a
  ~1.4 MB HTML page through the proxy, so the quiet week is polled gently). Hidden tabs are skipped —
  except while a stream is live — and a tab that comes back after 15s re-checks at once. Changing the
  channel or the link in the console changes the target, and the hook restarts on that change, so the
  new answer lands about a second later instead of waiting out the poll.
- **The office's one new field.** *Live stream* → **YouTube channel to watch for live**
  (`LIVE.youtubeChannel`, `path: "youtubeChannel"`, hint: *Paste the channel's @name, its id or its
  link…*). Empty by default — the church has not given us its channel — and the page then behaves
  exactly as the note-65 rules left it, except that the frame shows the ended screen rather than the
  last-message preview.
- **Verified live (all of it through the real page, not a harness):** with the field pointed at a
  channel that *was* broadcasting, the badge became **Live now** with the red dot, the heading became
  that stream's title, and the frame held
  `https://www.youtube.com/embed/3PFJ9SETS4M?…&autoplay=1`; pointed at a channel that was not, the
  badge stayed *Next broadcast* and the ended screen showed, with `{"state":"off"}` cached. The
  in-page flip was proven without a reload in both directions (change the target → the answer arrives
  in ~2s), and the **timer** path was proven by serving the hook a captured live page: the periodic
  check fired at **171s** (the 3-minute idle cadence, measured from the previous check), the badge
  flipped to *Live now* and the autoplaying iframe appeared with no interaction at all. Layout
  checked at 1440/1280/1024/820/390 px: the ended screen's two buttons sit on one row from 820px up
  and stack on a phone, with no horizontal overflow at any width, and the screen reads correctly in
  both themes (`vision`-checked; note that the snapshot helper's own re-render is narrower than the
  live layout, which makes the two buttons *look* stacked in a capture — the DOM rects and a capture
  of `.btn-row` alone (630×58, one row) say otherwise). A sermon page's player still opens on click
  with `autoplay=1` as before (`autoPlay` defaults to false, and only the live panel passes it).
- **Caveat worth knowing:** browsers block *unmuted* autoplay until a visitor has interacted with the
  page, so a stream starting under a visitor who has never clicked may begin muted or need one tap.
  That is the browser's rule, not the site's; the screen still flips to *Live now* on its own.
- **Possible follow-ups (not done):** letting the header's "Happening now" pill follow the stream
  too. (Filing the finished service into previous sermons is no longer a goal at all — SPEC note 71
  took that job away from the live section: the broadcast fills *Recent services* by itself and the
  office writes the message up in the *Sermons* section.)

## 69. The "Prayer line" row left the watch-live panel

**The message, verbatim** — a screenshot of one row of the *While you watch* list (a prayer icon,
**Prayer line** over *Call or WhatsApp during the service*, and the round WhatsApp button on the
right):

> remove this

- **What was pointed at.** The **first row of the *While you watch* list** in the live panel —
  `sideList[0]` in `src/pages/WatchLive.tsx`, whose words were the two hand-written entries
  `live.side.1.title` (*Prayer line*) and `live.side.1.text` (*Call or WhatsApp during the service*),
  and whose action was an `IconBtn` opening `https://wa.me/<SITE.whatsapp>`.
- **This is a page change, not an editor change.** The *Watch live page text* section has been
  `hidden` since SPEC note 51, so there was nothing in the drawer to take out; the note-48 rule
  applies instead (a line the church wants *off the page*: drop the copy entry and the element that
  renders it). The row, its WhatsApp button and the deep link are gone from the page.
- **The bookkeeping that goes with it.** The two hand-written entries were deleted from the live
  page's block in `src/data/copy.ts` (nothing points at a row that no longer renders), and the four
  remaining rows were renumbered `live.side.1…4` — labels included — in both `copy.ts` and
  `WatchLive.tsx`. The auto-collected `auto.live.355f0a2a8b32bf03` (the WhatsApp button's
  `aria-label`) disappeared from `src/data/autocopy.ts` on its own: the collector only emits ids it
  still finds in the source, so an orphan cleans itself up (741 entries after the run, no literals
  claimed, no warnings). Renumbering was safe because **no office edit exists for `copy-live`** —
  the published snapshot overrides only the `live` section (checked in `localStorage["wom.cms.cache"]`),
  so no id could hand somebody's wording to a different row. `SITE.whatsapp` stays in the data: the
  prayer page's one-tap WhatsApp still uses it.
- **The list now reads:** *Give during service* (*Tithes, offerings and pledges*) → giving, *Service
  notes* (*Follow along with the outline*) → the latest message, *Chat with an online host* (*We
  reply within minutes*) → email, *First time watching?* (*Tell us you came — we'll reach out*) →
  plan a visit. Verified live: four rows with their four actions intact, *Prayer line* and *Call or
  WhatsApp during the service* nowhere in the panel's text, no `wa.me` link left in it, and a fresh
  load reached neither the console nor the engine's report.

## 70. Ways to watch: YouTube and Facebook in place of Podcast and TV & radio

**The message, verbatim:**

> in ways to watch remove podcast, tv and radio then replace with youtube  and facebook. for the sermon archive: Every message since 2026

- **What it was about.** The four cards under *Ways to watch* — the list `LIVE.watchOptions`
  (`src/data/live.ts`) — which *two* pages render: `/watch-live` (*Ways to watch* / *Everywhere you
  already are*) and `/sermons` (*Ways to watch* / *Sermons, wherever you are*). They read *Live
  stream* (*Sundays 9:00 & 11:30 AM (CT)*), *Podcast* (*Every episode, audio only*), *TV & radio*
  (*Broadcasting in 41 nations*) and *Sermon archive* (*Every message since 2003*).
- **What they read now:** *Live stream* / *Sundays 9:00 & 11:30 AM (CT)*, **YouTube** /
  `@worldovercomers`, **Facebook** / `/worldovercomers`, *Sermon archive* / **Every message since
  2026**. The podcast and TV-&-radio cards are gone; the two platform cards take their places and
  the handles are the ones the site's socials already carry (`SITE.socials`, so the footer, the
  cards and the console all say the same thing). The `2003` in the *About* page's history timeline
  (*The Overcomers' Chapel opens*) is a different fact and was left alone — worth repeating to the
  office if they meant that too.
- **One place renders the row.** New `WatchCards` (`src/components/blocks.tsx`) is used by both
  pages, so they can no longer drift apart. Each card carries an optional `platform` field:
  *Live stream* and *Sermon archive* are words only; a **platform card** gets the *Open YouTube* /
  *Open Facebook* button, whose address is the best one we have — the stream link, else the channel
  (`youtubeChannelUrl`, new in `src/lib/embed.ts`: a `@handle`, a channel id or any channel link),
  else the site's own socials entry — and no button at all when there is nothing to point at yet.
  A card whose icon is YouTube's or Facebook's counts as a platform card too, so one the office adds
  in the drawer behaves the same way. The old *generated* platform cards (one per configured
  platform, in front of the list) are gone: the row is the list, and only the list, so YouTube can
  never appear twice.
- **The row reads as a row.** In `src/styles/pages.css`: `.watch-card { height: 100% }` (each card
  fills its cell), `.watch-card > .btn { margin-top: auto }` (the two buttons sit on one floor) and
  `.watch-card p:not(:last-child) { margin-bottom: .85rem }` (the shared paragraph rule strips the
  gap the button needs; cards without a button are untouched). Measured at 1440px: one row of four,
  every card 227px tall, titles on one line, 6px between title and line and 14px between line and
  button, no element overlapping another and no horizontal overflow; 2 columns at 1000px (two equal
  heights per row) and one column at 390px.
- **The saved copy of the section had to go too.** The *Live stream* section carried a stored
  override (from the earlier "Offline changes published" round) whose *only* difference from the
  shipped defaults was the TV-&-radio line — so the new cards would have been invisible behind it.
  It was put back to the original with the drawer's own button and then cleared directly on the
  preview server. **Lesson for the next session:** while `window.generatorIsUnsaved` is true the
  publish modal does not publish — it *plans* a publish and asks the editor tab to save the website
  (`planPublishAfterSave` + `requestWebsiteSave`), which is a user-level action; and the preview's
  server is per-page-load and starts **empty**, so the client re-pushes whatever is in
  `localStorage["wom.cms.cache"]` ("Offline changes published") on the next load. Clearing an
  override therefore means clearing the cache as well, or the next load puts it straight back.
  After that: server sections `{}`, overrides `{}`, no draft, no pending change in the drawer.
- **Verified live** on both pages, console and engine report clean, auto-copy a no-op (741 entries,
  no literals claimed, no orphans — the *Open* entry is still used, now by `WatchCards`).

## 71. Recent services rolls itself; previous sermons are the office's own

**The message, verbatim:**

> recent  services should apply immediately after live stream ended, it should be able to take just five previous services, as new live ends it deletes the oldest services(give information that to watch older livestreams they should visit youtube or facebook). for previous sermon it should be edited and uploaded in the admin and a roll over of the last live shouldnt apply(give information that previous sermon would be available within five hours of the closing service.

- **Two lists, two owners.** *Recent services* on `/watch-live` now belongs to the broadcast: it
  holds the **last five** services, read from the church's own YouTube channel — nobody types it, and
  the moment a service comes off air it takes its place while the oldest drops off the end.
  *Previous sermons* belongs to the office: it is the sermon archive (the messages written up and
  uploaded in the *Sermons* section, notes and discussion questions included) and **the broadcast
  never rolls into it**.
- **How the five are read** (`src/lib/recentstreams.ts`, new). `LIVE.youtubeChannel` is the single
  input — the same value the live check already watches. The /live address it resolves becomes the
  channel page, and the page's **/videos tab** is the list: YouTube's own long-form list, newest
  first, Shorts already elsewhere (checked against a channel that posts many Shorts — 13 of its 15
  feed entries were Shorts, none appear in the grid). The channel's **RSS feed**
  (`/feeds/videos.xml?channel_id=…`, its id resolved once from the channel page and remembered under
  `wom.ytchannel`) is fetched at the same time for exact dates, and the channel's own name is trimmed
  off the end of each headline ("… | Elevation Church"). Where the feed does not reach, YouTube's own
  words are used, expanded from the compact form ("2w ago" → "2 weeks ago"). The list is cached under
  `wom.recentstreams`, re-read every 10 minutes in the quiet week, every 90 seconds while a service is
  on the clock, **and at once when the live check flips live → off** — which is what makes the new
  service appear "immediately", with nobody doing anything. A failed read keeps the last good list; a
  site with no channel yet falls back to the newest messages it already holds, and the archive list
  below then takes what is left, so the page never shows the same service twice.
- **What the visitor is told.** *Recent services* keeps its *Catch up* eyebrow and now reads: "The
  five most recent services we streamed are here to play — older livestreams stay on our YouTube
  channel and Facebook page", with *Open YouTube* / *Open Facebook* buttons beside the archive
  button (the addresses come from `platformWatchLinks()` in `src/components/blocks.tsx`, the same
  helper the ways-to-watch cards use). *Previous sermons* reads: "Every message is written up and
  uploaded by the office after the service — usually within five hours of it closing. Open one for
  the notes and the discussion questions." Each recent service is a card with the video's still and
  player, its title, its date (or YouTube's "3 weeks ago") and a *Watch on YouTube* link out.
- **The filing machinery is gone.** `src/data/broadcasts.ts` (`buildSermonFromLive`, `fileBroadcast`,
  `filedBroadcast`, `canFileBroadcast`, `broadcastKey`) is deleted, with it `autoFileOnAirOff` (which
  fired when the office switched *we are on air right now* off), `fileLiveService` and the *File this
  service in previous sermons* button. The live section's archive fields — *Title for the sermon
  archive*, *Who is preaching*, *Their role*, *Series it belongs to*, *What the service was about*,
  *Date of this service*, *How long it ran*, *File it in previous sermons when the service ends* — are
  gone from `LIVE`, `cmsSchema.ts` and the drawer, so the section is now: where it plays, the stream
  link, the channel, the Facebook link, the headline while live, the on-air switch and the
  ways-to-watch cards. The panel under it (`LiveEndingPanel`, renamed from `LiveArchivePanel`) is a
  reminder, not a button: *"the streamed service appears in Recent services by itself: the page keeps
  the last five and lets the oldest drop off… Previous sermons is filled in by hand: add the message
  in the Sermons section… Most messages are up within five hours of the service closing, which is what
  the page promises."* `pastBroadcasts()` in `src/data/sermons.ts` went with it; the `fromLive` field
  and the *Broadcast* badge stay (harmless, and any older filed message still renders). A site whose
  live section has already been published keeps the old field values inside that stored section
  (`mergeSection` only merges), so the drawer may show one pending change after this update — pressing
  *Publish* once settles it, and nothing reads those values either way.
- **Verified live.** With a real channel configured for the test, the section showed five services
  from that channel, newest first, dates on the newest two (the feed's own limit), "2 weeks ago" style
  below, no Shorts, each card playing in place with a working *Watch on YouTube* link, all four parts
  present in the DOM (thumbnail, title, when, link) and equal heights per row, one row of four at
  1440px, two columns at 1000px and one at 390px, no horizontal overflow, console and engine clean —
  then the channel was put back to empty, `wom.recentstreams` / `wom.ytchannel` cleared from the
  preview, and the fallback checked (five archive messages under *Recent services*, four different
  ones under *Previous sermons*, nothing repeated). Auto-copy stayed a no-op (741 entries; the
  console's own chrome text is deliberately not collected — `editor.tsx` is in `SKIP_FILES`).

## 72. Six recent services, and the band moves above previous sermons

**The message, verbatim:**

> make the recent services 6 and let it come before previous sermons

- **Six.** `RECENT_LIMIT` in `src/lib/recentstreams.ts` is now 6 (it was 5), so the rolling window is
  the six most recent finished services — still read from the church's channel, still refilled the
  moment a stream ends, still dropping the oldest off the end. Every place that named the number
  follows it: the *Catch up* line now reads "The **six** most recent services we streamed are here to
  play — older livestreams stay on our YouTube channel and Facebook page" (`src/data/copy.ts`), and
  the channel field's blurb, the drawer's *When the service ends* panel and `src/README.md` say six.
- **Recent services now sits above Previous sermons.** The Watch live page runs: screen → *Last
  message* → *Coming up* (the branch schedule) → **Recent services** → **Previous sermons** → *Ways to
  watch*. The bands keep alternating as a result — the *Catch up* band wears the parchment
  `tone="light"` and *Previous sermons* the plain band (they swapped tones, since the tone is there to
  separate neighbouring sections, not to mark a particular list).
- **Nothing else about the two lists changed.** The recent list is still the broadcast's own (nobody
  types it; the office's uploaded messages are still filtered out of it while the live stream is on
  screen and while they already exist as messages), and *Previous sermons* is still the office's
  uploads with the five-hour promise in its line. With no channel configured the band still falls
  back to the newest six messages the site holds, and *Previous sermons* takes the next four.
- **Verified live.** Two passes at 1440px, 1000px and 390px: with a real channel temporarily
  configured (through `wom.cms.cache`, the console's own store — put back to empty afterwards, with
  `wom.ytchannel` / `wom.recentstreams` / `wom.cms.draft` cleared) the band showed **six** streamed
  services, newest first, exact dates on the newest two and "2 weeks ago" style below, three columns
  at 1440px / two at 1000px / one at 390px, equal heights within each row and no thumbnail missing;
  with the channel empty again, *Recent services* showed six archive messages and *Previous sermons*
  four different ones — nothing repeated, both ledes as above, the sections in the order above, no
  horizontal overflow on any of the routes, console and engine clean.

## 73. The two numbers behind the recent/previous lists are the office's fields

**The message, verbatim:**

> every changes should be updated in the Admin Acess

- **Read as: a change the office can make, not one that only lives in the code.** Everything this
  side of the site now promises — how many services *Recent services* holds, and how soon a finished
  service is promised as a written-up sermon — is a field in the **Live stream** section of the
  drawer, and the pages (and the panel under the section) follow it. The wording that carries the
  promise stays the church's, so what the office tunes is the number, never the sentence.
- **Two fields, two readers.** `LIVE.recentLimit` (6 to start with) and `LIVE.turnaroundHours` (5),
  drawn as *How many recent services to show* (number, 1–24) and *Hours until a service is written up*
  (number, 1–72) in `src/lib/cmsSchema.ts`. Both are read through `recentLimit()` /
  `sermonTurnaroundHours()` in **`src/data/live.ts`**, which clamp whatever is stored — blank, `0`, a
  stray word and nonsense all fall back to the shipped number, so the page can never promise a count
  its list does not keep. `numberWord()` (6 → "six") spells the number for the page's prose.
  `RECENT_LIMIT` moved out of `src/lib/recentstreams.ts` into `src/data/live.ts` with them; nothing
  else read it, and `WatchLive.tsx` slices the two lists by `recentLimit()` instead.
- **The lines became templates.** `live.replay.lede` now reads "The **{{limit}}** most recent services
  we streamed…" and `live.past.lede` "…usually within **{{hours}}** hours of it closing"; both stay
  `locked: true` (the church's sentences, SPEC notes 47–50), which is what makes the arrangement work:
  a `locked` line is *fixed* — no stored wording can replace it (`copyIsFixed`) — so the shipped
  template always wins and the office's number is what changes on the page. The drawer's *When the
  service ends* panel reads `recentLimit(live.recentLimit)` / `sermonTurnaroundHours(live.turnaroundHours)`
  from the draft, so it repeats the office's own numbers ("the page keeps the last 3 services…",
  "within 12 hours") as they type, and the section's blurb now says the two numbers below the links
  decide both.
- **The Watch live page text came back into the drawer.** `"live"` left `HIDDEN_COPY_PAGES`
  (`src/lib/cmsSchema.ts`) — the section has been out since SPEC note 51 — so *Watch live page text*
  is offered again in the **Update** tab's *Page text* group and in **The words on every page**, next
  to *Home page text*, and the search box finds its lines again. The change added no editability
  inside it (its paragraphs are `locked` and its captions carry roles, so of its 78 small words only
  three — the online-host email body, the "nothing is streaming" line and the reminder toast — are
  editable): the point is that the lines behind *Recent services* and *Previous sermons* can be **seen
  where the numbers that drive them are set**. Fourteen page-text sections remain `hidden`, the
  drawer's raw list went from 34 to **35 of the schema's 53**, and the *Update* tab still prints 8
  groups. Its blurb points at the two fields.
- **Verified live.** With the two fields typed to `3` and `12` in the drawer (through `wom.cms.draft`,
  which is how a render sees an edit before publishing): the draft held `recentLimit: 3`,
  `turnaroundHours: 12`; the panel read "the page keeps the last 3 services"/"within 12 hours"; the
  page's own lines read "The **three** most recent services we streamed are here to play…" and
  "…usually within **twelve** hours of it closing"; and the *Recent services* band came down to **3**
  cards in a 3-up row while *Previous sermons* kept its 4 — the whole thing following a field, with no
  reload. The *the words on every page* card and the *Page text* group both list *Watch live page
  text*. Defaults then restored (draft and cache cleared): the page reads **six**/**five** again with
  6 + 4 cards, no horizontal overflow, and a fresh load reached neither the console nor the engine's
  report.

## 74. The "live has ended" button catches up with the recent services

**The message, verbatim:**

> this should be (catch up with recent services)

- **The button.** In the *Live has ended* state on `/watch-live` the gold button (a play icon) used
  to read *Watch the last message* and send the visitor to the newest written-up sermon. It now reads
  **Catch up with recent services** and **scrolls down this page to the *Recent services* band**
  (`document.getElementById("recent-services")?.scrollIntoView({ behavior: "smooth" })`, the same
  idiom as `#volunteer` on Ministries and `#reading-plan` on Devotional), which is the same section
  the page-head's *Catch up* eyebrow names. That is where what just finished actually is — the
  office's write-up appears hours later (SPEC notes 71/72), so sending the visitor to a sermon page
  was sending them to the wrong list. `Section` gained `id="recent-services"` for it. The button's
  neighbour, *See previous sermons*, is unchanged and still goes to `/sermons`; the button shows
  whenever there is anything to catch up on (`latest || recentItems.length || recentFallback.length`)
  instead of only when a written-up message exists, so a church with a channel and no sermons yet
  still gets it. The words live in `src/data/autocopy.ts` (`auto.live.58511836749f04df`, an
  auto-collected line with `role: "button"`, so the shipped wording always wins over any stored one).
- **A phone bug the label uncovered.** `.live-ended` (the screen that stands in for the player)
  carried `aspect-ratio: 16 / 9` with `overflow: hidden`; below ~560px its copy wraps *and* its two
  buttons stack, and the state needs more height than the ratio box gives it — so the buttons were
  **cut off at the bottom** on a phone (pre-existing, and worse now that the left button's label is
  longer). The screen now takes its 16:9 from a `::before` grid item instead (an empty element with
  `padding-top: 56.25%` sharing the body's `grid-area: 1 / 1`), so it keeps the player's shape but
  **grows when the state needs the room**. Desktop is pixel-identical: 656 × 370 at 1440px (16:9) with
  its 225px body centred, exactly as the ratio box produced.
- **Verified live.** At 1440px the overlay read *Catch up with recent services* + *See previous
  sermons*, the button clicked through to `#recent-services` at the top of the viewport (scrollY
  4517, six cards in view), and a vision check found both buttons complete and the composition
  balanced. At 390px the same click landed the band 70px from the top with no horizontal overflow,
  the screen measured 253px tall against a 251px body (nothing clipped, where the old box cut off
  ~90px), and a vision check confirmed both buttons fully inside the panel and legible.

## 75. Previous sermons shows the newest 20 and rolls over by itself

**The message, verbatim:**

> for the previous sermons make it 20 then delete oldest upload automatically to add new ones

- **Twenty, and the oldest falls off the band on its own.** *Previous sermons* on `/watch-live` used
  to show four. It now shows the newest **20** of the office's uploaded messages
  (`pastCards = replays.filter(…).slice(0, past)` in `src/pages/WatchLive.tsx`), and because
  `replays` is `sermonsNewestFirst()` there is nothing to maintain: publishing a new message pushes
  the oldest one off the end of the band. **Nothing is deleted** — the band is a *view* of the
  archive, so `/sermons` (and the message pages) keep every one of them, which is what the button
  beside the heading, *Full sermon archive*, is there for. That is the reading of "delete oldest
  upload automatically" the whole site is built on (the archive calls itself "every message since
  2026"); if the church ever wants the *records* capped instead, that is a different change and a
  destructive one, so it was not made unasked.
- **The number is the office's, like the other two** (SPEC note 73). `PAST_LIMIT = 20` in
  `src/data/live.ts`, read through `pastLimit()` (clamped 1–60, blank/nonsense → the shipped 20),
  drawn as **How many previous sermons to show** in the drawer's *Live stream* section, whose hint
  says exactly what the rollover does — "as you publish a new one the oldest drops off the band by
  itself — nothing is deleted, and the full sermon archive under it keeps every message".
- **The band is laid out three across now** (`grid grid-3`, the same rhythm as *Recent services* and
  as the archive's own grid; two columns at 1000px, one at 390px). Twenty of the old two-across cards
  would have added ten rows of large players to the page; the cards themselves are unchanged
  (`SermonWatch`, still playing in place). The reveal stagger became `(i % 3) * 60` so a twenty-card
  cascade does not wait a second and a half for its last card.
- **Verified live.** With 30 test messages put in the draft (through `wom.cms.cache`, the console's
  own store): *Previous sermons* rendered **exactly 20** cards — Test message 08 to 27, the newest
  seven sitting in *Last message* / the recent-services fallback and the oldest three
  (28–30) gone from the band — while `/sermons` still reported *30 messages found* and still listed
  messages 28–30, which is the rollover proved end to end. The grid measured three 375px columns at
  1440px, two 460px at 1000px and one 331px at 390px, all cards in a row equal in height, no
  horizontal overflow anywhere, and a vision check of the whole grid found every card the same size,
  nothing clipped and no missing image. The override was then cleared, the draft discarded and the
  shipped content checked again (band back to the demo archive with the recent-services fallback
  taking the newest six, nothing listed twice).

## 76. Branches live in three countries, and Nigeria has sub-branches

The church asked for the branches to be **America, Nigeria and Canada**, and for Nigeria's to be
**sub-branches** — *Lagos, Abuja, Edo, Ogun*. That is what the data, the Locations page and the
drawer now say.

- **The data** (`src/data/branches.ts`). `country` is now the grouping key — `America`, `Nigeria`,
  `Canada` — and a branch can be marked **`isSub`**, a sub-branch sitting under its country. The
  seven gatherings are Dallas (HQ) and Atlanta in **America**; Lagos, Abuja, Edo and Ogun in
  **Nigeria**, all four `isSub`; and Toronto in **Canada**. The three branches that were in
  countries the church did not list (London, Manila, Nairobi) are gone, and everything that named
  them was carried with them rather than left dangling: the three events that were hosted there now
  happen at Abuja, Edo and Ogun; the testimonies that said "Nairobi", "London" and "Manila" now say
  "Lagos", "Toronto" and "Abuja"; the UK giving account became a Canadian one; the timeline's 2024
  line, the giving-options note and the four paragraphs that spoke of "four continents / North
  America, Africa, Europe and Asia" now name America, Nigeria and Canada.
- **The Locations page groups by country.** One block per country, in the order the countries first
  appear in `BRANCHES` (so the office reorders the groups simply by moving the branch entries),
  each with a heading row — flag, country, and a quiet `Africa · 4 branches` line over a rule. A
  country's plain branches come first; a country's sub-branches follow in an indented block behind a
  gold rule under a small **Sub-branches** label, and every sub-branch card wears a gold
  **SUB-BRANCH** pill on its photo (`BranchCard`, `src/components/blocks.tsx` + `pages.css`). The
  filter chips became the countries (**All countries**, America, Nigeria, Canada) in place of the
  old region chips, and the stats row now reads *branches / countries / sub-branches / seats every
  weekend*. `groupByCountry()` in `branches.ts` does the grouping so the page never reshuffles when
  a search or the distance sort narrows the list; with a location the cards are ordered by distance
  inside their country, without one the sub-branches are held to the bottom of their block.
- **The watch-live page's "Coming up"** table used to filter by *region* (North America, Africa,
  Europe, Asia). Those chips are now the countries too, filtered on `branch.country`, so "Nigeria"
  shows the four Nigerian gatherings. The branch search in the header palette carries the country in
  every branch line as well, so typing "Nigeria" finds them.
- **All of it is the office's** (SPEC note 73). The drawer's *Branches* section gained the
  **Sub-branch** switch — *"Ticked, this gathering is listed beneath its country's branches with a
  Sub-branch badge — Lagos, Abuja, Edo and Ogun in Nigeria"* — and its Country field now explains
  that the Locations page groups by that name, in the order the countries first appear in the list.
  The list itself draws a country heading wherever the group changes (`groupBy: "country"` on the
  section), so the office reads the same three groups a visitor reads.
- **Two small renderer fixes came with it.** `SectionDef` gained `groupBy`, and `FieldControl`'s
  nested list now honours an `itemLabel`/`itemMeta` given as a function — a branch's weekly service
  slots used to read "Item 1, Item 2…" in the drawer and now read "First Service 07:00".
- **Verified live.** Three country headings in the asked-for order with the right counts; the
  Nigeria block's four cards each carrying the SUB-BRANCH pill (measured inside their photo, 108×28);
  the country chips narrowing the list to four cards; an Abuja card opening the detail panel with
  its own map, weekly rhythm and next gathering; the watch-live chips, the Visit step-1 chooser, the
  Contact form's list, the About page's branch row, the home page's branch strip and the events
  filter all showing the seven with their countries; three columns at 1440px and one at 390px with no
  horizontal overflow; and a vision pass over the whole list (headings, indented sub-branch block,
  pills, no clipping). In the drawer, the *Branches* list showed the three groups, four `· sub-branch`
  metas and the Sub-branch switch on for Lagos. The browser's stored draft re-based itself onto the
  new defaults on its own (branches, page text, timeline), keeping the office's unpublished Live
  stream setting (`isLive`).

## 77. Directions open a map popup; a sub-branch leads to the rest of its country

Two things the church asked for on the Locations page:

- **"When direction is clicked it should create a popup of a rectangular landscape map instead of
  going to another page."** Every *Get directions* button — on a card, in the branch panel beside
  the map, and in the detail panel — now opens `BranchMapPopup` (`src/components/blocks.tsx`)
  instead of jumping to Google Maps in a new tab. It is a `Modal` (`size="lg"`, so an 860px panel)
  showing the branch in a **16:9 landscape rectangle of map** (4:3 under 620px, where a 16:9 strip
  would be too thin to read), then the address, the next gathering and the phone under it, and two
  buttons: *Open in Google Maps* (the routed link, in a new tab — that is the one place a visitor
  deliberately leaves for their own maps app) and *Copy address*. Escape, the backdrop and the X all
  close it, and the page underneath never navigates. The three buttons keep their own copy lines
  (`auto.site.c0e60f7cb5d423cd`, `auto.site.c1e6110f59709a36`, `auto.locations.e9255c2c10ef0ddd`);
  the two buttons inside the popup are new lines of their own.
- **"When you click the sub-branch button there should be other branches."** The gold **SUB-BRANCH**
  pill on a card is a real button now: it selects that branch and takes the visitor to the branch
  detail, where the panel beside the map lists **Other branches in {country}** — for a Nigerian
  sub-branch, its fellow sub-branches (Abuja, Edo, Ogun, each tagged *Sub-branch*) — as full-width
  rows that switch the panel (and the map, the weekly rhythm and the next gathering) to that branch.
  So clicking a sub-branch is never a dead end. A country with a single branch (Canada) shows the
  rest of the family instead, under *Other branches*; once a visitor shares their location the list
  is every other branch, nearest first, keeping the old *Nearest branches to you* heading and its
  distances. The rows are buttons, not loose text — they used to be a static `<span>` list that only
  appeared after geolocation, which is why a sub-branch had nothing beside it before.
- **A gotcha found on the way, and fixed.** The popup came out *trapped in the card's box* (368px
  wide, its backdrop the size of the card) instead of covering the page. The cause was `.reveal` —
  every card in a grid is wrapped in one, and `will-change: opacity, transform` makes an element a
  containing block for `position: fixed` descendants, so the overlay was confined to the card.
  Portalling the modal to `<body>` would have fixed it but pulled a second copy of react-dom into
  the bundle (+136 KB); instead `will-change` is now scoped to `.reveal:not(.is-visible)` — it is
  there for the animation, which is the only time it helps, and a revealed card (the only kind a
  visitor can click) no longer establishes a containing block. Recorded in `src/TODO.md` under
  maintenance gotchas.
- **Verified live.** At 1440px the overlay measured the whole viewport (1440×1000), the panel 858px
  and the map 806×453 (ratio 1.78) with the title, the three icon lines and both footer buttons, and
  no element inside it overflowing; at 390px the panel is 349px and the map 297×222 (4:3) with the
  footer reachable and no horizontal overflow. Escape, the backdrop and the X each close it. All
  three *Get directions* buttons open it for the right branch. The SUB-BRANCH pill is a `<button>`
  in the DOM; clicking it opens that branch's detail, whose panel showed *Other branches in Nigeria*
  with Abuja, Edo and Ogun as rows (identical 93×27 tags — no wrapping), and clicking *Edo* switched
  the whole panel to Edo with Lagos, Abuja and Ogun listed under it. A vision pass over the panel
  found the heading and the three rows right-aligned and un-clipped. None of it left an unused copy
  line: the *Sub-branch* badge is read into a variable before it is rendered so it stays rewordable
  (a caption typed straight into a `<button>` would have been locked as furniture).

## 78. Every branch can take a sub-branch — and a branch — from the drawer

The church asked for **"every branch should have an option to add a sub branch and branches in the
admin"**. Until now the drawer's *Branches* list could only append a flat branch at its foot, and
whether a gathering was a sub-branch was a tick (plus a country to group it under).

- **The model** (`src/data/branches.ts`). `Branch` gained an optional **`parentId`** — the branch a
  gathering was added under — and `parentOf()` reads it back. `isSub` still means "listed under its
  country's branches"; `parentId` says *which* branch it belongs to, and it is what the Locations
  page nests on. **None of the seven shipped branches has one**, so the page a visitor sees is
  unchanged for them: Nigeria's four keep the country's own *Sub-branches* block, and America and
  Canada are untouched.
- **The drawer** (`src/lib/cmsSchema.ts` + `src/pages/Admin.tsx`). `SectionDef` gained **`addLabel`**
  and a **`tree`** block (`parentKey`, `childLabel`, `siblingLabel`, `makeChild`, `makeSibling` and
  the two toast lines), and the Branches section sets both. So *every* branch entry in the drawer now
  offers:
  - a small **＋** on its own row (next to its title) — *Add a sub-branch* — so it can be done without
    opening the branch;
  - once the entry is open, two labelled buttons under its fields: **Add a sub-branch** and
    **Add a branch**;
  - and the foot of the list reads **Add a branch**, not "Add another".
  *Add a sub-branch* builds the branch from `blankBranch()`, inheriting the parent's country, flag,
  region, time zone, languages and photo (so it lands in the same country block the moment it is
  published), ticks **Sub-branch**, sets `parentId` to the parent's id, drops it **immediately under
  the parent** — after any sub-branches the parent already has — and opens it for editing. *Add a
  branch* builds a branch in its own right beside the entry, in the same country. A sub-branch is
  indented under the branch it belongs to in the drawer (`pitem--child`, with a gold hairline on its
  header) and carries a small gold chip naming its parent — **↳ Lagos**. The section also gained a
  **Sub-branch of** picker (a select of the branches, with *A branch in its own right* to clear it),
  so the relationship is a field the office can set, not only a side effect of the button (SPEC note
  73).
- **The Locations page** now nests: within a country, each *parent* that has sub-branches gets its own
  indented block behind the gold rule, labelled `SUB-BRANCHES · Lagos` (the branch name in a quieter
  colour beside the gold words), and those blocks come before the country's plain *Sub-branches*
  block, which now holds only the gatherings that belong to no branch in particular. A country's own
  branches still come first, in one grid.
- **Two bugs the feature uncovered, both fixed.** Both were live in the old code and would have
  broken *any* added entry, not just sub-branches:
  - `applyToList` — the writer that refills a section's list in place — matched entries by `id`, and
    every branch the office adds starts with an **empty** id. Two brand-new branches were therefore
    written onto the *same* object: the page behind the drawer showed one of them three times and the
    America block lost a sub-branch entirely. An entry with no id is now never matched against another
    id-less entry, and each existing object is consumed by exactly **one** incoming entry (so two
    entries sharing an id — a copy, an id typed twice — can no longer hollow out the list either).
  - `Locations.tsx` built its rows in a `useMemo` keyed only on the visitor's coordinates, while the
    branch list is refilled **in place** — so a branch added from the drawer while the office was
    standing on that very page never appeared until a reload. The page now ticks on the CMS version,
    and the section's `bind` rebuilds `COUNTRIES` in place through the new `syncCountries()`, so a
    branch added in a brand-new country reaches the country chips, the stats row and the watch-live
    list too. A card is keyed by its id *or* its row while a just-added branch has no id yet, and
    `Duplicate` now gives a copy a URL id of its own.
- **Verified live.** In the drawer on `#/admin/locations`: every one of the seven branches showed the
  ＋ row button and the two labelled buttons; *Add a sub-branch* on Lagos inserted a branch directly
  under Lagos with a `↳ Lagos` chip, `isSub` ticked, `parentId: "lagos"`, country Nigeria, flag 🇳🇬,
  region Africa and the Lagos time zone, and it appeared **on the page behind at once** — Nigeria
  gained an indented `Sub-branches · Lagos` block beside the four loose ones. Adding a second
  sub-branch under Lagos put it after the first; *Add a branch* beside Atlanta put a plain branch in
  America's own row; typing a city and name into the new branches moved them onto the page live
  (America then read `North America · 4 branches` with `SUB-BRANCHES · Dallas, Texas` and
  `SUB-BRANCHES · Atlanta, Georgia`, one card each). Setting **Sub-branch of** on Abuja to Lagos moved
  it out of the loose block into the Lagos block; setting it back to *A branch in its own right*
  returned it. The DOM check confirmed every sub-branch card wears the SUB-BRANCH pill and only Dallas
  wears *Global HQ*, and a vision pass over the America block read the heading, both parented labels
  and the indented cards correctly. The drawer opened a sub-branch from a card, moved, duplicated and
  deleted it as before, and after the test the section was put back to the original (draft = the seven
  shipped branches, no parent ids, one unsaved change left — the office's own live-stream toggle).
  Nothing was published; the pages at 1440px and 390px show no horizontal overflow.

## 79. Nigeria leads, the head office is Lagos (Oke-Odo), and the sub-branches show

Five things the church asked for on the Locations page, in one pass:

- **"remove the seats every weekend"** — the stats row under the headline is now *branches /
  countries / sub-branches*. The seating total went with the label, so no copy line is left dangling:
  `auto.locations.d747a5c4587d288d` was dropped from `autocopy.ts` (743 lines now, re-run clean).
  Each branch card still shows its own seating in its facts — that was not part of the ask.
- **"make Nigeria the first country followed by America"** — the countries were already ordered by
  where each one first appears in `branches.ts`, so reordering the list was the whole change: **Lagos,
  Abuja, Edo, Ogun, Dallas, Atlanta, Toronto** give **Nigeria → America → Canada** on the page, in
  the country chips, in the stats and in the watch-live list. The two paragraphs that listed the
  countries by name (`home.branches.lede`, `locations.head.lede`) now read *"Seven branches across
  **Nigeria, America and Canada**…"* to match. `COUNTRIES` and the group order follow the data, so
  the office can re-order the countries again simply by moving the branch entries.
- **"the global hq should be nigeria, lagos(oke-odo)"** — the head office moved:
  - **Lagos** is the head office now (`isHq`) and a branch in its own right rather than a
    sub-branch: `city: "Oke-Odo, Lagos"`, name *"Main Branch — Overcomers' Cathedral, Lagos"*, and an
    Oke-Odo address with coordinates for Agbado Oke-Odo. It still carries a `Global HQ` badge on its
    photo.
  - **Dallas** lost `isHq` and the "Main Branch —" prefix (it is *"Overcomers' Cathedral, Dallas"*,
    which is also the `venue` the archived sermons name).
  - **Nigeria's other three** — Abuja, Edo and Ogun — are **sub-branches of Lagos** now
    (`parentId: "lagos"`), which is what the country's structure actually is, and it puts the new
    sub-branch design straight to work on the page.
  - `SITE.address` (the footer, the contact card, the contact page's own map and its *Get directions*
    link) follows the head office — `HQ.lat` / `HQ.lng` / `HQ.address`.
  - **The visitor's default branch follows the head office too**: the eight places that defaulted to
    the literal `"dallas"` (the header pill, the home page, the visit wizard, the watch-live page, the
    contact and serving forms) now use `DEFAULT_BRANCH_ID` from `branches.ts`.
  - **`HQ` is a copy now, kept in step by `syncHq()`** — called from the branches section's `bind`
    and from `refreshDerived()`. It has to be: `refreshDerived()` used to do
    `Object.assign(HQ, BRANCHES[0])`, which only worked because the head office *was* the first entry
    — with Lagos in front and Dallas holding the flag it would have copied Dallas over the head
    office. Ticking **Global HQ** on another branch in the drawer moves the contact page with it.
- **"change the sub branch design it is not visible"** — the treatment was reported (and confirmed by
  a vision pass on the old page) as *subtle, leaning towards effectively invisible*: a small
  gold-outlined pill lost against the photo, a faint label, and cards that looked like any other. It
  is a design of its own now:
  - The page's sub-branch group is a **panel** — its own border, a gold rule down its left edge and a
    `--panel` background — headed by **`SUB-BRANCHES · <the branch they belong to>`** in bolder gold,
    with a **count pill** (`3 branches`) on the right.
  - Every sub-branch card wears **two solid gold chips**: `SUB-BRANCH · Oke-Odo, Lagos` in the card's
    body, above the city (so it never depends on what happens to sit behind it in the photo), and the
    `SUB-BRANCH` pill on the photo, now solid gold with dark ink instead of an outline (it is still
    the button that opens the branch, per SPEC note 77).
  - In the drawer, a sub-branch row is indented further, sits on `--panel-2`, has a **3px gold rule**
    down its head, and its parent chip is a **solid gold pill** (`↳ Oke-Odo, Lagos`).
- **"remove the large map"** — the branch detail no longer embeds a map. `MapPanel` became
  **`BranchPanel`**: a two-column panel with the branch's own details (city, name, address, weekly
  rhythm, phone, email, languages, highlights and the actions) on the left and the rest of the family
  on the right, inside a bordered panel with padding rather than the old full-bleed map frame. A
  visitor who wants a map presses **Get directions** and gets the 16:9 popup from SPEC note 77 — the
  *Open in OpenStreetMap* link is still there for a full map in a new tab. Everything below the panel
  (weekly rhythm, next gathering, at this branch) is unchanged.
- **The office's draft.** The drawer keeps a saved copy of every *list* section, so the new branch
  order and the new head office reach it through that section's *"Put this back to the original"* —
  lossless here, because nothing had been published and the draft still held the shipped branches.
  The church address was set in the drawer's own field, so the draft matches the shipped content
  field for field. The one unpublished change in the browser — the Live stream toggle — was left
  exactly as it was.
- **Verified live.** On `#/admin/locations`: the countries read **Nigeria (4), America (2), Canada
  (1)**; the stats row read *7 branches · 3 countries · 3 sub-branches*; Nigeria showed one
  full-width card — *Oke-Odo, Lagos* with the **GLOBAL HQ** badge — and, beneath it, the sub-branch
  panel headed `SUB-BRANCHES · Oke-Odo, Lagos` with its `3 branches` count, its three cards each
  carrying both gold chips, and **no iframe anywhere in the branch detail**. Selecting Abuja brought
  up its detail with the gold `SUB-BRANCH · Oke-Odo, Lagos` badge, its facts and — beside it —
  *Other branches in Nigeria* (Oke-Odo, Lagos / Edo / Ogun) as clickable rows; the panel measured
  1176×454 with both columns inside their borders and the last row 237px clear of the bottom edge. A
  vision pass read back the country heading and count, the panel header, the count pill, both gold
  chips and the HQ badge, and found no overlap or clipping; at 390px the same block fits its column
  (375px document, no horizontal overflow) with the header wrapping its count chip onto a second line
  (title 38→293, chip 240→338, no overlap). The contact page, the footer and the header's branch pill
  all say Lagos / Oke-Odo now, and `#/locations` on the public side renders the new order straight
  from the shipped data.

## 80. The redundant branch labels are gone

The office read note 79's page and named four pieces of wording to remove, because each of them
repeats something the card beside it already says: the *"Main Branch — "* prefix, the sub-branch
panel's header, and the two gold sub-branch chips.

- **The name prefix.** `branches.ts` calls the head office *"Overcomers' Cathedral, Lagos"*. The
  prefix is dropped from the data, not hidden in one component, so the card, the detail panel's
  heading and lede, the searching/ranking text and anything else that prints `branch.name` all read
  the new name at once. `announcements.ts`'s demo title ("Parking stewards at the Main Branch…") is
  plain English and was left alone.
- **The sub-branch panel's header.** The `<p className="branch-sub__label">` — the pin icon, the
  word *Sub-branches*, the `· <branch city>` and the right-aligned count pill — is deleted from both
  places Locations builds one (the family block and the country's plain *loose* block). The
  `.branch-sub` panel itself stays: border, 3px gold left rule and `--panel` background are what say
  "these gatherings sit together". Its padding is now `1.15rem` all round, since there is no header
  to sit above the grid any more.
- **The two chips on a sub-branch card.** `.sub-tag` (the solid gold pill over the photo) and
  `.branch-card__sub` (the same words inside the card body, with `· <parent city>`) are both gone, so
  a sub-branch card looks exactly like any other card. `.sub-tag` was a `<button>` around
  `onSelect()`, but the card's own **View map** button calls the same `onSelect()`, so selecting a
  branch is unaffected — `BranchCard` no longer reads `subLabel`/`parent` at all, and its `parentOf`
  import went with them (`parentOf` is still exported by `branches.ts`).
- **The panel's own badge and the nearby rows.** `BranchPanel`'s `.branch-panel__tag`
  (*Sub-branch · <parent city>*, shown when a sub-branch is the selected branch) is deleted, and the
  *Other branches in <country>* rows no longer append a *Sub-branch* tag to a sub-branch — the tag
  is now only ever a distance or a country.
- **The dead CSS and copy lines.** Removed from `pages.css`: `.sub-tag` (+ its `:hover`), the
  `.branch-sub__label/__title/__of/__count` family, `.branch-card__sub` (+ its `em`) and
  `.branch-panel__tag` (+ its `em`), and `.sub-tag` from the shared absolute-position pill selector.
  `src/tools/auto-copy.mjs` was then re-run so its two orphaned entries fell out of `autocopy.ts`
  (`auto.locations.eb1e87c197060e40` *Sub-branches*, `auto.site.6acdb01583cbf9cc` *Sub-branch*:
  743 → 741 entries, `filesTouched: 0`, no warnings) — re-running the collector is the way to drop a
  line that is no longer printed, never a hand edit.
- **Verified live.** On `#/locations` no element's text matches *Main Branch* or *Sub-branch*; the
  Nigeria block shows the Oke-Odo card (**GLOBAL HQ**, name *Overcomers' Cathedral, Lagos*) and then
  the bordered panel holding the Abuja/Edo/Ogun cards with **no header strip and no leftover blank
  space** (1176×722 at 1440px, not a pixel of horizontal overflow); the live BranchPanel prints
  *Overcomers' Cathedral, Lagos* with no sub-branch badge and its *Other branches in Nigeria* rows
  are just names. What marks a sub-branch now is only the panel's gold left rule.

## 81. Adding a country, a branch or a sub-branch — and every branch's sub-branch button

The office asked for two things in one breath: *every branch* should carry a sub-branch button, and
the drawer should offer *adding more countries, branches and sub-branches*. Both are in the
*Branches* section now.

- **Every branch wears the button.** The icon-only *“+”* a row had (`pitem__quick`) is unchanged in
  behaviour — it still adds a sub-branch under *that* branch, sub-branches included — but it now
  carries the word, `Sub-branch` (`tree.childShort`), so it reads as an action rather than
  decoration. The words drop on a viewport under 560px and the *“+”* stays (its `title` and
  `aria-label` still name it).
- **Three ways to add, at the foot of the list.** *Add a branch* is the old `addLabel`; beside it are
  *Add a country* and *Add a sub-branch*, each opening a one-line form in place (`.plist__form`) —
  a name box for the country (Enter creates, Escape cancels) and a `<select>` of every branch for the
  sub-branch, indented by depth and defaulting to the row the office had open, with *Create* and
  *Cancel*. Only a section that carries a `tree` grows the second and third.
- **A country is a branch that names one**, so *Add a country* runs `makeCountry`
  (`countryBranchOf`) — a blank branch carrying the typed country — and everything else follows: the
  drawer's group heading, the page's country chips, its stats and its group order all read the list
  (the section's `bind` calls `syncCountries()`/`syncHq()`). *Add a branch* now starts from the
  **last** branch through a new `makeNewFor(list)` (the same country, flag, region, time zone and
  languages) instead of a blank one, so it lands in a country that exists; a brand-new country comes
  from *Add a country*. `SectionDef.tree` gained `childShort`, `countryKey`, `countryLabel`,
  `countryPlaceholder`, `countryToast` and `makeCountry`; `SectionDef` gained `makeNewFor`.
- **Making room for it.** A branch row holds three things now, and the old flex priority squeezed the
  wrong one (the row's *aside* grew while the **name** was ellipsized — rows read “Overcomers' T…”).
  So: the name outranks the aside (`.pitem__head b` is `flex: 1 1 auto`, its `em` `flex: 0 1 auto`,
  and the parent chip yields first, `flex: 0 6 auto` with its own ellipsis); a child row hides the
  aside entirely (`.pitem--child .pitem__head em { display: none }` — its name already ends in its
  city and the chip beside it names its parent); the child indent is 1.3rem; and the drawer itself is
  `min(600px, 100%)` (was 520) — sized, as the CSS comment says, for a branch row's three things.
  Branch rows also lost the country from their aside (`itemMeta` is the city alone: the country is
  the heading printed above them).
- **Verified live.** At 600px every one of the seven rows measured **zero** clipped pixels in its
  name and its chip; the three footer buttons sit on one line; the country form's box is 317px wide
  and the sub-branch form's select carries all seven branches (children indented). Each flow was
  exercised — a country typed in and grouped as its own heading, a sub-branch created under Dallas
  from the foot of the list, another under Lagos from that row's button — and the draft was then
  restored byte-for-byte, so the only unpublished section is still the office's own *Live stream*
  toggle. The public pages are untouched: no *Sub-branch* wording anywhere (note 80 still holds).

## 82. The head office's city is just *Lagos* — and its Sub-branch button is on its row like everyone's

The office asked for two things: take *Oke-Odo* out of the branch city that reads *(Oke-Odo, Lagos)*,
and make sure **every** branch — *"including the global hq lagos"* — carries a sub-branch button.

- **The city is one word now.** `BRANCHES[0].city` is `"Lagos"` (was `"Oke-Odo, Lagos"`). That single
  string is what heads the branch's card, the Locations panel's `<h3>`, the drawer row's aside, the
  gold parent chip the sub-branches wear (`↳ Lagos`), the header's branch pill, the footer and the
  searching/sorting text — so one edit moves all of them. **The street address keeps Oke-Odo**
  (`Overcomers' Cathedral, Oke-Odo Road, Agbado Oke-Odo, Alimosho, Lagos State, Nigeria`, in
  `branches.ts` and `SITE.address`): the office asked about the *city*, and that is where the church
  actually is. The drawer's *Global HQ* hint lost its parenthetical too (`… It is on Lagos; tick it on
  another branch to move the head office there.`).
- **The draft had to be put back.** The office's stored draft still carried `city: "Oke-Odo, Lagos"`,
  so the drawer (and the draft-previewed page) would have gone on showing it however the data read.
  The *Branches* section was reset from the drawer's own **Put this back to the original** — which is
  the office's own way of doing it, and exactly what this change needed — leaving the pending list at
  the single *Live stream* toggle it has been for several sessions.
- **The sub-branch button: on every row, and it works on every row.** Every one of the seven rows
  (head office included) carries the button, so the *"make sure"* was a verification: each row's
  button was pressed in turn and each produced a child hanging from **that** branch — `lagos`, `abuja`,
  `edo`, `ogun`, `dallas`, `atlanta`, `toronto` — with the new child inserted straight under its
  parent and the parent chip naming it. The draft was then reset again, so nothing of the test
  remains. (The Lagos row's own title still reads *Add a sub-branch — under “Overcomers' Cathedral,
  Lagos”*.)
- **The word no longer leaves on a phone.** Under 560px the button used to shrink to a bare *“+”*
  with the words hidden — which is how a row reads as having *no* button at all, and is the likely
  reason the office asked. Now the branch row **wraps** at that width: the name gets the full width
  of the row and stays uncut, and the named **Sub-branch** button sits beneath it, right-aligned (its
  label drops only 0.62rem → 0.6rem). The city and the parent chip still step aside there — the
  nesting is still the indent, the gold rule and the shading.
- **Verified live.** In the drawer's *Branches* section: 7/7 rows wear a labelled *Sub-branch* button
  at the drawer's 600px width (101px wide, inside the list, no name clipped) and at 390px (103px wide,
  **every** name now fits uncut — `Overcomers' Tabernacle, Abuja` used to ellipsize, and the row is
  67px tall). The three footer buttons are untouched. On the public site, no page's text contains
  *Oke-Odo, Lagos* and no element matches *Main Branch* or *Sub-branch* — the only *Oke-Odo* left
  anywhere is the street address in the footer and on the contact page (note 80 still holds). Build
  clean: no console errors, no `platformErrors`, no `syntaxErrors`; 390px and 1440px passes with no
  horizontal overflow.

## 83. Every change takes effect — the draft stays on the page, and the on-air switch reaches the whole site

The office reported *"every change and update I make gives effect in the admin"*, and two separate
faults were behind it. Both are fixed:

- **The stored draft stopped being previewed the moment the content landed.** While `#/admin` is
  open the pages behind the drawer show the **draft**, and the drawer reads the draft, so an edit
  lands on the page as it is typed (`applyDraftLiveSoon`). But *loading* the page went:
  (1) the Admin shell mounts, `setAutoPreview(true)` applies the draft it can see — which, before
  `startCms()` has read localStorage, is a draft of the **shipped words**; (2) `startCms()` then
  applies the local cache / server content (`applyOverrides` → `applySnapshot(merge(overrides))`),
  i.e. the **published** content; (3) the office's own draft is read from `localStorage` a moment
  later — and nothing put it back on the page. So after a reload the drawer showed the office's
  edits (the headline, the on-air switch, the city) while the page behind it showed the published
  site: the edit *was* saved and *looked* dead. It went unnoticed because typing a character in any
  field re-applied the whole draft, which is exactly why it read like *"some changes do nothing"*.
  Now `showDraftIfEditing()` in `src/lib/cms.ts` pins the draft back on the page at both moments —
  at the end of `applyOverrides` (whenever the live content changes underneath, cache/server/another
  editor's publish) and at the end of `startCms` (the stored draft arriving) — and only while the
  office is on `#/admin` (`autoPreview`) and only when there is a draft, so a publish, a discard, a
  rollback and the public site all keep their own behaviour.
- **The *We are on air right now* switch only moved one page.** `LIVE.isLive` was read in exactly
  one place — `WatchLive.tsx`'s `onAir` — while the header's service pill, the home page's hero line
  and the home page's next-gathering card all asked the **service clock** (`nextService(...).isLive`).
  Flipping the switch therefore turned the Watch live panel on and left the rest of the site counting
  down ("Night Vigil in 5h 40m" *under a live stream*), which is what the office saw as a change that
  did nothing. `src/lib/store.ts` now owns the question:

  ```ts
  export function onAir(info?: NextServiceInfo | null): boolean {
    return !!LIVE.isLive || !!info?.isLive;
  }
  ```

  and every live state reads it — `ServicePill` (header), the Home hero, `NextServiceCard`, and
  `WatchLive`'s panel (`onAir(info) || air.state === "live"`, which also replaced the old
  `canCheck`/`checkFailed` third clause: the clock is now read the one way everywhere). The switch
  wins over the clock, because it is a person saying "we are broadcasting" — a moved or special
  gathering must be able to put the site on air without editing the schedule.
- **What the site says while the switch is on.** The pill and the hero badge read **LIVE NOW**; the
  gathering's name rides along only when the clock agrees (the switch alone cannot say *which*
  service is on). The next-gathering card becomes *Happening now* with **We are on air right now.**
  — a new editable copy line (`auto.site.af04bc17aac8d156`, `auto-copy.mjs` re-run: 741 → 742
  entries, `filesWritten: 1`) — and the *Watch live* button; its countdown is dropped, and the
  *"We are live — ends about <time>"* line it used is kept for the clock's own case, since only the
  clock knows an end time. The drawer's field hint now says where the switch is seen.
- **Verified live.** The reload repro: `#/admin` → reload → with the drawer *closed*,
  `applied().live.isLive` is `true`, the pill is `service-pill--live` reading **LIVE NOW** and the
  card is `next-service--live` reading *Happening now* — before the fix the same state read
  "Night Vigil (fortnightly) in 5h 40m". The switch was then flipped off and on from the drawer and
  both the pill and the card followed within a second, with the office's draft byte-identical
  afterwards. An edit of each kind was exercised end to end and each reached the page behind the
  drawer: a **page-text** paragraph (the home page's *Branches* line), a **list record's** text field
  (the head office's city), a **boolean** (the on-air switch), an **image link** (the *Home banner*
  photo), and a **record added and deleted** (a new branch — an eighth card appeared, and the delete
  put it back to seven). Nothing else is pending afterwards: the office's *Live stream* toggle is
  still the only unpublished section.
- **Still true, and worth telling the office:** nothing reaches *visitors* until **Publish**, and
  while the generator itself is unsaved Publish asks the editor to save the website first — so a
  change the office has made shows on their own pages (draft) and nowhere else, which is the design,
  not the bug above.

## 84. The website runs on Lagos, Nigeria time — automatically

The ask: *"let the website use lagos nigeria automatic time"*.

**What was wrong.** Nothing about the site's clock was a clock of its own — every time it showed or
counted to was worked out on the **visitor's device**: `nextOccurrence` did `d.setHours(h, m)` and
`slot.day - d.getDay()` on a plain `Date`, `todayKey` read `getFullYear()/getMonth()/getDate()`, the
office-hours check read `getHours()`, `sermonDate` read `getDay()`. So the church's own times only
came out right for someone whose computer was already set to West Africa Time: a member in Dallas
was told the Lagos 7:00 AM gathering started at 7:00 AM *his* time, the Sunday service on the
watch-live table counted down to the wrong instant for five of the seven branches, and "today" — the
daily verse, the reflection, a notice's age, the head office's open/closed line — rolled over at
whoever's midnight was nearest. The branch `timezone` field had been carried in the data since the
branches were written and read by nothing at all.

**The clock.** `src/lib/store.ts` now owns one, built on the platform's own `Intl` data (no
hard-coded offsets, so Chicago's and Toronto's daylight saving is handled for us):

- `DEFAULT_TIMEZONE = "Africa/Lagos"` — the church's home clock. Overridable from `main.pjs`
  (`churchTimezone`) and, day to day, from the drawer: *Church profile → **Time zone*** (new field;
  its `bind` hands the value to `setSiteTimezone` as soon as the section is applied, so a published
  profile and the running page agree).
- `zonedParts(date, tz)` (what the wall clock reads in a zone) and `zonedTimeToUtc(y, m, d, h, min,
  tz)` (the instant at which a zone's clock reads that wall time — two passes, so a change of offset
  lands on the right side of it). `siteTimezone()`, `zoneOr()` (never returns a zone `Intl` would  reject, so a typo in the console cannot throw) and `zoneYear()` sit on top.
- `nextOccurrence(slot, now, tz)` / `nextService(schedule, now, tz)` take a zone; `todayKey`,
  `fmtDate` (which gained `weekday` and `month` styles) and the new `fmtTime` are zone-aware by
  default, so a date shown anywhere is the date the church is on.

**The two rules, and why there are two.** Everything the site works out *for itself* — which day it
is, the next gathering, the office being open, today's verse, how old a notice is — is read on the
**church's** clock (Lagos). A **branch's own service times** are read on **that branch's** clock
(`branchZone(branch)` = the branch's `timezone`, or the church's if it names none), because 9:00 AM
in Dallas *is* 3:00 PM in Lagos and a countdown has to be right for the member standing in either
city. That is the one place the two differ, and it is why the watch-live table, the branch cards,
the map popup and the visit wizard each pass their own branch's zone. New branches are created on
the church's clock (the drawer's *Services & activities → Branches → Time zone* hint now names
`Africa/Lagos` first).

**Where it is read** — `nextOccurrence`/`nextService` (header pill, home hero, next-gathering card,
watch-live panel and its *Coming up* table, branch map popup, the visit wizard), `todayKey` /
`pickForDay` (the daily verse, the prayer focus, a giving reference), `zonedParts` (the contact
page's open/closed line — read on the **head office's** clock, which is what the office hours are;
the events calendar's day numbers, weekday letters and month headings; the years in the sermon
filter), `fmtDate`/`fmtTime` (every date and clock time shown, including a live gathering's "ends
about" and record dates), `eventDate`/`eventZone` (an activity's *day* counted on the church's clock
and its *time* read at the host branch), `announcements.todayISO`/`daysAgo` (a notice dated on the
church's calendar), `sermonDate`/`parseSermonDate` (a Sunday 11:30 gathering, in Lagos time).

**Verified, not assumed.** The countdowns were checked against an independent brute-force scan of
the *hours* a zone's clock reads (not against the same arithmetic twice): Dallas's *Sunday 9:00 AM*
row showed **70h 19m**, matching Sunday 09:00 America/Chicago = `2026-09-27T14:00:00Z` — the
device-zone answer was 64h 20m, so the branch clock is being used; Toronto's row matched a scan in
`America/Toronto`; the Lagos rows matched a scan in `Africa/Lagos`. The drawer's own path was
exercised end to end: setting *Church profile → Time zone* to `Pacific/Kiritimati` made the page
behind the drawer read **Friday, 25 September 2026** while the device read Thursday the 24th, and
setting it back to `Africa/Lagos` put the page back on Thursday — with the office's stored draft
**byte-identical** (174,883 characters) before and after. The announcement strip was un-dismissed
long enough to confirm both notices still pass `daysAgo` (0 and 1) and the dismissal state was put
back. Cost: `Intl.formatToParts` measures ≈0.007 ms here (500 calls in 3.6 ms), so re-computing
every visible countdown once a second is far inside a frame.

**The office's draft is untouched** — `live.isLive` is still the only section that differs from the
shipped defaults (the new `site.timezone` rides along at its default value, `Africa/Lagos`).

## 85. The visitor's own clock — the times are shown where the reader is

The ask: *"let the visitors checking the website see the time according to their ip address
location"*. That is the opposite of note 84's rule, and deliberately so: note 84 made the site
*compute* on the church's clock so a countdown was right; this note makes the site *show* every time
on the reader's clock, so a member in Dallas reads the Lagos Sunday 07:00 gathering as one o'clock
in the morning — their time — and knows when to open the stream. The two rules live together rather
than cancelling out: an instant is still worked out in the zone it is written in (note 84), and it
is then *shown* on the reader's clock (note 85).

**The visitor's clock** (`src/lib/visitor.ts`, new). On the first load the site asks a
geolocation service for the visitor's zone and remembers the answer in `localStorage`
(`wom.visitorClock` = `{tz, place, source, at}`), so a returning visitor is painted in their own time
on the very first frame; the answer is re-checked once it is more than half a day old, and on
`visibilitychange`/`online` if it has gone stale.

- **Three keyless services, tried in turn:** `https://get.geojs.io/v1/ip/geo.json` (zone, city,
  country), `https://ipinfo.io/json`, then `https://ipapi.co/timezone/`. Each is read for an IANA
  zone name and validated with `isValidTimezone()`, so a service answering nonsense cannot corrupt
  the clock. If none answers (offline, blocked, an outage) the visitor's *device* zone is used
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`, `source: "device"`) and, failing even that,
  the site stays on the church's clock — which is where it was before any of this existed.
- **The lookup is a plain `fetch`, and that is the whole trick.** `superFetch` (used for the YouTube
  live check) sends the request from *platform's server* — the service would see platform's address
  and answer with platform's location, so every visitor on earth would be told the same city. A
  browser `fetch` goes from the visitor's own machine, which is the only way an IP lookup can mean
  anything. The endpoints are CORS-open, so no proxy is needed. (Verified in the live preview: the
  geojs response carried the reader's own address, `197.211.52.241` → `Africa/Lagos` / Lagos.)
- **Nothing is stored on a server.** The zone and the place name stay in the visitor's own
  `localStorage`, the request carries nothing but the address every request already carries, and the
  office can switch the whole thing off.

**Two clocks become one to read** (`src/lib/store.ts`). `siteTimezone()` — the clock everything that
*shows* a time already defaulted to — now returns the visitor's zone when it is known, and the
church's otherwise. That single change carried most of the site with it, because every display
helper (`todayKey`, `fmtDate`, `fmtTime`, `zonedParts`) already defaulted to `siteTimezone()`; what
it needed instead was for the *defining* helpers to stop being confused with the *showing* ones, so
`nextOccurrence`, `nextService` and `zonedTimeToUtc` now default to `churchTimezone()` — they create
instants, they do not show them. `churchTimezone()`/`setChurchTimezone()` are note 84's
`siteTimezone()`/`setSiteTimezone()` renamed, so the *Church profile → Time zone* field still means
what the office thinks it means. Two new helpers do the showing:

- `clockAt(instant)` → `{day, time}` as the reader's clock reads that instant.
- `clockHere(time, day, fromZone)` → the same, for a **weekly** schedule entry written in another
  zone (it takes the next occurrence of that wall time in `fromZone`, then reads it in the reader's
  zone — so it is DST-correct for *this* week, not for a hypothetical average one).

**Where they are used.** The header service pill, the home hero's next-gathering line, the
next-gathering card (and its "ends about" time), the branch strip and branch cards, the branch
panel and map popup, `ServiceTimesList`, the watch-live screen and its *Coming up* table, the
events page (featured card, grid cards, calendar month headings and the timeline rows), the visit
wizard's service chooser, its pass card and its email/plain-text summary, the prayers page's
gathering list, and the contact page's *Sundays:* line — which is now **derived from the head
office's schedule** instead of being written out by hand (the old sentence claimed "Sundays: 9:00 &
11:30 AM, 5:00 PM", which was Dallas's wording from before the church moved its head office to
Lagos and did not match the schedule at all). Event cards and the calendar now read their day and
clock time off the event's *instant* (`clockAt(eventDate(e))`), so the date badge, the time and the
countdown can never disagree.

**What deliberately did not change.** The office's own prose — a ministry's "meets" line, a
department's hours, the wording on any *Ways to watch* card — is the office's own text about the
church's gatherings, not a time the site worked out, and it stays exactly as they wrote it. (That is
why the *Live stream* card's *Sundays 9:00 & 11:30 AM (CT)* stayed *as typed* while every other time
on the page moved onto the reader's clock; the church replaced that line with a plain statement in
SPEC note 99, and the card's wording is still theirs to change.) The contact page's *open now / closes in 2h* badge is still read on the
**head office's** clock, because "the office is open" is a fact about Lagos and not about the
reader. And the two *definitions* of a day the church owns — a notice's date (`announcements.ts`)
and the anchor instant of a service (`branchZone`) — stay on the church's clock, so a notice posted
on Friday morning in Lagos is not already "yesterday" for a reader whose clock is still on Thursday.

**The office can turn it off.** *Church profile → **Show each visitor their own time zone***
(`SITE.visitorTime`, `setVisitorTimeEnabled()`, bound by that section) puts every reader back on the
church's clock. It is off-the-shelf ON, so the shipped site is the one the ask described; the switch
exists because a church that wants one clock for a worldwide congregation should not need a
developer to get it.

**A React trap this walked into, and the fix.** The first build looked right on a fresh load and
wrong on a page that was already open: the Lagos branch would read "Sunday 1:00 AM" in the branch
strip but "Sunday 7:00 AM" in the contact page's *Sundays:* line — both on the same screen. The
cause is not the clock but the router: `resolvePath()` hands back the **same element object** every
render (they are built once in `src/lib/routes.tsx`), and React bails out of re-rendering a child
whose element is referentially identical — so when the visitor's zone arrived a moment after the
first paint, `App` re-rendered and the page it was showing did not. `SiteApp` now renders a
`cloneElement` of that element (same type, same position, so nothing is torn down and the page keeps
its own state), and the drawer's `pageNode` memo lists the visitor's zone among its dependencies.
This is the same trap note 61 fixed for the drawer with the same remedy; it is worth remembering
that **anything carried into a page from above needs that clone**, or a component that happens to
re-render on its own timer will show the new value while the rest of the page keeps the old one.

**Verified, not assumed.** All times were checked twice — once in the DOM, once against an
independent brute-force computation in the reading zone:

- With the reader forced into `America/Chicago` (the geolocation response stubbed and
  `wom.visitorClock` cleared, the *device* left on `Africa/Lagos`), the branch strip read
  **Lagos Sunday 1:00 AM**, Abuja 1:30, Edo 2:00, Ogun 1:00 — Lagos 07:00/07:30/08:00 read six hours
  earlier — while Dallas (its own `America/Chicago`) stayed at 9:00 AM, Atlanta (10:00
  `America/New_York`) read 9:00 AM and Toronto (10:30 `America/Toronto`) read 9:30 AM. The
  watch-live *Coming up* table agreed, and every countdown was unchanged: Lagos's first Sunday
  service read "Sun 1:00 AM, 61h 56m" and the instant it counted to was the same one as before.
- The contact page's *Sundays:* line moved **7:00 & 9:30 AM → 1:00 & 3:30 AM** the moment the answer
  landed, in the same page, with no navigation — the re-render fix, watched live (samples taken
  before and after releasing a deliberately-held geolocation response). Before the fix the same
  sequence left the page on the church's clock while the *chip* beside it already said "Chicago".
- The switch was exercised through the drawer: *Show each visitor their own time zone* off turned
  "Sunday 1:00 AM" back into "Sunday 7:00 AM" and on turned it back, with `aria-checked` and
  `applied().site.visitorTime` following.
- No horizontal overflow at 390px or 1440px on all fourteen public routes
  (`scrollWidth - innerWidth` = −15, the scrollbar), no console errors, no platform errors; the new
  copy line was collected by `auto-copy.mjs` (742 → 743 entries, `auto.site.9087ea3faed891fe`
  "Times shown in your local time"), and the pill was looked at on the next-gathering card and above
  the *Coming up* table at both widths.
- **The office's draft is intact:** every section still matches the shipped defaults except `live`
  (`live.isLive`, their unpublished on-air switch). The draft was snapshotted, the tests were made,
  and the stored draft was put back byte-for-byte (174,883 characters) before the final load; the
  only lasting difference afterwards is the contact page's *Sundays:* line, whose copy entry was
  replaced by the new computed one — a content refresh the console reads as part of the shipped
  words, not as a change the office made (the final draft is 175,016 characters and its change set
  is still `["live"]`). A wording change to an ordinary (unlocked) copy line was *reverted* for
  exactly this reason — an office draft that already holds a value keeps it, so editing such a
  default would have shown up in their console as a change nobody made.

## 86. Every branch can be checked for its sub-branches — on the page and on the drawer's row

> **Superseded in part by note 87:** the shipped list no longer carries any sub-branch at all (the
> office asked for Lagos to be empty like the rest), so every *Sub-branches* button on the site opens
> on this note's empty state. The button, the popup, the count and the drawer row are unchanged.

The ask: *"create a sub-branch button to check the sub-branches of each branches"*. Note 81 had
already put a *Sub-branch* button on every row of the drawer's *Branches* list, but that button
**adds** a gathering — nothing let anyone, the office or a visitor, *see what a branch already has
under it*. On the public side there was nothing at all: note 80 had taken the sub-branch wording off
the page as redundant, which left the block of sub-branch cards under Lagos unlabelled. A visitor
could see the gatherings and not that they belong to the branch above them, and a branch that has
sub-branches gave no sign of it.

**On the page: a *Sub-branches* button on every branch, and a popup saying what is under it.**

- **One definition, so nothing can disagree.** `subBranchesOf(branch)` (new, `branches.ts`) returns
  the gatherings the office ticked *Sub-branch* **and** pointed at this branch (`isSub &&
  parentId === id`) — the same test the Locations page groups its nested blocks by. The page's
  nesting, the card's button and the drawer's row count all read it.
- **The button.** `BranchCard` grows a full-width outlined row between the service times and the
  little actions: a people icon, *Sub-branches*, a solid gold count pill when the branch has any,
  and a chevron. It is on **every** branch, as asked — a branch with none opens the same popup and is
  told so rather than having no button at all. `BranchPanel` (the branch detail) carries the same
  button in its action row beside *Get directions*. `BranchCard`'s `onSelect` now takes the branch
  it is asked to show (the card hands a sub-branch up), which is why its *View map* button calls
  `onSelect?.(branch)` rather than passing the click event through.
- **The popup.** `SubBranchesPopup` (new, `blocks.tsx`) lists the branch's sub-branches one bordered
  row each — the same gold left spine the page uses to say "these sit together" — with the
  sub-branch's name, street address, its **next gathering on the reader's own clock** (SPEC note 85:
  the `nextService` + `clockHere` pair the branch panel already uses, with the local-time pill above
  them) and its phone. Each row offers **View branch** (selects that sub-branch and scrolls to its
  detail) and **Get directions** (the Google Maps deep link used everywhere else) plus the
  copy-address button. A popup locks the body while it is open, so *View branch* closes first and
  hands the branch over a tick later — otherwise the page cannot be scrolled to it.
- **Wording stays the office's.** The button caption, the popup's heading (*Sub-branches · Lagos*)
  and its empty state are ordinary copy lines (`auto.site.a8527719df5a9170` *Sub-branches*,
  `3014276958fb4df0` the empty state, `282585a33057bf1a` *View branch*). The heading is written as
  the word plus the city rather than one template, because `auto-copy.mjs` refuses a template whose
  literal parts carry a hyphenated word — so `Sub-branches` is one shared key across the card, the
  panel and the heading.

**On the drawer: the count is on the row.** The drawer is where the office does the checking, so a
branch row's aside now reads `Lagos · 3 sub-branches` (singular for one, absent for none) beside its
city. `SectionDef.itemMeta` gained the section's live list as a second argument, and the count is
taken from **that** list rather than `BRANCHES`: a sub-branch added a moment ago is counted before it
is published (verified live — adding one under Dallas turned the aside into `Dallas, Texas · 1
sub-branch` at once, and an *Undo* put it back).

**A CSS specificity trap worth naming.** `button:not([disabled]) { color: inherit }` in the base
sheet is specificity (0,1,1) — one class, plus the element — so it beats a bare
`.branch-card__subs { color: … }` (0,1,0) *whichever order they appear in*; the new row's words and
chevron were rendering in `--text` until they named their gold on their own class. `border-color`,
`background` and `font-size` were never at risk — that reset only touches `color` and the font
shorthand — which is exactly why the fault was easy to miss: the row looked *nearly* right.

**Verified live, by measurement as well as by eye.**

- On `#/locations`: **7/7** cards carry the button, the Lagos card and the Lagos detail panel carry
  the count `3`, and no other branch shows one. The Lagos popup listed **Abuja, Edo, Ogun** with
  their addresses, next gatherings (Abuja *Friday 6:30 PM · Prayer & Fasting*, Edo *Friday 10:00 PM ·
  Night Vigil (monthly)*, Ogun *Saturday 7:00 AM*) and phone numbers, each with working `tel:`,
  directions and copy controls. *View branch* on Abuja closed the popup, unlocked the page, turned
  the detail panel to Abuja and left `#branch-detail` at the top of the viewport; Dallas's button
  showed the empty state.
- **The layout was measured, not eyeballed.** At 1440×900 the popup is 753px tall with **no
  scrollbar** — three rows of 190px, a 12px gap above each row's buttons, nothing overlapping (an
  earlier snapshot *looked* clipped because the capture tool re-renders the panel without the site's
  webfont, so every geometry claim here is a `getBoundingClientRect` reading: every fact line is one
  line box at both widths). At 390px the two labelled buttons cannot share a line, so each takes the
  line it is on — *View branch* full width, *Get directions* with the copy button at its end — all
  inside the 350px panel, and `scrollWidth - innerWidth` is −15 on all eleven routes swept.
- Vision passes at both widths in **both themes** read back the gold row on the Lagos card, the
  four-button detail action row and the popup's three cards, with no overlap or clipping; the light
  theme keeps the row legible (dark-gold words, gold pill reading `3`), the dark theme shows the
  gold row and outline clearly.

**The office's draft is intact.** The drawer was exercised (their session was already signed in) and
one sub-branch was added and undone. The snapshots taken before and after differ in exactly one
thing — the three new copy lines the console pulled into the draft with their shipped defaults
(`copy-site`: 220 → 223 entries) — and in nothing else, section by section. The final load's change
set is still `["live"]`, the office's own unpublished on-air switch, and the draft now stands at
175,338 characters.

## 87. Lagos has no sub-branches either — every branch opens on the empty state

The ask: *"let the sub branches in lagos too be empty"*. Note 86 had just put a *Sub-branches* button
on every branch, and Lagos was the only branch with anything behind it: Abuja, Edo and Ogun had been
set as its sub-branches in note 79 (*"which is what the country's structure actually is"* — the
assistant's reading, never an instruction from the office). The office wants that list empty the way
the other six branches' are, so **the three are branches in their own right again** and every
*Sub-branches* button on the site opens on *No sub-branches yet*.

- **The data.** `isSub`/`parentId` are gone from Abuja, Edo and Ogun in `src/data/branches.ts`. The
  two fields, `subBranchesOf()`, the `.branch-sub` panel and the popup are all still there and
  unchanged, so *Add a sub-branch* in the drawer puts one back the moment the church wants one; the
  top of the file says so, because a reader who finds `isSub` documented and unused should not think
  it is dead.
- **The page.** Nigeria now renders as one grid of four cards — Lagos (with its GLOBAL HQ badge),
  Abuja, Edo, Ogun — with **no nested panel** under Lagos, no count pill on any card and the detail
  panel's plain *Sub-branches* button. The stats row would have read *7 branches · 3 countries ·
  **0 sub-branches***, so its third chip now renders only when there is something to count (*7
  branches · 3 countries*); the copy line stays in the source, so it comes straight back with the
  first sub-branch the office adds.
- **The office's draft had to be put back — and this time its flag had to go too.** The draft holds a
  copy of every list, and it still held the old branches: after the shipped change the drawer showed
  Abuja/Edo/Ogun indented under Lagos with their `↳ Lagos` chips while the page showed four plain
  cards, and the bar counted a change nobody had made (*2 unsaved changes*). The section was reset
  from the drawer's own **Put this back to the original** — the office's way, as in notes 79 and 82 —
  which put the new list into the draft and the count back to *1 unsaved change*. A reset **marks the
  section `dirty`**, though, and a section flagged dirty is never re-based onto the shipped list again
  (`rebaseDraft()` skips flagged sections), which is exactly the trap that made this one visible in
  the first place — so `branches` was also cleared from the stored draft's `dirty` map
  (`wom.cms.draft`), leaving that section a follower like the other 49. `site` and `copy-home` carry
  the same stale flag from older resets; they were left exactly as they were.
- **Verified live.** On `#/locations`: **0** `.branch-sub` panels, **0** count pills, seven cards, the
  stats row reading *7 branches · 3 countries*, and Lagos's popup reading *Sub-branches · Lagos* /
  *No sub-branches yet — this branch gathers on its own.*; a vision pass over the Nigeria block read
  four identical cards in a tidy grid with no nested box around any of them. In the drawer, after the
  reset: seven flat rows (`Lagos`, `Abuja`, `Edo`, `Ogun`, `Dallas, Texas`, `Atlanta, Georgia`,
  `Toronto, Ontario`) with no chips, no indent and no counts, each still wearing its *Sub-branch*
  button, and the bar reading *1 unsaved change*. On a public route the draft differs from the shipped
  content in **`live` alone** — the office's unpublished on-air switch — exactly as it did before this
  change.

## 88. The giving reference, the personal giving log and the *Card / online* method are gone

The ask: *"remove this: Card / online / Processed instantly over an encrypted connection, You are
giving … Reference created … Copy reference … Download giving slip … QR code linking to this giving
page … My giving record … Clear record"* — a paste of the whole tail of the giving wizard: the
card method, the *You are giving* summary with its **Generate giving reference** button, the
reference card that button produced (badge, reference, note, copy / download / email buttons, the
QR block and the *never share your reference* notice) and the sidebar's *My giving record* card.

- **What went.** `src/pages/Giving.tsx` lost the `.give-summary` block, the whole `.give-reference`
  block, the `QrCode` component (and with it the `qrcode-generator` import — nothing else used the
  library, so it is out of the bundle, `BARE` and the README), the `reference` state, `slip()`,
  `givingLink` and the now-derelict `activeFund` / `effectiveAmount` helpers. The sidebar keeps its
  verse and *Need help?* cards, so `.giving-side` is two cards. `GIVING_METHODS`
  (`src/data/content.ts`) lost the `card` entry — the one method that promised *processed instantly
  over an encrypted connection* — and the wizard's default method is `transfer`; step 3 is **Bank
  transfer / Mobile money / In person**.
- **The copy that named it.** `giving.reference.note`, `giving.reference.qr`,
  `giving.reference.qrText`, `giving.reference.warning`, `giving.log.title` and `giving.log.note`
  are deleted from `src/data/copy.ts` (so note 50's locked-line list no longer matches: four of its
  *Giving* lines are gone), and re-running `src/tools/auto-copy.mjs` dropped every string the
  removed buttons carried — **746 → 722** entries, because the tool only keeps what a `ct()` still
  points at. `giving.bank.note` now reads *"Put your name and the fund in the payment narration
  where possible."* (it used to send the giver to their reference) and the giving FAQ *"How do I
  get a receipt?"* asks for *the date and fund of your gift* instead. `givingRef()` left
  `src/lib/store.ts`.
- **Left alone, deliberately.** The member area still shows its *Giving recorded* stat and its *My
  giving* card (`src/pages/Library.tsx`), and `useGivingLog()` / `KEYS.giving` (`wom.givingLog`)
  stay — a record an older version saved can still be seen and cleared (*Clear my data*). Nothing
  writes to it any more, so it can only ever be empty; say the word and the stat and the card go too.
- **The office's draft had to be put back.** `givingMethods` and `givingFaqs` are plain list
  sections, so `mergeSection()` takes a stored draft's copy whole: after the shipped change the
  draft still held the four-method list and the old receipt answer while the page and the drawer
  showed three, and the bar counted *3 unsaved changes* — publishing would have written the old
  list back as an override. Both sections were re-based to the shipped content in the stored draft
  (`wom.cms.draft`) and cleared from its `dirty` flag, the way `rebaseDraft()` does for a section
  nobody has edited; no *Put this back to the original* was pressed, so nothing picked up a `dirty`
  flag it did not have (note 87's trap). `dirty` is still exactly `["live", "site",
  "copy-home"]` and the draft again differs from the shipped content in **`live` alone** — the
  office's unpublished on-air switch. 175,226 → 175,145 bytes.
- **Verified live.** `#/giving` shows three method buttons with their notes and no `.give-summary`,
  `.give-reference`, `.giving-log` or `.qr` anywhere, and no *reference* in the page text at all; a
  vision pass over `.giving-grid` at 1440×900 and at 390×844 read the wizard card ending cleanly at
  the *note to the finance team* box, then the *On generosity* and *Need help?* cards, with no gaps
  or orphans. The *Where it goes* tab still opens its allocation card and six fund cards, *Give to
  this fund* still lands back in the wizard, and *Other ways* shows the new bank-transfer note. The
  drawer's *Ways to give* section lists the three methods and offers *Add another* / *Put this back
  to the original*; a fourteen-route sweep at both widths reported no overflow, no console errors
  and no `platformErrors`.

## 89. The audit claims, the *Mobile money* method and the one-time/monthly chips are gone — and the amount buttons no longer glow gold on hover

The ask: *"remove this: in 41 nations. Every account is independently audited and published annually
to members. Mobile money / Available in Nigeria, America and Canada. One-time gift / Monthly
partnership. Our full accounts, including the auditor's opinion, are published to members every
March and available from the church office on request. disable the yellow hover in choose
amount"* — five lines off the giving page, plus one CSS rule.

- **The lines.** `giving.head.lede` (`src/data/copy.ts`) loses *in 41 nations* and the whole
  *Every account is independently audited…* sentence, so the page head now reads *"Your tithes and
  offerings keep the lights on, the pantry stocked, the missionaries sent and the gospel
  preached."* The `mobile` entry leaves `GIVING_METHODS` (`src/data/content.ts`) — step 3 is **Bank
  transfer / In person** and the method icons fall through to `home` / `people`. The one-time /
  monthly chips leave the wizard with the `frequency` state that fed them (nothing else read it
  since note 88), and the *Allocation — audit notice* Notice leaves the *Where every $100 goes*
  card (`giving.alloc.audit` is deleted from `copy.ts`, and `Notice` and `Chip` leave the page's
  imports). Re-running `src/tools/auto-copy.mjs` dropped the two chip labels — **722 → 720** entries.
- **The hover.** `.amount-btn:hover { border-color: var(--gold) }` (`src/styles/pages.css`) is gone,
  so pointing at an amount no longer flashes the gold that also means *this one is chosen*; the
  selected button keeps its gold gradient (`.amount-btn--active`), which is the only gold in the
  grid now. Verified through the CSSOM on the live page: no `:hover` rule matching `.amount-btn`
  survives in either stylesheet, in the source or in the built `app.css`.
- **The office's draft had to be put back again.** `givingMethods` is a plain list section, so the
  stored draft still held the three-method list after the shipped change; it was re-based to the
  shipped two in `wom.cms.draft` and left out of `dirty` (which is still `["live", "site",
  "copy-home"]`). The draft differs from the shipped content in **`live` alone**, and the drawer's
  *Ways to give* section shows two rows. The copy lines needed nothing: `giving.head.lede`,
  `giving.alloc.audit` and `giving.alloc.note` are `locked`, and `mergeSection()` ignores a stored
  value for a fixed line — which is why no *copy-giving* change appeared either this time or in
  note 88.
- **Verified live.** `#/giving`: no `.chips` row, two method buttons with their notes, no *41
  nations* and no audit sentence anywhere in the page text; the *Where it goes* tab's allocation
  card now ends at the progress bars (no lock-icon notice) and *Give to this fund* still works; a
  vision pass over `.give-panel` at 1440×900 and 390×844 read the wizard as finished, with no
  leftover pills and no overflow. The fund cards the snapshot *looked* clipped in are the known
  snapDOM-without-webfont artefact (SPEC note 78): measured on the live page every card is the same
  height with zero overlap and zero clipped pixels.
- **Left alone, deliberately** (say the word): the *Independently audited figures from our most
  recent financial year.* line under the allocation heading and its *Administration & audit* bar
  (`giving.alloc.note` / `GIVING_BREAKDOWN`), the home page's *Every gift is stewarded with
  transparency and audited annually* giving block (`GivingCTA`), the *Mobile money* card in the
  *Other ways* tab (its wording is the longer *"Available on all major networks…"*, not the line
  that was removed), and the step-3 *note to the finance team* box, which still has nothing reading
  it (note 88).

## 90. The giving page is down to one account, no *$ Other*, and an *Account details* tab

The ask: *"remove this: $ Other, other ways replace with account details with only lagos account
details"*.

- **The custom amount is gone.** The dashed *$ Other* box (`<div className="amount-custom">`,
  with the *Other* placeholder and its aria label) left step 1, together with the `custom` state
  that fed it, so the step is the six preset buttons and nothing else — `amount-btn--active` now
  keys off the chosen preset alone. `.amount-grid` keeps its three columns at every width (the
  `min-width: 700px` override that made room for a seventh box is deleted), so the six read as two
  even rows of three on a phone and on a desktop.
- **The third tab is *Account details*.** The label is a literal in `Giving.tsx`, so the copy
  collector minted a fresh entry for it (`auto.giving.d5e1031bb2373cc2`) and retired *Other ways*.
  The id underneath is still `other`; no link or query reached it.
- **Only the Lagos account.** `BANK_ACCOUNTS` (`src/data/site.ts`) is one entry now — the head
  office's: *Lagos (NGN) / Covenant Microfinance Bank, Lagos / World Overcomers Ministries
  Ltd/Gte / 0133447788*. The US and Canada accounts (both placeholders) are out of the data, so the
  drawer's *Bank accounts* section and the page agree, and its `sort: "N/A"` went with them — that
  field renders as an *Extra reference* row, and *N/A* is not an account detail.
- **The four cards that were in that tab went with the name.** *Standing order*, *Mobile money*,
  *Legacy & wills* and *Giving, not extraction* are deleted from `src/data/copy.ts`
  (`giving.standing.*`, `giving.mobile.*`, `giving.legacy.*`, `giving.integrity.*`) and from the
  page, so the tab is only what its name says. Two of them had already lost their footing —
  *Standing order* promises a monthly partnership, which is the chips note 89 removed, and *Mobile
  money* was that note's method. Each is one block to put back; the collected strings they carried
  dropped out with them (**720 → 711** entries).
- **The single card fills its row.** `.bank-grid`'s `>=800px` rule is `repeat(auto-fit,
  minmax(320px, 1fr))` instead of a fixed three columns, so one account spans the card and a second
  or third added from the drawer tiles again rather than leaving two thirds of the row empty.
- **The office's draft had to be put back again.** `bankAccounts` is a plain list section, so the
  stored draft still held all three accounts — the drawer would have shown three while the page
  showed one, and publishing would have written them back as an override. It was re-based to the
  shipped single account in `wom.cms.draft` and left out of `dirty` (still `["live", "site",
  "copy-home"]`). `copy-giving` needed nothing: `mergeSection()` maps a fixed section over the
  shipped rows, so the deleted ones leave the draft by themselves (its 45 rows no longer carry any
  of the four cards).
- **Verified live.** Step 1 shows six amount buttons in two rows of three with no custom box; the
  *Account details* tab shows *Bank transfer details*, its note, and one account block (badge *Lagos
  (NGN)*, bank, account name, account number and its copy button) with no callout cards; vision
  passes over both panels at 1440×900 and 390×844 read them finished, with nothing clipped, empty,
  orphaned or overflowing; a fourteen-route sweep reported no overflow and no console or platform
  errors; and the draft differs from the shipped content in **`live` alone**.

## 91. *Give now* opens *Account details* — and the giving panel lives in the address

The ask: *"when Give now button is clicked it should move to the account detailes page"*.

- **The header button goes to *Account details*.** The gold `Btn` in the page head (the only
  *Give now* button on the page, `auto.giving.69337ad1b8cc24c8`) used to select the *Give now* tab
  — which is the tab it sits above, so it looked inert. It now opens the third panel, which is
  where an online visitor actually gives (there is no card or transfer-from-here flow any more).
  The button keeps its wording; only its destination changed. The *Give now* tab itself is
  untouched, so the three-step wizard is still one click away.
- **Which panel is open is now in the address.** `Giving` reads `useRoute().query` for
  `tab` ∈ `give` | `funds` | `other` (anything else, or nothing, is *Give now*), and `setTab`
  writes it back with `navigate("/giving", { tab }, { replace: true })`. Two consequences. The
  panel survives a reload and can be linked or shared (`#/giving?tab=other`), and while the panel
  changes the address never leaves `/giving` — `App.tsx` scrolls to the top only when the resolved
  path changes, so there is no jump — and `replace` keeps the back button meaning "the page
  before" rather than leaving three panels in the history. `buildUrl` carries the `/admin` prefix,
  so the same switcher works in the office's view and stays there. The default tab keeps the clean
  address (`#/giving`), so nothing you already link to gains a query.
- **Two links that never worked now do.** Home's giving band carries `<Btn to="/giving"
  query={{ tab: "funds" }}>` (*See where it goes*) and the page ignored the query, so it landed on
  *Give now*; and that band's *Give now* (`auto.site.b17847913539ca88`) pointed at bare `/giving`.
  The first now opens *Where it goes*, and the second was given `query={{ tab: "other" }}` so the
  two buttons of that band and the page's own *Give now* button all mean the same thing.
- **No copy moved.** Only a destination and a URL parameter changed, so no literal in `Giving.tsx`
  changed and the copy collector was not re-run (711 entries, unchanged).
- **Verified live.** Clicking the page-head *Give now* at 1440×900 and at the editor's natural
  width swaps `.give-panel` for `.other-panel` and sets `#/giving?tab=other` with no scroll jump;
  the three tabs still switch panels and keep the address in step; `#/giving?tab=funds` opens
  *Where it goes* on a cold load and a bogus value falls back to *Give now*; Home's *Give now*
  lands on *Account details*; the same clicks under `#/admin/giving` stay under `/admin`; the
  account card still reads *Covenant Microfinance Bank, Lagos / World Overcomers Ministries
  Ltd/Gte / 0133447788*; and the office's draft still differs from the shipped content in `live`
  alone.

## 92. The wizard tab is now *Steps*

The ask: *"Give now: replace this to steps"*.

- **The first tab reads *Steps*.** It is the only *Give now* that did not mean "show me how to
  give" — note 91 sent the page-head button of that name to *Account details*, and the tab under
  it opened a wizard whose own headings are *Step 1 — choose an amount*, *Step 2 — choose a fund*
  and *Step 3 — how would you like to give?* So the tab now says what it holds, and the tab row
  reads *Steps · Where it goes · Account details*. The tab's `id` is still `give`, so addresses and
  the query (`?tab=give`, or `#/giving` alone) are unchanged and note 91's plumbing needed nothing.
- **New collected id, old one retired.** The label was a literal written back into `Giving.tsx`,
  so the collector minted `auto.giving.59244d45d165533c` (= *Steps*) and dropped
  `auto.giving.083077ebc15a7572` (= the tab's old *Give now*) — the entry count is unchanged at
  **711**, and the page-head button's own *Give now* (`auto.giving.69337ad1b8cc24c8`, fixed, it
  carries `role: "button"`) was not touched. `copy-giving` is a *fixed* section, so the retired row
  leaves the office's stored draft by itself through `mergeSection()` — no hand-rebasing needed this
  time.
- **Verified live.** The tab row reads *Steps* (active) · *Where it goes* · *Account details*; the
  *Steps* tab still opens the three-step panel with all three headings, six amount buttons, six
  funds and two methods; the page-head *Give now* still opens *Account details*; the address stays
  `#/giving` on the default tab; nothing is clipped or overflowing; and the office's draft still
  differs from the shipped content in `live` alone.

## 93. The "Times shown in your local time" pill is gone

The ask: *"donot let this be visible: Times shown in your local timeLagos"*.

- **What it was.** `<LocalTimeNote />` (`src/components/blocks.tsx`, SPEC note 85) — a small pill
  reading *Times shown in your local time · <place>*, where the place is the visitor's own, found
  from their IP address. It sat in seven places: the next-gathering card
  (`NextServiceCard`), the sub-branches popup (its own `subbranch-pop__clock` row, which went with
  it), the footer's link row (`.footer__meta`), and near the tables of times on Contact, Events,
  Prayer and Watch Live.
- **All seven are done.** The component, its doc comment and its three now-unused imports went with
  them (`useVisitorClock` from `src/lib/visitor`, `visitorTimeEnabled` and `zoneLabel` from
  `src/lib/store`), plus the import of `LocalTimeNote` in `layout.tsx` and the four pages. The
  collected string retired itself — **711 → 710** entries — since `copy-site` is a fixed section,
  `mergeSection()` drops the row from the office's stored draft on its own. Its `.local-clock` rules
  are still in `src/styles/global.css` (and `.subbranch-pop__clock` in `src/styles/pages.css`),
  unused, as the cheapest way back.
- **A symptom, not the clock.** The pill appeared because the visitor's own clock *is* the clock the
  site shows (SPEC notes 84/85) — a reader in Lagos was being told the times were Lagos times. So
  removing it does not change a single time on the site: while the office's switch is on (*Church
  profile → Show each visitor their own time zone*) a visitor abroad still reads their own clock,
  now without the explanation. Flipping that switch off pins every reader to the church's clock.
  The place name was never the church's — it came from the visitor's IP, so it also read oddly when
  the lookup landed a nearby city.
- **Verified live.** Zero `.local-clock` elements and no *Times shown in your local time* anywhere
  in the page text on `/`, `/contact`, `/events`, `/prayer`, `/watch-live`, `/giving`, `/locations`
  and `/visit`; the next-gathering card still reads *Thursdays at 10:00 PM · Lagos* above its
  countdown with no leftover gap (vision passes over the card and the footer's link row, and every
  footer link measures `scrollWidth === clientWidth`); the sub-branches popup still opens; no
  overflow on any route; and the office's draft still differs from the shipped content in `live`
  alone.

## 94. The footer's bottom row is the copyright line alone

The ask: *"remove this: Contact / Donate / Plan a visit / Share this page"*.

- **What went.** `.footer__meta` — the small row at the foot of the footer, under its rule, that held
  four links: *Contact* (`/contact`), *Donate* (`/donate`), *Plan a visit* (`/visit`) and *Share this
  page* (the absolute address of the site's own top-level page, built by `absoluteLink("/")`). The
  `<span className="footer__meta">` and its four children are gone from `layout.tsx`; the
  `© <year> <church name>. All rights reserved.` line is now alone on that row.
- **Nothing was orphaned.** Those four routes are still linked from the footer's own columns (*Contact
  us*, *Donate online*, *Plan your visit*) and from the top bar and menu, and the share buttons
  inside `src/components/ui.tsx` (sermons, events, testimonies) still use `absoluteLink()` — only
  `layout.tsx`'s import of it was dropped. The footer's other columns, the newsletter form and the
  social row are untouched.
- **Four collected strings retired themselves** (**710 → 706**): the ids are per source file and per
  wording, so these were the footer's own copies of the words. The same words elsewhere keep theirs —
  *Plan a visit* is still collected for the buttons that use it, and *Contact* / *Donate* stay for the
  columns and the menu. `.footer__meta`'s styling is still in `src/styles/global.css`, unused.
- **Verified live.** On `/`, `/contact`, `/events`, `/visit` and `/watch-live` the bottom row reads
  only *© 2026 The World Overcomers' Ministries Inc.. All rights reserved.*, no `.footer__meta`
  element exists, nothing overflows, and vision over the whole footer at 1440×900 reads it balanced
  (single rule, left-aligned copyright, no stray gap). The office's draft still differs from the
  shipped content in `live` alone.
- **A nit left for the office:** the copyright line prints *Inc..* — the church's name ends in
  *Inc.* and the collected suffix (`auto.site.9dbf1a6691d1bfa7`) starts with its own full stop. It
  reads that way only because nothing else is on the row now, and it is one string to fix.

## 95. The note under the live player leads with the promise

The ask: *"This preview plays the most recent service while the live player switches over. On a live
Sunday the current broadcast appears here automatically: give a statement saying all live broadcast
appears automatically"*.

- **The line is reworded.** `live.preview.note` (`src/data/copy.ts`, still `locked: true`, still the
  same id) now reads *"All our live broadcasts appear here automatically — whenever we go on air, this
  player switches over by itself. Until then you are watching our most recent service."* The old
  wording explained the machinery (*this preview plays the most recent service while the live player
  switches over*) and then made the promise about one day only (*on a live Sunday*); the new one
  states the promise first — every broadcast appears here by itself — and keeps the one fact a
  visitor still needs, that what is playing meanwhile is the most recent service.
- **Where it shows is unchanged** (SPEC note 68): only in the *on air, nothing to play yet* state —
  the panel is live because the office's switch or the service clock says so, but no stream id has
  been found, so the last message plays under the notice. The *Live has ended* screen and
  `live.fallback.*` are untouched, and nothing else on the page moved.
- **Verified live.** With the office's own draft (its *We are on air right now* switch is on; the
  shipped content has it off, which is why the public page shows *Live has ended*), the panel renders
  the notice and vision reads the new sentence back word for word, wrapping to two lines inside the
  strip with nothing clipped or overflowing. The office's draft is still unsaved in `live` alone.

## 96. "Add to calendar" opens the visitor's own calendar, already named

The ask: *"the add to calender button when clicked should automatically go to device clander reminder
with automatically giving it the title"*.

- **What the buttons did.** Every calendar button called `downloadText(….ics, toIcs(…), "text/calendar")`
  — a silent download of an .ics file, which on a phone lands in Files/Downloads with nothing visibly
  happening. The one on Watch Live was worse than that: its `onClick` was
  `downloadText("service.ics", "", "text/calendar")` — an **empty** .ics, no title at all — and it was
  a `Btn` with `to="/events"`, so the tap both downloaded a nameless file and navigated away to the
  Events page. That is the button the church tapped.
- **`addToCalendar()` and `calendarInvite()` are new** (`src/lib/store.ts`, beside `toIcs`).
  `calendarInvite()` is pure — it returns the .ics text, a slugged filename and a pre-filled
  Google Calendar link (`action=TEMPLATE` with `text` / `dates` / `details` / `location`, built from
  `URLSearchParams`) — so the two shapes a web page can offer a device are in one place and can be
  checked without side effects. `addToCalendar()` hands the event over:
  - **Anywhere but Apple** the pre-filled Google Calendar page opens in a new tab. The title, the
    start and end (UTC, from the same stamp `toIcs` writes), the details and the place are already
    in it, and on Android the Google Calendar app takes it from there — the event is in the phone's
    calendar with one tap on *Save*.
  - **iPhone/iPad (and Safari on a Mac)** get the .ics handed to the browser instead
    (`appleCalendar()`), because no web page can write into Apple Calendar directly; Safari takes it
    to Calendar, where the event is already named.
  - **If the browser refuses** (an in-app browser blocking the new tab) the .ics is downloaded, with
    the same "Downloaded …" toast as before — so the button still does something everywhere.
- **The title is the event's own.** Every call site passes the record it belongs to: the event's
  title on Events (featured, list row and the card), `Sermon: <title>` on a sermon, and on Watch
  Live the next gathering — `«slot name» — «church name»`, the branch and its street address in
  `description`/`location`, from `nextService()`. The Watch Live button lost its `to="/events"`, so it
  no longer navigates away. Filenames are the slugged title, cut at 48 characters, so a download is
  called `night-vigil-fortnightly-the-world-overcomers-min.ics` rather than a paragraph.
- **The .ics now carries a reminder.** `toIcs()` writes a `VALARM` (`TRIGGER:-PT30M`,
  `ACTION:DISPLAY`) inside the event, so importing it sets an alert half an hour before — a reminder
  rather than a bare entry. No new copy was needed: the only user-facing words are the existing
  "Downloaded …" toast.
- **Verified live.** With `window.open` stubbed, clicking each of the five buttons hands over a
  Google Calendar URL whose `text` is the right title and whose `dates`/`location` match the record
  (e.g. *Night Vigil (fortnightly) — The World Overcomers' Ministries Inc.*, `20260924T210000Z /
  20260925T010000Z`, the Oke-Odo address); with the user agent set to iPhone the same clicks hand
  over a `blob:` .ics, which reads back as
  `SUMMARY:Night Vigil (fortnightly) — …` / `DTSTART` / `DTEND` / `LOCATION` / `VALARM TRIGGER:-PT30M`;
  with `window.open` returning `null` the file downloads and the toast names it. The Watch Live tap
  leaves the address at `#/watch-live`, and the button — now a `<button>` rather than a link — computes
  to exactly the same box, border, padding, font and colours as the untouched ghost buttons beside it.
  The office's draft still differs from the shipped content in `live` alone.

## 97. The *Coming up* service-times band has left the watch-live page

The ask: *"remove this here: Coming up / Service times across our branches / Every branch / Nigeria /
America / Canada / …🇳🇬 Lagos …"* — the whole band, heading, country chips and table.

- **What went.** The `<Section>` on `src/pages/WatchLive.tsx` that headed itself *Coming up* /
  *Service times across our branches*, carried the four country chips (*Every branch*, *Nigeria*,
  *America*, *Canada*) and listed the next eight gatherings of every branch — flag and city, the
  branch's full name, the gathering, its day and time on the visitor's clock, the "57h 54m" countdown
  and a *Branch* button to `/locations?branch=…`. Heading, chips, table and rows are all gone, and the
  page now runs straight from *Missed the last one?* into *Recent services* (verified: no
  `.schedule-table`, no `.chips`, no `?branch=` links, and no gap or orphaned rule where it stood).
- **The machinery went with it.** The `zone` state (the chip filter), the `upcoming` memo that built
  the rows out of every branch's schedule, `filtered`, and the now-unused `COUNTRIES`, `Chip`,
  `clockAt` and `nextOccurrence` imports. `nextService()`/`clockHere()`/`to12h()`/`DAY_NAMES` are
  still used by the live panel above, exactly as before — nothing about the countdown or the *Next
  broadcast* line changed. The branch schedule itself is untouched and still shown where it belongs:
  `ServiceTimesList` on `/locations` (and the branch cards), which is a different component
  (`.times-list`, not the removed `.schedule-table`).
- **The wording left too.** The two hand-written lines *Coming up* / *Service times across our
  branches* (`live.coming.eyebrow`, `live.coming.title`) are deleted from `src/data/copy.ts`, and the
  eight collected ones died with their last `ct()` call — **706 → 698** entries. Nothing else linked
  to that band, so no link is left dangling (the `/locations` *Branch* buttons it held are still
  reachable from the locations page itself). `.schedule-table`'s styling is still in
  `src/styles/global.css`, unused.
- **Verified live.** The band is absent at 1440 and at the editor's width, `Nigeria`/`America`/
  `Canada` appear nowhere on the page outside the footer address, the bands under it (*Recent
  services*, *Services we have broadcast*, *Everywhere you already are*) are unchanged and vision
  passes over the full page with no gap where the table was, no overflow, no console or platform
  errors, and the office's draft differing from the shipped content in `live` alone.

## 98. The money is read in the visitor's own currency (found from their IP, like the clock)

The ask: *"time and currency should be determined by visitors coming to the website ip address"*.
The clock half was already true (notes 84/85); this note is the money half. The same IP lookup that
finds the visitor's time zone now finds their **country**, and everything the church writes down as
money is read back in that country's currency.

- **One lookup, four answers.** `src/lib/visitor.ts` asks for the country and the currency in the
  same request that asks for the time zone (`ipapi.co/json` answers with all of it; `geojs` and
  `ipinfo` answer with the country, which the generated table turns into a currency — so the lookup
  order is now ipapi.co → geojs → ipinfo → ipapi.co/timezone). The clock it hands back carries
  `{ tz, place, country, currency }`, cached under the same `wom.visitorClock` key and stamped
  `v: 2` (`VISITOR_CLOCK_V`); an older cache is treated as stale and looked up again rather than used
  as it is, so a returning visitor gains the currency without losing their clock in the meantime
  (nothing is cleared — the old clock keeps painting until the new answer lands). When no IP service
  answers at all, the *device* now also supplies the country for the currency (the region of
  `navigator.language`, "en-NG" → "NG"), alongside the device time zone it already supplied.
- **Country → currency is generated, not typed.** `src/data/currencies.ts` is new and generated:
  `COUNTRY_CURRENCY` (246 countries, 154 currencies, from the `world-countries` dataset —
  restcountries data) and `FALLBACK_RATES` (a snapshot of the live feed's rates, taken 2026-09-23,
  "1 US dollar buys this much"). Seven countries are pinned by hand because the dataset's first
  currency for them is not the one people spend: CK → NZD, CU → CUP, EH → MAD, PA → USD, PS → ILS,
  SH → SHP, ZW → USD.
- **The rate comes from the visitor's own browser.** `src/lib/rates.ts` (new) is the second half of
  the module pair — it fetches a keyless, CORS-open daily feed *directly* from the visitor's machine
  (the same reason the clock lookup is a plain `fetch` and not `superFetch`), caches it under
  `wom.fxRates` for half a day, and tries the feed's second mirror and then a different provider
  before giving up. It only fetches when a rate has something to do: `ratesNeeded()` is false for a
  reader whose own currency *is* the church's, so those readers cause no request at all (the app
  calls `startRates()` again when the visitor's clock arrives, since until then the currency is
  unknown). Until — and if — the fetch lands, the shipped snapshot is what converts, so no page ever
  waits on money, and the figures are simply a day or two old rather than missing.
- **Where the money lives.** The money section of `src/lib/store.ts`: `baseCurrency()` (the church's
  own — `Church profile → Currency`, or `churchCurrency` in `main.pjs`, USD by default),
  `currencyOfCountry()`, `visitorCurrency()`, `displayCurrency()` (the visitor's own when it is known,
  the switch is on, and a rate exists for it; the church's otherwise), `convertMoney()`, `fmtMoney()`
  — which now converts, and rounds a converted amount to three significant figures so a rate cannot
  turn $25 into "₦38,281.34" — and `moneyText()` for the dollar figures inside the church's own
  prose. `fmtMoney(amount, currency)` still names the currency the *amount* is in, defaulting to the
  church's; converting an amount into the currency it is already in is a no-op, which is exactly why
  a reader of the church's currency sees the figures the office typed, to the dollar.
- **What it reaches.** The giving wizard's six amount buttons, *Where every $100 goes*
  (`moneyText()`), the giving total and the giving log in `/#library`, and every event's cost —
  *$15 per teen* → *NGN 19,900 per teen* — through `moneyText()` at the two places a cost is drawn
  (`blocks.tsx`'s event card and `/events`' featured event). A small muted line under the amount
  buttons said why the figures were not the church's: `giving.fx.note`, one new **hand-written** copy
  entry with `{{base}}`/`{{local}}` (the auto-collected count is unchanged at 698), shown only to a
  visitor reading in a currency of their own — **removed again the same day at the church's request
  (SPEC note 99)**; the conversion stayed, the explanation went.
- **The office keeps control.** *Church profile* gains two fields, beside the two time ones:
  **Currency** (text, ISO code, `USD`) and **Show each visitor their own currency** (switch, on).
  Off, every reader gets the church's currency and the note disappears with the conversion. Verified
  live by flipping the switch in the drawer and watching the giving page fall back to
  `US$25 … US$1,000` and *Where every $100 goes*.
- **Deliberate limits.** A "$" in the office's copy is read as the church's currency — there is no
  way to write a figure that is already in another one. One quoted figure is left alone: a
  testimony's *"$48,000 of consumer debt"* is a person's own story in the money of the country they
  lived it in, not a price this site is quoting. The bank details are not money and are untouched.
  Because the buttons now carry a currency code and a grouped figure ("NGN 1,330,000"), a narrow
  phone drops the amount grid to two roomier columns (`@media (max-width: 600px)`).
- **Verified live.** On the visitor's own IP (Lagos, NGN): the giving page reads *NGN 33,200 …
  NGN 1,330,000* at the day's fetched rate (288 currencies in, `NGN 1326.63`), the note reads
  *Amounts are set in USD and shown in NGN at an indicative exchange rate.*, the allocation heading
  reads *Where every NGN 133,000 goes*, the event costs convert, and *Total given* in the library
  converts with them. With a US clock seeded the same page reads *US$25 … US$1,000* with no note and
  *$100* in the heading, and *no dollar sign survives anywhere on the site except that one
  testimony*. At 390×844 the six buttons are 2×3, single-line and `scrollWidth === clientWidth` on
  every one (no page overflow); the drawer shows both new fields and both switches in the right
  order; the office's draft still differs from the shipped content in `live` alone; and no console,
  platform or syntax errors on any of the fourteen routes.

## 99. The rate note and the live card's schedule line are gone — the card says what it does

The ask: *"remove this: Amounts are set in USD and shown in NGN at an indicative exchange rate.
Sundays 9:00 & 11:30 AM (CT) put a statement that whenever broadcast is active"*.

- **The rate note is gone, the conversion stayed.** The `.give-fx` paragraph under the amount
  buttons — *Amounts are set in USD and shown in NGN at an indicative exchange rate.* — was the
  `giving.fx.note` copy entry added in note 98 hours earlier. The line, the entry (a hand-written one,
  added and retired the same day), the `.give-fx` rules in `src/styles/pages.css` and the three store
  imports it needed (`showingOwnCurrency`, `baseCurrency`, `displayCurrency`, dropped from
  `src/pages/Giving.tsx`) are all removed. **A visitor still reads the amounts in their own currency**
  — the wizard's buttons, *Where every $100 goes* and every event cost are untouched, and a reader of
  the church's own currency still sees the office's figures exactly as typed; there is now simply
  nothing on the page explaining why. `showingOwnCurrency()` is still exported and still used, by
  `moneyText()`.
- **The live card's schedule line became a statement of what the card does.** The *Live stream* card
  in *Ways to watch* (`LIVE.watchOptions[0]` in `src/data/live.ts`; the same row is drawn on
  `/watch-live` and on `/sermons`) read *Sundays 9:00 & 11:30 AM (CT)*. It now reads **Plays here
  whenever our broadcast is active**. The other three cards — YouTube, Facebook, Sermon archive — are
  untouched, as is the note under the player from note 95. Nothing else on the site carried that
  schedule line: the *Kingdom Kids* ministry's own *meets* line (*Sundays, 9:00 & 11:30 AM*) and the
  membership FAQ are their own content and stay.
- **The office's own copy of the card was updated with the drawer, not around it.** The live section
  is a record the office edits, and a stored copy overrides the shipped one (the branches note in
  `TODO.md` says the same about lists), so changing `live.ts` alone would have let the old line come
  back the next time they pressed Publish. The field (*Live stream → Ways to watch cards → the first
  card's value*) was edited through the drawer's own input, which keeps their unsaved change intact
  (the *We are on air right now* switch is still on) and writes the draft through `setSectionValue`,
  so the undo stack, the dirty flag and `persistDraft()` all behave as they would for the office. The
  live section has never been published (`overrides` is empty), so the shipped value and the published
  one already agree — the draft now agrees too.
- **Verified live.** *Plays here whenever our broadcast is active* on the *Live stream* card at
  `/watch-live` and `/sermons`; no `(CT)` anywhere in the page text; nothing between the amount
  buttons and *Step 2 — choose a fund*, and no leftover gap where the note was (vision over the giving
  panel, six NGN buttons still 3×2 and aligned); the drawer's field, the stored draft and the shipped
  value all carry the new words, with the draft still differing from the shipped content in `live`
  alone (their on-air switch) and no console, platform or syntax errors.

## 100. The visit wizard's branch notice is gone

The ask: *"remove this: All branches preach the same message each week, and every one has Kingdom
Kids for ages 3–11."*

- **The line is gone, nothing else moved.** The sentence was the `visit.step1.notice` copy entry
  (`locked: true`) in the *Plan a visit page* section of `src/data/copy.ts`, drawn once, by
  `<Notice icon="info">{ct("visit.step1.notice")}</Notice>` at the foot of step 1 (*Which branch will
  you be visiting?*) in `src/pages/Visit.tsx`. Both the `ct()` call and the entry are removed, so the
  line cannot come back through the drawer — it is no longer a field the office can see, and it is
  not in the stored draft. The step now ends on the branch grid; the grid's own `margin-bottom` is
  the only space under it, so no empty notice box or gap is left. `Notice` is still imported and
  still used twice on that page (the privacy notice and the visit pass), and the surrounding copy —
  the step's heading, the *Not sure yet?* note and the *visit.privacy* line — is untouched.
- **Verified live.** Step 1 of `/visit` no longer contains the sentence (a leaf-element scan of the
  whole document finds zero matches, and `app.js` no longer contains the string or the entry id);
  step bottom equals the branch grid's bottom, so no leftover element sits below it; vision over the
  wizard panel shows the branch buttons running straight into the *Back* / *Next* footer with no
  stray box; the drawer's draft differs from the shipped content in `live` alone (their unsaved
  on-air switch), `overrides` is empty and there are no console, platform or syntax errors.

## 101. *Ask about an event* leads to the *Email us* card

The ask: *"the ask about an event should be linked to the email us"*.

- **The events page's first button is a page link now, not a mail composer.** In the `/events`
  header, *Ask about an event* (`events.head.action1` in `src/data/copy.ts`) was a `mailto:` to the
  church address with a prefilled subject (*Event enquiry*) and body. It is now an ordinary internal
  link to **`/contact`** — the page whose first section carries the **Email us** card (with the
  church's address, the copy button, the four other contact cards and the message form) — i.e. the
  same destination the site's two other *"Ask us…"* buttons already use: *Ask us something else* on
  `/about` and *Ask us anything else* on `/visit` (`about.faq.action`, `visit.faq.action`, both
  `<Btn to="/contact" variant="ghost" icon="send">`). Its own label, its `mail` icon, its `ghost`
  variant and its place beside *Serve at an event* (`/ministries`) are unchanged.
- **The two email templates it needed went with it.** `auto.events.e7489914c0e06bb5` (*Event
  enquiry*) and `auto.events.9fcd9bdb31773c52` (the *"Hello, I'd like more information about an
  upcoming event."* body) had no `ct()` call left, so `src/tools/auto-copy.mjs` dropped them on its
  next run — 698 → 696 collected entries, the documented way a dead line leaves (SPEC note 80). The
  event *registration* templates (`Registration: {{title}}` and its body) and the *Submit your
  event* notice on the same page are untouched — every *Register now* / *Register* button still
  opens the visitor's own mail app, addressed to the church.
- **Verified live.** The button's `href` is `#/contact`, and clicking it lands on *Talk to a real
  person* with the *Email us* card first in the card row; the header still shows two aligned,
  legible buttons with the envelope icon on the first (vision); `app.js` no longer contains either
  template; the drawer's draft still differs from the shipped content in `live` alone (their unsaved
  on-air switch) with `overrides` empty, and there are no console, platform or syntax errors.

## 102. The line under the live panel's headline is gone

The ask: *"remove this: We are on air from Lagos right now. The stream opens right here in this
panel."*

- **The on-air sentence left; the off-air one stayed.** On the Watch live page's screen
  (`src/pages/WatchLive.tsx`), the paragraph under the headline carried two different lines: while
  the church is on air, *We are on air from {{city}} right now. The stream opens right here in this
  panel.* (`live.live.lede`, a `locked: true` copy entry), and otherwise the next gathering read on
  the visitor's own clock (*Saturdays at 12:30 AM · Dallas, Texas · 1 days 2 hours away*). The
  paragraph is now rendered **only when the panel is not on air** (`{!onAirNow && (<p
  className="lede">…)}`), so an on-air screen goes badge → headline → player with nothing between the
  headline and the frame (`.live-panel__frame` already carries its own `margin-top: 1.4rem`, so the
  spacing is unchanged). The entry itself is deleted from `src/data/copy.ts` — it was a `locked`
  line, so the drawer's *Watch live page text* section never offered it (locked lines are filtered
  out of both the prose list and the closed group); deleting the entry is what keeps the wording out
  of the site for good, and nothing can type it back. The off-air line,
  the *All our live broadcasts appear here automatically…* note under the player (SPEC note 95) and
  everything else on the panel are untouched.
- **The locked-line inventory in `TODO.md` was corrected** while the file was being read: it said
  `locked: true` in `copy.ts` was *146* lines and named *the nine paragraph lines of the watch-live
  page* — the real count is **120** (121 before this removal), with **eight** left in that group.
- **Verified live, in both states.** On air (the head office's Thursday *Night Vigil*, which the
  service clock is inside right now, plus the office's own *We are on air right now* switch): the
  panel shows the *Live now* badge and the stage holds **no** `.lede` paragraph, and the sentence
  appears nowhere in the document. Off air (the visitor's branch switched to Dallas, which has no
  gathering on the clock — and switched back afterwards): the panel returns the *Next broadcast*
  badge and the `.lede` line *Saturdays at 12:30 AM · Dallas, Texas · 1 days 2 hours away*, so the
  kept branch renders exactly as before. The office's unsaved switch was toggled off and back on to
  test and its stored draft came out byte-identical (`JSON.stringify(draft.live)` compared before and
  after); the draft still differs from the shipped content in `live` alone, `overrides` is empty, and
  there are no console, platform or syntax errors.

## 103. A pass over the drawer and the site's own wording

The ask: *"make all update on the admin and fix all edit that is needed"*.

- **What the pass was.** Read as: make sure everything the drawer offers is up to date with the site,
  and fix every edit on it that needs fixing. So it went through the drawer end to end and then over
  the rendered site, and fixed the three word-level faults it found (the counts, the copyright stop
  and the contact card's clock). **Nothing was published or saved** — the generator is still the
  office's unsaved draft, and the only pending change in it is their own *We are on air right now*
  switch (the Status tab's *Waiting to publish: 1 part of the site — Live stream*), which is theirs
  to press Publish on.
- **The drawer is coherent, and now proven so.** 53 sections; the *Update* tab offers **35** of them
  and the 11 jobs offer **39** blocks — 53 − 14 `hidden` copy sections (SPEC note 51) − 4
  `everythingHidden` photo sections = 35 exactly, and the 14 hidden page-text sections are the ones
  the *The words on every page* job lists but filters out, so every offered section still belongs to
  exactly one job (the *words* job's two visible blocks are *Home page text* and *Watch live page
  text* — `about` joined `HIDDEN_COPY_PAGES` in SPEC note 67, so note 51's "Home and About" is one
  note out of date). The Status tab's numbers agree with the content itself
  (7 branches, 19 sermons, 11 upcoming activities, 10 ministries, 2 notices), every section opens
  with its fields, no removed line is reachable anywhere in the panel (no *Wizard step 1 — notice*,
  no *Live — paragraph*, no *Event enquiry* / *Hello, I'd like more information…* email templates),
  and the drawer's own labels, hints and blurbs carry no typo of their own. The office's stored draft
  still differs from the shipped content in `live` alone, with `overrides` empty — nothing of theirs
  was touched.
- **Every line the drawer shows is still read by the build.** All 397 hand-written ids in
  `src/data/copy.ts` were matched against the source: the only ids with no plain-text `ct("…")` call
  are the four `prayer.side.how.1…4` (composed at runtime — `ct(\`prayer.side.how.${i + 1}\`)`), and
  `site.appsTip` / `site.noResults`, two entries nothing reads any more (both inside the `site` group,
  which is hidden, so the office never sees them). They were left in place rather than deleted — they
  are invisible and cost nothing, and a future session may prefer to. The collector
  (`src/tools/auto-copy.mjs`) reports **0 files touched, 0 new literals** after this pass, so the
  generated list is in step with the components.
- **Fault 1 — a count of one.** The countdown and duration lines are composed from a number and a
  unit the office can reword, so a line that landed on one read *1 days* / *1 hours*. New
  `tidyCount(text)` in `src/lib/store.ts` puts the phrase right as it is drawn, exactly as
  `moneyText()` does for a `$`, and the five places that compose a count and a unit now wrap it:
  the events page's featured eyebrow (*Coming up in {{days}} days*), the timeline's day badge
  (`{{v0}} days`), the featured card's duration (`… · {n} hours`) and *Plan a visit*'s service length
  (the same `hours`) and the live panel's next-broadcast line (`{{days}} days `). Left alone on
  purpose: the event card's own *when* line already branches to *Today* / *Tomorrow*, the header's
  countdown uses bare unit letters (`2d 5h 30m`), the big `Countdown` clock uses `days/hrs/min/sec`
  as labels, and `relativeTime()` goes through `Intl.RelativeTimeFormat`, which knows its own
  singulars.
- **Fault 2 — the full stop printed twice.** The footer's bottom row is `© {year} {SITE.name}` +
  the collected line *. All rights reserved.*, and the church's name already ends in a full stop
  (*… Ministries Inc.*), so every page read *Inc.. All rights reserved.* (the open item in
  `TODO.md`). The name is now printed with a trailing full stop stripped in that one row
  (`SITE.name.replace(/\.\s*$/, "")`) — the name itself is untouched everywhere else, and a name
  without a stop still gets the line's own.
- **Fault 3 — the contact card's clock.** *Call the office* said *Monday to Friday, 9:00 AM – 5:00 PM
  **CT*** while the *Open now* / *Closed* badge beside it is worked out on the head office's own clock
  (Lagos) and every other time on the site is shown on the reader's — a leftover of the Dallas years.
  The note's value is now *Monday to Friday, 9:00 AM – 5:00 PM, {{zone}} time*, with the page passing
  `zoneLabel(branchZone(HQ))` (*Lagos* today), so the words follow *Church profile* like the badge
  does instead of naming a zone by hand. The office's copy is otherwise untouched, and no other line
  on the site names a zone.
- **The rest of the site checked clean.** A leaf-text scan of all fourteen routes finds no *1 days*,
  no doubled full stop and no doubled word; all **51** internal link targets across the site resolve
  (not one falls to the 404 page); no image on any route fails to load; and a scan of every display
  string in `src/data/*` and of the drawer's own files turns up no misspelling. Two deliberate
  non-changes: the sample leaders' titles (*Sista Maria Diaz*, *Bro. Joshua Mbeche* — the church's own
  wording to confirm, like the *Inc.* and the Dallas phone in `TODO.md`), and *judgement*, which is
  the British spelling the rest of the copy already uses.

## 104. The notices stop asking the office for a URL id

The ask: *"remove this anywhere they are in the admin: URL id / ann-consecration / Only used
internally."*

- **The one field it was.** The *Announcements* section was the only list in the drawer whose `id`
  the office was ever shown: a `slug` field labelled *URL id* with the hint *Only used internally.*
  — and its first notice's value read `ann-consecration`. The other seven lists that carry an id
  (leadership, branches, ministries, events, sermon series, sermons, giving funds) keep theirs,
  because those ids really do appear in links and their hint says so. Nothing on the site links to a
  notice, so the field was jargon in the office's way.
- **The id itself stayed — the console now makes it.** It is still what the site keys a notice by
  (the strip's React key, and the "don't show me this again" list a visitor's dismissal is kept in,
  `wom.noticesDismissed`). So `src/lib/cmsSchema.ts` gained a module-level `withNoticeIds()` just
  above `CORE_SECTIONS`: any notice that arrives without an id is given one slugged from its own
  headline, with twins numbered apart in list order (`…-2`, `…-3`), and the section's `bind` runs it
  before `applyToList` (`bind: (v) => applyToList(ANNOUNCEMENTS, withNoticeIds(v), "id")`). It is
  settled by the list alone, so the same notices produce the same ids on every publish. The two
  hand-written ids in `src/data/announcements.ts` and the field's own `slug` renderer and `idField()`
  helper are untouched — the other seven sections still use them.
- **Proven live, including the naming.** Two notices with blank ids and the *same* headline were
  applied to the live list: the strip drew both, and dismissing each wrote
  `test-notice-for-the-roof-fund` and `test-notice-for-the-roof-fund-2` into `wom.noticesDismissed` —
  the numbering is the dedupe working. Both test notices and their dismissal keys were then removed
  and the live list put back, so the office's draft is exactly what it was (nothing pending but their
  own *We are on air right now* switch in `live`). The two real notices still render, ids intact.
- **The whole drawer swept for it.** Every one of the *Update* tab's 35 sections was opened with its
  first entry: **seven** still show a *URL id* (the link-bearing lists, hint *Used in links — changing
  it breaks existing links.*), none shows *Only used internally.*, and `ann-consecration` appears
  nowhere. All 11 *Edit* jobs were opened and scanned the same way — clean. The search box finds
  *Only used internally.* nowhere, and a search for `ann-consecration` matches the notice itself but
  shows it by its headline (*21 Days of Prayer & Fasting begins this week*), so the id is no longer
  readable anywhere in the panel. The notices' fields now begin at *Headline*: Headline, Details,
  Tone, Post date, Link (optional), Link label, Show on the site.
- **The site is otherwise as it was.** The two notices still draw on the strip (verified with the
  dismissal list cleared and restored), the fourteen routes sweep clean, the collector reports 0 files
  touched / 0 literals, and there are no console, platform or syntax errors. Nothing was published or
  saved.

## 105. The Watch live page's words come out, and the live screen stops contradicting itself

The ask: *"remove the watch live page text, fix the live now"*.

- **The Watch live page text left the drawer.** `HIDDEN_COPY_PAGES` in `src/lib/cmsSchema.ts` gained
  `live`, which is the whole change: the section is gone from the *Update* tab (35 → **34**), from its
  job and from the search box, so *The words on every page* now offers **Home page text alone** —
  and every one of the 64 lines it used to hold (*Catch up*, *Previous sermons*, the card links, the
  small words) is now unreachable from the drawer. Nothing about the page itself moved: a hidden
  section still loads, applies and publishes (SPEC note 51's rule), so `/watch-live` reads exactly as
  it did. Deleting the one word brings the section back.
- **"The live now" was three faults on the same state.** The church's site is genuinely on air on a
  Thursday night (the *Night Vigil (fortnightly)*, 22:00–02:00 Lagos, on the service clock), with
  their own *We are on air right now* switch on top of it, and the live-now state was wrong in three
  places:
  - **A dangling separator in the home hero.** The hero's badge is `LIVE NOW · ` (`auto.home…`) plus
    the gathering's name, but the name is the *clock's* to give: with only the office's switch saying
    we are on air there is no gathering to name, so the badge read **“LIVE NOW ·”** with the dot
    hanging (the header's service pill already handled this — *the badge alone is the honest answer*,
    SPEC note 83). The hero now prints that separator **only when a gathering is named**, and
    otherwise reads the same *LIVE NOW* line the pill uses (`auto.site.96c2adc6bda4059f`), so the two
    can never drift.
  - **The panel called the Night Vigil “Sunday Celebration — live”.** The heading was
    `air.title || LIVE.liveTitle || info?.slot.name` — the office's *Headline while live*
    (`LIVE.liveTitle`, shipped as *Sunday Celebration — live*) came **before** the gathering the clock
    has on, so a Thursday broadcast was announced as Sunday's. New `liveName` in
    `src/pages/WatchLive.tsx` resolves it the other way round: the detected stream's own title, else
    the gathering the clock has on (when the clock is what says we are live), else the office's
    headline — used by both the panel's `<h2>` and the live player's title, so a switch-only on-air
    still shows the office's own words.
  - **The note under the player contradicted the badge.** `live.preview.note` read *“All our live
    broadcasts appear here automatically — whenever we go on air, this player switches over by
    itself. **Until then** you are watching our most recent service.”* — and it only ever renders in
    the *on air, nothing to play* state (SPEC notes 68/95), where “until then” says the opposite of
    the LIVE NOW badge above it. It now reads *“All our live broadcasts appear here automatically —
    we are on air now, and this player switches over to the live stream by itself. Until it does, you
    are watching our most recent service.”* — the promise the church asked for in note 95, the
    on-air fact, and what is actually playing, in that order.
- **What was left alone.** The frame still keeps the most recent service while the panel is on air
  with nothing to play (SPEC note 68's deliberate fallback — a screen the visitor can watch beats an
  empty box, and the card itself is labelled *… — last service*); the *Live has ended* screen,
  `live.fallback.*`, the ways-to-watch cards, the blink/red-dot styling and the office's switch are
  untouched. The header pill's rule is untouched too: the *name* stays the clock's to say, so a
  switch-only on-air shows **LIVE NOW** alone (verified — the “missing” name I saw while testing was
  my own doing: a branch left in `localStorage` by an earlier probe, which a re-mount then wrote back
  through `useLocalState`; with the branch put back the pill and the hero name the same gathering).
- **Verified live, in both states.** On the clock (Lagos, the Night Vigil): the panel reads **LIVE
  NOW**, heading **Night Vigil (fortnightly)**, the notice above, and the hero **LIVE NOW · Night
  Vigil (fortnightly)**. Switch-only (the branch switched to Dallas, which has no gathering on the
  clock, and switched back afterwards): the hero reads **LIVE NOW** with nothing dangling, the pill
  the same, and the panel's heading falls back to the office's *Sunday Celebration — live*. The
  notice wraps to two lines (653 × 106px) with nothing clipped. The drawer's *Update* tab counts
  **34** sections with *Watch live page text* gone and *Home page text* still there, the words job
  offers Home alone, the fourteen routes sweep clean, the collector reports **0 files / 0 literals**
  (696 entries), and there are no console, platform or syntax errors. **Nothing was published or
  saved** — the office's draft still differs from the shipped content in `live` alone (their switch),
  and the tests above put it back exactly as they left it.

## 106. *Stop*, *Continue* and *Start* the livestream — and the activity that is on right now

The ask: *"edit in the admin where to stop continue and start a livestream, edit a current event"*.

- **The livestream is driven from one place now.** The *Live stream* section of the drawer opens on a
  control panel (`LiveControlPanel`, `src/components/editor.tsx`) instead of a field list: the state
  in words (*You are on air right now* / *The stream has been stopped* / *The stream is off air*), a
  line saying since when and how long, a warning when there is nothing set to play, and the buttons —
  **Start the livestream**, **Continue the livestream**, **Start a new livestream**, **Stop the
  livestream** — shown for the state the office is actually in. The raw *We are on air right now*
  boolean left the schema; the value it wrote is still the content's (`LIVE.isLive`), now owned by the
  buttons so the office cannot set a live state in one place and end it in another.
- **Three verbs, three meanings.** *Start* begins a session (`isLive` on, `liveSince` stamped).
  *Continue* — offered when the stream was stopped within the last eight hours — puts the same session
  back on air, keeping its start, so "on air since 10:04" keeps counting instead of restarting; *Start
  a new livestream* next to it begins a fresh session at the current time. *Stop* ends it
  (`isLive` off, `liveCut` stamped) and the panel says the finished service files itself into *Recent
  services*. Two new content fields carry the timestamps (`LIVE.liveSince` / `LIVE.liveCut`,
  `src/data/live.ts`, both shipped as `0`) — when a site was left on air before those existed, the
  panel reads the gathering's own start off the clock for its "on air since" line.
- **A stop is also heard by the service clock.** With the office's switch off, the site used to say
  live for the whole of a scheduled gathering's hours whether anyone was broadcasting or not, so
  *Stop* during a service was immediately overruled by the clock — and the honest-looking alternative
  was worse: `nextService` would report that gathering as the *next* one and print a countdown of
  **0h 0m** for the rest of its hours. `nextService` (`src/lib/store.ts`) now steps over a gathering
  the office ended by hand — `LIVE.liveCut >= start` — and answers with the gathering after it, so
  after a stop the pill reads *Lagos · First Service in 2d 7h 30m* and the Watch live page counts
  down to the next service as it should. `onAir` keeps its shape (the office's switch, else the
  clock); the cut never touches a *later* gathering (next week's slot starts after the cut), and
  *Continue* goes back on air regardless.
- **The panel under it now points at the button.** *When the service ends* used to explain that the
  service filed itself away; it now opens with "Press **Stop the livestream** above and the website is
  done with it too", so the two halves of the section agree. A `stop` icon (a filled square) joined
  the icon set for the Stop button.
- **The activity on right now is one click from its form.** The *Events & activities* section gained
  `CurrentEventPanel` (`src/components/editor.tsx`): the gathering the site is carrying — the one on
  now, else today's next, else the next one on the calendar — as a highlighted card (when it is, its
  title, where, an *On the home page* badge when it is the featured one) with an **Edit this event**
  button, and the rest of today's activities listed under it with *Edit* links. *Edit* hands the
  entry to the drawer (`onOpenSection("events", key)`), and `ListBlock` now **opens** the entry it was
  asked to find, not just scrolls to and highlights it (its own comment always said "opened"; the
  initial state only had one chance to run, so a jump from inside a section that was already on
  screen — this panel, or a search hit for the section you are standing in — did nothing). The days
  are counted from today on the office's own clock, the same reading the activity's card on the site
  uses (SPEC notes 84–85), and an entry without a URL id is found by its place in the list.
- **Verified live.** With the office's own draft on air: the panel reads **You are on air right now /
  On air since 22:00 — 1 hr 28 min.** with the red dot and one crimson **Stop the livestream**; stop
  gives **The stream has been stopped / Stopped at 23:32**, the two buttons, and the header pill drops
  to *Lagos · First Service in 2d 7h 30m* while `/watch-live` shows *Live has ended* with **First
  Service** and *Sundays at 7:00 AM · Lagos · 2 days 7 hours away*; *Continue* returns to **On air
  since 22:00** (same session), and *Start a new livestream* to **On air since 23:28** (fresh). The
  events panel showed **Happening right now / ON NOW · UNTIL 3:00 AM** for a temporary activity put
  at *today* on the Lagos branch, listed a second one under it with a working *Edit*, and a click on
  *Edit this event* left the entry open and focused in the list — then the two test activities were
  deleted through the drawer and the panel went back to *Coming up next*. Both panels were checked by
  eye, and hold at phone width (390px: drawer 375px, panels 300px, zero overflow). The drawer's
  *Update* tab still counts **34** sections, the collector reports **0 files / 0 literals** (696
  entries), and there are no console, platform or syntax errors. **Nothing was published or saved** —
  the tests' draft changes were put back exactly as the office left them (on air, `liveSince` /
  `liveCut` at 0).

## 107. Every way to change an icon is gone

The ask: *"remove all the option to change icons"*.

- **Five *Icon* pickers left the drawer.** The office could pick an icon in the social links (*Church
  profile*), the *Ways to watch cards* (*Live stream*), *Values*, *Prayer categories* and *What to
  expect*. Those five `{ path: "icon", label: "Icon", type: "icon" }` entries are gone from
  `SECTION_DEFS` (`src/lib/cmsSchema.ts`); every other field in those sections is untouched — the
  cards now read *Label / Handle / URL*, *Title / Line underneath*, *Value / What it means*, *Key /
  Label / Verse theme* and *Title / Description* respectively.
- **The control itself is gone too, not just hidden.** The `"icon"` member left the `FieldType`
  union and `case "icon"` left `FieldControl` (`src/components/editor.tsx`), along with the
  `ICON_NAMES` import; the now-unused `.admin__iconfield` / `.admin__iconpreview` rules left
  `src/styles/admin.css` (`.admin__imagefield`, which shared the flex rule, keeps it). Nothing in the
  editor can render an icon picker any more, so re-adding a field cannot bring one back by accident.
- **The icons themselves are unchanged.** They live in the content
  (`live.watchOptions[].icon`, `contact.socials[].icon`, …), so every icon on the site renders
  exactly as it did; a card the office adds keeps getting a sensible one from the section's
  `makeNew` (which has always stamped the icon). The tagline for *Values* stopped promising a choice
  — *"The convictions on the About page — a heading and a sentence each."* — and the list-card
  subtitles that only ever echoed the icon name back (in *Values* and *What to expect*) were dropped,
  so no card ends in a stray *star* or *heart*.
- **Verified live.** Opening each of the five sections in the drawer shows no icon control at all
  (`.admin__iconpreview` count 0), the remaining fields render in full, and the entries still open,
  add and reorder as before; the *Ways to watch cards* list shows four cards of two fields each, the
  *Social links* sub-list three, and `ICON_NAMES` is no longer referenced by any component. The
  collector reports **0 files / 0 literals** (696 entries, no orphans left behind by the removed
  label), the *Update* tab still counts **34** sections, the home page still draws its **106** icons,
  and there are no console, platform or syntax errors. Nothing was published or saved.

## 108. Where the last message and the previous sermons play from

The ask: *"editing in the admin of previous sermon and last message (the last message will represent the first
previous sermon) should have youtube and facebook link and a video upload just how it is before, it should be able to
edit this"* — with the message page for *The Hope That Overcomes the World* pasted under it.

- **The messages the Watch live page plays now have their own board in the drawer.** *Last message* and
  *Previous sermons* are one archive seen twice: `LiveMessagesPanel` (`src/components/editor.tsx`) sits in
  the **Live stream** section, above *When the service ends*, and lists them as the page reads them —
  the newest write-up tagged **Last message**, the ones after it tagged **Previous sermons** (as many as
  *How many previous sermons to show* asks for), newest first, each row carrying the speaker, the date and
  the source in words (*Plays from YouTube · dQw4w9WgXcQ* / *Plays from Facebook* / *Plays from an uploaded
  video*). The panel's own line says what the parenthetical in the ask says: the newest message becomes the
  first previous sermon the moment a newer one is written up, so it is one list.
- **A row opens on the sermon section's own four fields** — *Where it plays from* (YouTube / Facebook / an
  uploaded file), *YouTube video id*, *Facebook video link*, and *Upload the video* with its upload button
  and cover picture — taken straight from `sectionById("sermons").fields` and rendered by the same
  `FieldControl`, so the labels, the hints and the upload behave exactly as they do in the sermon list and
  cannot drift apart from it. Every write goes through the sermon section's value
  (`cms.setSectionValue("sermons", …)`), so an edit here *is* an edit there: one record, one publish, and
  the message page, the archive and the *Last message* band all move together.
- **"Edit the rest of this message" is one click.** The board is the video sources; the title, the preacher,
  the notes, the discussion questions and the rest stay where they were — the button opens that message in
  the *Sermons* section, highlighted and expanded (`onOpen("sermons", id)`, the same jump SPEC note 106
  built for the events panel).
- **Why it was needed.** All of those fields already existed — but only inside the *Sermons* list, nineteen
  entries deep, and the reminder that sent the office there (*When the service ends*: "Previous sermons is
  filled in by hand: add the message in the **Sermons** section") sat right beside the live controls with no
  way to act on it. The board and that reminder now point at each other. Nothing was removed from anywhere:
  the sermon list, the sermon page and the *Sermons* section are untouched.
- **Two preview faults had to be fixed for the board to be honest** (both pre-existing, both about the CMS
  editing records *in place* — `syncObject` in `src/lib/cmsSchema.ts` keeps the object's identity, so
  anything memoised on that identity goes stale):
  - `SermonWatch`'s source list was memoised on `[sermon]`, so a card that was already on screen went on
    offering only the old source after the office added a Facebook link: the platform switcher did not
    appear until the route changed. It is now keyed on the values (`youtubeId`, `facebookUrl`, `uploadUrl`,
    `poster`, `platform`), and the card's own choice follows the office's `platform` through an effect —
    so changing where a message plays from in the drawer switches the card behind it as you watch. A
    visitor's own pick still stands (it never changes `preferred`).
  - The sermon page's `series` / `siblings` memos were keyed on `[sermon]` too; they now key on the ids, so
    moving a message to another series updates its page.
- **Verified live.** The board showed **19** rows — *Overcoming in Christ* (20 Sept) as the last message
  open on its four controls, the other eighteen tagged *Previous sermons* — and, with the drawer standing on
  `#/admin/watch-live`, setting *The Hope That Overcomes the World* to Facebook with a link switched that
  card behind the drawer to `player__source--facebook`, the YouTube / Facebook switcher with Facebook
  active and *Open on Facebook*; putting it back to YouTube returned both the card and the panel's line, and
  the draft went back to clean (`unsaved()` false, the section no longer pending). *Edit the rest of this
  message* opened the *Sermons* section with that entry highlighted (`pitem--open is-focus`) and the whole
  field list present, the four video fields among them. The board holds at **560px and below** (tag on its
  own line, every row starting at the same left edge, no overflow at 390px: drawer 375px, card 300px) and at
  desktop (titles and meta on one column, 67px rows). The fourteen routes render clean, the collector
  reports **0 files / 0 literals** (696 entries), and there are no console, platform or syntax errors.
  **Nothing was published or saved.**

> **Superseded by note 109.** The board this note added left the *Live stream* section at the church's
> request — the video fields live in the *Sermons* section only, and the live section now carries the
> *Recent services* panel instead. What note 108 fixed in the CMS itself (memos keyed on a record's
> identity rather than its fields) stands, and is recorded in the README as a rule.

## 109. The live section shows the services, not the sermons — and a finished stream lands in *Recent services* at once

The ask: *"remove the previous sermon from livestream in the admin, live it in sermon, make sure immediately a
livestream has ended it goes automatically to the recent services, the video can be deleted in the admin the recent
services saved video should replace the previous sermon in the livestream area of the admin"*.

- **The previous-sermons board is out of the live section.** `LiveMessagesPanel` (SPEC note 108) is gone
  from the drawer's *Live stream* section, with its styles. The messages the office writes up are edited
  where they have always been edited — the **Sermons** section, with the same four video fields (*Where it
  plays from*, *YouTube video id*, *Facebook video link*, *Upload the video*) — and the *When the service
  ends* reminder now points at the panel above for the finished service and at the sermon list for the
  write-up. The two preview fixes note 108 found (`SermonWatch`'s source list and the sermon page's memos
  keyed on the record instead of its fields) stay: they are about the CMS editing records in place, not
  about that panel.
- **What replaced it: the services themselves.** `RecentServicesPanel` sits in the same place and shows
  what the site is carrying under *Recent services* — the finished services read from the church's channel
  (`src/lib/recentstreams.ts`), newest first, with the still, the title, the date (or YouTube's *"2 weeks
  ago"*), a link out to YouTube, and a read line (*"This list was read 4 minutes ago."*). It is the same
  list the page shows, from the same cache, so the office is looking at what a visitor is looking at.
- **A video can be taken off the site — and put back.** *Take it off* (armed first, like every other
  delete in the drawer) writes the video's id into **`LIVE.hiddenReplays`** (a new content field,
  `src/data/live.ts`), which is published with the live section, so the video is hidden for every visitor
  on every browser — `hiddenReplays()` in `WatchLive.tsx` filters the list as it is built, and the
  archive-message fallback too (a hidden video id is dropped there as well). The videos the office has
  taken off are listed under *Taken off the site* with **Put it back**, which is the only way back — one
  record, one publish. Nothing is deleted from the church's channel, and the panel says so.
- **A service lands there the moment its stream ends.** Three things now make that true rather than
  "within ten minutes":
  1. **The seed.** *Stop* knows which broadcast was on air (`readLiveStatus()`), and
     `askForRecentServices()` writes it straight into the list (`seedRecentService`) — video id, headline
     and thumbnail — so the card is in *Recent services* in the same second, on the page and in the panel,
     with *Stop*'s toast saying so. The read behind it replaces the seeded card with YouTube's own title,
     date and still the moment the recording is published (`withSeeds`, and a seeded card is dropped after
     twelve hours either way, or as soon as a read lists the video itself).
  2. **The poke.** `askForRecentServices()` wakes every open page's read at once — `useRecentServices`
     listens (`listeners` in `src/lib/recentstreams.ts`), shows what it holds immediately and then goes to
     the channel — so no page waits out its ten-minute timer after a service. *Start* pokes too.
  3. **The short cadence.** After a service ends, the read keeps the 90-second cadence (rather than the
     ten-minute one) for six minutes (`BURST_MS`) — which is the window in which YouTube is usually still
     publishing the recording, so the seed is replaced by the real entry without anyone touching anything.
- **Verified live, with the mechanisms isolated.** With the *channel* left empty (as the office has it,
  so the read cannot answer): setting the live check to a broadcast and pressing *Stop* put **Test
  Broadcast — Sunday · Just ended — YouTube is still publishing it** at the top of the panel in the same
  second, with its thumbnail and *Take it off*, and the Watch live page's *Recent services* band showed the
  same card (playing in place) once the check was not reporting it as live. *Take it off* moved the row
  under **Taken off the site**, wrote the id into `live.hiddenReplays`, and the band dropped the video for
  the archive-message fallback; *Put it back* emptied the field and the card returned. The panel was
  checked by eye at both widths (670px card: three rows, thumbnails rendering, nothing clipped; 390px:
  card 300px, rows wrap, the take-off button stays inside, no overflow), the fourteen routes render clean,
  the collector reports **0 files / 0 literals** (696 entries), and there are no console, platform or
  syntax errors. **Nothing was published or saved** — the test's seed and caches (`wom.recentstreams`,
  `wom.livestatus`) were cleared and the live section put back exactly as the office had it
  (`isLive` false, `liveSince` 0, `liveCut` as it was, `hiddenReplays` empty).

## 110. The *Ways to watch cards* come out of the live area of the drawer

The ask: *"remove this from the livestream area of the admin: Ways to watch cards"* — with the whole body of
the drawer's *Live stream* section pasted under it (the cards list, then *Recent services*, then *When the
service ends*, then *Open the sermon list*).

- **The editing list is gone; the cards are not.** `live` (`src/lib/cmsSchema.ts`) no longer offers the
  `watchOptions` list — no *Ways to watch cards* heading, no *Add a card*, no *Title* / *Line underneath*
  boxes — so the *Live stream* section is now just the stream: the default player, the two links, the
  channel, the three numbers and the headline while live. `LIVE.watchOptions` itself is untouched
  (`src/data/live.ts`), and **`WatchCards`** still draws all four cards on both pages that show them
  (`/watch-live` and the sermon archive), so nothing a visitor sees changed. The only thing that changed is
  that the four cards are fixed content now rather than something the office edits in the drawer.
- **The rest of the section is as the church asked for it last time** (SPEC note 109): *Recent services*
  with *Take it off the site* / *Read the channel again*, and the *When the service ends* reminder under it
  — both left exactly where they were, since the ask named the cards and not the panels.
- **Verified live.** The drawer's *Live stream* section renders with no *Ways to watch cards* / *Add a
  card* / *Line underneath* anywhere in it, the section still ends with *Recent services*, *When the
  service ends*, *Open the sermon list* and *Put this back to the original*, `/watch-live` and `/sermons`
  both still show the four cards (Live stream · Plays here whenever our broadcast is active, YouTube ·
  @worldovercomers, Facebook · /worldovercomers, Sermon archive · Every message since 2026), and the
  routes render with no console, platform or syntax errors. **Nothing was published or saved.**

## 111. The stream ends, and the site stops by itself

The ask: *"when the livestream ends on youtube or on facebook the stop the livestream here automatically and it saves to
recent services"*.

- **The check now knows an ending when it sees one.** `checkLiveStream` (`src/lib/livestatus.ts`) gained two things.
  `LiveStatus` carries `platform` (where the broadcast was found) and **`endedAt`** — the moment a check that followed a
  "live" answer came back "off", kept with the video id and headline of the broadcast that had been on air. The ending
  *sticks* until a broadcast comes back (every later "off" answer carries the same moment), or the drawer would have one
  answer to end a service and never see it again — the bug the first end-to-end run caught. It also answers a stale
  state: the cadence for the next check is taken from the answer just made, not from the render that has not landed yet
  (a broadcast that has just been found must not wait out the quiet-week timer).
- **The drawer does what the button does.** New **`src/lib/autostop.ts`** — `useAutoStopLive(enabled)`, mounted in the
  shell of `#/admin` (`src/pages/Admin.tsx`) so it keeps watching whichever card of the drawer the office has open. When
  a broadcast it had seen live comes back ended it writes exactly what *Stop the livestream* writes: `isLive` off,
  `liveCut` stamped with **the moment the stream ended** (not the moment we noticed), `liveEndedBy: "channel"` — a new
  content field (`src/data/live.ts`) that lets the panel say *ended by itself* rather than *stopped*, and that the
  buttons take back the moment the office presses them — and then `askForRecentServices({videoId, title})` so the
  finished service is seeded into *Recent services* and every open page reads the channel again, in the same breath.
- **Deliberately careful, because a machine is writing content.** Only a definitive answer counts: "unknown" never ends
  anything, and "off" has to arrive **twice in a row** (about a minute apart) before the drawer acts, so one flaky read
  of the channel page cannot close a service. Only a broadcast we *saw* live can end (`endedAt`). Only a site that was
  on air is stopped (`isLive` or the clock's gathering), and an ending from an earlier session can never close a later
  one — the office's last *Start* / *Continue* / *Stop* (`liveCommandAt`, a new content field, written by those three
  buttons), then `liveSince`, then the gathering's own start, has to be before it, so a *Continue* on a stream the site
  had already stopped is the office's word and is left alone (and so is a reload). A stop the office has
  already made for that same stream is left alone (`liveCut >= endedAt`). It writes the **draft**, never the published
  site: the office still presses Publish, exactly as they do for everything else, and the panel says so.
- **Facebook is asked too — as far as it can answer.** `facebookTarget()` turns whatever the office pasted (the day's
  live video, or the church's page → its `/live` tab) into an address, and `parseFacebookLivePage` looks for the two
  markers that mean a page is broadcasting. Facebook serves a browser that is **not signed in** nothing it can be
  trusted for — the same HTML comes back live or not; verified by fetching the church's own page, its `/live` tab and
  Facebook's live directory through the proxy — and a finished live video keeps "was live" marks of its own, so this
  probe can only ever *confirm* a broadcast: it never says one has stopped. It is also only ever made from the office's
  drawer (`checkLiveStream({ facebook: true })`, `useLiveStream(soon, watchFacebook)`) — never from a visitor's page,
  which would be a fetch spent on nothing. In practice the stop follows YouTube, which is also where *Recent services*
  comes from; a service that is only on Facebook can be recognised when Facebook does answer, and a Facebook ending
  names Facebook in the toast.
- **The wording follows.** The panel's headline is *The stream ended, so the site stopped by itself* and its line
  *The stream stopped on its own at 3:00, so the site went off air with it…* — platform-neutral, because the panel knows
  the stream ended and not which side said so; the toast names YouTube or Facebook. *When the service ends* now says
  nothing has to be pressed, and the live section's blurb says the same. A Facebook ending is not seeded (`Recent
  services` is built out of YouTube videos, and a Facebook id is not one) — the poke alone is right.
- **Verified live, end to end, with a fake channel.** With the office's own drawer and `superFetch` stubbed for the
  channel's `/live` page: on air → the check found the broadcast (platform `youtube`, id and headline from the page) →
  the stream went off → the *first* "off" answer left the session alone (still *You are on air right now*) → the second
  stopped it by itself, 45 seconds later, with `liveCut` equal to `endedAt`, `liveEndedBy: "channel"`, the finished
  service seeded at the top of **Recent services**, and *1 unsaved change* on the editbar. **Off air, the same ending
  writes nothing** — two "off" answers in a row, a draft untouched and a panel still quiet. The office's own *Start* and
  *Stop* still set `liveEndedBy: "office"` and keep their wording. A service found on **Facebook** (its own two markers)
  stopped the site with *The stream ended on Facebook…* and left no Facebook id in the list. Then every route was
  re-rendered (the same sizes as before the change), the collector reported **0 files / 0 literals**, and there were no
  console, platform or syntax errors. **Nothing was published or saved**: the test's channel, stream links, seeds and
  caches were rolled back with the drawer's own *Undo* and the draft's own JSON, and the live section put back exactly
  as the office had it (`isLive` false, `liveSince` 0, `liveCut` 1790290196260, `hiddenReplays` empty, `liveEndedBy`
  office, the channel fields empty).

## 112. The church's channel — and the reload that used to throw the office's changes away

The office handed over the church's livestream link: `https://youtube.com/@twocorg?si=…`. That one
line of link work turned up a false "we are live now" and a data-loss bug in the editor.

- **The field it belongs in.** *YouTube channel to watch for live* (the *Live stream* section) now
  holds **`@twocorg`** — the handle, which is what the field asks for; the `?si=…` on the end is
  YouTube's share-tracking noise and is not kept. The parser takes the whole link happily
  (`youtube.com/@handle` is matched out of any pasted address), so the office could have pasted the
  link as it came; the handle is what the field reads best as. *YouTube stream link* (`youtubeId`) is
  deliberately left **empty**: a channel URL follows whichever broadcast is on that day, while a
  video link freezes the page to one service. Three things follow from the channel being set — the
  live check asks `https://www.youtube.com/@twocorg/live` (verified by stubbing the proxy and reading
  the address asked for), *Recent services* reads that channel (verified against the real one: the
  channel's own /videos list, `UCQ0KIUXUV7gTZmDDlvd3ZcQ`), and the automatic stop of SPEC note 111
  now has something to follow. The office still presses **Publish** — the change sits in their draft
  as *1 unsaved change*, nothing was published from here.
- **What the channel page taught the check.** Asked about a channel that is not on air,
  `youtube.com/@twocorg/live` answers with the channel's **last** stream — a 2016 video page whose
  `liveBroadcastDetails` says `"isLiveNow":false`, but which also carries `"isLive":true` in its
  **view-count renderer** (the renderer YouTube uses for a premiere or an upcoming broadcast). The
  old `parseLivePage` counted that as broadcasting, so the church's quiet week read as *Live now* the
  moment the channel was set. The marker is now `"isLiveNow":true` alone (or a live `hlsManifestUrl`,
  which no finished page has); **`"isLive":true` is never a live marker** — it was measured on the
  real channel. The same measurement was taken on a genuinely live channel (`@LofiGirl/live`:
  `"isLiveNow":true`, no view-count flag), and the comment in `src/lib/livestatus.ts` records it.
- **A page we cannot read is not an ending.** `parseLivePage` now answers `read` as well: whether the
  answer carried YouTube's own scaffolding (`ytInitialData` / `videoDetails`). A consent wall, a bot
  check or an error page carries none of it, and `checkLiveStream` returns **`unknown`** for those —
  never `off`. An "off" answer is what stops a site that is on air (SPEC note 111), so a page we
  merely failed to understand must not be able to close a service.
- **A ways-to-watch card names the door it opens.** The four cards are fixed content since SPEC note
  110, so their stored words had drifted from the office's own settings: the YouTube card read
  `@worldovercomers` while linking to whatever the channel/stream/socials fields said, and the
  Facebook card read `/worldovercomers` while linking to `facebook.com` itself. `platformDoorName`
  (new, `src/lib/embed.ts`) pulls the handle out of the address a door card actually opens —
  `youtube.com/@twocorg` → `@twocorg`, `facebook.com/worldovercomers` → `/worldovercomers` — and
  `WatchCards` shows that instead of the stored line, keeping the stored words as the fallback when
  the address is a video, a search or nothing at all. One source of truth: the day the office points
  the site at another channel, the card renames itself. (Verified on both the draft and the published
  page: the card reads `@twocorg` and opens `https://www.youtube.com/@twocorg`.)
- **The church's own socials.** `SITE.socials`' YouTube entry was a placeholder that searched YouTube
  for "world overcomers ministries" with a `@worldovercomers` handle under it (the footer and the
  contact page print the handle). It is now the real channel — handle `@twocorg`, address
  `https://www.youtube.com/@twocorg`. The office can still change it in *Church profile → Social
  links*; the Facebook, Instagram and X entries are untouched, because the office has not given us
  those.
- **The reload that threw the office's changes away** (found while re-checking the field above, and
  the serious one). `startCms()` applied the local cache **first** — and applying content calls
  `rebaseDraft()` → `persistDraft()`, which *writes* `localStorage["wom.cms.draft"]` — while the
  stored draft was only read **afterwards**. The drawer mounts before `startCms()` runs and makes
  itself a draft of the shipped words on its first render (`useAutoStopLive` reads it), so that first
  write was a draft of the *content* with `dirty` empty — and it landed on top of the office's own
  stored draft, which the next line then read back. Every reload of the editor silently discarded
  whatever the office had not yet published; it went unnoticed because the pages behind the drawer
  and the drawer itself both re-read the (now empty) draft, so the editor looked consistent — just
  empty. It was caught with a `localStorage.setItem` probe passed as `page_refresh`'s `preambleJs`:
  the trace showed exactly **one** write to `wom.cms.draft` during a load, `dirty: none` with the
  office's channel already gone (and, after the fix, one write with `dirty: live` and the channel
  intact, through a reload that then still showed *1 unsaved change*). The fix is in `src/lib/cms.ts`:
  the stored draft is read **first**, `draftLoaded` gates `persistDraft()` so nothing may be written
  back over it until it has been read, and the cache is applied after it — where `rebaseDraft()`
  keeps every `dirty` section exactly as the office left it. `showDraftIfEditing()` at the end of
  `startCms()` still puts the draft on the page (SPEC note 83), which is what the earlier fix was
  about; this one is about the stored copy underneath it.
- **Verified live.** The office's field holds `@twocorg`; the check asks
  `https://www.youtube.com/@twocorg/live`; against the real channel it answers **off** (its last
  stream is from 2016 — `isLiveNow:false` — so nothing is on air, and no false *Live now* is shown:
  the watch page reads *Live has ended* / *Nothing is streaming right now*); the draft survives
  reloads with *1 unsaved change*; the *Recent services* band holds the channel's own six newest
  services; the door cards and the footer read `@twocorg` on both the draft and the published page,
  with no clipping, no overlap, equal card heights at 1440px and no horizontal overflow at 390px; and
  the load is clean — no console errors, no `platformErrors`, no `syntaxErrors`. **Nothing was
  published or saved**; the office's other draft content is exactly as they left it.

## 113. Recent services by date — one message, however many times it was published

The ask: *"adjust the last six message to be determined by the nearest date to each other"*.

- **The list was reading the wrong tab.** *Recent services* was built from the channel's `/videos`
  grid, and **YouTube does not carry a channel's live archives on `/videos`** — it keeps them on the
  `/streams` tab. For a church, the Sunday services *are* live archives, so the band was showing what
  was left: a 3-week-old clip, an 11-month-old one, and then four episodes of a 2019–20 series, while
  the church's actual Sundays sat unread. Measured on the church's own channel: `/videos` began with
  the 3 September clip and jumped to "11 months ago"; `/streams` began with 20 September; the RSS feed
  carried all of it with exact dates. The channel's **feed is now the list itself** (`parseFeed` also
  returns each video's title), because it holds *every* kind of upload, newest first, with the exact
  `<published>` date — and the `/videos` grid is merged in for the two things it alone has: YouTube's
  own "3 weeks ago" line (for services older than the feed's fifteen) and the depth behind them. The
  feed wins wherever the two overlap. An upload with neither a date nor "ago" is an *upcoming*
  broadcast, not a service that has happened, and is not listed.
- **One message, however many times YouTube published it.** A church streams a service and YouTube
  ends up with two or three videos of it — the same headline, minutes or hours apart (a stream that
  drops and resumes, or a re-upload) — so a list taken straight off the channel shows the same Sunday
  twice or three times. `collapseSameMessage` (new, `src/lib/recentstreams.ts`) folds uploads whose
  headlines match **and whose dates are nearest each other** (inside 20 hours) into one card, and keeps
  the **first** of them — the service's own start, so the player opens it from the beginning and the
  card's date is when the service was. Same headline with dates further apart is *not* folded: those
  are different services by the same name (a weekly "Sunday Service"), which is the whole reason the
  rule is about dates and not headlines alone. Uploads with no date at all are never folded together.
- **The six are then the six nearest in date.** The read returns the channel's list ordered by date —
  the feed's exact dates, with YouTube's "how long ago" as the approximation behind them — so the
  office's own number (*How many recent services to show*, six to start with) picks the services
  closest together in time: the last few services as they happened, not the first six rows of a tab.
  Nothing else in the page or the drawer changed: both filter (hidden, already-written-up) and take
  their number from the same list, so the band and the console's *Recent services* panel can never
  disagree. The carried list is 24 messages now rather than 15, which is the largest the office's
  field allows.
- **Verified live.** The read (three proxy answers: feed, `/videos`, and the channel page for the id)
  now returns 24 candidates whose head is the church's own run, and the band and the drawer panel
  both show the same six: *TEENS WEEK 2026 — 20 September*, *YOUTH SUNDAY SERVICE — 20 September*,
  *SUNDAY SERVICE, 13th Sept*, *FAMILY ESSENTIALS … 8th Sept*, *FAMILY ESSENTIALS … 7th Sept*,
  *THANKSGIVING SUNDAY SERVICE — 6th Sept* — each with its exact date, each service's duplicated
  uploads folded to one card (the three copies of 30 August collapsed to a single entry, the two of
  20 September to one, and so on). Laid out as a 2×3 grid with even heights per row at 1440px, no
  clipped text and no horizontal overflow. No console errors, no `platformErrors`, no
  `syntaxErrors`, and **nothing was published** — the office's draft is untouched apart from their own
  channel setting (`@twocorg`), which still waits for their **Publish**.

## 114. “N unsaved changes” opens what has not been published

The ask: *“when i click the unsaved changes it should show me what ii have not saved”*.

- **The chip was a label, not a door.** The edit bar printed `3 unsaved changes` in a crimson pill and
  pointed at nothing — the office could see that something was waiting and not a word about what. It
  is a button now, and it opens the drawer on a new view: one row for every part of the site that
  differs from what is live, each said in the office's own words — *“Live stream — YouTube channel to
  watch for live: empty → @twocorg”*, *“Church profile — Founded (year): 1999 → 1997”*, *“Service
  times — Sunday Service: a new entry”*. A row opens that section's fields (`openSection`), and a
  small *Put back* on its right drops that one change (see below).
- **The words come from the section itself, not from a dictionary.** `pendingEdits()` (new,
  `src/lib/cms.ts`) walks `pendingSections()` — the *same* function the chip counts with, so the
  heading and the chip can never disagree — and for each section diffs the draft against
  `publishedSection(id)` using the drawer's own vocabulary: an object section through its `fields`
  (labels, select `optionLabels`, `time`/`date`/`number` verbatim), a list through its entries
  (`itemLabel`/`itemMeta`, `idKey` when every entry has one, by position when one has no URL id yet),
  a page-text section through its lines. Details are short: `1999 → 1997`, `switched on`, `a photo was
  removed`, `2 lines changed`, `(+2 more)` when an entry changed in several places. Long text is
  snipped to fit the column, and a section shows at most six lines with *“and N more in this part”*
  under them — a list that hides a change would break the count, so the count is the number of lines
  and the six are only what is written out.
- **Put back drops one change.** `revertSection(id)` restores that section to what is live, alone —
  everything else typed and unsaved stays exactly where it is — and marks the section no longer
  `dirty`, so a later publish by another editor reaches it too. It goes through `pushEditUndo`, so
  the bar's *Undo* takes the change back and the office's edit returns. (The section's own *Put this
  back to the original* is a different thing: it restores the *shipped* content, which is itself a
  change when the office has ever published something else.)
- **Clicking the chip keeps the tab they are standing on.** The view is drawn inside the existing
  panel (`kind: "unsaved"`, one back link to the tab's own home), so from *Edit* a row returns to the
  job cards and from *Update* to the full list — the complaint behind SPEC note 59 was being thrown
  out of the list they were clicking in. The one exception is *Status*, a different kind of page:
  opening the list from there moves to *Update*, because being shown the status again would look like
  nothing happened. An empty draft gets its own panel — *Everything is published* — using the gate
  the sign-in screen already uses.
- **Cheap enough to sit behind every keystroke.** The list is memoised on the applied `version` plus a
  signature of the changed ids, so it re-reads when the draft lands on the page (the paced preview,
  SPEC note 61) and the moment the set of changed sections changes — never once per character, which
  is what the drawer's typing hangs were about. Measured: the whole `pendingEdits()` call is 5.8 ms
  with three sections of real content.
- **Verified live.** With the office's own one unsaved change, the chip reads `1 unsaved change`,
  opens a panel headed *“1 change not on the site yet”* listing *“YouTube channel to watch for live:
  empty → @twocorg”*; clicking the row opens the Live stream section with that field in it;
  *Put back* took it away, the chip disappeared and the panel showed *Everything is published*, and
  the value was then put back byte-identically (`JSON.stringify` before === after). Undo brought a
  dropped change straight back into the list. A templated *Church profile* change covering fifteen
  fields showed six lines plus *“and 9 more in this part”*, each long line wrapping without clipping,
  and *Put back* restored the section to published (it left `pendingSections()`, which is the
  definition of equal). Checked at 1440×900 and 390×844: the pill, the rows and the *Put back* button
  (icon-only under 420px) lay out with no overflow or clipped text. No console errors, no
  `platformErrors`, no `syntaxErrors`, and **nothing was published or saved** — the office's draft
  still holds their channel setting and nothing else. Two empty *Add another* entries (`series`,
  `sermons`) that earlier test runs had left in the draft were taken out of the list with its own
  *Put back* button, which is what that button is for.

## 115. The Live stream section's help paragraph is gone

The ask: *“remove this: The Sunday stream. Paste the YouTube link … how many of those write-ups the
page lists.”*

- The *Live stream* section opened with a four-sentence paragraph explaining the two links, the
  channel-following behaviour and what the three numbers below them do. It was `SectionDef.blurb` for
  `live` in `src/lib/cmsSchema.ts`, drawn as `.pblock__blurb` at the top of an opened section. It is
  `""` now, which is how the drawer already words a section that has nothing to add — the block body
  prints the paragraph only when there is one (`blurb ? <p …> : null`), so nothing else changed.
  Every one of those fields carries its own `hint` (*“Visitors can still switch to the other one.”*,
  *“A live link, a watch link or just the video id — all of them work.”*), so no instruction was lost
  with the paragraph.
- **And the channel field's second half.** The ask immediately after: *“remove this: The page then
  asks YouTube whether that channel is on air … Nothing to do on the day.”* The `youtubeChannel`
  field's `hint` was four sentences; the office's paste starts at the second one, on a sentence
  boundary, so the first — *“Paste the channel's @name, its id or its link.”*, which says *what to
  paste* — stays and the three explaining what the page does with it are gone. (Where the earlier ask
  elided the *middle* of a paragraph, the whole paragraph went; here the cut is between sentences, so
  the instruction survives.)
- **Verified live.** The section opens straight onto the on-air panel and *Plays by default*; the
  words *“The Sunday stream”* appear nowhere in the drawer; the channel field's hint reads just
  *“Paste the channel's @name, its id or its link.”*; the block body holds no empty element and
  no gap where the paragraph was (measured: header → card → first field are flush, as they are in
  every other section, with the card's own padding doing the work). No console errors, no
  `platformErrors`, no `syntaxErrors`, and **nothing was published or saved** — the office's own
  unsaved channel change is untouched.

## 116. The welcome picture became a slide space for the office's announcements

The ask: *“replace this attached image with a slide space for image announcement”*, with a phone clip
of a church notice board — a poster filling a screen, then a red arrow and a second, different poster.

- **The picture is not printed, it is composed.** The welcome box on the home page used to be one
  photograph (`img("welcome")`). It is a *slide space* now: every picture the office posts is composed
  into a designed announcement slide — the office's own words set large and small *on top of* the
  picture, poster-fashion — and the space turns from one slide to the next by itself, with arrows and
  dots, exactly as a church notice screen does. `AnnouncementSlide`/`AnnouncementSlides`
  (`src/components/slides.tsx`) are the whole of it; the data lives in `src/data/slides.ts` and the
  office edits it under *Events & notices → Announcement slides* (`slides` in `src/lib/cmsSchema.ts`,
  a `kind: "list"` section keyed on `id`, using the same `ImageField` every other photo on the site
  uses, so uploading, pasting a link and *Use the original photo* all work as the office already
  knows them).
- **Eight designs, and a different one for every upload.** A slide drawn in the same design as the
  slide before it would read as a template, so `SLIDE_DESIGNS` holds eight hand-composed layouts —
  *Parchment plate*, *Crimson band*, *Sanctuary arch*, *Ray card*, *Seal & mandala*, *Two-part
  poster*, *Numbered plate*, *Ribbon* — and `slideDesigns()` hands one to each slide. The design is
  read off the **picture** (an FNV-1a hash of its address and the slide's id, which is *stable on
  every device and every load*, unlike `Math.random()`), and taken designs are skipped, so **each
  upload gets a design of its own**. Slots are handed out in a stable id order and a pinned design
  keeps its own slot, so reordering the slides never re-designs them — only adding, removing or
  replacing a picture does. A slide may also *pin* a design (`design`, a select with *Automatic (a
  different one for every picture)* plus the eight names), which is how the office asks for a
  particular one; the automatic slides work around the pinned ones.
- **Poster colours, deliberately outside the theme.** A slide is artwork, not chrome: the designs are
  drawn in a fixed *poster* palette (`--poster-ink/gold/gold-2/crimson/cream/parchment`, declared on
  `.aslide`) and do **not** follow the site's light and dark themes, exactly as a printed poster would
  not. (Superseded by **note 117**: every slide now takes its colours *from its own picture* —
  `src/lib/palette.ts` — with that shipped palette kept as the fallback, and the designs still do not
  follow the site's themes.) Everything is sized in container units (`cqw`, with a `rem` fallback in front of each) against
  `container-type: inline-size`, so one set of designs is the same picture at any size — the
  full-width box on a phone and the half-width one on a desktop differ only in scale.
- **The words can never run off the poster.** The office writes the words; the design cannot know how
  many. Every size in the designs is therefore a share of the box's width multiplied by a single
  `--fit` factor, and `AnnouncementSlide` measures its own text against the block it sits in and
  scales the whole block down together — in 2.5% steps, floor 0.6, re-measured once the display face
  has actually loaded (`document.fonts.ready`) — until nothing is left outside. With the shipped
  slides every design sits at `--fit: 1`; driven with a 45-character headline, a 170-character line
  and a 29-character button, *Crimson band* lands at 0.825 and *Sanctuary arch* at 0.875 with **no**
  element outside its block where, without the fit, the two of them pushed the button off the bottom
  edge of the slide (measured: 15.5 px and 6.2 px of the button beyond the box).
- **The small voice was raised.** Measured on a phone-sized box (329 px), the supporting line was
  reading at 8.6 px — fine print, and below what a phone visitor can comfortably read. The line, the
  kicker and the button gained 0.2–0.5cqw each (the button 2.4 → 2.7cqw, the line 2.6–2.7 → 3.1–3.2cqw
  in the designs that carried the smallest type), which is ~10 px on that box and ~16 px on the
  desktop one, with the auto-fit taking back whatever a long line then needs.
- **The years-of-ministry chip is the poster's caption now.** The count (`zoneYear() − SITE.founded`)
  was a chip floating in the bottom-right corner *of the picture*. That corner is not free any more:
  measured against the eight designs, a chip that size (34.8% × 22.8% of the box) sat on top of the
  words in five of them — the plate's line, the band's button, the arch's line and button, the split's
  line, and the whole of the ribbon — and no other corner is clear at every box size, because the chip
  is a fixed size and the poster is not. It is a caption under the poster now (`<figure>` +
  `<figcaption>` in `src/pages/Home.tsx`, `.split__figure`/`.split__badge` in `src/styles/pages.css`),
  themed from `--ink-2`/`--line`/`--gold` instead of the old dark glass, and the same office-editable
  words (`home.welcome.badge`) and the same number. Verified: the chip's top edge sits 13 px **below**
  the box at every width tested, and it is the only thing in the box that ever was outside the slide.
- **`?slides=all` lays every design out at once.** Visiting any page with the flag in the address
  (`#/?slides=all`, or `#/admin?slides=all` from the drawer) swaps the space for a full-screen grid of
  all eight designs, drawn with the first slide's picture and words — the office's preview of the set
  and the harness these designs were drawn and checked in. It carries its own *Back to the page*
  button (`leaveDesignPreview`), because a preview with no way out is a trap.
- **How they were drawn.** Each design was rendered alone in that grid, captured at 2–3× and measured
  in the live DOM rather than judged by eye: every element's box against the block it belongs to
  (nothing outside its block at any of the shipped slides), the real ink rectangles of the headline,
  the line and the button (`Range.getClientRects`) for the gaps between them, and a glyph-pixel
  contrast audit (each text element captured with its text visible and hidden, sampling the pixels
  behind the glyphs). Two findings worth keeping: the *Seal & mandala* headline was the one real
  failure of that audit, at 1.8:1 with 31% of its glyph pixels under 3:1 — the mandala's rings behind
  the words — and is fixed by `.aslide__sealscrim`, a radial dark scrim, which took every headline and
  line on every design to **≥4.4:1 with 0% of glyph pixels under 3:1**; and an off-the-shelf vision
  model, asked to check the designs, reported the headline and the line *overlapping* on slide after
  slide, which the rectangles disproved every time (a clean 6.7–8.3 px gap between the two, measured
  at the same moment). The captures themselves were cross-checked against the DOM — the gold star's
  pixel rows land at 52.5–54% of the box, where the DOM puts it at 51–56.1% — so they were faithful
  and the vision model was simply confabulating collisions in 8–9 px type. Where the two disagreed,
  the measurements were trusted, and where the model agreed with a measurement (the button clipping,
  the seal's legibility, the chip on the words) the fix is in the list above.
- **Verified live.** The home page's welcome box shows one slide at a time — *Sanctuary arch* for the
  first, *Parchment plate* for the second — with two arrows and two dots and **no** counter chip on
  it; the next arrow advances (`welcome-home` → `watch-live`), the prev arrow goes back, the dots mark
  the current slide, the space advances by itself after 9 s, holds while the pointer is over it
  (`mouseover` → unchanged across 9.6 s) and resumes when it leaves, and both arrows are the only
  controls added to the box. No text element's box overlaps another's on any of the eight designs, no
  element leaves the block it belongs to on any of them, and the box itself neither scrolls nor
  clips at 1440×900 or 390×844 (measured: `scrollWidth === clientWidth`,
  `scrollHeight === clientHeight`, no page overflow). The drawer lists *Announcement slides* under
  *Services & activities* in the *Announcements* job with its blurb, both shipped slides with their
  label and meta line, and an opened slide shows all of it: URL id, *The picture* (*Using “Choir”*,
  *Upload a photo*, *Use the original photo*), the four word fields, the *Design* select with
  *Automatic (a different one for every picture)* plus the eight names, and *Show this slide*; *Add
  another*, *Delete* and *Put this back to the original* are all there. No console errors, no
  `platformErrors`, no `syntaxErrors`, and **nothing was published or saved** — the office's own
  unsaved channel change is untouched.

## 117. The slide space takes its colours from the picture — and fills the column

The ask: *“use a carousel/slider, make sure it takes the colour and design of the uploaded image, let it
fill the whole space area especially for desktop view”* — three separate things, all now true.

- **A real carousel, not a fader.** The space is a track slider: `.aslides__viewport` clips,
  `.aslides__track` carries every slide side by side, and the track moves with
  `transform: translate3d(calc(-N% + dragpx), 0, 0)` over `transform .6s`. A finger (or the mouse) can
  **drag the track itself** — pointer events, with the drag distance kept in a ref as well as in state
  so a flick that begins, moves and ends inside a single frame still lands (state alone lost it); a
  gesture that turns vertical is handed back to the page, so scrolling on a phone still scrolls. A
  release counts as a swipe past `max(42px, 18% of the box)`, and the arrows, the dots, the 9-second
  self-advance that a touch holds, and the arrow-key handler all still work. Only the slide on screen
  is reachable: the others carry `inert`, so the keyboard and a screen reader skip them.
- **The colours come off the picture** (`src/lib/palette.ts`, new). A slide used to be drawn in the one
  fixed poster palette. It is now read from the office's own upload: the picture is drawn to a 64×~96
  canvas (`crossOrigin = "anonymous"` — the bundled photos are same-origin and platform's upload host
  answers with `Access-Control-Allow-Origin`, so both read) and each pixel votes into one of 24 hue
  buckets, **weighted by how vivid it is** (`s²·(1 − |2l − 1|·0.55)`), so a sharply coloured flyer on a
  white ground is read as *its* colour and not as white; the winning bucket is averaged with its two
  neighbours through a circular mean, so a picture that straddles a bucket boundary is not read as the
  boundary. From that hue come the ground (`ink`/`inkTop`), the paper (`light`/`light2`), the accent
  (`accent`/`accent2`), the scarlet (`deep`) and every `on*` ink — each one passed through `readable()`,
  which walks its lightness away from its ground until the pair clears a WCAG target (4.6 for accents,
  7 for body), and stops at the ends so a palette is always a real colour rather than a clip.
  **A picture with no colour of its own keeps a neutral palette**: `tone()` returns the near-zero
  saturation for a black-and-white flyer rather than inventing a colour it never had. The module is
  cached in memory and in `localStorage["wom.slidePalette"]` (v1, 60 entries) and reachable as
  `window.__slidePalette` (`load`, `cached`, `all`, `fallback`) — until (or instead of) a read, the
  designs use `FALLBACK_PALETTE`, the poster palette they shipped with, so a slide is never
  half-dressed and an unreadable picture still gets a finished poster.
- **The same read answers the composition.** A 3×3 grid of mean luminance-difference gives `calm` (the
  quietest third — the side a design may put its words on without covering the subject; the band and
  the card mirror on `data-calm`) and `focusX`/`focusY` (the busiest cell, used as the crop's
  `object-position`), so the subject survives the crop.
- **Every design is full-bleed now.** The picture covers the whole slide in all eight — no inset
  photograph in a letterbox. Each keeps its identity by the treatment laid *over* it: *Parchment plate*
  a paper card at the foot, *Crimson band* a translucent `deep` side band, *Sanctuary arch* a dimmed
  photo with a brighter 3:4 window and a ring, *Ray card* conic rays behind a deep card, *Seal &
  mandala* a dimmed photo under the mandala and its scrim, *Two-part poster* a blurred translucent ink
  foot panel with an accent rule, *Numbered plate* an ink veil behind an outlined number, *Ribbon* a
  parchment ribbon running off both sides at the foot.
- **The box fills the column on a desktop — and a real layout bug was behind it.** `align-items:
  center` on a grid whose figure is short left the photo in a letterbox, so `.split__figure` became
  `height: 100%` with `grid-template-rows: minmax(0, 1fr) auto` and `.split__media` `height: 100%`
  (min-height 360px) inside `@media (min-width: 940px)`. Writing that up found the older bug: `<Section>`
  wraps its children in `.container`, so the `.split { display: grid; grid-template-columns: 1fr 1.05fr }`
  that was meant to make the two columns had **one child** — the welcome picture sat in a half-width box
  with a big empty column beside it and the words underneath. The grid now lives on `.split > .container`
  (a comment in `pages.css` says why), with `align-items: stretch` on the desktop. Measured at
  1440×900: figure 547×785, media 547×732, the slide box 546×730 (**aspect 0.747 — portrait**, where the
  old box was 4:3), the body 574×785 beside it, and no page overflow. (Replaced by **note 118**: the
  box now takes the upload's *own* shape, so a portrait flyer fills the column and a landscape picture
  sits centred in it at its own proportions — the `.split > .container` grid fix above still stands.)
- **The type was audited at both box shapes.** The glyph-pixel audit (each cell captured with its text
  visible and hidden, comparing the pixels behind the glyphs) run over all eight designs at the preview
  cell (325×244, 4:3) **and** at the real desktop box (545×729, 0.747) leaves the text-only elements at a
  median of **5.47–10.01:1** per design, with every design at `--fit: 1` at both sizes, the photograph
  covering the cell in every one, nothing outside its words block, and — measured with
  `Range.getClientRects`, not by eye — **no box overlapping another** on any of them. The changes the
  audit asked for are in: the band's `deep` gradient 88→96% at the top and 66→88% at the foot, the ray
  card 96→84%, the split's foot panel 90%, the arch's under-photo brightness 0.4→0.5 with its words
  block moved 52→47%, and the numbered plate's veil — 62% alpha was a real 2.9:1 median — now 96%/90%
  falling to 34% and then transparent.
- **The palette was proved on four synthetic flyers** (blue, red, black-and-white, pastel), each read
  through `window.__slidePalette.load()`: all four report `fromImage: true` with the right hue, and
  every guaranteed pair lands where it should — `onInk`/`ink` 17.0–17.3, `onInkSoft`/`ink` 9.2–9.6,
  `onLight`/`light` 14.1–14.7, `onLightSoft`/`light` 6.4–7.3, `onAccent`/`accent` 7.1–8.3,
  `deep`/white 6.9–8.3, `accent`/`ink` 7.7–9.1, `accent2`/`ink` 13.1–13.8. The black-and-white one is
  the interesting case: its palette is neutral greys (`accent` #b9b6b6, `deep` #5f5959) instead of the
  pinkish-grey a hue-less picture used to be given, while still clearing every target.
- **A phone keeps the old shape.** The desktop fill lives inside `@media (min-width: 940px)`, so at
  390×844 the box keeps `aspect-ratio: 4/3` (329×247), the arrows are 32×32, the dots stay, the caption
  chip stays 13 px below the box, and there is no horizontal overflow (`scrollWidth` 375 ≤ 390). The
  slide on screen measured 7.9–12.8:1 on its own text with `--fit: 1` and nothing outside its block.
- **The vision model was wrong again, and the DOM was right.** Asked to check the desktop capture, it
  reported the headline overlapped by the paragraph below it, the years chip sitting *on* the photo, a
  "distinct white margin" around the picture, and low-contrast gold text on a white card. Every one is
  false and each was disproved by measurement at the same moment: the headline's text rects end at
  1483 with the line starting at 1491 (an 8 px gap), the chip's top edge is at 1729 against the photo's
  1717, the photo's own rect *is* the box's rect (125,986 → 671,1716 on both), no slide in either
  position has a white card or gold-on-white, and the "white margin" was the light page background the
  capture painted around the element it was asked for (the site was in light theme, `body`
  #f4efe4). The plate slide's four text bands measure 1488–1505, 1513–1552, 1559–1609, 1630–1647 —
  four clean, disjoint rows. As in note 116: where the model and the DOM disagreed, the DOM was
  trusted, and a real capture of the figure alone confirms the photograph is full-bleed to all four
  edges with the chip below it.
- **Verified live, and nothing published.** The home page's space shows *Sanctuary arch* then
  *Parchment plate* (2 slides) with arrows, dots, drag, self-advance and `inert` flipping; `?slides=all`
  lays the eight out at the desktop box size for the checks above; *Events & notices → Announcement
  slides* still lists both slides with their words, *Add another* and *Put this back to the original*.
  No console errors, no `platformErrors`, no `syntaxErrors`; the office's unsaved channel change was
  left alone.

## 118. A slide is the shape of its own upload

The ask: *“every upload is turned to a landscape on the announcement slide and it takes the design of
the uploaded image”* — the box was a fixed 4:3 and the picture was cropped into it (`object-fit:
cover`), so a portrait flyer came out as a landscape. The slide now takes the upload's own shape as
well as its colours.

- **The picture's proportions are read with its palette.** `src/lib/palette.ts` already loaded the
  image; it now also keeps `naturalWidth / naturalHeight` as `aspect` on the palette (from the real
  pixels, not from the capped sample), **clamped to `ASPECT_MIN` 0.55 – `ASPECT_MAX` 1.9** so a
  story-format poster or a letterbox banner cannot wreck the page layout. `CACHE_VERSION` went 1 → 2
  so a palette cached before the shape existed is read again rather than used as it is — an entry
  without `aspect` would have kept the old 4:3 for ever.
- **The box is a variable, not a rule.** `AnnouncementSlides` reads the *current* slide's picture's
  palette (and, in the design preview, the first slide's) and writes it on the box as
  `--slide-aspect`; `.aslides { aspect-ratio: var(--slide-aspect, 4 / 3) }`. The fallback is the old
  shape, so a slide is never badly shaped while a picture is still being read, and
  `transition: aspect-ratio .45s` glides to the real one (dropped under `prefers-reduced-motion`).
  On a desktop the box is still as wide as its column, and **a portrait upload — a real flyer — now
  fills that column exactly** (measured with a 512×768 flyer: the box is 546×819 beside a 785-tall
  body; the shipped landscape photograph gives 546×364, centred, with no crop).
- **Nothing crops the upload any more.** The picture's own rect and the box's are the same
  (measured crop delta **0.000** at 759, 1440 and 390 px wide), because `object-fit: cover` now has
  nothing to cover. `.split__media img` (which was also hitting every slide photograph, and carried
  the old `aspect-ratio: 4 / 3`) is scoped to `.split__media > img` — the stand-in photograph for the
  "no slides at all" case — and `.aslides--empty img` gets that fill explicitly, since nothing else
  would have styled it once the selector was scoped.
- **The auto-fit had to learn to re-measure.** With the shape able to change *after* mount (the
  picture's proportions arriving, the space moving to a differently-shaped upload, a window resize),
  a `--fit` measured for the old box could stay behind — at a 1.9 box the *Crimson band*'s ornament
  and button sat **outside** their block. `AnnouncementSlide` now watches its own box with a
  `ResizeObserver` (one `requestAnimationFrame` per change) and re-fits. After that, all eight designs
  are clean — nothing outside its words block — at **0.55, 0.667, 0.75, 1.0, 1.33, 1.6, 1.78 and 1.9**,
  with the fit shrinking only where it must (band 0.875–1.0, arch 0.775–1.0).
- **The portrait case, end to end.** A 512×768 flyer through `window.__slidePalette.load()` reports
  `aspect: 0.667`, `ink #0e141d`, `accent #7da9f3`, `deep #0e48a9` — the flyer's own midnight blue.
  With it in place the slide measures 699×1048 at the editor's width and 546×819 at 1440, with
  `--fit: 1`, nothing outside its block, and its own words at a **p50 of 9.63:1 with 1.1% of glyph
  pixels under 3:1** (the glyph-diff audit). On a phone (390 px) it is 329×494 with the chip still
  13 px below it, the arrows still 32×32, and no horizontal overflow.
- **The vision model was wrong again.** Asked to check a capture it read "9:00 & 11:30 AM" as lying on
  top of "Sunday" in the *Parchment plate*'s card and "home" as sitting on the line beneath it. The
  card's text measured four disjoint rows — 1571–1589, 1597–1636, 1643–1693, 1713–1731 — with
  **zero** overlapping pairs, at the portrait shape, on the live DOM. The capture itself was proved
  faithful first (the element's 547×873 came out as 820×1309, the same 0.627 ratio at DPR 1.5), so the
  only thing at fault was the reading of it, exactly as in notes 116 and 117.
- **Verified live.** The home page's box matches its picture's shape at 759 px (699×466 for the 1.5
  photograph), at 1440 (546×364, the figure centred beside the words) and at 390 (329×220); the
  design preview follows the first slide's shape (306×204 cells on a phone); the chip stays below the
  box at every width; no page overflow anywhere. No console errors, no `platformErrors`, no
  `syntaxErrors`, and nothing was published or saved — the office's own unsaved draft is untouched
  (the `slides` section carries no office edit, so the shipped list is still what shows).

## 119. The church's own photo, faintly, behind the home headline

The ask: *“add this background faintly to the first attached image area, it still retains all
designs”* — with a screenshot of the home page's hero and a photograph of one of the church's own
services. So: the photograph becomes a **faint background texture in the hero**, and everything that
was there before stays.

- **What was read where.** The attached screenshot is the home hero, so that is the area changed —
  the hero only. Nothing else on the site was touched: the announcement slides keep all eight of
  their designs and their own pictures, and the *Watch live* banner keeps the picture it had (both
  are the things "still retains all designs" could mean, and neither was altered).
- **The picture is the office's own, and office-replaceable.** The photograph ships as
  `src/assets/img/hero-faint.jpg` behind a new photo slot — *Home page background*, "Laid over the
  home banner as a faint texture, behind the home page headline only", in the *Main photos* group —
  so it appears in *Photos & covers* with its preview and can be swapped from the drawer like every
  other picture on the site (verified: the drawer lists it, with its blurb, between *Home banner* and
  *Welcome section photo*). A **separate slot** was used rather than *Home banner* because that key
  is also the *Watch live* page's banner, which the office did not ask to change.
- **Two layers had to be got right.** The hero already has a banner photo, a scrim over it, a gold
  glow and a grain, with the copy's own readability scrim above them all. The faint photo must sit
  **above the banner's scrim** (or the scrim would hide it) and **below the copy's scrim** (or it
  would eat the headline). The first attempt was simply added inside `.hero__bg` in the normal flow:
  it was pushed below the banner picture and clipped away by the hero's `overflow: hidden` — measured
  as a pixel change of **0.00–0.09 out of 255**, i.e. it was not painting at all. Two fixes: the scrim
  became a real element (`<span className="hero__scrim">`, where the `::after` used to be) so the
  picture could be painted after it, and the picture is `position: absolute; inset: 0` with
  `transform: scale(1.05)` (so the 6px blur cannot show a soft border at the edges).
- **"Faintly" was tuned by measurement, not by eye.** How much a layer changes the pixels is
  measurable: the hero is captured with the layer shown and hidden and the two are compared. The
  shipped values are `opacity: .07` + `multiply` + `blur(6px)` in the light theme and `opacity: .18` +
  `screen` + `blur(6px)` in the dark — chosen against the measurement (light: mean change **9.6** of
  255, max 16, 0% of pixels over 20; dark: mean **4.8**, max 36, 2.8% over 20). The two themes need
  different numbers on purpose: `multiply` over the light theme's cream moves far more pixels than
  `screen` over near-black, so equal opacities would not look equally faint.
- **The copy did not get any harder to read.** The glyph-pixel audit on the hero's eyebrow, headline
  and paragraph comes out at a **median of 8.93:1 in the light theme and 11.25:1 in the dark**
  (p25 5.74 / 9.47; 5.2% and 0.6% of glyph pixels under 3:1, the anti-aliasing edges as always) —
  and the copy's text rectangles are four clean, disjoint bands (eyebrow 271–285, headline 295–474,
  paragraph 488–539, buttons 576–634), i.e. no element overlaps another. The texture is subtle enough
  that the vision model could no longer identify what the photo shows, which is the point of
  "faintly"; it also *did* report the headline overlapping the paragraph and the middle button
  covering it — **including on a capture with the whole background hidden**, and while misquoting the
  CARE paragraph's own wording, so its readings were discarded and the measurements kept, as in notes
  116–118.
- **Verified live.** The hero's faint layer covers the hero at 1440×900 and on a phone (375×780, the
  layer 393×819 with its 5% bleed), the announcement box below is untouched (329×220 for the shipped
  landscape photo), there is no horizontal overflow anywhere, and the new slot is in the drawer. No
  console errors, no `platformErrors`, no `syntaxErrors`; nothing was published or saved.

## 120. The photo behind the home headline shows properly — sharp, and still off the words

The ask: *“let it shows but make not obstructing the text it is too faint”*, then *“let it be more
visible clears but a bit blur”*. So the faint layer stays behind the copy, but it must read as a
photograph rather than a smudge — and it must stop being washed out without the headline or the
paragraph getting any harder to read.

- **What is measurable here, and what is not.** How visible the layer is: capture the hero with it
  shown and hidden and compare (mean/max pixel change, share of pixels over 20/255). How readable the
  copy is: find the element's own ink pixels (its computed colour, confirmed by the pixel changing
  when the ink is made transparent) and take the contrast of that ink against the **actual pixel
  behind each one**, from a capture where only that ink is transparent — so the copy's own readability
  scrim is still in the picture. The vision model was asked the same questions but its answers
  contradicted themselves and the measurements (see below), so every figure here is a measurement.
- **Numbers, before → after.** The layer shipped in note 119 as `opacity .07 + multiply + blur(6px)`
  light / `.18 + screen + blur(6px)` dark, i.e. **9.6 / 255** mean change in the light theme and
  **4.8** in the dark. It is now `opacity .55 + soft-light + blur(1px)` light / `.5 + screen +
  blur(1px)` dark: **27.1 / 255** mean change light (max 72; **55%** of the hero's pixels move by more
  than 20) and **12.5** dark (max 113; 20% over 20). On a phone the layer still covers the hero
  (393×819 for a 375×780 hero, its 5% bleed) and shows photographic texture.
- **“A bit blur” was taken literally: 6px → 3px → 1px, kept.** Sharpness was measured as the mean
  pixel-to-pixel gradient *of the layer's own contribution* (the on-minus-off difference image), which
  is not confused by the grain layer or the banner underneath. In the dark theme that reads 0.437 at
  `blur(3px)`, 0.486 at 1.5px, **0.514 at 1px** and 0.579 with no blur at all — so 1px keeps a visible
  softness while giving back ~18% of the detail that 3px was destroying (in the light theme the same
  curve is nearly flat, 0.499 → 0.543).
- **The light theme had to stop multiplying.** `multiply` can only darken, so over the cream parchment
  band the photo's bright half — the stage lights and LED screens, the whole reason the picture reads as
  a photograph — simply disappeared, and what was left looked like a grey wash (this is exactly what
  the vision model said about the strongest `multiply` build). The light theme now uses `soft-light`,
  which moves both ways. Measured: the band's overall brightness is **unchanged** (mean hero luminance
  0.640 with `multiply .23` vs **0.636** with `soft-light .55`), while the layer's contribution carries
  noticeably more colour (chroma 3.68 → **4.20**) and its bright areas survive. `normal` was rejected:
  it is the clearest of all but darkens the band (mean luminance 0.593, 36% of the hero under 0.45).
- **The copy kept its protection, and one real weak spot was fixed.** The copy's scrim ellipse was
  widened (`58%×52%` → `74%×64%`, fully transparent at 88% instead of 80%) because the *outer words*
  of the eyebrow and the paragraph fall outside the old ellipse — the one place the photo came through
  at full strength. With that, the ink-over-real-background audit gives, light theme: eyebrow **6.1:1**
  median (worst 5.5), headline **16.4** (worst 15.5), paragraph **8.6** (its p25 8.0); dark theme:
  **11.1 / 13.7 / 10.8**. The background directly under the ink sits at luminance 0.69–0.92 in the
  light theme, i.e. a light band, and 0.01–0.11 in the dark. A soft text-shadow halo was tried in the
  light theme and then removed: it added **0.0** to the measured contrast, so it was pure risk.
- **Two measurement traps worth remembering.** (1) The page has a continuously animating element, so
  two captures of an *unchanged* page differed in 7,744 pixels by more than 20 — every audit now
  pauses animations and self-checks for determinism (it reports 0). (2) Hiding text (by `visibility`
  or by making the ink transparent) makes the capture tool *redraw that text in the page's fallback
  ink colour*, which invented a phantom dark background under ~12% of the paragraph's glyph pixels.
  That phantom is identical with the faint layer deleted, and unchanged by its strength — so it is not
  the photo, and it is reported here as a known artifact rather than as a contrast problem. The vision
  model, for its part, described the paragraph as muddy and the glow as an obvious artifact on captures
  where the glow was disabled and the headline never had a shadow; it also re-reported a headline
  overlapping the paragraph and a countdown pill clipping on the phone, both of which the rectangle
  and `scrollWidth`/`clientWidth` checks show are not there. Measurements kept, vision readings
  discarded, as in notes 116–119.
- **Verified live** at 1440×900 and on a phone (390×844): no horizontal overflow, no text overflow
  inside the live/next pill (329/329), zero overlapping copy rectangles, and no console errors,
  `platformErrors` or `syntaxErrors`. Nothing was published or saved.

## 121. The slide runs the full length of the band, and the welcome copy is underneath it

The ask: *“this should be underneath, the annoucement slide should take the place of that area
background full lenth”* — with the welcome band's whole copy pasted in (eyebrow, the *“You were not
made to survive”* heading, the 1999 paragraph, the five values, *Our story & beliefs*, *Find your
place*). So the pasted words say **which** area: the home page's welcome band (`.split`), the one
holding the announcement slides. The slide is to take that area over at full length, and the copy is
to be underneath it.

- **Two readings were built, and one was rejected by measuring it.** “Underneath” can mean *behind*
  (the slide as the band's backdrop with the copy over it) or *below* (the slide full length on top,
  the copy under it). The backdrop version was built first and looked good in the abstract — the
  poster edge to edge with the copy in its own panel — but the poster's **own words** were cut by the
  panel: *“First Sunday or…”*, *“PLAN YO…”* truncated mid-word, and on the light theme the panel and
  the poster's text read as one collision. The office's posters *are* their announcements (notes
  116–118), so hiding part of one is not acceptable. The second reading keeps every word: **the slide
  full length, the copy underneath.**
- **What changed.** The media breaks out of the container — `.split__media { width: 100vw;
  margin-inline: calc(50% - 50vw) }` — so the slide runs edge to edge, while the caption under it
  stays on the page's gutter; the media loses its border and radius; and the band loses its own top
  padding, so the poster starts at the band's top edge — only the copy underneath keeps the
  section's padding. The copy follows the poster in the flow, as two columns
  where there is room (the eyebrow, heading, paragraph and buttons on the left; the five values
  beside them on the right) and as the single column it always was on a narrow screen. **The change
  is deliberately not gated behind a breakpoint**: the pane the office works in is about 760px wide
  and sits below the old 940px breakpoint, so a desktop-only rule would have been invisible to the
  person asking for it. The years-of-ministry chip stays the caption underneath the poster — it is
  aligned to the page's gutter (`justify-self: start` on the figure's single column), so it lines up
  with the welcome copy below it rather than with the poster's now-full-bleed edge.
- **The slide's shape was, at this point, still its own upload's** (note 118): the box was
  `--slide-aspect` wide per unit of height, running the full length of the page, with a `110vw` stop
  so an upload tall enough to be more than 1.1× the page's width high was held back rather than
  cropped into a strip or run down three screens. Measured then: at the office's 759px pane the
  landscape slide filled the width (**759×506**) and the square one filled it too (**759×759**), while
  the portrait flyer (0.71) showed at **590×835** (78% of the width); at 1440×900 the same three were
  **1440×960**, **1440×1440** and **1119×1584**; on a phone all three were full width. A held-back
  slide was centred on the band's own dark ground (`#08080c`, the slide box's own colour), so the
  strip reads as one stage with a matte at the sides instead of a poster floating on the page. The
  designs scale with the box instead of recomposing for it (measured: the arch element is **40.3%**
  of the box width at both 699px and 720px), so a bigger box is the same composition, larger.
  **Note 122 supersedes this**: the frame is now one shape for every slide — 1600×1200, 4:3 — and
  every picture is cut to it, so the band no longer changes height from one announcement to the next
  and the `110vw` stop no longer has anything to hold back.
- **Nothing collides.** The copy sits below the poster (`body.top ≥ media.bottom`) and its glyph ink
  is inside the band with room to spare (ink 898–1494 in a band 0–1565 — a 71px gap at the foot); a
  glyph-level check (`Range.getClientRects()` on every text node, not the element boxes) finds
  **zero** overlapping pairs; and there is no horizontal overflow at 759, 1440 or 390. The poster's
  own edges were checked by sampling the capture, not by eye: the leftmost and rightmost columns are
  the poster's content (left 8,8,12 / right 53,48,40), not the page's parchment (244,239,228). The
  vision tool, meanwhile, reported cream side margins, a white frame, a black bar down the left, a
  cut-off heading and an overlapping paragraph — every one of which the measurements above
  contradict, so its readings were discarded, as in notes 116–120.
- **Verified live** in both themes, at 759, 1440×900 and on a phone (390×844); no console errors, no
  `platformErrors`, no `syntaxErrors`. Nothing was published or saved. The final geometry was
  re-measured after the media-breakout change: the stage's left edge is **−7.7px** and its right edge
  **innerWidth − 7.7px** at every width (clipped by the band's `overflow: hidden`, so the poster
  reaches both edges of the viewport), the stage is **759.3** wide in the 759 pane, **1440** at
  1440×900 and **390** on the phone; the chip's left is **22px** at 759 and 390 and **124.3px** at
  1440 — exactly the welcome copy's own left edge in each case (`justify-self: start` on the figure's
  single column) — and it sits **12px below** the stage; in the 759 pane the copy's first line
  starts **60.6px** below the chip. Glyph collisions stay at **0** and `overflowX` stays negative
  everywhere; at 1440 the copy block is the two-column grid (574.5px / 547.1px), and at 390 it is
  the single column it always was.

## 122. Every slide is the same frame, and every picture is fitted to it

The ask: *“all the annoucement slide would have same resolution in the process of uploading … make
any image sent adjust to the resolution … make it fit with the slide area perfectly while showing
all the image; meaning in the process of uploading it re-edit the image to fit, make adjustment to
previous upload too”*. Until now a slide took its *shape* from its own upload (note 118), so the
band was a different height for every announcement and a portrait flyer and a landscape photo could
not sit on the same page. Now there is **one frame**, and pictures are re-cut into it.

- **The frame is `SLIDE_FRAME` — 1600×1200, the house 4:3 — in `src/lib/slideFrame.ts`**, and the
  space is always that shape (`--slide-aspect` is set from the constant, not read off the picture),
  so the band is the same size whichever announcement is on it and the slides never change shape
  under a visitor. 4:3 is not a new invention: it is what the space already fell back to before a
  picture was read (`.aslides { aspect-ratio: var(--slide-aspect, 4 / 3) }`), and what the band's
  stand-in photograph uses. The frame is one constant — changing it to 1:1 or 3:2 changes every
  slide, and the `min(100%, 110vw × aspect)` rule in `.split .aslides` is the single place that
  would hold a taller frame back from the page's full width.
- **“Showing all the image” is literal: nothing is cropped.** A picture is *contained* — the whole
  of it, centred — and the room it leaves is filled with **the picture's own light**: the picture
  drawn small, blown back up, blurred, saturated a little and taken down to 0.7, plus a 34% wash of
  the band's ground over it, with a soft shadow under the print so the two read as one print on its
  own paper rather than a photograph with bars beside it. The blur is done by upscaling a tiny copy
  (one 57×43 thumbnail at frame size) rather than filtering a 1600px draw, which is what keeps a
  re-cut at ~120ms on the office's own machine.
- **Two paths use the same code**, so a slide is uniform whichever way its picture arrived:
  1. **Upload** — `frameImageBlob` (wired in through `PhotoUpload`'s new `frame` prop, which the
     slides section's picture field asks for with `frame: "slide"` in the schema). The picture goes
     up, comes back 1600×1200, and is hosted; the button says *Upload a picture* and the toast says
     it was fitted. **Every new slide is the frame's resolution from the start.**
  2. **Display** — `framedImageUrl` cuts a picture that is *already* on the site at another shape
     (an address the office pasted, or a picture posted before the frame existed) in the browser as
     it is shown, cached for the session, with the original left on screen until the cut is ready
     and handed back unchanged if the picture cannot be read or drawn. **A slide can never go
     missing over a re-cut.**

  A third path — a one-press *Fit the slides I have already posted* action in the slides panel,
  which re-cut the posted pictures, re-uploaded them and wrote the new addresses into the draft —
  was built, used on the office's three posted pictures, and then **removed at the office's request**
  (note 122b).
- **The palette is still read from the picture as it was photographed**, not from the framed
  version, so every colour decision from notes 116–120 stands and the office's upload keeps its own
  poster colours; the mat is derived from the same picture, so it is the picture's own light either
  way.
- **The upload path was measured, not eyeballed.** A 900×1400 portrait test flyer (four coloured
  quadrants, so any crop would be obvious) goes in as PNG and comes out 1600×1200 JPEG in **120ms**;
  the output's print region matches a hand-computed `contain` of the whole source to a mean absolute
  difference of **0.71/255** — i.e. the whole picture, correctly placed, nothing cropped — while a
  sample 10px outside the print reads a blurred colour (63,2,62) rather than flat ground. The same
  check on the shipped 3:2 `choir.jpg` gives **1.03/255** with the print 1600×1067 and a 67px mat
  top and bottom; the office's own poster (763×1080, 0.706) prints **848×1200** with a 376px mat
  each side, and vision, asked to judge it, called it intentional and finished with all its poster
  text legible and nothing cut off.
- **The three pictures already posted were re-cut for real** (before the panel was removed): the
  draft's three slide pictures are now `https://user.uploads.dev/file/…` at exactly **1600×1200**
  each, and the panel reported *“3 pictures re-cut to the frame”*. Nothing was published — the
  change sat in the draft for the office to publish.
- **Re-verified after the change**: the band is 4:3 at every width (**759.3×569.5** in the office's
  759 pane, **1440×1080** at 1440×900, **390×292.5** on a phone), the chip still lands on the
  copy's own gutter (22 / 22 at 759 and 390, 124.3 / 124.3 at 1440), the copy still sits below the
  poster, glyph collisions stay **0**, `overflowX` stays negative, the eight-design preview
  (`?slides=all`) draws all eight cells with the framed picture, and the console is clean and the
  theme still light.

### 122a. The arch was the one design that cut the picture — every design is landscape now

The follow-up: *“always make the images landscape and make them fit without cutting while
editing”*. The frame was already landscape (4:3) and uploads were already fitted whole — but
measuring the eight designs rather than trusting the code found one that was not: **the *Sanctuary
arch* put the picture in a portrait 3:4 arched box** (`.aslide--arch .aslide__arch`,
`height: 38%; aspect-ratio: 3 / 4`), and `object-fit: cover` on a 4:3 picture in a 3:4 box threw
**most of the width away** — the one place in the whole slide space where the office's picture was
still being cut.

- **The arch is now the frame's own shape**: `width: 38%; height: 38%` — equal parts of the slide's
  width and height, which on a 4:3 slide *is* 4:3, measured at the box the picture sits in. Equal
  parts rather than `aspect-ratio: 4 / 3` so the arch keeps following the frame if the constant in
  `src/lib/slideFrame.ts` is ever changed to another shape: the arch cannot crop a picture it is
  always the same shape as.
- **Measured across all eight designs** (`?slides=all`, the photo's own box against the frame):
  every picture box is **1.335** — 4:3, the frame's own — and **0** of them cut. Before the change
  the arch's box was **0.75** (a portrait slit).
- **Nothing collides in the redesigned arch**: the arch spans **5%–43%** of the slide's height and
  its gold outline runs to **45.5%**; the words block starts at **47%**; a glyph-level check
  (`Range.getClientRects()` over the star, the heading, the line and the button) finds **0** glyphs
  on the arch and **0** on its outline — the first ink (the star) sits **6.3px** below the outline
  and 12.3px below the arch.
- **Landscape, everywhere**: the frame is landscape, the stored picture is landscape (1600×1200),
  the arch is landscape, and the picture inside every design is landscape — so “the images are
  always landscape” is true of the artwork, not just of the file, and nothing is cut to get there.
- **The corner note**: an arch has rounded top corners, so the *silhouette* trims those two corners
  of the photograph — that is the design (an arched window), not a crop; the photograph's own
  content is not cut. If the office ever wants no trimming at all, pin a different design on that
  slide (the other seven are plain full-bleed and trim nothing).
- The vision tool, asked to check the redesigned arch, reported words sitting on top of the arch and
  an unfinished composition. Both were measured false (0 glyphs on the arch; the outline clears the
  words by 6.3px), so its readings were discarded, as in notes 116–121.

### 122b. The *Fit the slides I have already posted* panel is gone (the office asked)

Asked, with the panel's own words quoted back: *“remove this: Every slide the same size … Fit the
slides I have already posted / 4 pictures posted / 3 already the right shape”*. The panel in the
slides section — the heading, the paragraph, the button and the count — is **removed**, and with it
the `SlideFramePanel` in `src/components/editor.tsx`, its `{def.id === "slides" && …}` slot in
`src/pages/Admin.tsx`'s section block, its imports, and the `frameUrlBlob` helper and the
`window.__slideFrame.recut` handle it was the only caller of.

- **Nothing the office sees changes about the slides themselves.** The frame is still one shape for
  every slide, uploads are still re-cut on the way up (`frameImageBlob`), and a picture already on
  the site at another shape is still cut in the browser as it is shown (`framedImageUrl`). What is
  gone is only the button that re-cut the *stored files* in one press — the three pictures it had
  already re-cut keep their 1600×1200 uploads.
- **The helper was removed rather than left dangling**: `frameUrlBlob` had no other caller once the
  panel went, and dead code in `src/lib/slideFrame.ts` would have read as a third path that nothing
  uses. If the action is ever wanted again it is ~20 lines on top of `frameCanvas` + `canvasBlob`
  (both still there) plus the panel, and this note is the recipe.
- **Verified live after the removal**: the slides section shows its blurb, its four entries and the
  *Upload a picture* control with no panel text anywhere in the block, and the home band still runs
  at **759.3×569.5** (4:3 is landscape), all four slides' pictures at **1600×1200** with **0** of
  them cut, theme light, console clean.

### 122c. Portrait-to-landscape matches the office's own landscape (their reference)

The office supplied the pair: the portrait flyer and the landscape they composed from it
(Clinical Concert). The converter sets the whole portrait into the frame uncropped and sharp,
resting on a ground of the portrait's own colours — no dark mat. The zones a
portrait leaves at the sides are poured full with tones drawn from the poster's
own edges, so the slide simply shows the picture itself. A finished landscape within 4% of 4:3 (theirs
is ~2.8% off) passes through byte for byte instead of gaining hairline bars.

## 123. The sermon series are gone, lock stock and barrel (the office asked)

Asked in two parts, quoting the screen: *“remove this: Every recorded message. Give it a YouTube
link, a Facebook link, or upload the video file itself … remove sermon series totally and all its
content”*. Two things went:

- **The *Sermons* section's help paragraph is gone.** Its `blurb` is now `""` (the drawer already
  prints nothing for an empty blurb — the same pattern `scriptures` and the photo sections use),
  so the block shows its title and its entries and no paragraph under them. Nothing else about the
  section changed: every field, the video upload and the cover-picture capture work as before.
- **The whole *Sermon series* feature is removed**, data included — not hidden, not emptied.

What "all its content" meant, in the order it was cut:

- **The data** — the `Series` type, the five-record `SERIES` array, `seriesById()` and
  `sermonsBySeries()` in `src/data/sermons.ts`, `seriesId` from the `Sermon` type and from all
  nineteen message records (and the four *Overcoming the World* / *The School of Prayer* / …
  grouping comments that only existed to mark which series a run of records belonged to).
- **The four bundled covers** — the `series-faith` / `series-prayer` / `series-family` /
  `series-purpose` photo slots, and with them the *Sermon series covers* group in
  `PHOTO_SLOTS`/`PHOTO_GROUPS`. `PHOTO_SLOTS` is 17 entries, the *Photos & banners* job lists
  three groups, and the `photos-series` section id (and its `PHOTO_BLURBS` / `PHOTO_SECTION_IDS`
  rows) is gone.
- **The drawer** — the whole `series` section definition in `src/lib/cmsSchema.ts`, the *Series*
  select on a sermon (`{ path: "seriesId", optionsFrom: "series" }`), the `series` arm of the
  `optionsFrom` union and of `resolveOptions()` in `src/components/editor.tsx`, `"series"` from
  the *Teaching* job and `"photos-series"` from the *Photos & banners* job in `src/lib/jobs.ts`,
  and `"series"` / `"photos-series"` from the `/sermons`, `/sermons/:id`, `/watch-live` and home
  rows of `src/lib/pageMap.ts`.
- **The pages** — the series filter chips and the whole *The series* grid on `/sermons`;
  `SeriesCard` from `src/components/blocks.tsx`; the home page's *Walk through a series* band
  (a `tone="light"` section, so the home page's light band is now the ministries one); the series
  badge on every sermon card and on the featured card, on the per-message page (its breadcrumb,
  its header badge and the *More in <series>* sidebar card, which is why the sidebar is now just
  the prev/next/pager card) and in the Library's notes list; the search index's *speaker · series ·
  duration* sub-line; and the `series=` links on the Prayer, Devotional and home pages.
- **The words** — `home.series.*` (eyebrow, headline, lede) and `sermons.series.*` from
  `src/data/copy.ts`, and (regenerated by `src/tools/auto-copy.mjs`) *Browse every series*,
  *All series*, *Series overview*, *Explore series*, *Watch the series*, the two devotional
  series links and the `messages` count that only `SeriesCard` printed. `sermons.empty.text` now
  reads *“…or choosing a different speaker or year.”*
- **The CSS** — the `.series-card*` block out of `src/styles/pages.css`.

Where the removed content was doing real work, it was replaced rather than deleted:

- **Prev/next on a message page** used to walk one series. It now walks the archive, newest
  first (`sermonsNewestFirst()`), and the pager's middle button reads **All sermons** and goes to
  `/sermons`. The *Previous sermons* strip is simply the next three newest messages.
- **A message card's fallback picture** used to be its series cover. It is now a bundled church
  photo (`photoOr("", "worshipband")`), used both for the `src` and for the `onError` re-point.
- **The gold badge on a card** (and on the Library's note cards, and the featured card) used to
  name the series; it now carries the message's **scripture** when it has one, and the card's
  sub-line is just the speaker.
- **The Devotional page's *Deeper* card** listed two series; it now offers the whole archive and
  the live page, and the Prayer page's callout button is *Watch the sermons*.

Verified live afterwards: `/sermons` shows the featured card (scripture badge + summary), the
search + Speaker/Year/Sort filter row and **19 messages found**, with no chip row, no series grid
and **0** occurrences of the word "series" on any page (home, about, sermons, a message, watch
live, events, testimonies, giving, prayer, contact, visit, locations, devotional, ministries,
library); the message page keeps its prev/next pager with *All sermons* in the middle; the admin
drawer's *Edit* list, its *Update* list and the *Sermons* block contain no *Sermon series*
anywhere; theme light; console clean.

Derived from the seal: **near-black** canvas, **gold** (#E3B75C) as the accent, **crimson**
(#C8202F) for urgent/primary actions and **sky** (#8FC7EE) for informational accents, with a
parchment band (`--band-invert-*`) for section rhythm. Display type is Cormorant Garamond (the
serif of the seal); UI type is Inter. Both themes are token-driven in `src/styles/global.css`.

## 124. The sermon form asks for less (the office asked)

Asked with the field names quoted: *“in the sermon in the admin remove url id, remove speaker's
role, replace youtube video id to video link, remove weeks ago preached”*.

The drawer's *Sermons* entry now asks for **Message title, Speaker, Date preached, Where it plays
from, Video link, Facebook video link, Upload the video, Cover image, Duration, Scripture, Summary,
Sermon points, Discussion questions, Tags, Venue** (with *Filed from the live stream* as its one
switch). Four changes:

- **URL id — gone from every form.** It was the last piece of jargon in the office's way: no list
  now asks for one (leadership, branches, ministries, events, slides and giving funds follow the
  notices and the messages — notes 104 and 124 took those away, note 123 removed the sermon-series
  list this section used to sit beside). Every list names an id-less entry after itself as it is
  applied (`mintIds()`), and an entry that already carries one keeps it, so renaming never moves
  a page.
- **Speaker's role — gone from the form.**
- **YouTube video id → *Video link***, with a placeholder showing the whole address
  (`https://www.youtube.com/watch?v=…`) and the hint *Paste the whole YouTube link, or just the
  video id (e.g. dQw4w9WgXcQ)*. The stored field is still `youtubeId` and still accepts either form
  (`parseYoutubeId` in `src/lib/embed.ts` does the work) — only the words the office reads changed.
- **Weeks ago preached — gone from the form.** The *Date preached* field was always the one that
  wins; its hint now says so: *Leave it empty and the message is dated to the most recent Sunday.*

**The id did not go — the console makes it.** A message's id *is* its address (`/sermons/<id>`, the
page a share link opens), so removing the field needed the trick the notices already use
(`withNoticeIds()`, SPEC note 104): a module-level **`withSermonIds()`** in `src/lib/cmsSchema.ts`,
run inside the section's `bind` *before* `applyToList` matches the list by id
(`bind: (v) => applyToList(SERMONS, withSermonIds(v), "id")`).

- **An entry that already carries an id keeps it.** That is the guarantee that matters: all nineteen
  shipped messages keep theirs, every link that has been shared keeps working, and — because the id
  is never re-derived from the title — **renaming a message never moves its page**.
- **Only an id-less entry is named after its title**: "Grace Alone" → `grace-alone`, numbered apart
  (`-2`) from a name already taken. It counts the ids already in the *incoming* list as taken as
  well as the ones it has minted, so it can never claim a name a later entry arrives with — which is
  what stops a new message from being silently written over an existing one.
- **Two hidden defaults went with the fields**: a new message starts from `id: ""` (the console names
  it) and carries no `weeksAgo`, so until the office types a *Date preached* it is dated to the most
  recent Sunday rather than to a week ago. `weeksAgo` itself stays in the data and in `sermonDate()`
  — it is what gives the shipped nineteen messages their dates — it is simply no longer a field.

**Proven live, and put back.** With the drawer open on *Sermons*, *Add another* was pressed and a
title typed in: the page behind drew a twentieth card, addressed
**`#/sermons/grace-alone-2`** — slugged, and numbered apart from the real `grace-alone` message —
dated to the most recent Sunday. A second pass with "Zz Test Message Id" produced
`zz-test-message-id`. Both test entries were then removed (the draft's sermons list was restored to
exactly what it was: **19** entries, `pending` back to the office's own *Announcement slides*
change alone), no message's id changed, no console, platform or syntax errors, theme light. The
whole drawer was re-read afterwards: the entry shows the fifteen fields above, with no *URL id*, no
*Speaker's role*, no *Weeks ago preached* anywhere in the block.

**Left alone on purpose:** `speakerRole` is still in `src/data/sermons.ts` and still printed — the
transcript line's *This message is hosted by Dr. Charles Stanley (Guest Teacher)* and the
downloaded outline — because the request was about the form. It is now uneditable from the panel,
so the office should ask for its removal (or for the demo text to go) if they want the page changed
too; `TODO.md` item 1 says where.

## 125. The *Watch & share* tab keeps one row (the office asked)

Asked as an inventory — *“remove this from all the watch&share in sermon: Podcast / Audio-only,
perfect for the commute / Listen / Sermon outline / Printable notes for your group / Download”* — so
every line quoted was matched against the *Watch & share* tab of a message's page
(`src/pages/SermonDetail.tsx`, the tab whose label is `auto.sermon.e7b6175d3f2969ec`).

**Two of the tab's three list rows are gone.** The tab (`transcript` tab) drew a three-row
`<ul className="tick-list">` under *Watch on other platforms*:

| gone | its words | its button |
| --- | --- | --- |
| the **headphones** row | *Podcast* / *Audio-only, perfect for the commute* | *Listen* (a second door to the same video address as the row above it) |
| the **download** row | *Sermon outline* / *Printable notes for your group* | *Download* (the `-outline.txt` text export) |

What is left is the one row that is genuinely about the message itself — the platform it plays from
(*YouTube* / *Highest quality, with captions*) with its *Open* button — and, below the list, the
*This message is hosted by … Share it freely — the gospel is not copyrighted.* line, both untouched.
The `<ul className="tick-list">` was kept rather than unwrapped: it is what gives the remaining row
its icon-and-button layout, and a one-item list renders exactly as before (`margin: 1.2rem 0`, no
bullets, no borders) — checked on screen, not assumed.

**The same edit on every message.** The tab is one component, so all nineteen archive pages changed
at once; five of them (`overcoming-in-christ`, `hope-that-overcomes`, `stages-of-faith`,
`grace-at-work`, `godly-wife`) were re-read live after the change: each showed the single platform
row, and *Podcast*, *Audio-only*, *Listen*, *Sermon outline* and *Printable notes* appeared nowhere
in the tab's text.

**The outline is still reachable, on purpose.** The page head keeps its *Download outline* button
(and *Add to calendar*, and *Save* / *Watched*) — the ask was about the tab, not the head — so the
leader's sheet the *Discussion questions* tab points at (*Download the outline above …*) still
downloads: verified by stubbing `URL.createObjectURL`, which caught a 706-byte
`overcoming-in-christ-outline.txt` beginning *Overcoming in Christ / Dr. Tony Evans — Guest
Teacher*. The words of that pointer were left as they were, because "above" is still true of the
head button.

**The collected copy lost them too.** Six entries had been collected from `SermonDetail.tsx`
(`Podcast`, `Audio-only, perfect for the commute`, `Listen`, `Sermon outline`, `Printable notes for
your group`, `Download`), so removing the rows removed their six auto-copy keys with them:
`auto-copy.mjs` walked from **697 → 691** entries with **0 warnings** (the *sermon* group 42 → 36),
and the regenerated `src/data/autocopy.ts` no longer carries those ids. Nothing else referenced
them — a grep of every `.tsx` for the six ids matched only the two deleted lines, no published
override or pending change carries them (`__churchCms.pending()` is still the office's own
*Announcement slides* edit alone), and the hard-coded *Podcast* button on the **Watch live** page
(`auto.live.119262a1855436a8`, the live panel's headphones button to the church's socials) is a
different page and was left alone — the ask named the sermon page.

Fresh load afterwards: no console, platform or syntax errors; theme light.

## 126. The sermon form loses its cover picture, its tags and two long hints (the office asked)

Asked as an inventory of what should not show, quoted from the open drawer:

> this should be applicable to all in sermon remove this: The day it was preached, on the church's
> own calendar — it drives the “latest” ordering. Leave it empty and the message is dated to the
> most recent Sunday. A service filed from the live stream always has a date. dont show this. this
> should not show: Cover picture for this message / No cover picture yet — the message's card falls
> back to a photo of the church. / Best for short clips — videos up to about 25 MB are kept for
> good. For a full service, a YouTube or Facebook link is better. A cover picture is taken out of
> the video for you. / Cover image / Nothing set — the YouTube still, or a photo of the church, is
> used instead. / Upload a photo / …or paste a photo link / The picture on this message's card, and
> behind the player until someone presses play. An uploaded video fills this in for you — change it
> here any time. Leave it empty to use the YouTube still. remove this: Tags / gospel / evangelism /
> calling / Add tag

**Read as four deletions, and made that way** (SPEC note 124 precedent: the form is trimmed, the
*data* is not):

- **The *Date preached* hint** — gone. The field stays (only the paragraph under it went).
- ***Upload the video*'s hint** — gone. The field keeps its upload button, its paste box and its
  *Remove the video* button.
- **The *Cover image* field** — gone, and with it the ***Cover picture for this message*** panel that
  took a still out of an uploaded video (its title, its “no cover picture yet” line, *Take a cover
  from this video* / *Use a different moment* / *Remove the cover*). The two halves were one feature
  (SPEC note 43), and the office quoted every line of both. A message's picture is now whatever the
  platform gives it: YouTube's still, else the bundled church photo (note 123's fallback).
- **The *Tags* field** — gone, with its chips and *Add tag*.

The form is now **14 items**: *Message title*, *Speaker*, *Date preached*, *Filed from the live
stream*, *Where it plays from*, *Video link*, *Facebook video link*, *Upload the video*, *Duration*,
*Scripture*, *Summary*, *Sermon points*, *Discussion questions*, *Venue*. (**Note 128 moves on from
this list**: *Filed from the live stream* has since gone and *Video link* is now *YouTube video
link* — thirteen items.)

**What did not change.** The data: `poster` and `tags` stay in `src/data/sermons.ts` and in every
record, so a cover picture already set still shows on the card (`posterFor`) and the *Tags* on a
message still print on its page (checked live on *The Gospel of the Grace of God*: gospel,
evangelism, calling) — they are simply no longer editable from the drawer, exactly like
`speakerRole` since note 124. `makeNew` still gives a new message `tags: []`.

**The dead machinery went with it**, since nothing declared it any more: `coverPath` from the field
definition, `VideoField`'s cover panel and its helpers (frame capture, upload, cycling, the busy
line), `getSibling`/`setSibling` through `FieldControl` (and the four props `Admin.tsx` passed),
`VideoFrame` / `captureVideoFrames` / `bestVideoFrame` from `src/lib/store.ts`, and the
`.admin__videocover*` CSS. The one style worth keeping — the spinner line — is now `.admin__busy`
(it is what *Saving the website so your changes can go live…* uses). `VideoUpload` no longer hands
its `File` back, and *Cover picture for this message* is gone from the source. `src/app.js` shed
about 7 KB.

**Verified live, on the office's own draft** (their two unsaved changes — *Announcement slides* and
*The Gospel of the Grace of God*, *Filed from the live stream* switched off — were snapshotted
before and compared after every test, and are byte-identical): the open record shows the fourteen
items above, with no *Cover image*, no *Tags*, no dashed panel and neither hint; the *Upload the
video* path was driven for real — a pasted address put the preview and *Remove the video* on
screen, *Remove the video* cleared it, and a 64-byte file pushed through the field's own file input
was hosted and written into the draft (then reverted) — so the trimmed field still does everything
it did. `/sermons` draws its 21 card pictures with none broken and no empty `src`, and a fresh load
reached neither the console nor the engine's report. One honest side effect: the drawer's pending
list for that message used to show a third line, *Cover image: a different photo* — a false one,
from an empty `poster` in the draft's record; with the field gone the line is gone too, so it now
reads *Filed from the live stream: switched off (+1 more)*. That is the summary, not the change:
`pending` still names the same two sections.

## 127. The *Video link* holds a link, not a bare video id (the office asked)

> apply to all: the video link in the sermon should be replaced with youtube video link and the
> shared link instead of this 0xThVTs8aro

`0xThVTs8aro` is the shipped `youtubeId` of the first message (*Overcoming in Christ*), and the
drawer's *Video link* field was showing exactly that — a bare eleven-character id — because the
demo data was written that way. The office wants the field to hold a link.

- **Every message now stores the whole link.** All nineteen `youtubeId` values in
  `src/data/sermons.ts` are `https://www.youtube.com/watch?v=…` (`0xThVTs8aro` →
  `https://www.youtube.com/watch?v=0xThVTs8aro`). Nothing else about the records changed: the ids
  are the same videos.
- **The field says so too.** *Video link*'s hint was the last thing still inviting an id (*Paste the
  whole YouTube link, or just the video id (e.g. dQw4w9WgXcQ)*) — it now reads *Paste the whole
  YouTube link — the address from your browser's bar, or the link the Share button gives you
  (https://youtu.be/…)*, which is both forms the office named.
- **Nothing consumed the id, so nothing had to learn the link.** Every reader already went through
  `parseYoutubeId` (`src/lib/embed.ts`): the player's `<iframe>` (`youtubeEmbed`), the card and
  player still (`youtubeThumb` → `i.ytimg.com/vi/<id>/…`), the *Open* button (`youtubeWatch`), the
  outline the office downloads, and `WatchLive`'s arrowing of the recent services. It accepts a bare
  id, a `watch` link, a `youtu.be` share link, an `embed`/`live`/`shorts` link and anything with
  `?v=`, so a value in any of those forms keeps working — including one the office pastes by hand.

**The draft had to be written too, or the office would have seen no change at all.** The drawer
reads the *draft*, and the draft holds its own copy of the whole sermons list (seeded from the data
when it was first opened), so editing `src/data/sermons.ts` alone leaves the form showing the old
bare id — and would have made every record look *changed* in the office's unsaved list (the diff
would have read *Video link: https://… → 0xThVTs8aro* nineteen times, as if they had put the ids
back). So the same nineteen values were written into the draft through `cms.set` — the field's own
write path — with the record-by-record comparison proving the draft is otherwise byte-identical to
what it was. `pending` is unchanged: the office's *Announcement slides* edit and their one sermons
edit (*Filed from the live stream: switched off*) exactly as before.

**Verified live** after a fresh load: the drawer's *Video link* on *Overcoming in Christ* reads
`https://www.youtube.com/watch?v=0xThVTs8aro` with the new hint under it; on the site behind it the
same message still plays (`https://www.youtube.com/embed/0xThVTs8aro?rel=0&…` built the moment play
was pressed), its card still shows `https://i.ytimg.com/vi/0xThVTs8aro/hqdefault.jpg`, its *Open*
button still points at `watch?v=0xThVTs8aro`, the home page's featured video still loads its still,
and the downloaded outline still carries its *Watch:* line. No console, platform or syntax errors.
`LIVE.youtubeId` (the live stream's own field, labelled *YouTube stream link*, already worded
"a live link, a watch link or just the video id — all of them work") is empty and was left alone.

## 128. The *Video link* reads *YouTube video link*, and the sermon form loses its broadcast switch (the office asked)

> apply to all in sermon: replace Video link with youtube video link. remove this:
> Filed from the live stream
> Shows a “Broadcast” tag on the card and lists it under Previous sermons on the Watch live page.

Two changes to the **Sermons** section of the drawer, both read the way notes 124 and 126 were (the
form is trimmed, the *data* is not).

**The *Video link* field is now labelled *YouTube video link*** — it sits directly above *Facebook
video link*, and the office is asking for the pair to read alike. The field itself is unchanged
(same path `youtubeId`, same placeholder, same hint from note 127). **Its contents were already
whole links**, put there by note 127, and this was re-checked live rather than assumed: all nineteen
records in the open drawer show `https://www.youtube.com/watch?v=…` — none holds a bare id.

**The *Filed from the live stream* switch is gone, with the hint under it** (*Shows a “Broadcast”
tag on the card and lists it under Previous sermons on the Watch live page.*). It was a
`type: "boolean"` field (a toggle), and the office quoted it and its hint together, so both went.

The form is now **13 items**: *Message title*, *Speaker*, *Date preached*, *Where it plays from*,
*YouTube video link*, *Facebook video link*, *Upload the video*, *Duration*, *Scripture*, *Summary*,
*Sermon points*, *Discussion questions*, *Venue*.

**What did not change — the data, and everything that reads it.** `fromLive` stays in
`src/data/sermons.ts` (`Sermon.fromLive`), `makeNew` still seeds it `fromLive: false`, and the two
places that read it still work: the *Broadcast* pill on a message's card (`src/components/blocks.tsx`)
and the tag beside a message's scripture on its own page (`src/pages/SermonDetail.tsx`). No shipped
record carries `fromLive: true`, so the site looks exactly as it did — the switch is simply no
longer the office's to flip, like `speakerRole` and `tags` since notes 124 and 126. The row's own
meta line (*Broadcast · speaker · duration*) was left in place for the same reason: it reports the
data, and would show *Broadcast* for a record that had it.

**The office's own draft is untouched.** `localStorage["wom.cms.draft"]` was snapshotted
(`rev 7`, hash of the whole file `2240362131`, hash of its sermons list `2787429617` — the list
lives under `content.sermons`, inside `{rev, content, dirty}`) and re-checked after every test:
byte-identical. One honest side effect, the same one note 126 describes in reverse: `pendingEdits`
only reports fields the schema still declares, so their *Filed from the live stream: switched off*
lines have disappeared from the *N unsaved changes* list — *Sermons* now reads **1** line,
*Upload the video: a different video* on *The Gospel of the Grace of God* (that line was there
before, as the `(+1 more)` of the old summary). The draft itself still holds `fromLive: false` for
both messages; nothing about their content changed.

**Verified live** after a fresh load (drawer re-opened on `#/admin`, *Update* tab, *Sermons* block,
a record opened): the open record shows the thirteen items, no *Filed from the live stream*, and no
hint; the field above *Facebook video link* reads *YouTube video link* and holds
`https://www.youtube.com/watch?v=0xThVTs8aro`; every one of the nineteen records was visited and
each holds a `youtube.com/watch?v=…` link. On the site behind the drawer: `/sermons` draws its 19
cards, `/watch-live` still shows its **Previous sermons** band, a message page still plays (its
still `i.ytimg.com/vi/0xThVTs8aro/hqdefault.jpg`, pressing play builds
`youtube.com/embed/0xThVTs8aro?rel=0&…`), and *Watch & share* is unchanged. No console, platform or
syntax errors; build wrote `src/app.js` / `src/app.css` with nothing unresolved.

## 129. The *Watch & share* tab loses its hosting line, and the outline notice loses its "press play" clause (the office asked)

> remove this: — press play above and follow along, or.   This message is hosted by (). Share it
> freely — the gospel is not copyrighted.

Quoted from a message's page (the `()` stands for the speaker the line prints), and read as two
deletions.

**The hosting line is gone.** The transcript tab (*Watch & share*) ends with the platform row; the
`<p className="muted">` under it — *This message is hosted by Dr. Charles Stanley (Guest
Teacher). Share it freely — the gospel is not copyrighted.* — is removed. Two page-text entries
went with it, `auto.sermon.3dd4abc2503b4c1b` (*This message is hosted by*) and
`auto.sermon.7d1339dbe2b9a0ca` (*). Share it freely — the gospel is not copyrighted.*), because
nothing else read them. It is the same direction as note 125, which took the *Podcast* and *Sermon
outline* rows off this tab; what is left is the one row for the platform the message plays from.
The *data* is untouched: `speaker` and `speakerRole` stay on every record, and the downloaded
outline still prints *speaker — role* (which is why `speakerRole`, field-less since note 124, is
still worth knowing about).

**The outline notice drops its middle clause.** On the *Sermon notes* tab, a message with no
*Sermon points* shows *The outline for this service is not written up yet — press play above and
follow along, or add the points from the admin console.* The clause the office quoted is gone; the
em dash stays so the sentence still reads:

> The outline for this service is not written up yet — add the points from the admin console.

This one is a **generated** page-text entry (see `src/tools/auto-copy.mjs`): the wording lives in
`src/data/autocopy.ts`, keyed by a hash of the source text, so the new sentence was written as
plain text in `SermonDetail.tsx` and the collector re-keyed it —
`auto.sermon.58d8a283434d8e3a` → `auto.sermon.a2241865082286b4` — with the old entry dropping out.
Editing the value in `autocopy.ts` by hand would have worked too (the collector prefers the value it
finds there), but re-keying keeps the file's own rule (*generated; do not edit by hand*) true. The
page-text group behind it, *Sermon*, is hidden (`HIDDEN_COPY_PAGES`), so no drawer row appeared or
disappeared, and no copy page has published overrides — nothing to republish.

**Verified live.** The collector ran clean (691 → **689** entries, 0 warnings) and the build wrote
both bundles with nothing unresolved. On the site: the notice was rendered for real — one message's
points were emptied for a moment through `window.__churchCms.apply(...)` (in the page only, then put
back, with the applied content compared byte-for-byte before and after) — and the *Sermon notes* tab
printed exactly the sentence above. *Watch & share* on *Overcoming in Christ* now shows the platform
row alone (*YouTube · Highest quality, with captions · Open*), with no hosting line anywhere in the
page. Neither removed phrase survives in the built `src/app.js` or in any section of the content the
site renders from. No console, platform or syntax errors.

**One note about the content server.** While this was being done the drawer's log read **rev 8 —
*Updated Announcement slides, Sermons*** at 21:34, i.e. the office's two unsaved edits had just been
published, and the local draft list (*N unsaved changes*) was empty (the stored draft was gone with
it). Nothing was written into the draft for this note, and the copy sections this note touches have
no overrides, so nothing here reached the server.

## 130. The live section is down to its controls — the hints go, the two panels lose their prose, and the previous-sermons number moves beside the sermon list (the office asked)

> remove this on the admin livestream: Visitors can still switch to the other one., A live link, a
> watch link or just the video id — all of them work. The stream plays on your own site., , its id or
> its link., Paste the live video link from Facebook. It plays on your own site too., The Watch live
> page keeps this many finished services under “Recent services”. As a new one comes off air the
> oldest drops off the end, and anything older stays on your YouTube channel and Facebook page —
> which is what the page tells visitors., How soon after a service closes its write-up appears under
> “Previous sermons”. The page promises “usually within this many hours”, and the panel below repeats
> it — change the number here and both follow., “Previous sermons” lists this many of your uploaded
> messages, newest first. As you publish a new one the oldest drops off the band by itself — nothing
> is deleted, and the full sermon archive under it keeps every message. The title over the player
> while the stream is on air, when nothing else names the broadcast., The services the site is
> carrying under Recent services — the last 6 finished services, read from your channel and playing
> on the page. Nobody types them in: the moment a stream ends the service lands here by itself. They
> are picked by date — the services nearest each other in time — and a service YouTube has published
> more than once counts once, as the one message it is. Take a video off the site and it goes from
> the page for everyone (the video itself stays on YouTube and Facebook). The messages you write up
> yourself are edited in the Sermons section, with their own YouTube link, Facebook link and
> upload., Read the channel again / When the service ends / Nothing has to be pressed when a service
> ends: the moment the stream stops on the channel the page watches, the site stops with it, and the
> streamed service appears in Recent services on the Watch live page by itself — the page keeps the
> last 6 services and lets the oldest one drop off, so there is nothing to file and nothing to type
> twice. Use Stop the livestream above when you want to end it early. / Your channel is set. The last
> 6 services are on the page now, and the section tells visitors that older livestreams live on
> YouTube and Facebook. / The streamed service itself is in Recent services above, and on the page,
> the moment the stream closes. Previous sermons is the office's own work: add the message in the
> Sermons section — title, preacher, notes and discussion questions, and its video (a YouTube link, a
> Facebook link, or the file itself) — and publish it. Most messages are up within 5 hours of the
> service closing, which is what the page promises. The page lists the newest 10 messages: publish a
> new one and the oldest drops off that list by itself — nothing is deleted, and the full archive
> keeps every message.
> this should be moved near open the sermon list line area: How many previous sermons to show 10

Read as three things: every hint the section's form carried, the prose (and one button) of the two
panels under that form, and — the last line — a move.

**① The eight hints are gone.** The *Live stream* form was the last one that explained itself under
every field; *Plays by default*, *YouTube stream link*, *YouTube channel to watch for live*,
*Facebook stream link*, *How many recent services to show*, *Hours until a service is written up*,
*How many previous sermons to show* and *Headline while live* now carry their label alone. (Two of
them are quoted a second time in the office's list as fragments — *The stream plays on your own
site.* and *its id or its link.* — they are the tails of the *YouTube stream link* and *YouTube
channel to watch for live* hints.)

**② The two panels under the form lost their prose.**
- ***Recent services*** keeps its heading, the line saying when the channel was last read, the list
  with *Take it off* on every row and the *Taken off the site* block with *Put it back*. Gone: the
  paragraph under the heading, and the **Read the channel again** button that closed the card. That
  button was the panel's one manual action, and the list no longer needs it — the watcher fills it the
  moment a stream ends, *Stop the livestream* seeds it, and a fresh load reads the channel
  (notes 109, 111) — so the empty-state line that sent the office to the button no longer names it
  (*Nothing here yet — the list fills itself as services finish.*).
- ***When the service ends*** is gone as a piece of prose: its icon, its heading, its paragraph, its
  *Your channel is set…* state line and its note are all removed. What is left of that card is the
  office's own number and the way to the messages.

**③ The number moved next to the sermon list.** *How many previous sermons to show* is the last field
of the `live` section but is **no longer drawn with the other seven**: `Admin.tsx` filters it out of
the form and passes the very same `FieldControl` into `LiveEndingPanel` (which now takes `children`),
so it stands directly above *Open the sermon list* at the foot of the section — it belongs to the
*Sermons* side of the site, not to the stream. **It is still declared on the section** — same path,
same label, same 1–60 bound — so `pendingEdits` (which only reports fields a section declares), the
content export, the clone and the drawer's search all treat it exactly as before; only its place on
screen changed.

**Dead machinery went with it.** `LiveEndingPanel` no longer reads the draft at all (no `useCmsTick`,
and no `ready` / `limit` / `hours` / `past` locals), the now-unused `pastLimit` and
`sermonTurnaroundHours` imports left `editor.tsx`, and the `.admin__archive-note` rule plus the
`.admin__archive-state.is-done` / `.is-live` variants left `src/styles/admin.css` (the *Recent
services* line still uses the base rule and `.is-ready`; `.admin__archive-head p` stays — the events
panel still has one). `askForRecentServices` is still imported and used: *Stop the livestream* seeds
the finished service with it.

**Verified live.** The field was driven through its own write path (the input's native setter + an
`input` event, 10 → 8 → 10) — the draft followed, the pending list showed *How many previous sermons
to show: 20 → 8* while it was off, and came back line-for-line to what it was before the test. *Open
the sermon list* jumps to the *Sermons* section, which opens with that block in view. The *Recent
services* panel still draws its six rows, thumbnails and *Take it off* buttons. Both remaining cards
were looked at (a snapshot of each): the foot card holds the number field and the button and nothing
else; the recent card holds the heading, the read line, the list — and no paragraph. No console,
platform or syntax errors.

**The office's draft was left alone.** It held two unsaved changes while this was done (*How many
previous sermons to show* 20 → 10, and an empty *New sermon* removed) — nothing in this note writes to
the draft, and the field's test put the value back where it found it, so `pending` still names the
same two sections with the same lines.

### 130a. The line saying when the channel was last read is gone too (the office asked)

> remove this: This list was read 3 min ago.

One more deletion in the same panel, asked for right after note 130 (and the same panel its own
paragraph and button left in). The *Recent services* card is now **its heading and its list**: the
`admin__archive-state` line under the heading — *Reading the channel now…* / *This list was read 3 min
ago.* / *The channel has not been read yet.*, `readLine` in `RecentServicesPanel` — is removed, and
with it the last reader of `recent.checking` / `recent.at` in that panel (the hook still reports both
to anyone else) and the `.admin__archive-state` rules in `src/styles/admin.css` (the four blocks:
base, `svg`, `.is-ready`, and the `.is-done`/`.is-live` variants that went in note 130). The list, the
empty state (*Nothing here yet…* / *Paste the channel above…*), *Take it off* / *Put it back* and the
*Taken off the site* block all stay, and the foot of the section (*How many previous sermons to show*
+ *Open the sermon list*) is untouched.

**Verified live** after a fresh load: the *Recent services* card draws its six rows with thumbnails,
dates, *YouTube* links and *Take it off* buttons and carries no line between the heading and the list —
nothing anywhere in the drawer reads *was read*, and no element with `admin__archive-state` remains. No
console, platform or syntax errors.

Meanwhile the office's own draft changed under this session: its *How many previous sermons to show*
went back to the published 20 (the section is still flagged dirty, so the value now matches what is
live and `pendingEdits` no longer lists it), leaving their *Sermons* change — an empty *New sermon*
removed — as the one unsaved edit. Nothing here wrote to the draft.

## 131. The branches form loses its prose and its two switches — and a sub-branch is the gathering with a parent (the office asked)

> remove this: The church-wide rhythm used by the countdown in the top bar and the “next service”
> notices., ranches grouped by country — Nigeria, America and Canada, in the order the countries first
> appear here. Each one keeps its address, map coordinates, pastor and local service times. Every
> branch has a Sub-branch button that adds a gathering underneath it, and the foot of the list adds
> another branch, a whole new country, or a sub-branch under any branch you choose. A Sub-branch tick
> files a gathering under the branch named by Sub-branch of, in the group the Locations page draws for
> that branch. Global HQ marks the head office., The picture on this branch's card, on the Locations
> page and the home page.
> Global HQ
> The head office — its address and map are the ones the contact page shows. It is on Lagos; tick it
> on another branch to move the head office there.
> Sub-branch
> Ticked, this gathering is listed beneath the branch it belongs to, in that branch's own panel
> (Nigeria's Abuja, Edo and Ogun sit under Lagos)., Branches grouped by country — Nigeria, America and
> Canada, … Global HQ marks the head office.

(The Branches blurb is quoted twice in the ask — once at the top, once at the end.) Four deletions,
read the way notes 124–130 were: the *form* is trimmed, the data is not.

**① The two section blurbs are gone.** *Weekly services* and *Branches* had a help paragraph under
their heading — the countdown's rhythm, and the long description of how the branch list, its
Sub-branch buttons, the *Sub-branch of* picker and the two switches work. Their `blurb` is now `""`
like the *Live stream* section's (note 115), so both cards open straight onto their contents, and the
one asking-about-*Sub-branch* text that described the tick went with them.

**② The branch *Photo* hint is gone** — *The picture on this branch's card, on the Locations page and
the home page.* The field keeps its upload panel, its picker and its `fallbackPhoto`.

**③ The two switches are gone.** *Global HQ* and *Sub-branch* were the last `type: "boolean"` fields
in this form; both and the hints under them are removed.

**④ A gathering is a sub-branch when it has a parent.** That is what the *Sub-branch* tick meant, and
`parentId` is what the section already stores: `blankBranch()` starts a gathering with none, *Add a
sub-branch* sets both the flag and the parent, and the *Sub-branch of* picker changes the parent. So
the branches `bind` now derives the flag for the whole list on every apply —

```js
for (const branch of BRANCHES as any[]) branch.isSub = !!String(branch.parentId || "");
```

— which means **the picker alone is enough**: choose a parent and the Locations page nests the
gathering under it (and its *Sub-branches* button lists it), choose *A branch in its own right* (the
picker's empty option) and it is a branch again. Every reader of `isSub` (`subBranchesOf`, the
Locations page's `mains`/`families`/`loose`, the sub-branch count on the Locations page's stats row)
keeps working, and the drawer's own row aside (*Lagos · 1 sub-branch*) now counts `parentId` rather
than the flag — the *draft's* records never carried `isSub`, so the count had to read what the picker
writes. Worth knowing: the deleted hint's claim that Abuja, Edo and Ogun sit under Lagos was already
stale — **no branch, shipped or published, names a parent**, so nothing nests today, and the picker
(or *Add a sub-branch*) is what files one.

**The *Global HQ* flag is not lost, but the drawer can no longer move it.** `isHq` still marks the
head office on every record, `syncHq()` still re-points `HQ` at it (the contact page's address, the
head-office service clock and the *Global HQ* badge on the branch card all follow that), and Lagos
still carries it. With the switch gone, moving the head office is a data edit: `isHq: true` on the
branch that should hold it in `src/data/branches.ts`, and remove it from Lagos. The drawer also no
longer shows which branch is the HQ. (Both are one line to bring back if the office wants them.)

**Verified live.** The drawer's *Branches* form has no switch and no `Boolean`-styled field left, no
photo hint, and its only prose is the hints on *Country* (*The Locations page groups branches by this
name…*), *Time zone* and *Sub-branch of*, which the office did not name; the *Weekly services* and
*Branches* cards open straight onto their lists, and neither paragraph survives in the built
`src/app.js`. The derive was tested for real: *Ogun*, given `parentId: "lagos"` through the section's
own write path, did not gain an `isSub` in the draft but **did** nest — the Locations page drew it in
the gold-ruled `.branch-sub` panel under Nigeria/Lagos and the drawer's Lagos row read *Lagos · 1
sub-branch* — and the draft was then put back byte-for-byte (pending returned to exactly what it was:
the office's own three branch renames plus the removed *New sermon*). Home and Locations render with
no broken images, and there were no console, platform or syntax errors.

## 132. The whole site takes a liquid-glass material over a shadier aurora (the office asked)

**The ask was one line** — *create a 3d liquid glass effect and a shadier gradient for the website* —
and this is the first *visual* pass of the build. Everything it changes is a fill, an edge or a
shadow: no layout, no copy, no type. It lives in one new sheet imported **last** (see
`src/main.tsx`), so it restates the surfaces `global.css`, `pages.css`, `admin.css` and
`edit.css` had already declared.

**The aurora.** `body` no longer paints a flat `--ink` / cream. It paints a *fixed*
(viewport-anchored) stack of radial blooms — warm light from the top-left, a gold bloom right of
centre, rose and slate low down — sinking into a deeper linear base. Measured across the viewport,
the light theme runs from luminance 242 at the top to 189 at the bottom, and the dark theme to
near-black. Where a browser ignores `background-attachment: fixed` (e.g. iOS Safari) the gradient
simply stretches over the document instead, which is a shade ramp rather than a break. The existing
bands follow: `.section--raised` and `.section--light` become translucent tinted bands so the
aurora reads through them instead of being cut off by an opaque slab.

**The glass.** Panels are two *padding-box* background layers — a corner specular over a translucent
tint — with a 1px translucent border and directional `box-shadow` edges (lit top, lit left, shaded
bottom-right, plus a soft inner falloff along the bottom) over a three-part drop shadow. The material
is carried by `--glass-*` custom properties, so a theme re-materials every panel by overriding the
tokens: the light theme takes a deeper, cooler and deliberately **more transparent** fill (white glass
on a near-white page is invisible), and `.section--light` — a *light* band in **both** themes — pins
the light tokens for its own subtree. Big surfaces get `backdrop-filter: blur() saturate()`; small
ones (chips, pills, quiet buttons) get the same edges without the blur, so the material is consistent
without paying for a backdrop filter on every tag. Fields, the top bar, the sticky header, the footer,
modals, toasts, the notice strip and the whole admin/edit drawer (`.epanel`, `.pblock`, `.pitem`,
`.epop`, `.ejob`, `.eres__item`, `.unsaved__item`, `.admin__stat`, `.admin__tool`, …) are all
in the pass. Panes that were drawn square now take a 14px corner so the edge runs all the way around
them, and the hover lifts gained a slight scale.

**Two things the visual passes taught, both baked in.** ① A *border-box* gradient rim shows
**through** a translucent fill and smears a diagonal wash across the panel, which reads as a cheap
Web-2.0 bevel on small cards — the lit and shaded edges are therefore `box-shadow` insets, not a
border gradient. ② A diagonal fill gradient does the same thing at card scale, so the fill's gradient
is near-vertical (166°): light from above rather than a sheen band across the text.

**The deeper page took two tokens with it.** Muted copy sitting directly on the (now darker)
background lost contrast, so in the light theme `--muted` moves to `#564f45` and `--faint` to
`#635c51`. Everything on a permanently dark surface (top bar, footer, photo scrims) already remaps
those for itself, so nothing else moves. Measured on the drawer's own body text, the ratios are now
5.4–6.2:1.

**Verified live.** All ten routes (`#/`, sermons, watch-live, locations, events, giving, connect,
about, devotions, `#/admin`) render with no horizontal overflow and no collapsed panels, at both
1440×900 and 390×844; the admin drawer's cards are clean frosted panes with no bevel and its body
text measures 5.4–6.2:1; the dark theme keeps its warm blooms and reads cleanly; there were no
console, platform or syntax errors. Nothing was published, and the office's own unsaved draft was
left exactly as it was.

## 133. The stream itself now decides *Live now*, and the wait for one has a ticking clock (the office asked)

> let the cover image of the last live stream remain at the streaming screen but faded just like it is
> for the last message. when the scheduled live now activates and the live stream has not started put
> on a text that service is on, we will be live here shortly bare with us while a 3d time ticking
> background ticking sound on the screen area. and whenever the livestream ends the live now stops
> automatically in all places that it indicates. whenever the livestream start even if not scheduled
> the live now indicators activate the live now in all places

Four asks about one thing — **who decides the church is on air** — and the answer was three rules
instead of two. Until this note `onAir()` (`src/lib/store.ts`) could only hear the office's switch and
the service clock; the live check (`src/lib/livestatus.ts`) was read on `/watch-live` and by the
office's drawer alone. So a broadcast that started at a time nobody had written down lit the Watch
live panel and nothing else — the header still counted down to Wednesday — and when it ended the
site's *Live now* came off only where that one panel was, and only for a visitor whose own browser had
noticed. The check is now the third voice, and it reaches every indicator.

**① One poll, one answer, whole site.** The live status is kept at module scope in `livestatus.ts`
(a `useSyncExternalStore` snapshot) and the polling is *reference-counted*: `watchLiveStream()` is
called by every reader as an effect body, the first caller starts the timer, the last one to leave
stops it, and the callers' needs are merged — the short cadence if *any* of them is expecting a
service, Facebook if any of them asks for it (only the drawer does). `App.tsx` mounts it for the
public site (asking for the short cadence while a gathering is on or within 45 minutes — where the
old per-page hook needed a hint passed in from the page). `useLiveStream()` kept its old signature,
so `WatchLive.tsx` and `useAutoStopLive` were not rewritten. Before this, four components each held
their own poll — four fetches of the same channel page for one answer, four timers free to disagree.

**② The site is on air if the stream is.** `onAir(info)` returns true when the check found the church
broadcasting, whatever the clock says — so a vigil, a moved service or a special broadcast lights the
service pill in the top bar, the home hero, the next-gathering card and the Watch live panel together,
with nobody touching the site. That was the TODO item *"let the header's Happening now pill follow the
stream as well as the schedule"*.

**③ A stream that ends stops the site, everywhere.** The status already remembers the moment a
broadcast it had seen go live came back off (`endedAt`, SPEC note 111). `streamCut()` in
`src/lib/store.ts` now reads that moment as a **cut on the service clock**, in exactly the shape of
the office's own `LIVE.liveCut`: `onAir()` is false while it is the newest thing that happened, and
`nextService` *steps over* the gathering it interrupted — so the pages count down to the next service
rather than printing `0h 0m` for the rest of the interrupted gathering's hours (the bug SPEC note 106
was written for, now for the stream's stop as well as the office's). The office's word beats it, both
ways: a *Start* / *Continue* newer than the ending means they are streaming again, and an ending older
than the gathering the clock is on now (last Sunday's) is history. And any *live* answer clears
`endedAt`, so a restart lifts all of it.

What this does **not** do is tell a browser that never saw the stream that it has ended: the check can
say *not broadcasting now* but cannot say whether that is "not started yet" or "finished early". So a
visitor who arrives after a service ended still reads the clock (unless the office has pressed *Stop*,
which is content and reaches everyone). The office's own drawer keeps writing that stop
(`src/lib/autostop.ts`) — the difference is that the display no longer waits for it.

**④ The wait for the stream is a screen of its own, over the last stream's own still.** The frame on
`/watch-live` is now three states, not four: **the stream is running** (the player), **the service is
on but the stream has not opened** (new), **nobody is broadcasting** (the *Live has ended* screen),
and — only for a site with no channel, no stream link and no Facebook page at all — the old "most
recent message" fallback with its notice, because there is no broadcast to promise. The new state is
`LiveWaiting` (`src/components/liveclock.tsx`): the line *The service is on* and *We will be live here
shortly — please bear with us while we get the stream up…* over a **clock built out of CSS 3D** — a
gold case set behind the dial in Z, sixty marks and four numerals on the dial, three hands, a centre
pin and a glass cover floating 14px in front of the hands, the whole stage swaying on two axes and
nudging itself on every second (the *prefers-reduced-motion* pass drops the animations and keeps the
sway's resting angle). The hands are turned from the reader's own **device** clock — this is the one
place on the site where `getHours()` is right, because a clock face shows the time where the reader is
sitting rather than a church instant.

**Its tick is made, not shipped** (`src/lib/ticksound.ts`): a short noise burst band-passed around
2.1–2.7 kHz for the escapement and a 150–175 Hz triangle for the wood of the minute hand, the pair
alternating every second, the minute's tick lower and louder, nothing at all while the tab is hidden.
The tick is *scheduled onto the second itself* (each tick measures the next whole second rather than
riding an interval that drifts). It is deliberately **light** — a clock in the next room, not an effect
(master gain 0.13, 0.18 on the minute). And because **no browser will run an audio context before the visitor
has touched the page**, the context is created *inside the first gesture* rather than on mount —
creating it early is what earns Chrome's "The AudioContext was not allowed to start" warning — so the
tick starts by itself: at once when the browser already counts the page as touched, otherwise on the
first pointer, key or touch anywhere on it. There is no switch for the tick —
it plays quietly under the words, with nothing to turn off.

**Both dark screens keep the last stream's cover, faded.** The still behind the *Live has ended* state
used to be the newest **message**; it is now the last **broadcast** — the video the check watched end,
else the newest service on the church's channel, with the newest message only as the last resort — and
the waiting screen wears it too, under the same `opacity: .42` + `grayscale(.4)` and the same scrim
the ended screen uses (`live-ended__bg` / `live-wait__bg`), so the two states are one treatment and the
screen is never a blank box.

**Verified live.** With the office's own *Start* written to the draft (and put back afterwards): the
header pill, the home hero and the next-gathering card all read **Live now** with the frame showing the
new waiting screen at 653×430 and at a phone's 390 px (heading and the sound button each on one line,
nothing clipped — measured, since a snapshot of a *cloned* subtree renders differently). A status cache
staged as *live* (a stream found off the schedule) opened the channel's own player on the panel and lit
every indicator. A staged ending older than the office's command — the real case this browser had
already seen: a service streamed tonight at 21:15 that is not on the schedule — took *Live now* off the
pill, the hero, the card and the panel at once, left the panel on *Live has ended* over that stream's
own still, and stepped the clock over the gathering it interrupted. All fourteen routes render at
390 px with no horizontal overflow, and there were no console, platform or syntax errors. Nothing was
published; the office's draft was put back byte-for-byte (the same three branch renames and the
removed *New sermon*, with `dirty` exactly as it was found).

## 134. The X link leaves the footer, and the page background becomes a living shader (the office asked)

> remove the twitter icon, make sure the liquid glass is still present and add a shader gradient to the backgrounds

Three asks in one line. The **X/Twitter link** left `SITE.socials` (`src/data/site.ts`) — the footer's
social row reads that list, so YouTube, Facebook and Instagram are what remain — and its now-unused
`x` glyph left the icon set (`src/components/ui.tsx`), so nothing dead stays behind. The **glass**
(`src/styles/glass.css`, SPEC note 132) is untouched: the panels keep their blur, rims and shadows,
verified by computed style in both themes.

The **background** is now a WebGL fragment shader (`src/lib/shaderbg.ts`, mounted once from `App.tsx`
so it covers the public site and the drawer alike): a slow domain-warped gradient in the church's own
colours — gold spilling from the top-left, crimson at the far corner, falling away deeper toward the
bottom — over the same layout the CSS aurora had, in a warm cream version for the light theme (the
palette crossfades on a theme switch). It renders small (a third of the display size, capped at 2x)
at ~30 fps, pauses with the tab (requestAnimationFrame stops itself when hidden), draws one still
frame under *prefers-reduced-motion*, and removes itself if WebGL is unavailable — in which case the
CSS aurora underneath shows, exactly as before, since the canvas sits over it as a fixed layer behind
everything else. Verified live: varied pixels in the warm and deep zones of both themes, glass panels
composing over it on the full page, no console, platform or syntax errors. Nothing was published.

## 135. The last message is the latest upload (the office asked)

> the last message should be the latest uploaded in the previous sermon

The *Last message* band on `/watch-live` played the newest **write-up** — so it showed a demo message
while the channel's own latest broadcast sat one band down in *Recent services*. It now plays the
newest **upload**: the latest broadcast read from the church's channel (`pool[0]` in
`src/pages/WatchLive.tsx`), with a *Watch on YouTube* button instead of the write-up's message button
(a stream has no sermon page). The grid below skips it, so it never appears twice; a service the
office has written up, taken off, or is currently watching live is never picked; and with nothing to
read (no channel, failed read) the newest write-up keeps the slot exactly as before. While an upload
plays above, the newest write-up rejoins *Previous sermons* instead of hiding behind the feature.
*Previous sermons* itself is unchanged — still the hand-written archive, nothing ever rolls into it on
its own. Verified live: the Youth Sunday/Communion service plays in the band, the write-ups follow
from the newest, the grid starts at the next upload, no console, platform or syntax errors. Nothing
was published.

## 136. The last message stays a previous sermon, not a recent upload (correction to 135)

> the last message should be the from the latest uploaded previous sermon not from the recent messages

Note 135 had it backwards: it made the band play the newest *Recent services* upload. The office wants
the newest **previous sermon** — the latest message from the hand-written archive (`latest` in
`src/pages/WatchLive.tsx`, the newest write-up by preached date), never a raw stream. So 135 is
reverted in full: the band plays the newest write-up again through `SermonWatch`, *Recent services*
keeps all six uploads, and *Previous sermons* follows from the next write-up. Verified live: the band
is back on the newest write-up with the grid complete underneath, no console, platform or syntax
errors. Nothing was published.

## 137. The unsaved-changes row gets a Delete button (the office asked)

> add delete button to the unsaved changes in the admin if you dont want it anymore

The row already dropped its change alone (`revertSection()`, SPEC note 114) — but under the name *Put
back*, which did not read as deleting. It is now a **Delete** button with the trash icon (crimson on
hover, in `src/styles/edit.css`), and the header, footnote and toast around it say delete too. Same
behaviour, undoable, everything else untouched. Verified live in the drawer with the office's own
pending changes (the button shows on every row; the draft was left exactly as found). Nothing was
published.

## 138. The Tools modal loses its restore card, and Sign out really signs out (the office asked)

> remove this: Restore the shipped content / Removes every edit stored on the server and puts the
> original content back. / Restore original content, the signout in the admin signs the admin out

The whole *Restore the shipped content* card is gone from the Tools modal (`ToolsModal` in
`src/components/editor.tsx`) — heading, paragraph, both buttons and the two-step arm. The *End this
session* card stays, and its **Sign out** now signs the admin out in every mode: before, `cms.logout()`
cleared the server session but left the drawer's local preview mode on, so a tab that had entered
locally stayed editable. The modal now takes an `onSignOut` hook (`src/pages/Admin.tsx` passes one
that drops `localMode`), so signing out locks the drawer behind the office password again. The *How
sharing works* notice says both halves now — publishing shares, signing out signs this browser tab out
of the shared server while everything published stays live. Verified live: no console, platform or
syntax errors. Testing note, read before touching the draft: mid-session a wedged preview reload (one
that hung ~75s before recovering) blanked the office's unsaved draft; it was rebuilt byte-for-byte
from that session's own snapshot (three branch renames, plate pin, removed empty sermon, the office's
live Start) and verified back in `pending()`. Sign-out, sign-in and a clean reload were each
re-verified safe afterwards — none of them touches the draft. Nothing was published.

## 139. Deleting a branch takes its sub-branches with it (the office asked)

> delete in the unsaved automatically remove from the website or anywhere it is

Deleting a branch left its sub-branches orphaned on the site — they stayed in the list, on the
Locations page and in its counts with a parent that no longer existed. *Delete* on a branch now
removes the branch and every gathering under it (children, grandchildren, however deep), in one
step: the drawer toast names how many sub-branches went with it, and the hover on a branch that
has any says so before the two-click confirm. Anything without children deletes exactly as before.
The removal itself is still a draft change like any other — nothing leaves the site until Publish —
but once published it is gone from every surface at once (page, chips, counts, search), because
those all read the one list. Undo takes it back up to Publish. Verified: unit-tested the cascade
helper against a parent/child/grandchild/id-less mix, rebuilt clean, no console, platform or
syntax errors. Nothing was published and the office draft was never written.

## 140. The unsaved list grows a real Delete next to Put back (the office asked)

> the delete button in the unsaved change should delete the unsaved and not put it in the website
> again so there should be a delete button and the push back

The old Delete did not delete — it put the section back the way the live site has it, so a sermon
the office had taken off came straight back. Each unsaved row now carries the two honest buttons:
**Put back** (undo icon) restores the live version, exactly what the old button did; **Delete**
(trash, two taps to confirm) removes it for real. Delete drops anything that never went live,
returns edited entries to their published version, and publishes the section straight away
(`publishSection`, new in `src/lib/cms.ts`), so what was taken off leaves the live site at once —
page, archive, bands and counts together — instead of waiting for Publish. Offline it stages the
section the way Publish does, to send on reconnect. Only real add/remove lists (sermons, branches,
events …) offer Delete; a reworded line has nothing to take off, so those rows keep Put back alone.
The cleanup is undoable up to the publish, and the publish itself joins the server history like any
other. Verified: surgery logic unit-tested (add/drop, edit/revert, remove/keep, reorder folded,
id-less lists), rebuilt clean, no console, platform or syntax errors. Nothing was published in
testing and the office draft was never written.

## 141. Sermons date themselves — the Date field is gone (the office asked)

> in the sermon edit remove the date option, the date should automatically be the date of upload

*Date preached* is out of the sermon form (`src/lib/cmsSchema.ts`). A new message is stamped with
the upload day on creation (`makeNew` sets `date` to `todayKey()`, the site's own calendar date),
and a duplicated message restamps too — a copy is a new upload, not the original day again
(`duplicate` in `src/pages/Admin.tsx`). Nothing else changes: dates already on published messages
(including messages filed from broadcasts) are still honoured, and messages without one still fall
back to their week count, so the archive order never jumps. Verified live: the sermon form shows
no date field, rebuilt clean, no console, platform or syntax errors. Nothing was published and
the office draft was never written.

## 142. New sermons land at the top of the admin list (the office asked)

> note that every new sermon uploaded would be at the top of the sermon list in the admin, just
> like it would be in the top of the previous sermon and the last message

The site reads newest-first, but the drawer appended uploads at the foot of its list. Lists can
now declare `addToTop` (new on `SectionDef`); only the sermons do. *Add* and *Duplicate* in such
a list insert at the top and open the entry there, so the drawer's order always matches the last
message and the previous sermons. Nothing stored moves — only new entries land differently.
Verified in the bundle and live with the office draft untouched; nothing was published.

> Superseded by note 143 below — the office asked for it the other way round: new uploads stay
> at the foot of the drawer list until Publish.

## 143. New sermons stay underneath until Publish, then take the top (the office asked)

> after clicking another let the new sermon still remain underneath but after published it goes
> to the top of the sermon list

*Add* and *Duplicate* append again, exactly as before note 142 (whose `addToTop` mechanism is
removed — no list uses it now). A new upload sits at the foot of the drawer list while it is
worked on, and because every upload is stamped with its date (note 141) the live site — which
orders the last message, the previous sermons, the archive and the detail pager newest-first —
puts it at the top the moment it is published. Apart from the newest-first sort at Publish
(note 144), no stored order is ever rewritten. Verified live
with the office draft untouched; nothing was published.

## 144. Publish puts the new sermon at the top of the admin list at once (the office asked)

> when the new sermon is publish it stays at the top of the sermon list in the admin immediately

The drawer keeps draft order while editing (note 143), but the stored order is newest-first: both
Publish and the unsaved list's Delete publish the sermon list sorted by the date the site reads
(`newestSermonsFirst` in `src/lib/cms.ts`, the same `sermonDate` the last message, previous
sermons, archive and pager sort by). The sort is stable, so messages sharing a date keep the
order the office left them in — and a manual reorder alone no longer counts as a change worth
publishing, since order is derived from dates. The draft follows what goes live (Delete's path),
so the section leaves the unsaved list instead of popping back in on order alone. Verified:
ordering unit-tested against mixed dates/weeksAgo/legacy blanks, rebuilt clean, no console,
platform or syntax errors. Publish itself was not test-fired — the office's pending work must
never go live from testing — and their draft was never written.

> Superseded by note 145 below — sorting at Publish changed the stored order the whole site
> shares. The website is back to exactly how it was; only the drawer reorders, and only on
> screen.

## 145. The admin sermon list reads newest-first; the website is untouched (the office asked)

> this have not been corrected, this is what i want, in the sermon the add another button create
> a field to upload but when the uploaded sermon is published it changes position to the top of
> the sermon list in the admin not in the website, revert the website to how it was for the
> sermon i just want the changes for the admin

Note 144's publish-time sort is fully reverted — Publish and Delete store entries exactly as the
office arranged them, so every page, archive, band and library reads precisely what it did
before. The reorder now lives only in the drawer's sermon list (`order` in `ListBlock`,
`src/pages/Admin.tsx`): published messages read newest-first by the date the site reads
(`sermonDate`), while an upload still being worked on waits at the foot — told apart by
`publishedSectionIds` (new in `src/lib/cms.ts`), which lists what the live site holds. The
moment it is published it joins the date order at the top, on screen only; nothing stored ever
moves. Move up/down is hidden on sermons (order comes from dates, so the buttons would look
broken); every other action still runs on the stored entry. Verified live: published sermons
newest-first, the in-progress upload at the foot, rebuilt clean, no console, platform or
syntax errors. Nothing was published and the office draft was never written.

> Superseded by note 146 below — a new upload keeps a blank id, so ids alone called a published
> upload new forever and it never left the foot.

## 146. Published uploads reach the top even with a blank id (the office asked)

> but its still at the buttom of the liast after pulished

The note-145 split recognised a published message by its id — but an upload's id stays blank
until the page re-reads it, so a published upload sat at the foot with the unfinished ones.
`publishedSectionIds` is replaced by `isPublishedEntry` (`src/lib/cms.ts`): id match first,
whole-content match second. An upload being filled in still matches nothing and waits at the
foot; the moment its content equals what is live — Publish, or Delete — it joins the
newest-first order at the top. The website is untouched (display order only, drawer only).
Verified live: the published blank-id upload reads at the top, rebuilt clean, no console,
platform or syntax errors. Nothing was published and the office draft was never written.

## 147. Framer Motion runs the modals and toasts (the office asked)

> add framer motion

Framer Motion 11 (`framer-motion@11.11.9`, pinned in `BARE` in `src/tools/build.mjs`) is bundled
into `src/app.js` — no runtime CDN. Its esm.sh entry must pin `react`/`react-dom` as externals
so the bundle keeps exactly one React (a second copy breaks hooks); the entry turned out to be
a shim over hundreds of relative chunk imports, so the build plugin now resolves relative
imports inside fetched files against their URL and caches downloads in `scratch/.http-cache`
(first build is slow, rebuilds reuse it). Motion drives the shared `Modal` (backdrop fade,
panel rise, and — new — a matching exit instead of blinking out) and the `Toaster`
(slide-and-settle in, shrink out); the old `toastIn` keyframes are retired and `modalIn` stays
for the command palette, which is still CSS. The root `MotionConfig` sets `reducedMotion="user"`,
so the site's reduced-motion promise holds. Scroll reveals stay CSS on purpose. Verified live:
Library's clear-data modal opens, exits and unmounts; a toast appears and dismisses; home page
unchanged; no console, platform or syntax errors. Nothing was published and the office draft
was never touched.

## 148. One motion language for the whole site (Framer Motion redesign)

> redesign the framer motion

- **The gap.** Note 147 bolted Motion onto two surfaces — the modal (a timed fade-and-rise) and
  the toaster (a timed slide) — while scroll reveals stayed CSS and accordions ran on a
  `grid-template-rows` trick. Three different animation systems, three different feels, and the
  easings were copy-pasted per component.
- **One shared vocabulary** (`src/lib/motion.ts`): a single `EASE` (`[0.22, 1, 0.36, 1]`),
  `SPRING_SOFT` (modals, accordions, collapses) and `SPRING_SNAPPY` (toasts), plus the `rise`,
  `modalBackdrop`, `modalPanel`, `toastCard` and `fold` variants every surface reads. A new
  animated surface starts from these — it never invents its own curve.
- **What each surface does now.**
  - `Modal`: the backdrop fades *through a blur* (0 → 6px) and the panel rises on the soft
    spring (`y 28, scale .96 → open`), with a matching exit — no more blinking out.
  - `Toaster`: cards pop in on the snappy spring with `layout` + `AnimatePresence mode="popLayout"`,
    so a dismissed toast hands its space over instead of the stack jumping.
  - `Reveal`: rewritten on Motion (`initial → whileInView`, once, `-48px` margin, delay clamped
    to 400ms) — the old `.reveal` CSS animation is gone (now just a `.mreveal` will-change hint).
  - `Accordion` and `Collapse`: the grid-rows/opacity CSS trick is replaced by the shared `fold`
    height animation with a matching exit, so closing glides shut instead of snapping.
  - The command palette keeps its own CSS keyframes, and the root `MotionConfig
    reducedMotion="user"` still quiets everything at once.
- **Gotcha note for the next session:** `.mreveal` carries only `will-change` (no transform), so
  the TODO's containing-block warning still stands — do not put a transform or a permanent
  `will-change` on a card wrapper without checking the popups that open from it.
- **Verified live:** About's accordion opens (126px, opacity 1) and closes back to unmounted;
  a toast appears, settles (opacity 1, transform none) and dismisses itself; the tools modal
  opens (backdrop `blur(6px)`) and Escape exits to unmounted; home reveals sit at opacity 0
  below the fold and flip to 1 on scroll; no console, platform or syntax errors; the office
  draft untouched (165032 bytes before and after). Nothing was published.

## 149. The backup cards left the Tools modal

> remove this: [& backups] … [the whole Download-a-backup / Restore-a-backup block]

- **What went.** The *Download a backup* and *Restore a backup* cards (`ToolsModal` in
  `src/components/editor.tsx`) with the intro paragraph about the shared server and JSON files —
  exactly the pasted block. The modal is now titled **Tools** and holds only *Undo the last
  publish* and *End this session*; the bar's icon button and the Status tab's button were renamed
  the same way (*Tools*). `cms.exportSnapshot()` / `cms.importSnapshot()` stay in `src/lib/cms.ts`
  as engine API with no caller, so bringing an export back is one card.
- **Verified live:** the Tools modal opens with two cards and no backup wording; no console,
  platform or syntax errors; the office draft untouched. Nothing was published.

## 150. The sign-out card says “log out this admin.”

> replace this with Signs this browser tab out of the shared server. : log out this admin.

One line in `ToolsModal` (`src/components/editor.tsx`): the *End this session* card's description
is now “log out this admin.” Verified live, zip re-attached. Nothing was published.

## 151. The “How sharing works” notice left the Tools modal

> remove this: How sharing works. …

The notice under the tool cards in `ToolsModal` is gone — the modal is now just the two cards.
Verified live, zip re-attached. Nothing was published.

## 152. Branches lost capacity/established; flags come from the country; the admin waits five minutes

> remove this: established in the branches and sitting capacity, for flag emoji use the country real flag emoji. whenever you go to check some changes in the admin live edit let the admin remain in the previous state, it automatically resolve back if you dont go to the admin in 5mins

- **Branches.** The *Capacity 2,500 · since 2016* line is off the branch card (`BranchCard` in
  `src/components/blocks.tsx`), the *est.* line is off About's branch chips, and the drawer's
  *Established* / *Seating capacity* fields are out of the form (`src/lib/cmsSchema.ts`) — the
  values stay in the data and in old drafts, they are simply never shown or offered. The three
  orphaned copy lines (`Capacity`, `· since`, About's `est.`) stay in `autocopy.ts` until the
  collector's next run drops them; do not hand-edit that file.
- **Flags.** `countryFlag()` / `branchFlag()` in `src/data/branches.ts` work the flag out from the
  country name (Nigeria 🇳🇬, America 🇺🇸, Canada 🇨🇦) — every card, chip, group header and event line
  reads it, so a branch can never fly the wrong picture. The stored `flag` is only the fallback,
  and the drawer's *Flag emoji* field stays.
- **Stay-and-return.** Pressing *Open the live site* writes the drawer down (page, tab, section,
  open or not) to `sessionStorage["wom.cms.exitReturn"]` (`exitToSite` in `src/pages/Admin.tsx`);
  coming back — by hand or by the link — reopens the drawer exactly there with a *Welcome back*
  toast, and the note is cleared. While the note sits there, the public site (`SiteApp` in
  `src/App.tsx`) holds a timer for the remainder of five minutes from the exit; if it runs out it
  navigates back to the stored admin page itself. Returning by hand disarms it (unmount). The
  draft itself was never at risk — this is only the drawer's place.
- **Verified live:** Locations cards show pastor + address only with correct country flags; About
  chips are flag + city; the branch form has no Established/Seating-capacity rows; exit wrote the
  note, manual return restored the open drawer + toast and cleared the note; a backdated note
  auto-returned `#/` → `#/admin/giving` with the toast; draft untouched throughout (office's own
  drift aside). Nothing was published.

## 153. The drawer keeps your place until five minutes pass

> if im in a place in the admin and i click the cancel button to go to the live edit website to observe my edits and all changes when i come back to the admin let [it] remain where i was dont let it change back to the editors option until after 5mins of not going back

- **The correction to note 152.** Note 152 saved the drawer across the exit-to-live-site trip, but
  inside the admin itself the drawer still snapped back to the options list every time it was
  reopened (`askWhatToChange`) and on every admin page switch (the route effect). Now closing the
  drawer (X) and reopening it, or stepping to another admin page, lands exactly where the office
  was — job, section or search view. Only a drawer untouched for longer than five minutes
  (`drawerTouched` vs `ADMIN_RETURN_MS` in `src/pages/Admin.tsx`) falls back to the options
  landing, and a return note older than the wait (plus a minute's grace) is thrown away instead of
  restoring a section from another day.
- **Verified live:** job view survived close → reopen and `#/admin/locations` → `#/admin/giving`;
  draft untouched. Nothing was published.

## 154. A bare #/admin visit returns to the exact last page

> let it remain in the exact last admin page it was

- Every admin page visit is written down (`sessionStorage["wom.cms.lastAdminPage"]` in the route
  effect of `src/pages/Admin.tsx`); entering `#/admin` bare redirects (replace) to that page while
  the memory is fresh, instead of the admin home. The redirect effect is deliberately declared
  *before* the recording effect — the recording of `"/"` would otherwise wipe the memory before
  the redirect reads it (caught live: the first build stayed on `#/admin`). Same five-minute
  freshness as the drawer.
- **Verified live:** `#/admin/ministries` → live site → `#/admin` resolved to `#/admin/ministries`;
  draft untouched. Nothing was published.

## 155. The exact row stays open; only five untouched minutes reset it

> for example if i am editing something (may be a branch name) in the admin then i quickly go to the live website pages where i see my previews, the page in the admin still retains the branch page where i am editing then changes back to the default admin page after 5 mins of been untouched

- **The gap in note 153.** The drawer kept its *view* (job/section) but not its *rows*: the open
  section blocks (`PagePanel.open`) and the open record (`ListBlock.openItem`, e.g. the Lagos
  branch row) were local state that died with the unmount — closing the drawer or stepping out to
  the live site shut the very row being edited.
- **What now persists** (`src/pages/Admin.tsx`, all `sessionStorage`): open section ids
  (`wom.cms.drawerOpenSections`, seeded into `PagePanel` on mount) and the open row per section
  (`wom.cms.drawerOpenEntry`, section id → entry key, seeded into `ListBlock` after the search-hit
  focus). Opening a row writes its key; closing it removes it.
- **What counts as touching it:** navigating, toggling a section, opening a row, and any keystroke
  or picker change inside the drawer (delegated `input`/`change` listener) stamp
  `wom.cms.drawerTouch`. Only a drawer untouched for longer than `ADMIN_RETURN_MS` (5 min) falls
  back to the options list — on reopen, on admin page switch, or on a stale return note — and the
  snapshots are cleared with it.
- **Verified live:** Lagos row open → live site → back: same row open with the welcome toast;
  close → reopen: row kept; touch backdated 6 min → reopen lands on the options list with nothing
  open; draft untouched throughout. Nothing was published.

## 156. Moving away never loses the last state — even a reload

> if you move away from a page in the admin it closes[,] this one applies to the last state of the admin

- **What was still closing.** Notes 152–155 kept the drawer across exits, closes and page moves —
  but every one of those kept the state in memory, so a full reload (and every build refresh) still
  reopened the drawer shut on the options landing.
- **The view is now written down too** (`wom.cms.drawerView`: tab, job/section view, open or not,
  on every change in `src/pages/Admin.tsx`). A mount with no exit note restores from it — drawer,
  section blocks (`wom.cms.drawerOpenSections`) and open rows (`wom.cms.drawerOpenEntry`, e.g. the
  Lagos branch row) all come back. Freshness reads the drawer's last touch (navigation, toggles,
  opened rows, keystrokes all stamp it), so a long uninterrupted edit still counts as active; past
  the wait everything is cleared and the drawer starts fresh.
- **Verified live:** drawer restored open across refresh from the written view; a touch backdated
  past the wait reloads to the closed landing with the snapshots cleared; every in-admin move
  (hash, real link clicks, back/forward) keeps drawer, section and row; draft untouched throughout.
  Row-level checks after a reload stop at the sign-in gate (the office signs back in first — the
  snapshots wait in `sessionStorage` until then), so that leg is covered by the same seeding code
  the exit/return path proves end to end. Nothing was published.

## 157. Only the last opened section stays open

> i noticed that previous admin pages where still opened, only the last state should be opened and retain the page

- Sections are now single-open: opening one closes the previous (`toggle` sets `[id]`, and a
  section jump sets `[sectionId]`), while the page, tab and view are still retained as before.
  Rows were already single-open per section. The snapshots follow the same rule — entries of
  closed sections are pruned, and seeding takes the first id only — so a reload cannot resurrect
  a stack of old sections either.
- Verified as far as the signed-out preview allows: build clean, page renders with no console,
  platform or syntax errors, draft untouched. The click-through (opening B opens, A shuts) needs
  the office session, which a reload signs out. Nothing was published.

## 158. Tab clicks become the last state too

> if edit, update and status was clicked they become the last state too

- Clicking *Edit*, *Update* or *Status* now clears the open section (`setOpen([])` in the tab
  handler), so the tab landing replaces whatever section was open. The existing snapshots do the
  rest: the emptied open list is written and every section entry pruned, and the tab's mode plus
  home view recorded — a reload or return lands on the clicked tab, not a resurrected section.
- Verified as far as the signed-out preview allows: build clean, page renders with no console,
  platform or syntax errors, draft untouched. The click-through needs the office session, which
  a reload signs out. Nothing was published.

## 159. Status tab stat cards removed

> remove this: The numbers behind the pages — tap one to manage it. [7 Branches / 19 Sermons / 11 Upcoming activities / 10 Ministries, each with Manage]

- The "At a glance / How much is on the site" heading and the four stat cards are gone from the
  Status tab, along with the now-unused `counts` memo and the orphaned `.admin__cards` /
  `.admin__stat` CSS. Everything else on the tab (live state, this week, history) is untouched.
- Verified: build clean, page renders with no console, platform or syntax errors, the heading
  string no longer appears in the rendered page, draft untouched. Nothing was published.

## 160. Tools sits after the Status tab

> tools button should be after the status button

- The drawer's Tools button moved out of the Status heading and into the tab row, right after
  the Status tab, styled as a tab. It opens the same Tools modal; the drawer's place behind it
  is untouched. The now-unused `onTools` prop left `Dashboard`.
- Verified: build clean, page renders with no console, platform or syntax errors, draft
  untouched. The signed-in tab row needs the office session to eyeball. Nothing was published.

## 161. Tools lights up like the other tabs

> the button should be the same like the edit and update

- The Tools tab already shared the tab pill style; what differed was the active state, so it now
  takes `is-active` (the same gold highlight) while the Tools modal is open and drops it on
  close, via a `toolsActive` prop from the drawer's modal state.
- Verified live in the preview: tapped Tools, modal opened with Tools highlighted gold like an
  active Edit/Update/Status tab; closed it, highlight cleared. No console, platform or syntax
  errors, draft untouched. Nothing was published.

## 162. Tools is a page, not a popup

> the tools should have its own page just like edit and update not a pop up

- Tools is now a fourth drawer tab (`tools` joins `PanelMode`, with an `isPanelMode` helper used by
  both snapshot validators so the tab survives reloads and returns). Tapping it shows a Tools page
  in the drawer — the same Undo-the-last-publish and End-this-session cards — with the gold active
  highlight, section clearing, and last-state memory all working exactly like the other tabs.
  The Tools modal is gone (`ToolsModal` removed; its `toolsOpen` state with it), and the edit
  bar's Tools button now opens the drawer on the Tools page instead of a popup. "N unsaved
  changes" from Tools lands on the unsaved list, as it does from Status.
- Verified live in the preview: tapped Tools, page rendered with both cards, tab highlighted,
  no modal, no errors, draft untouched. Nothing was published.

## 163. Tools page heading removed

> remove this: Undo and sign out / Roll back the last publish, or end this editing session.

- The heading block is gone from the Tools page — it now opens straight onto the two cards
  (the tab itself already says Tools).
- Verified live in the preview: heading absent, both cards intact, no errors, draft untouched.
  Nothing was published.

## 164. Sub-admins with one-time invite codes

> give a good title for this while you add this in tools: create an option on tools whereby this admin would create other admin and can delete the admin, just like a sub admin, the sub admin can also sign in just like this main admin. create an authenticator for the main admin, for the sub admin signup there should be a one time authentication creation so that the sub admin can access the admin later. a delete button too for the main admin, so the tools for the sub admin would have the undo the last publish, end this section only

- The Tools page has its title back: **Who can edit the site** (*Tools / Invite sub-admins, undo
  a publish, or end this session.*). The main admin's authenticator is unchanged — the existing
  office password (still the temporary `12345678` until it is rotated per the README recipe).
- New **Sub-admins** card on the Tools page, main admin only: invite by name (the browser invents
  a `XXXX-XXXX-XXXX` code and shows it once to pass on), a roster with two-tap **Delete** buttons
  (live sessions drop at once), and **Revoke** for unused invites. A sub-admin's Tools page holds
  only *Undo the last publish* and *End this session*.
- Signup: the sign-in gate grew *Use a one-time invite code* — code in, then create your own
  password. The code works exactly once (7-day expiry regardless); afterwards the password signs
  in like the main admin's, on any device.
- Server (`index.html`, 20/20 isolated handler tests green): roster lives in the meta blob beside
  the publish log (backward-compatible — older state loads as empty), hashes only, caps of 20 and
  20, main-only gates on every privileged call, login rate limits extended to the new endpoints,
  `publish` unchanged so subs can publish. Client (`cms.ts`): role tracking (`state.role`),
  invite-code crypto (`crypto.getRandomValues` + `subtle` SHA-256), session restore re-logs subs
  automatically. README documents the scheme.
- Verified without touching the live session (the office is working in the preview tab): build
  clean, reload error-free, server flow unit-tested end to end (invite → redeem → sign in →
  publish-auth → delete → persistence round-trip), bundle contains the new UI strings, draft
  untouched. The click-through (create → redeem on a second device) needs the saved production
  server — the unsaved preview's emulator forgets roster state on reload. Nothing was published.

## 165. Authenticator app for the main admin

> create an authenticator app for the main admin

- New **Authenticator app** card on the Tools page (main admin only): *Set up authenticator*
  shows a QR code plus a type-by-hand secret for any authenticator app (Google Authenticator,
  Authy, 1Password…); a live 6-digit code proves the app reads it before anything is stored, and
  ten single-use spare codes are shown once for a lost phone. *Switch off* takes a current code,
  so nobody can silently drop the lock from an open drawer.
- Afterwards every main-admin sign-in takes password **plus** the current app code (or an unused
  spare) — on any device, after every reload. Sub-admins are untouched. The main password itself
  is unchanged.
- Server (`index.html`, 21/21 isolated tests green incl. an RFC 6238 vector): pure-JS
  SHA-1/HMAC-SHA1/TOTP with a ±1 step window, secret + spare-code hashes in the meta blob
  (backward-compatible), `login` returning `needCode`, `login2fa` consuming spares on use, and
  the same per-connection / per-`net` rate limits as login. Client: `login2fa`, secret/backup
  generation with `crypto.getRandomValues`, QR via `qrcode-generator` (bundled, +~30 KB), and a
  second step in the sign-in gate.
- Verified live in the preview: Tools page renders the card, setup shows a scannable QR and a
  32-character secret, drawer left as found, no errors, draft untouched (rev 23, office mid-edit).
  Nothing was published. Note: like invites, enrollment lives on the content server, so it goes
  permanent when the generator is saved; the preview's test server forgets it on reload.

## 166. Explicit Delete admin button

> create a delete admin button

- Every sub-admin row now carries an explicit red **Delete admin** button (two taps: arm, then
  confirm — deleting signs their live sessions out at once), and an empty roster says so: nobody
  else can sign in yet, and each invite appears here with its Delete admin button.
- Verified: build clean, reload error-free, draft untouched. The tab is signed out, so the
  click-through waits for a signed-in session; the delete path itself is server-tested (note
  164). Nothing was published.

## 167. Delete button for the main admin

> not the sub-admin but for the main admin

- The roster now opens with a **Main admin** row carrying its own **Delete admin** button: it
  retires the shared office-password sign-in while named sub-admins carry on (the password
  stops working everywhere, immediately). A **Restore** button brings it back; any signed-in
  sub-admin sees the state and can restore too.
- Lockout is impossible by construction, enforced server-side: switching off needs a sub-admin
  to exist (`no-subs`), deleting the last sub-admin or revoking the last invite while off is
  refused (`last-way-in`), and restoring takes any signed-in admin. New `setMainOff` /
  `mainState` RPCs; `deleteSub` / `revokeInvite` gained the guards.
- Also fixed while testing this: `writeMeta()` never wrote the header, so admin-only changes
  sat in state with a stale blob length — the next load would have read a truncated meta blob
  and wiped the publish log with it. It now writes the header every time (this predates the
  sub-admin feature and affected it too).
- Verified: build clean, reload error-free, draft untouched; server suites green (retire →
  main denied + sub works → restore → delete; real persistence across reload; guards). The tab
  is signed out so the click-through waits for a session. Nothing was published.

## 168. Main admin row always visible

> i cant find the delete admin button on the tools of the main admin

- It was hidden by design until a sub-admin existed (the lockout guard), so with an empty
  roster there was no Main admin row at all — only the note plus the invite form. Then it
  lived as a row inside the Sub-admins card, which the office kept missing — so it now has
  its own top-level **Main admin** card in the Tools section (Authenticator, Main admin,
  Sub-admins, …), always rendered with its **Delete admin** button — nothing hidden, nothing
  nested. Tapping it before anyone joins explains why it cannot run yet (the main password
  is the last way in); once a sub-admin joins it arms and confirms like every other delete.
  The two cards stay in sync through a `wom:admins-changed` window event, and the `no-subs` /
  `last-way-in` server guards still hold.
- Disputed ("delete removes everything / all subs lose access / site looks new"): reproduced
  the full flow in isolation against the actual server script (stubbed 50 MiB state):
  publish → invite → redeem → retire → sub signs in fine (`role:sub`), content + log
  intact → state bytes reloaded fresh → subs, `mainOff`, sections and log all persist →
  a signed-in sub restores main → guards (`no-subs`, `last-way-in`) hold. Delete is
  innocent. The wipe the office saw is the unsaved preview's emulator: it forgets the
  roster (and server state) on every reload, and each rebuild hard-reloads the page — so
  a created sub-admin vanishes and the admin looks factory-new again. Permanent only on
  the saved production server.
- Separately fixed while chasing this: after retiring, the office password stops working
  while the sign-in gate still said "Sign in with the office password" — it now says "the
  office password or a sub-admin password", and the Main admin card states plainly that
  deleting retires that password only and Restore brings it back.
- Verified: build clean, reload error-free, live bundle checked for the new row note, the
  disabled-button hint and its CSS; draft untouched. Nothing was published.
(Superseded by 169 below — the card is gone.)

## 169. Main admin Delete button removed

> remove the delete admin button

- The **Main admin** card is gone from the Tools section (retire/Restore UI with it), along
  with the now-unneeded `wom:admins-changed` sync event. The office password always works
  again — there is no way to switch it off from the UI anymore.
- Kept deliberately: each sub-admin row's own **Delete admin** button (note 166 — separately
  requested, never disputed), the sub-side "Main sign-in / Switch it back on" recovery card
  (harmless if never shown), and the server `setMainOff`/`mainState` RPCs with their
  `no-subs` / `last-way-in` guards (so any already-retired production state can still be
  restored by a signed-in sub-admin). The only remaining "Main admin" string in the bundle
  is the authenticator app's account label.
- Verified: build clean, reload error-free; live bundle has no Main admin card and keeps the
  sub-row delete. Draft untouched. Nothing was published.

## 170. Security question replaces spare codes

> instead of this Two-factor is on. Write these spare codes down … do these: if you dont have access to the authenticator code an alternative should be a security question and answer that only the admin knows and have saved in security to access the admin this question can answer can also be refresh to input a new one

- The spare-code list is gone — including its bug: the generator alphabet had 31 characters
  but indexed `% 32`, so roughly 1 in 32 characters rendered as the literal text "undefined"
  (the `76UY-22undefined2` the office saw). No new spare codes are made.
- Setup now takes a security question + answer alongside the app code. At sign-in, step two
  offers "Answer your security question" when the phone is out of reach; answers match
  loosely (trimmed, lowercased, whitespace collapsed) and only the SHA-256 hash is stored —
  the question itself is visible, the answer never is. The question can be refreshed any
  time from the Authenticator card (proof: a current app code or the current answer), and
  switching two-factor off also accepts the answer.
- Server: `TOTP = {secret, backups, q, qhash}`; `login` returns the question with `needCode`;
  new `setSecurityQA` RPC; `login2fa`/`totpDisable` accept code, answer, or legacy spare.
  Old enrolled states (codes only) keep working and are prompted to set a question.
  Same rate limits as every sign-in step (5 tries per connection / 40 per network per
  10 minutes), so the question should still be something only the office knows.
- Verified: 15 isolated checks against the real server script green (enroll, loose/case-
  insensitive answer, wrong answer rejected, app code, QA refresh by answer, old answer
  dies, short question/answer rejected, enroll-without-question rejected, Q&A survive a
  state reload, disable-by-answer). Build clean, reload error-free, live bundle checked
  (QA strings in, all spare-code strings out). Draft untouched. Nothing was published.
- Minimums raised to 20 characters for both question and answer at the office's request
  (server enforces it in `totpSetup` and `setSecurityQA`; client guards and hints match).
  Later lowered to at least 4 characters ("4 characters and more") — same enforcement
  points (server re-tested: 3-char question/answer rejected, 4-char accepted).
- The Switch on button is now green (new `green` Btn variant, emerald gradient). Switching
  off was already a full disable (`TOTP = null`, proven by the disable-by-answer server
  check) — unchanged.
- The Authenticator card now has a proper toggle switch in its header (new `Switch`
  component, gold like Publish when on): flip it on to set up, off to switch off. It replaces the
  old "Set up authenticator" / "Switch off" buttons; the Switch on submit (gold, like
  Publish) stays. The header switch only turns on once setup actually completes — never
  during setup. Flipping it off opens a proof form showing the security question:
  Done (a correct answer or a current app code) is what actually switches it off
  (`totpDisable`, which also accepts legacy spare codes). Verified live, including
  switch styles (48×27 track, sliding knob, gold gradient when on, like Publish).
- Switching off clears the previous authentication completely: the server wipes the
  secret, question and answer hash (`TOTP = null`), and the card clears its local
  setup text too (secret, code, question, answer, change-form) — so flipping it back
  on always starts a fresh setup with a new secret. Cancelling a setup clears the
  secret as well.
- The header switch only lights once setup actually completes (Switch on) — never
  during setup; clicking it mid-setup cancels the setup instead. Switching off
  flips the card to off at once (optimistic) and clears the authenticator
  completely (secret, question, answer), and failures say when the server is
  unreachable.
- The "Two-factor is on", "Security question updated", and all sign-in
  ("Welcome…") notices use the gold toast style, not the green success one.
- Every success toast is gold now (the green success border and check are gone
  site-wide) at the office's request.
- The Tools page has an **Office password** card (main admin only): change the
  office password from `Tools` itself — but only while the authenticator app is
  on (the server refuses with `need-2fa` otherwise). Opening the form first asks for
  the security answer (or a current app code), and the change itself carries that
  proof — the signed-in session alone is not enough. The new password (at least 8
  characters) works at once on every device,
  and this tab keeps working without signing in again. Only the SHA-256 hash
  leaves the browser and only the hash is stored (new `setMainPassword` RPC, main
  session only — strangers refused, missing/wrong proof rejected, bad hashes rejected,
  old password dies, new one
  survives a state reload, proven isolated with real TOTP codes). The shipped hash
  stays as the fallback until the first change. The card re-checks the moment the
  authenticator is switched on or off in the same visit (`wom:totp-changed`), so it
  unlocks by itself — no extra button.
- Removed four office-facing texts at the office's request: the authenticator app
  examples, the sub-admin empty-state line, the invite-name hint, and the Tools
  page heading.
- Removed the drawer sign-in gate paragraph at the office's request (it now shows
  only "Sign in to change the website" with the Sign in button).
- Dropped the "Joining as a sub-admin?" lead-in on the sign-in card; the invite
  code button itself stays so codes still work.
- The sign-in card has a "Sign in as a sub-admin" click next to the invite-code
  one: already-created sub-admins sign in with the password they made (the office
  password typed there is met with the plain not-recognised refusal — no pointer).
  Sub-admins never see the authenticator code step.
- The Sub-admins card warns while the website is unsaved: invites and sub-admins
  only work in the same tab until it is saved (the preview server is per-tab and
  forgets on reload) — that is the shape of every "password not recognised"
  report.
- Creating the password saves it on that device: the sub-admin area offers
  "Continue as {name}" for one-tap sign-in anytime (with "Forget the saved
  password" to remove it).

## 171. One-click switch-off clears the authenticator and saves like a password change

> "when the button switches off it clears the previous authentication" / "save it the same way the admin password is saved during a change password"

- Flipping the Authenticator header switch off now clears the previous
  authentication at once — no proof form. Server wipes secret, question and
  answer hash (`TOTP = null`); the card clears its local setup text too, so
  switching back on always starts fresh.
- Saved the same way a password change is saved: `TOTP = null` + `writeMeta`
  on the server, like `MAIN_HASH` + `writeMeta` for a new password (new
  `totpOffNow` RPC, main session only — the session is the proof). The old
  `totpDisable` (proof-required) stays for older bundles.
- Verified: build clean, bundle carries `totpOffNow` with no proof-form
  strings, reload error-free. Draft untouched. Nothing was published.

## 172. Sub-admin sign-in back to the plain flow, and why a new password read as unknown

> "this is not what i want for the sub-admin, go back to how it was previously, the only issue i am having is after i have created a password for the sunadmin it tells me it does not recognize it. the process should be create invite code-use it to create password-apply the password whenever you want to login using the sunadmin sign in"

- Back to the plain flow, exactly those three steps: the main admin creates an
  invite code, the sub-admin spends it to create their own password, and every
  later visit types that password into **Sign in as a sub-admin**. The
  device-saved one-tap extras are gone: no more "Continue as {name}" button,
  no "Forget the saved password" line, no `saveSubLogin` / `loadSubLogin` /
  `clearSubLogin` in `cms.ts` — the sign-in is just the password field again.
- The flow itself was tested end to end against the real server script (9/9
  green): main signs in, invite created, code recognised as an invite, code
  spent to create the password, **the password recognised on a different
  connection**, the spent code dead, a wrong password denied, and the password
  plus the roster surviving a full state reload. Nothing in the code path drops
  the password.
- So a password that reads as unknown means the server holding it is gone:
  while the website is unsaved the preview server forgets sub-admins on every
  reload (and each rebuild reloads), and another tab never knew them. Two
  guards for that: the Sub-admins card already says to save first, and the
  sub-admin sign-in's "not recognised" refusal now says it too while unsaved —
  save the website first, then create the invite code again.
- Verified: build clean, bundle carries no saved-login strings and the new
  hint, reload error-free. Draft untouched. Nothing was published.

## 173. The unsaved warning can save the website itself

> "fix this:The website is not saved yet. Sub-admins and invite codes only work in this tab until it is — another tab will not recognise them, and a reload forgets them. Save the website first, then invite."

- That warning is the platform's unsaved-preview limit (the preview server
  forgets roster state on reload), not a bug in the invite flow — only saving
  the website fixes it, and only the office can save. So the warning now
  carries a gold **Save the website** button using the same
  `requestWebsiteSave()` the Publish flow uses: one tap asks the editor to
  save, and after the save + reload invites and sub-admins are permanent on
  every tab and device. Outside the editor it says to open the editor and
  press Save.
- Verified: build clean, bundle carries the button, reload error-free. Draft
  untouched. Nothing was published.

## 174. Sub sign-in names the real mix-up

> "after creating password for the sub-admin when i signout and sigin back it should be succesful instead of saying that password was not recognised"

- Agreed — that round trip is the design (proven 9/9 against the server in
  note 172). The one case that lied about it: typing the **office** password
  into the sub-admin box while two-factor is on used to answer "That password
  was not recognised." It now says it is the office password and points back
  to the main sign-in plus authenticator code.
- If the sub-admin's own password still reads unknown on this (saved) site,
  it is not the password on record: retype it exactly as created (capitals
  and spacing count), or revoke and invite again with a fresh code.
- Verified: build clean, bundle carries the new hint, reload error-free.
  Draft untouched. Nothing was published.

## 175. A sub-admin password can no longer match the office password

> "whether it is the same as the office password it should still be able to sign in, since it is the same input used to create the password"

- Why it couldn't: accounts are told apart by the password text alone, and
  the server checks the office password first — so a sub-admin password
  identical to it always signed in as the main admin (or landed on the
  authenticator step), never as the sub. The same text cannot serve two
  accounts, so making it "work" is impossible: the creation is refused
  instead, at the one place that can compare (`setSubPassword` checks the
  hash against the office hash, storing hashes only). The refused code is
  not consumed — the sub-admin simply picks a different password with the
  same code, and that password then signs in everywhere, as proven below.
- The sign-up form says so plainly: "That matches the office password — pick
  a different one, so the site can tell you apart from the main admin."
- Verified isolated against the real server script (6/6): same-as-office
  refused with `same-as-main`, the same code reusable with a distinct
  password, the distinct password recognised on another connection, the
  office password still main. Build clean, bundle carries the message,
  reload error-free. Draft untouched. Nothing was published.
- (Superseded by note 176 below — refusal removed in favour of location.)

## 176. The sign-in location breaks the tie

> "this is the solution: since the sign in happens in different places it should work and know which should open if the same password but different location to open"

- Done exactly that: each sign-in now says which box pointed at it. The
  sub-admin box looks at sub-admins first, the main box at the office
  password first — on a tie (the same text for both) the sub box opens the
  sub and the main box opens main. Anywhere else each box opens whichever
  account matches: a sub password works in the main box, and the office
  password works in the sub box (straight in, or via the authenticator step
  while two-factor is on — the gate flips to the code form by itself).
- Server: `login` takes the password raw (older bundles, main-first as
  before) or JSON `{password, want}`; nothing else about the responses
  changed. The note-175 refusal is gone — a matching password is creatable
  again. Client: the sub box sends `want:"sub"` and signs in with whatever
  account comes back (sub or main); the main box is unchanged.
- Verified isolated against the real server script (14/14): legacy raw
  login unchanged, tie opens sub from the sub box and main from the main
  box, cross-box passwords work both ways, wrong still denied — then with
  two-factor enrolled (real computed app code): tie from the sub box opens
  the sub with no code, from the main box asks the code, plain subs
  unaffected. Build clean, reload error-free. Draft untouched. Nothing was
  published.

## 177. The unsaved warning is gone from Sub-admins

> "eradicate this: The website is not saved yet. Sub-admins and invite codes only work in this tab until it is — another tab will not recognise them, and a reload forgets them. Save the website first, then invite. Save the website"

- The notice and its Save button are removed from the Sub-admins card —
  the card opens straight on the invite line. (`requestWebsiteSave` stays:
  the Publish flow still uses it. The sub sign-in's failure hint while
  unsaved stays too — it only appears when a sign-in actually fails.)
- Verified: build clean, the sentence is gone from the bundle, reload
  error-free. Draft untouched. Nothing was published.

## 178. Sub-admins saves the website by itself

> "if its so important let it automatically do it"

- Opening the Sub-admins card while unsaved now triggers the save on its
  own (the same `requestWebsiteSave()` the Publish flow uses), once per
  visit. A short "Saving the website…" note shows meanwhile; after the save
  + reload invites and sub-admins are permanent everywhere. If the editor
  refuses, the note says to press Save by hand.
- Verified: build clean, bundle carries the auto-save, reload error-free.
  Draft untouched. Nothing was published.

## 179. Switching off asks for the security answer first

> "when the authenticator app is clicked to switch off the security question answer should be inputed before the authenticator app is switched off"

- Flipping the header switch off no longer switches off at once: it opens
  the proof form showing the security question, and Done (a correct answer
  or a current app code) is what actually switches it off (`totpDisable`,
  which also honours legacy spare codes). Flipping it again while the form
  is open closes the form and keeps it on. The one-click `totpOffNow` stays
  on the server for older bundles.
- Verified: build clean, bundle carries the proof form, reload error-free.
  Draft untouched. Nothing was published.

## 180. Switching off takes the security answer only

> "only the security questions answer should be provided not the appcode"

- `totpDisable` now accepts the security answer and nothing else — a current
  app code or a spare code is refused. With no question set there is nothing
  to answer with, so it answers `no-question` and the card points at setting
  a question first instead of offering the form. Sign-in (`login2fa`) and the
  question change (`setSecurityQA`) are untouched — only switching off.
- Verified isolated against the real server script (7/7): app code refused,
  wrong answer refused, the right answer (loose case/spacing) switches off,
  status reads off afterwards, the password alone signs in again. Build
  clean, reload error-free. Draft untouched. Nothing was published.

## 181. The sign-in modal lost its title

> "remove this:Sign in to edit the site"

- The sign-in `Modal` no longer carries that title — the card inside still
  opens with its own "Sign in" heading, so nothing else changes. `Modal`
  itself now takes an optional title (other modals keep theirs).
- Verified: build clean, the sentence is gone from the bundle, reload
  error-free. Draft untouched. Nothing was published.

## 182. Help step trimmed

## 182. Help step trimmed

> "remove this: Nothing on the page itself needs to be clicked."

- That sentence is out of the help modal's second step — the step now ends
  at "change a time or an address."
- Verified: build clean, the sentence is gone from the bundle, reload
  error-free. Draft untouched. Nothing was published.

## 183. Announcement slides get a last day — then clear themselves away

> "in the announcements when a notification time and date elapse delete of the website and clear it from the admin too, so create an elapse date for the slide on the admin when it elapse that date it clears of from the admin and the website too"

- Every announcement slide now carries plain **Expiry date** / **Expiry time**
  pickers (empty = stays until taken down), and the **Announcements** notices
  carry the same pair. No extra wording — just the two fields.
- Three layers do the clearing, so no timing gap shows a dead entry: the site
  never renders a lapsed slide or notice (`visibleSlides`,
  `liveAnnouncements`, both re-checked on the half minute while a page sits
  open); the office's draft drops lapsed rows on load, on every publish of any
  section, and on a half-minute sweep while the drawer sits open (refresh
  deferred past render); and applied content drops them where it lands (each section
  `bind`) — so the next publish forgets them on the server for good.
- Verified live in the preview: a yesterday-dated slide vanished from the
  draft rows and never rendered on the site, while a tomorrow-dated one
  stayed in both; same check for a lapsed notice against the banner.
  Draft restored afterwards. Nothing was published.
- Follow-up: the purge first forgot to mark the section changed, so the next
  server answer rebased the deleted row straight back into the drawer about a
  minute later. The removal is now unpublished work like any other deletion —
  the row stays gone and the next publish carries it to the server for good.
- Follow-up: publishing a single section only purged when it was the slides
  section — now every publish, of any section, clears lapsed entries first.
- Follow-up: cancelling a notice is a three-minute snooze, by request — the tap
  stores `{ id, until }` for the entry and its headline, the strip hides it
  until the time runs out, and a timeout wakes the banner exactly when the
  nearest snooze lapses so it resurfaces on an open page. Entries older builds
  stored as plain ids are ignored, so past cancellations surface again.

## 184. Testimonies and their filters are one section now

> "combine testimonies and testimony categories together, remove what you know is not really important"

- The wall and its filters live in one **Testimonies** section: *The wall*
  first, *Filters* beneath it. Gone: the separate categories section, the
  wordy blurbs, the per-filter colour-name summary, and the photo field on
  wall entries (no shipped testimony uses one; visitor uploads are untouched).
- An early save kept the wall as a bare list — it is folded into the new
  shape on first touch (marked changed, so publishing carries it over), and
  the section also reads that shape, so nothing is lost either way.
- Verified live: merged shape (8 wall, 7 filters), edited a wall entry and a
  filter, reverted both. Draft restored. Nothing was published.

## 185. A memoised page ignored the office's publishes

> monogram edits in the drawer never showed on the page

- Two memos read module lists the CMS re-binds in place on every publish —
  `AnnouncementBanner` in `src/components/blocks.tsx` and `useTestimonies`
  in `src/lib/collections.ts` — but neither subscribed to the CMS version, so
  each kept serving the pre-publish snapshot until a reload. Both now read
  `useCmsVersion()` in their dependency lists, the same pattern the
  announcement slides already used: publishing an edited monogram re-renders
  the testimony cards in place.

## 186. Amen is back, and kinds of grace are office-editable

> "add the amen back to the testimonies but when visitors tap or click it the
> numbers of amen increases, add an option to add and remove the kinds of
> grace in the admin"

- The Amen button is back on every testimony card: a tap toggles the
  visitor's amen and the count rises by one (verified live: 214 → 215, and
  back on untap). The reading modal's large Amen button was never removed.
- The **Testimonies** section's *Filters* list already had Add filter plus a
  per-row Remove; what was missing was everything downstream of adding one.
  `categoryLabel`/`catAccent` now read the live `TESTIMONY_CATEGORIES` first,
  so an added kind shows its own name and colour on cards, chips and stats
  instead of a raw key. The wall entry field is now *Kind of grace*, fed by a
  new `optionsFrom: "testimonyCategories"` resolver, so a kind the office
  just added is assignable without a reload. Verified live end to end: added
  a *Guidance* kind, assigned it to a wall entry, saw the badge and a new
  `Guidance 1` chip — then removed the test kind and restored the entry.
  Draft clean, nothing published.

## 187. The testimony wall holds ten — the oldest makes room

> "the limit for testimony creation in the admin is 10, if admin add a new
> tesitimony the oldest testimony is deleted"

- The wall list carries `maxItems: 10`: the generic list *Add* drops the
  oldest entry (by `createdAt`) when the list is full, and the head counts
  `N of 10` so the office sees the cap. The section `bind` trims to the
  newest ten as a backstop, so an older save can never overfill the wall.

## 188. New testimonies land on top; kinds live in the entry

> "when you click add testimony, you see edit above not below all previous
> testimony ... the add filters should be part of the testimony not seperately"

- The new entry used to land at the foot of eight long forms, 4000px below
  the *Add testimony* button and out of view. A capped list is newest-first,
  so adding now prepends the blank form right under the button.
- The separate *Filters* list is gone from the drawer. Each wall entry now
  carries its own kind manager (*Kind of grace*, a new `testimonyKind`
  field): the select assigns a shared kind, *New kind* adds one (name +
  colour) and assigns it on the spot, and Remove deletes the selected kind —
  blocked with a reason when other entries still use it or it is the last
  one left, with the entry moved to a remaining kind on delete. Labels,
  colours, chips and counts all read the live shared list, so an added kind
  works everywhere.

## 190. The announcement slides go 3D

> "for the announcement slide use react three fiber for display"

- The moving stage is now a React Three Fiber coverflow
  (`src/components/slides3d.tsx`): the current slide faces the visitor
  head-on on a gold-rimmed card while its neighbours stand angled at its
  sides, gliding into place as the space advances on its own, by arrow, dot,
  swipe, keyboard, or a tap on a neighbour. Gold dust hangs behind the cards
  and the band's own backdrop shows through.
- Each face is the office's real slide carried by drei's `Html` — the eight
  DOM designs, palettes, word auto-fit and frame are reused untouched, and a
  face refits its words as it turns head-on. Deep drei imports keep the
  bundle lean; the flat swiper stage stays as the fallback for reduced
  motion, missing WebGL, or a stage that throws.
- Verified live: single slide fills its box (face ≈ box rect, 0.93 fit
  calibration); a two-slide apply shows the coverflow (head-on + angled
  neighbour, dots/arrows/count), with arrow wrap, dot select, neighbour tap
  and 9s self-advance all turning the stage; phone width fits with no
  overflow; `?slides=all` mounts no canvas; forced reduced-motion renders the
  flat swiper. The draft and pending list were left untouched.

## 191. Four displays for the slide space, and no URL id anywhere

> "make the react three fiber give numerous display for the announcement slide. remove every url id from admin"

- The stage now offers **twenty displays** (`SlideLayout` in `src/data/slides.ts`,
  `targetFor`/`FitRig` in `src/components/slides3d.tsx`): coverflow, ring,
  stack, wall, fan, tunnel, helix, wave, cascade, pyramid, vortex, orbit,
  arch, zigzag, tower, horizon, bloom, comet, tide and crown. The space
  shuffles by itself — a different display every turn, never repeating the one
  just shown — with no section in
  the drawer for it: at the office's request the *Slide space display* section
  was removed, so there is nothing to pick and nothing that can get stuck on
  one display. The flat swiper still serves reduced motion. Verified live with
  five slides: nine turns dealt nine different arrangements, and the page was
  left exactly as found (One build-trip noted: a use site that names a new export needs the
  name in the file's import — esbuild leaves the stray name as a global and
  the stage dies with it undefined.)
- At the office's request the shuffle is back across all twenty displays: a
  different one every turn and every five seconds, never repeating, with
  every move eased — cards, rig zoom and parallax camera all damp toward
  their targets — so each shuffle glides instead of jumping. Verified live:
  seven turns dealt seven different arrangements, the timer reshuffles
  between turns, and the page was left exactly as found.
- The dots and the `1 / n` counter are gone from the stage at the office's
  request: the slide keeps its exact full room, and turns happen by arrow,
  swipe, keyboard, tap or self-advance.
  (Second build-trip: a hook's dependency array counts as a read — `active` in the
  shuffle effect's deps fired a TDZ because the state was declared below.
  Hooks that read state must sit under its declaration.)
- All twenty were then forced on one by one and checked live: every display
  mounts every slide at a sane size with zero wild faces. Two real bugs came
  out of it: ring, helix and orbit faced their side cards *outward*
  (`atan2(px, …)` — the plane's normal needs `atan2(-px, …)` to meet the
  camera), so neighbours showed their dark backs, and the ring stacked its
  back cards directly behind the front one — it now lifts them above it.
  (Black cards in two captures were the screenshot tool choking on
  cross-origin images, not the page: every face was present with loaded
  images in the live DOM.)
- The slide area is seamless with the page at the office's request:
  `.split__media` and `.aslides` are both transparent with no rim, shadow or
  blur — only the slide cards themselves float over the website background.
  The WebGL canvas was already transparent (`alpha: true`, no scene
  background), so no 3D code changed. Verified live: faces mounted with
  loaded images, arrows working, no dots/counter, draft and pending untouched.
- The standalone zip seeds its backend with the live site's own published
  content: the preview's rev-49 snapshot (7 sections plus the publish log)
  was exported and written into `data/cms-state.bin` byte-for-byte in the
  server's own format — verified by running the site's actual server code
  against it and reading every section back. First local launch matches the
  preview exactly; later publishes continue from rev 49.
- The admin bar's external-icon button opens the visitor's website in a new
  tab (`https://platform.org/<name>#/` on Platform, the server root on a
  standalone host), falling back to same-tab navigation if the popup is
  blocked. The standalone path router only claims the pathname when there is
  no hash, so that fallback `#/` still lands on the visitor home.
- Every card now eases on three's frame-rate independent damp
  (`THREE.MathUtils.damp` in `CardGlide`): far cards trail near ones for a
  cascade, all cards breathe gently, and new cards pop in with an ease-out-back
  grow — so turns and shuffles glide instead of jumping. Verified live: a turn
  tracked no position jumps, and a mid-glide capture shows the deck fanned
  smoothly in depth.
- **No URL id field is left in the drawer.** The last six left — leadership,
  branches, ministries, events, slides, giving funds — following the notices
  and the messages (notes 104, 124). One helper does it all now: `mintIds()`
  names an id-less entry after itself in `bind` (branch from name or city,
  fund from name, slide from headline), existing ids are kept untouched, and
  duplicates are numbered apart. Proven live: an id-less slide applied as
  `mint-me`, the shipped `welcome-home` unchanged, event form opening on
  *Event title* with no id field, and the *Display* select offering all four
  displays. Office content and the pending list were left exactly as found.

## Non-goals / deliberate choices

- **No visitor accounts or payment processing.** Everything a *visitor* creates (prayer requests,
  library, giving log, visit plan) is stored locally (`localStorage`, key prefix `wom.`), and
  forms that must reach the church open the visitor's mail client / WhatsApp with pre-filled
  content. The one piece of server-side machinery is the **content server** behind `#/admin`
  (see revision 27), which stores published site content — not visitor data.
- The giving page never takes card details and generates no giving reference: a template cannot
  hold a real processor account, and a made-up reference (*quote this with your card / online*)
  reads as a payment that never happened. What is left is the real thing — the
  amount/fund/method chooser, the bank details by region and the finance team's contact.
- Sermon videos are embeddable public teaching messages used as demo content — replace with the
  church's own uploads.
- Photography is AI-generated placeholder imagery, to be replaced by real church photos.

## 192. Online-only sign-in: local preview mode removed, same-PC auto-join, pill renamed (the office asked)

> still getting this [not-connected banner]. This device only button should be not connected, when
> successfull sign in the green connected. i should be able to login online, clear the login
> through local

Three changes, all in service of one rule - editing takes an online sign-in, nothing else:

- The connection pill offline label is Not connected now, not This device only (StatusPill in
  src/components/editor.tsx). Online is still the green Connected.
- The passwordless local preview mode is gone: localMode removed from src/pages/Admin.tsx
  (canEdit = state.authed), the Continue in local preview mode link removed from LoginGate,
  and the unused onLocal/onSignOut prop thread deleted. The locked drawer already gates on
  canEdit, so a signed-out admin gets the sign-in prompt. Mid-session disconnects still queue
  into pending and sync back (that path is resilience, not a back door).
- The sign-in card joins the server by itself: it pre-connects on open, every sign-in attempt
  goes through cms.ensureOnline(), the address re-resolves fresh each time (baked file +
  override + remembered same-PC office + live loopback probe in src/lib/remoteserver.ts), and
  the last failure reason stays in cms state (connNote) for diagnosis.
  Opening the public site on the office computer itself finds its server over loopback with
  nothing typed - scripts/serve.mjs answers the private-network preflight for that.
  Verified live: default-password sign-in, stale-generation auto sign-out, and re-sign-in.

## 193. The last message reads first everywhere; new uploads top the drawer too (the office asked)

> fix the last message: the last message should be the first that is on the sermon list. every new
> sermon or new add another should be the first on the sermon list and should be the last message

Two defects, one rule - whatever the office added last is the latest message, and it reads first:

- Same-date ties buried new uploads. A message dated today and the standing message derived from
  the same Sunday both read 11:30, and the old date-only sort kept stored order - the new upload,
  stored last, read last. sermonsNewestFirst (src/data/sermons.ts) now breaks ties towards the
  later-stored entry. Every surface funnels through it (archive, home latest, watch-live last
  message, detail pager), and the archive re-sort is stable so it keeps the fixed order.
- The drawer kept unfinished uploads at the foot. Its sermon order (ListBlock, src/pages/Admin.tsx)
  is now one date-descending sort with the same later-added tie-break, so a new Add another sits
  at the top at once; rows not on the live site yet carry a gold Unpublished pill (new
  admin__pill--gold in src/styles/admin.css). Display order only - nothing stored ever moves.
  Verified live: added an upload (first in drawer, Unpublished), published it in the emulator,
  and it topped the archive, the watch-live last message and the home latest. Preview test data
  cleared afterwards; nothing published and no real state touched.

> Superseded by note 194 below — the office wants the previous arrangement back.

## 194. Back to the previous sermon arrangement; a published upload always reaches the top (the office asked)

> i dont want this, what i want is the previous but there was an error with the arrangement on the
> list that affected first new sermon and put it underneath. fix

Note 193 is fully reverted — the drawer reads as notes 145/146 describe it, and the website reads
exactly as it did before:

- The drawer's sermon list (`order` in `ListBlock`, `src/pages/Admin.tsx`) is split again:
  published messages newest-first by the date the site reads on top, uploads still being worked on
  waiting at the foot in the order the office left them. The gold Unpublished pill is gone (row and
  `admin__pill--gold` in `src/styles/admin.css` both removed). Display order only — nothing stored
  ever moves, and every action still runs on the stored entry. Move up/down stays hidden on sermons.
- The website is untouched again: `sermonsNewestFirst()` (`src/data/sermons.ts`) is back to a plain
  date sort, so same-date ties keep stored order on the archive, home latest, watch-live last message
  and detail pager, exactly as before.
- The error is fixed in `isPublishedEntry` (`src/lib/cms.ts`): recognising a published entry by id,
  or by whole-content match, missed the moment publishing mints ids on the way live — the draft in
  hand can still carry a blank id while the live copy already has one, so a just-published upload
  read as unpublished and stayed underneath at the foot. The content match now also compares with
  the id aside, so the moment an upload's words equal what is live it joins the date order at the
  top, in the same session, before any re-read.

Verified read-only in the live preview (the preview is connected to the shared server with the
office's own publish in flight, so nothing was added, published or cleared there): no console,
platform or syntax errors; the drawer sermon list renders with no Unpublished pills; rebuilt
clean and stale chunks deleted. Nothing was published and the office draft was never written.

## 195. The newly published sermon is the last message; lists follow publish date and time (the office asked)

> the new publish should be the one on the last message and the sermon list should be arranged
> accordingly to date and time of publish

Each sermon now carries when it went live. Publishing stamps every sermon that is new with that
exact moment (`publishedAt`, in `stampSermonPublishTimes` in `src/lib/cms.ts`), on all three ways
a publish happens — one section, the whole draft, and the offline staged path — and the stamp goes
on the draft and the payload together, so the upload joins the top in the same session. Sermons
already live are never restamped, so fixing a typo never knocks anything off the top. The order
everywhere (`sermonPublishTime` in `src/data/sermons.ts`: publish moment first, the preached date
for anything stamped before this existed) now runs the drawer list, the archive and its featured
spot, the home latest, the watch-live last message and the detail pager — whatever the office
published last reads first. Unfinished uploads still wait at the foot of the drawer.

Verified headlessly against the real code (esbuild bundle of `src/data/sermons.ts` run in isolation):
legacy date order unchanged, a freshly stamped upload sorts above same-day messages, archive still
19 entries with its top unchanged; live preview re-rendered with no console, platform or syntax
errors. Nothing was published and the office draft was never written — the connected preview holds
the office's own in-flight publish, so no add/publish test was run there.

## 196. Removed the leftover test uploads sitting on top of the sermon list (the office asked)

> from overcoming the world clean the remaining sermon list at the top

Three unpublished-looking rows sat above the real messages — `Test Last Message` (Test Speaker) and
two untitled `New sermon` uploads, all with blank ids. They were not just local draft: all three
were on the shared server, dated this month, so every list opened with them. All three are deleted
and the removal is published: the drawer and the archive again open with the real messages
(`Overcoming in Christ` first), 19 sermons total. The two blanks both pointed at the same video
(`https://youtu.be/1F_nfBYYoco`), kept here so it can be filed again as a proper titled sermon.
Verified live in the connected preview: published list 19 entries with none untitled, drawer and
archive tops read the real messages, nothing else pending. The office's other pending edits were
never touched.

## 197. New code reaches every browser: versioned bundle URLs (the last-message fix needs this)

> the new sermon should be on the last message after it is published. fix this

The publish-time ordering (note 195) was verified in the code and the bundle, yet a newly
published sermon still did not take the last message. The cause is staleness, not ordering: the
page loads `src/bundle.js` and `src/bundle.css` under fixed names, so a browser holding a cached
copy keeps publishing with the old code — which stamps nothing — and the sermon falls back to
date order. From this build on, both URLs carry a content hash (`?v=…`, stamped by
`src/tools/build.mjs` after every rebuild, idempotent), so an update is picked up on first load;
the split chunks were already content-named. The prebuilt `site-deploy.zip` pages got the same
hash on their bundle references when repacked. Anything published before this reaches a browser
still follows date order — republishing it (or any new publish) stamps it and it takes the last
message at once. Verified: rebuilt, the live preview re-rendered from the hashed URLs with no
console, platform or syntax errors. The generator itself still needs its normal save for any of
this to reach the public page, and a self-hosted copy needs the fresh `site-deploy.zip`.

## 198. A published sermon always outranks the standing Sunday message (the office asked)

> it is still the same the last publish was the newsermon but it is not still on the last message

The stamp was landing (the published upload carried `publishedAt`), but it still lost: messages
without a stamp fall back to the preached date, and the standing message derived from this same
Sunday reads 11:30 — later than a real publish at, say, early morning — so the new upload sorted
underneath it. The order now ranks first and compares second (`sermonRank` in `src/data/sermons.ts`):
anything with a publish moment always reads above anything without one, and publish moments
compare among themselves. The drawer, archive, home latest, watch-live last message and pager all
share it. Legacy order is untouched. Verified headlessly (a stamped upload tops the standing
Sunday message, legacy order preserved, a second publish tops the first) and against the live
shared data (the office's stamped upload reads as the latest message and first card). Note: that
upload is still untitled, so it shows as `New sermon` until the office names it.
## 199. Publish history cleared; code comments slimmed (the office asked)
> make sure history is clean until new publish, make the codes clean and make the comments in all the code simple and not too much
History: the Status tab's publish history was cleared (Clear history, double-pressed inside the arm window) — "Nothing has been published from this console yet". The next publish re-records from zero. Comments: every comment over four lines across sources, components, data, styles and tools condensed to one short line (SPEC pointers kept as `note N`). No code was changed. Verified: rebuilt with no orphans and no unresolved imports, live preview re-rendered with no console, platform or syntax errors.
## 200. Sign-in after sign-out kept failing (the office asked)
> after my first sign in i can not sign in again — "not reachable", stuck Reconnecting
Three traps in the join path: a dead-but-kept socket made every retry a no-op; sign-in failed fast on `offline` instead of joining; a hanging open never timed out. Fixed: user joins drop the dead socket, reset backoff and connect fresh (`retryNow`), a hanging open ends after 9s, stale attempts can't clobber a live one, no server means stand-alone (rejoining quietly later). Verified: three sign-out/in cycles in the preview, Connected throughout. Rebuilt, repacked.
Deployed copies stand alone with no server to check the password (see DEPLOY.md), and nothing on the
sign-in card could point one at the office server — so the card now has an Office server field
whenever it is not connected: paste the address, Connect, then the password. (`retryNow`,
override wrappers in cms.ts, `ServerConnect` in editor.tsx.)
## 201. VPN moves now move time and money; shader unburied (the office asked)
> i tried connecting a vpn but it still didnt change the time and the currency, i also notice liquid glass and shader gradient are not active
Two faults. VPN: the IP answer was cached twelve hours, so a VPN taken afterwards never re-asked. The cached clock now carries the public address it was looked up for (`ip`, v6); a one-question address check on load, wake, focus and every quarter hour re-asks when it moved, dropping the stale answer first so a failed re-ask reads the church clock, not the old country's. Rates refetch when the currency moved (`startedFor`). The proxy echoes the arrival address on `/__geo`. Glass/shader: the shader was never visible — its canvas sits at z-index -1, which paints *below* body's own background, and the body was opaque. The aurora base now lives on `html` with `body` transparent (both themes, both sheets), so the canvas shows; without WebGL the canvas is removed and the same gradient on `html` is the background. Verified: TS transforms clean, shader compiles and paints varied pixels live, glass blur computed on a card. Note: redeploy and clear the phone cache — a build from before the glass/shader pass shows neither.
## 202. The 3D box holds faces, turns on demand, idles back to revolve (the office asked)
> for the 3d box announcement slide: if i tap or click on the box it remains static on one the face of the box, when you swipe or you click left, right, up down in the areas of the box it swipes to the next face of the box, if no activities around the box for 3 mins it continues its default location, the default faces of the box should be the church logo and to revolves around the light and dark mode background
Four behaviours. Tap: a tap/click on the box settles it onto the nearest face and it sits truly still (bob frozen, no drift) — the old tap-to-kick is gone. Turn: sideways swipes, the left/right zones and arrow keys step one face around the sides; vertical swipes over the box, the new top/bottom zones and up/down keys step over the top and bottom faces (from the caps a sideways step comes back down to the sides). Idle: any touch restarts a three-minute clock; quiet that long and the slow default revolve resumes on its own. Faces: any face with no picture carries the church logo, and with no slides posted the box is all logo in the same frame. The canvas stays transparent so the box revolves against the page's own light/dark background, and the stage light follows the theme (brighter in light). Verified: TSX transforms clean, face math headless (every snap lands head-on, four side-steps close the loop, up/down returns), no leftover kick/touchX references.
## 203. Hero photos lifted out from under the scrims (the office asked)
> make the image in the hero sections visible especially for the light mode its looking too blur
Two faults. A literal one: the faint texture carried blur(1px) in both themes — gone. And a cascade one: glass.css re-stated near-opaque dark scrims for .hero__scrim and .page-head__bg::after with no light override, and it loads after pages.css, so light mode wore the dark wash too — both rules removed (pages.css owns the scrims per theme). Light hero: photo 0.12 multiply (a grey wash) to 0.34 normal blend, faint 0.55 to 0.4 with no blur, scrims and copy halo softened. Dark hero: photo 0.34 to 0.52, faint blur gone, scrims eased. Inner page heads: photo 0.22 to 0.4, both scrims eased. Copy keeps its own readability halo in both themes. Verified: CSS balanced, repacked.
## 204. Hero photos cross-fade with the theme flip (the office asked)
> but make it sync with the light and dark mode
The photo treatments snapped while the theme flips every 30s. Gradients cannot transition, so each scrim is now two always-present layers cross-fading in opacity: hero dark scrim out / light scrim in (on .hero__bg::after), the parchment band fading in over the dark base (.hero::before, copy untouched at z2), and inner page heads the same pair of layers. Photo and faint-texture opacity/filter ease over 0.6s with the flip; reduced-motion visitors switch instantly. Verified: CSS balanced, repacked.
## 205. Box turns left/right only, faint zones, every face upright (the office asked)
> let the box swipe be just left and right. and for desktop create a faint button to be clicked that can be used to move right and left. note that swipe or clicking right and left should show all faces of the boxes and the content of the faxes of the boxes should never be upside down
Swipes are sideways-only (up/down is page scroll again) and the up/down zones are gone; the side zones sit faint over the stage (a whisper until hover/focus on desktop). Left/right walks one ring through all six faces — front, right, top, back, bottom, left — so every face is reachable either way. Upright is by construction: each resting orientation is a fixed quaternion and the caps carry a corrective half-turn about the viewing axis, verified numerically (every face normal to the lens, top edge up). The default revolve is yaw-only, so passing words never tip either. Verified: TSX clean, no dead tilt/zone references, ring steps 90/120/90/90/120/90, repacked.
## 206. Home banner photo replaced with the office's choir shot (the office asked)
> correct the image in the hero section its should be this image [choir on stage]
src/assets/img/hero.jpg replaced with the uploaded photo (choir in white on a lit stage with red rigging). Still swappable from the console under Main photos → Home banner; still cross-fades with the theme treatments (note 204). Verified: byte-identical copy, repacked.
## 207. Hero photo cleaned and lifted to 4K width (the office asked)
> the image i saw looks like it has a shadow fix this, it should be a clean 4k image
Two parts. The "shadow" was the dark readability scrim — eased to 0.55/0.42/0.85 so the photo reads clean (copy keeps its own halo). The file was a 1080x604 WhatsApp compress (~66KB), soft when stretched full-banner: re-rendered at 3840x2148 with high-quality resampling plus a touch of contrast/saturation, saved at high-quality JPEG (~645KB). Honest limit: resampling cannot invent detail the lens never captured — for true 4K crispness, upload the original camera photo (console → Main photos → Home banner) and it ships as-is. Verified: dimensions and bytes, CSS balanced, repacked.
## 208. Box faces carry the full slide content; dots added, zones brightened (the office asked)
> during the swiping and clicking on the box slide, as it swipes it take the box faces of the front images but all the content in the six faces shows. i did not see the clicking button for the deskop mode
Two gaps. Faces showed the bare pictures while the flat stage shows composed slides: every face is now painted on a canvas with its slide's own headline, line and button words over the picture (one legible face treatment, always upright; logo faces and wordless pictures unchanged; a picture the browser will not share with WebGL falls back to words on dark rather than blanking). Zones were too faint to find (0.22 on hover-capable screens): now plainly visible at rest and full on hover/focus — plus six face dots under the stage that jump straight to any face and track the face on show (new goTo/onFace). Verified: TSX clean, wrap math and paint path headless, repacked.
## 209. Faces stay upright, zones always on, city + language follow the IP (the office asked)
> during swiping and clicking for the box slide, it should never result to the first image posture, it should always retain the second image posture. the left and right arrow button for the desktop mode is still missing, the desktop mode needs it for its swipe for devices that does not support screen touch. then for the ip addresses it should affect the town or city (e.g. lagos should change to the ip address city) the 1d 6h 34m should be affected by the ip address too, all text in the website should be affected by the language spoken in the ip address
Four fixes. Posture: the upside-down face was a wrong texture-top assumption on the caps (the geometry puts the top edge at -z/+z, not as assumed) — measured against the box geometry's own UVs, the corrective half-turns removed, all six rests verified upright, and the walk reordered front-top-right-back-left-bottom so every step is short (90-120°) with no flip-swing. Zones: the arrows and dots now render on every 3D stage (they used to hide with one slide) at unmissable strength. City: the gathering card reads the visitor's IP city (Lagos becomes London on VPN) with the time already converted; the countdown targets the same service moment worldwide, with its day/units translated. Language: new lib/i18n — IP country names a language (80+ mappings), every copy line is translated through a keyless endpoint in small newline-joined batches, cached per language, swapped in progressively; placeholders ride as tokens and a mangled line falls back to English. Nothing blanks, nothing blocks paint. Verified: UV ground truth, six-upright check, step angles, endpoint shape live (single-q only — batches newline-joined), TS clean, repacked.

## 210. Desktop arrows never hide (the office asked)

The desktop arrow is the swipe equivalent, so it stays. Flat fallback: the `multi` gate is gone — Swiper builds with even one slide and the arrows render unconditionally with keys still wired. Empty logo box: arrows plus six dots added (was bare). CSS: 3D arrows at full opacity with a fine-pointer rule pinning `opacity: 1; visibility: visible` so no hover-only or fade-out path remains. Verified: no `multi` references left, repacked.

## 211. Arrows breathe toward their direction (the office asked)

Each arrow's icon nudges toward its own side (prev left, next right, 1.6s alternate) via CSS keyframes on the inner svg — the button's centring transform and tap spring are untouched. Pauses on hover/focus so it steadies under aim; off under prefers-reduced-motion. Verified: repacked.

## 212. Four-sided stage, dots removed, phones get the verse graphic (the office asked)

Three parts. (1) The stage is four sides only — the ring is front-right-back-left quarter-turns of level yaw, so the top/bottom are never rested on and words can never tip; past four slides the faces carry the first four, caps carry the plain logo, and the idle revolve is unchanged yaw. (2) The face dots are gone everywhere (JSX, onFace/goTo plumbing and CSS removed) — the always-visible animated arrows are the swipe equivalent. (3) Phones show the office's verse graphic (new src/assets/img/hero-mobile.jpg, console-swappable under Main photos as Home banner (phones)) instead of the desktop banner; its baked-in words melt into a soft wash (blur + dim) while the page renders clean Stream-details and verse text with clear air between them (8rem hero foot, 1.8rem meta gap, verse wraps to three lines instead of hiding). Verified: no dots/goTo/onFace references left in code, repacked.

## 213. Name, addresses and emails never translate (the office asked)

All prose still converts to the visitor's IP language, but identity stays: new keeper registry in lib/i18n (setProtectedValues) holding the church name/short-name, every address (headquarters + all branches) and every email (+ bare mail domains); any copy line carrying one — or any email-shaped token — is never sent, and lone-word tx() honors it too. App refreshes the list on every language/content pass; keeper lines already in old caches are unseated live, and the cache version moved v1→v2 so stale converted names/addresses are dropped outright. Verified: read-back of the keeper block and call site, repacked.

## 214. Visit wizard pills renamed (the office asked)

Plan-a-Visit step pills were "Your branch, Your service, Your party, Almost there" — now "Your branch, Your direction, Your service, Your worship" in that order (autocopy defaults + editor labels; wizard flow and indexes unchanged). Verified: repacked.

## 215. Previous visit wording removed totally (the office asked)

The last "Your party" (visit-pass summary row) is now "Your worship", and the plan summary's hardcoded "Party:" line reads "Worship:" — no previous pill wording ("Your party", "Almost there", "Party:") remains anywhere in code; only this history note quotes it. Verified by search, repacked.

## 216. Backup + Restore under Sign out (the office asked)

Tools now has Download a backup and Restore from a backup cards below Sign out. Backup downloads the latest PUBLISHED content only (new cms.exportPublished — draft edits never leak in) as a dated world-overcomers-backup JSON. Restore uploads a backup file and loads it as a draft for review-then-Publish; visible-only rule enforced two ways: unknown top-level sections are stripped and named in the success message, and the existing merge already drops stored fields/lines this update no longer carries (object keys, fixed copy lists) so cleared things stay cleared. Legacy exportSnapshot/importSnapshot untouched. Verified: new engine + UI call sites present, existing icons only, repacked.

## 217. Backup/Restore card wording trimmed (the office asked)

Removed the two sentences from the Tools cards ("After an update changes the site…" and "Anything the update cleared away…"). Behavior unchanged — restore still only brings back what this update carries.

## 218. Language choice popup + everything follows it (the office asked)

Non-English IPs are now ASKED: a bottom card offers their own language (by its native name, 60+ covered) or Keep English, plus Not now (hides till next visit); the pick persists across visits and the site stays English until they answer. Choosing moves the whole site: copy lines progressively (as before) AND all data text — sermon/event/ministry/testimony titles and bodies, verses + refs kept, readings, FAQs, funds, methods, categories, branch roles/schedules/gathering names, notices, announcements slides (flat words and 3D-painted faces, repainted per language), footer tagline, stats, library lists. tx() now micro-batches (one request per burst, newline-safe) instead of one request per string; keepers still hold (name/addresses/emails never convert). Verified: every tx( call site imports from lib/i18n, no local tx collisions, repacked.

## 219. Next-service day, time, countdown and city all follow the visitor's IP (the office asked)

"Wednesday, 6:00 PM, 1d 1h 44m, and everything that has to do with it" is now IP-determined everywhere it appears. The day and hour already came from the visitor's own clock (clockHere over siteTimezone, note 85) and the countdown is one worldwide instant with translated units — but three places still printed the church's own city next to them, and five printed the day or gathering name outside tx() so they stayed English while the IP said French. Fixed: the header pill, the Home hero line and the Watch live panel all read (visitorPlace() || HQ.city) — Lagos reads as London the moment the address moves, exactly as NextServiceCard already did; the Watch panel's gathering name and day, the Home branch strip, the ServiceTimesList, the Prayer side card and the Visit chooser all go through tx(). Reactivity is free: App mounts useVisitorClock at the top and every next-service spot ticks with useNow, so the IP answer repaints the whole site within a second of landing, VPN mid-visit included (note 98 recheck). Verified: four visitorPlace() || HQ.city sites, no raw DAY_NAMES or gathering-name renders left outside tx() except the office-facing cmsSchema itemMeta, repacked.

## 220. Service and event times follow the visitor after the language choice (the office asked)

Choosing the IP language in the popup now moves the times too, not just the words. Dates and clock times used the device's own locale (toLocaleDateString(undefined, …)), so a French-choosing visitor on an English phone still read English dates. New siteLocale() in lib/store (the chosen language code — already a valid Intl locale — else plain English) feeds fmtDate, fmtTime and relativeTime, so every service gathering, event date, sermon/testimony date and the Today chip renders in the picked language the moment it lands (the root i18n tick already repaints the site). The Events month grouping recomputes on language change; the featured title/description, list titles/descriptions and weekday badges, the recent-service "ago" fallback, the giving-log fund names and the watch-live number-words all go through tx(). One regression guarded: the devotional reflection box was keyed by the formatted date, which now moves with language — it is keyed by the stable calendar date (todayKey) instead, so saved text never orphans. Office-truth stays office-truth: open/closed state still reads the head-office clock with its zone labeled, and emails/calendars/downloads keep the office's own words. Verified: no fmtDate/fmtTime key or id use left (only display strings), no store/i18n import cycle (i18n imports react only), repacked.

## 221. Library stat cards trimmed (the office asked)

The three trailing stat cards are gone — reading-plan days, answered prayers logged, and giving recorded. The row now reads saved / watched / notes only. The underlying data is untouched: the activity tab still lists prayer requests, the reading plan and the giving log exactly as before. Verified: hooks and imports all still used below the fold, repacked.

## 222. Stray brace in App.tsx broke `npm run dev` (the office asked)

`npm run dev` failed at esbuild's dependency scan: `Unexpected "}" src/App.tsx:131` — a leftover extra closing brace after the LangAsk language-popup component (it predates recent edits; the scan stops at the first error so nothing else could even load). Removed the one brace; all 65 source files re-parsed clean with a TSX parser. Repacked.

## 223. Service notepad + note save/download buttons (the office asked)

Sermon notes gained a bottom-left *Save to library* button beside the character count and download (notes already persist on keystroke; the button confirms it with a toast). Every note in the library's notes tab carries its own download button now, and service notes live there too. The *Service notes* arrow on Watch live opens a real notepad — the same pad as a sermon's, keyed per gathering (serviceNoteKey: occurrence date on the church clock + slot name, so each service opens fresh), with save-to-library and download, plus a link to the week's message. Storage is the visitor's own device (wom.serviceNotes, cleared by the library reset like everything else); the existing saved/watched/notes stat cards already count total saved notes, so no new card was needed. Repacked.

## 224. Fourth library card: service notes (the office asked)

The stats row is four again — saved sermons, watched, sermons with notes, plus service notes (count of service-notepad entries with text in them), in the same gold-card style. New hand-written copy line library.stats.serviceNotes ("service notes"), so the office can reword it and it translates like the rest. Grid now runs 2-across on phones, 4-across above that (the old 6-column wide rule belonged to the six-card row). Repacked.

## 225. Force every word through the IP language (the office asked)

Only the granted exceptions stay English now — the church's name, street addresses, person names, numbers/currency codes and anything that leaves the site (emails, calendar files, downloads). Everything else converts, including the lines that used to resist: multi-line copy (its newlines broke batch alignment, so whole paragraphs never translated — they ride masked now), lines holding an email or link (the address/link hides under a token while the prose around it converts, then is restored byte-identical), over-long office texts (split into token-safe pieces, translated, rejoined), and batch-mangled lines (each gets one solo retry). Display gaps closed too: video-player titles, search-result titles, country names/chips, spoken languages, category labels, costs, durations, distances, number formats/dates (visitor locale), result counts (no more raw English plural "s"), visit party/accessibility labels, department rows, serving values, scripture accordion, prayer texts, "Anonymous" seed names, watch-live platform joins and sermon card titles/durations. Verified: all files parse, repacked.


## 226. Service-notes popup downloads instead of linking out (the office asked)

The bottom pill in the *Service notes* notepad on Watch live was a *Notes & discussion* link to the message page — it is now a *Download note* button that downloads the notepad text as a .txt file the moment it is tapped (same per-gathering filename as before). An empty notepad answers with a short "write a note first" toast instead of handing over a blank file. The duplicate small download beside the character count is gone so there is only one download to find. The message-page link is removed from this popup only; the last-message card above it still links to the message. Verified: WatchLive parses, repacked.


## 227. Slides turnover, themed arrows, scroll-top pill, slide-field cleanup (the office asked)

Five together. (1) The announcement-slide field *The button goes to* lost its helper line about /visit, /events and full addresses — the label and /visit placeholder stay, the paragraph underneath is gone. (2) The slide picture preview in the editor shows the whole picture in the slide's own 4:3 frame (contain) instead of a cropped cover strip — on phones it used to read as only half the flyer (a full-width 128px strip); desktop shows a 220px frame, phones the full width, both at 4:3. Uploads already re-cut to the 1600x1200 frame on the way up, so the preview now matches what the stage carries. (3) The 3D stage's four faces walk through every announcement on their own every 9 seconds — the flat fallback's rhythm — instead of carrying only the first four; a tap still settles the box onto its nearest face, but the faces keep turning over underneath, so the stage moves like a normal slider with no swipe or arrow. Hover/focus/touch holds freeze the turnover, like the flat stage's pause. (4) The slide arrows take the page theme: light glass pill with dark ink on light pages, the dark glass as before at night. (5) The scroll-to-top pill (already mounted on every page, appearing once scrolled, smooth-scrolls to top on tap) takes the theme too — light glass by day, dark glass by night. Verified: edited files parse, repacked.


## 228. Tools-card buttons fit their card (the office asked)

On desktop the *Undo the last publish* button spilled past its card's edge and was clipped there: every `.btn` carries `white-space: nowrap`, and the tools grid columns can run narrower than the words. Tool-card buttons now wrap inside their own card (`max-width: 100%`, normal wrapping, left-aligned) and the cards themselves can shrink to their column (`min-width: 0`). Nothing else moves — labels unchanged. Verified: repacked.


## 229. Bottom-only scroll pill; slide button rows out of the admin (the office asked)

(1) The scroll-to-top pill is mounted once in SiteApp, so every public page already carries it — but it used to appear after any scrolling. It now appears only when the page is at its bottom (within ~160px of the foot, on pages tall enough to scroll), and one tap smooth-scrolls to the top. `useScrollProgress` gained an `atBottom` flag for it; the header's own scrolled/progress behaviour is untouched. (2) The announcement-slide editor lost both button rows — *Button words* (with its helper) and *The button goes to* (/visit placeholder). The data model is untouched: slides already carrying button words keep them on the site, and the list's meta line still names them; the office simply cannot add or change them from the admin anymore. Verified: edited files parse, repacked.


## 230. Top light streak gone; scroll pill is gold (the office asked)

(1) The thin gold-crimson progress streak fixed to the very top of the page — the light line that grew while scrolling — is removed (element and styles), so nothing flickers over the top bar on scroll. (2) The scroll pill is now solid gold with a dark arrow in both themes (no blur, no theme-tinted glass to lose it against the page), a touch larger with a stronger gold shadow, and renamed to `scroll-pill` so browser content-blocker annoyance filters that hide `to-top` buttons can never swallow it. Behaviour unchanged: every public page carries it, it appears only at the page bottom, one tap returns to the top. Verified: edited files parse, repacked.


## 231. Scroll pill animates (the office asked)

The gold pill now pops in with a small spring (rise + scale) each time it arrives at the page bottom, its arrow breathes upward, and a soft gold ring ripples outwards every couple of seconds — all pausing under the finger/hover. Reduced-motion visitors get the still pill: all three animations switch off under `prefers-reduced-motion`. Verified: repacked.


## 232. Theme stays put — the flashing top bar (the office asked)

The white flash over the top bar while scrolling was the 30-second showcase cycle flipping the whole site dark ⇄ light on its own (the video caught it sitting in light mode with the pale sticky header). The cycle is removed: dark is home and it holds — the theme now changes only when the visitor taps the sun/moon, and the pick is remembered on the device across loads (the stored pick is no longer wiped on load). The 3D stage and every themed surface still follow manual toggles exactly as before. Verified: edited files parse, repacked.


## 233. Self-hosted fonts — full local copy (the office asked)

The site no longer fetches type from Google: all 22 files both families use (Cormorant Garamond 400/500/600/700 + 400/600 italics, Inter 300–700, latin + latin-ext each) live in `src/assets/fonts/`, loaded by 22 `\@font-face` rules at the top of `styles/global.css` with the exact upstream unicode ranges. latin covers French/German/Spanish/Portuguese; latin-ext covers Yoruba/Igbo dotted letters (ẹ ọ ṣ) and the rest. The Google Fonts links are out of index.html, so pages read identically offline or on the office computer with no internet. Everything else online already degrades: no IP answer → church clock + church currency (visitor.ts), no rate feeds → the dated snapshot in data/currencies.ts (rates.ts), no live-check answer → treated as off-air (livestatus.ts). Streams, video stills, maps and share links inherently need the internet and stay remote. Verified: no googleapis reference left, all font files on disk, repacked.


## 234. Mobile-like slim scrollbars on desktop (the office asked)

The chunky desktop scrollbar (light track, arrow buttons) is restyled everywhere to the slim mobile look: thin gold thumb on a transparent track, no arrow buttons, matching rules for Chromium (`::-webkit-scrollbar*`) and Firefox (`scrollbar-width: thin`). Verified: repacked.


## 235. Scroll pill that cannot miss (the office asked — VS Code check)

The pill missed its cue in the office's own browser, so it no longer trusts a single scroll reading: it now runs two independent signals — scroll listeners on window and document (capture) reading every scroller (window.scrollY, documentElement and body), plus an IntersectionObserver watching the footer itself, which fires no matter which element scrolls or when late content grows the page. Either signal shows the gold pill at the page bottom on every page (public and admin both mount it); short pages still never show it. For the VS Code before-deploy check, `window.__pillState()` in the browser console reports the live scroll numbers (top/client/full/max/remaining). Same code ships to dev and production, so a VS Code `npm run dev` check is the production behaviour. Verified: parses, repacked.


## 236. Reference-style scrollbar; arrow-led scroll pill (the office asked)

(1) The scrollbar now matches the reference shot: a thin pale line on a transparent track with no arrow buttons, same slim shape on desktop and mobile (Chromium + Firefox rules; phones keep their native overlay feel). The tone adapts per theme so it stays visible — pale on dark pages, mid-grey on light ones. (2) The scroll pill stays a gold disc (visible in both themes) but the arrow leads: larger arrow (22px) bouncing upward inside the disc, pop-in on arrival, rippling gold ring — all pausing on hover/touch, off under prefers-reduced-motion. Still bottom-only: it appears solely at the page foot on every page. Verified: repacked.


## 237. No bars inside containers — page edge only (the office asked)

Only the page itself draws the reference-style thin pale line now: every inner scroll area (menu dropdown, modals, search palette, tab strips, panels) hides its own bar via a global non-root rule, so no bar ever sits inside a container — those areas still scroll by swipe, wheel and keys. The menu dropdown's own gold thin-bar rule is retired too. Verified: repacked.


## 238. Sample-style square scroll button, two-screenful trigger (the office asked)

The scroll button now matches the office sample: a square ochre block (12px corners) with a thick white chevron, same in both themes. It pops up with the spring entrance once the visitor has scrolled past two screenfuls, and the chevron bounces upward inside the block while it waits (pausing on hover/touch, off under prefers-reduced-motion). The footer watch stays as the second signal and covers short pages. The old ripple ring is gone — the sample is plain. Verified: repacked.


## 239. Circle scroll button that follows the theme (the office asked)

The square ochre block is now a circle that takes the page theme when it pops up: dark glass with a gold chevron at night, light cream with a dark-gold chevron by day. The thick bouncing white-on-ochre look is gone; the pop-in, chevron bounce and two-screenful trigger are unchanged. Verified: repacked.

## 240. Button above everything; seamless slide turnover (the office asked)

(1) The circle button now sits at z-index 950 — above every image, text, menu and modal on the page (only the temporary language popup is higher) — still fixed bottom-right on every page, popping up past two screenfuls with the footer covering short pages. (2) The rotation hiccup on slide change is fixed at its cause: the old code freed each face texture while it was still showing and swapped faces in one by one, so every turnover flashed. The new set of faces now paints fully offscreen and swaps in with a single update — old faces stay up until the last new one is ready — and replaced textures are freed only after the swap. Verified: edited files parse, repacked.


## 241. Tap advances at once; every slide holds 15 seconds (the office asked)

A tap or click on the box now turns the next face to the front immediately and hands straight back to the auto-slide about a second later — the revolve picks up exactly where the turn lands, so there is no jump and the stage never sits still. Each slide shows for 15 seconds, on the 3D stage and the flat fallback alike (CONTENT_MS and ADVANCE_MS both 15s). Verified: edited files parse, repacked.


## 242. Backups carry every photo; restore brings them home (the office asked)

The downloaded backup is now words plus pictures in one file: every office-server photo/video the published content points at rides inside as embedded data, and a restore writes each one back under its exact stored name (new `__restore-file` server endpoint, same file rules as uploads, foreign names refused) — so restored words point at working photos from the first Publish, with no re-linking. Anything already missing at backup time, or that fails to write back, is named in the toast. Old backups without embedded files still import; their words point at whatever the server still holds. Untouched: uploads are never deleted server-side (kept in data/uploads/ until the office removes them), and remote links (video pages, stills, pasted addresses) travel as words as before. Verified: edited files parse, repacked.


## 243. Admin can delete uploads for good (the office asked)

Uploads now live until the office says otherwise: beside *Use the original photo* and *Remove the video* sits a two-tap *Delete photo/video from the office* control (only on office-server uploads — bundled photos and pasted links never show it). Confirming deletes the file off the office disk via a new `__delete-file` endpoint (same naming guard as the other file endpoints), clears the field, and afterwards the file simply stops riding in backups; publishing takes it off the site everywhere it was used. Verified: edited files parse, repacked.


## 244. Build stamp, footer re-resolve, theme coerce (the office asked)

Three guards so a stale or damaged state can never read as a fault again. (1) Admin → Tools carries a *Which update is running here* card showing the shipped update number and date, mirrored on `window.__womBuild` in the browser console — if the live site shows a lower number than the latest zip, the host is still serving the old copy: rebuild and re-upload dist/. (2) The scroll button re-resolves the footer 1.5s after paint, so late content growth can never leave its footer watch guarding nothing. (3) The theme hook coerces any stored value that is not exactly dark or light back to dark, so the site can never wake up stuck in a half theme; manual sun/moon taps still hold and are still remembered. Verified: edited files parse, repacked.


## 245. Scroll button shows after one screenful; every scroller goes home (the office asked)

The button stayed hidden through ordinary phone scrolling because it waited for two full screenfuls — which read as missing. It now pops up after one screenful; the near-bottom and footer-watch rules are unchanged, and short pages still never show it. One tap drives window, documentElement and body to the top, so embedded or late-grown pages still land on top. Verified: trigger-matrix harness, edited files parse, repacked, image proof attached.


## 246. Scrollbar exactly like the office reference (the office asked)

The page-edge bar now matches the reference shot and nothing else: a thin floating neutral-grey thumb on an invisible track, no arrow buttons, no chunky desktop bar - same slim shape on desktop and mobile (Chromium, Firefox, and phones with their native overlay feel). Light pages carry neutral grey, dark pages pale; inner containers (menu, modals, palette, tab strips, panels) draw no bar at all. Also retired the menu dropdown's leftover gold scrollbar rules, which contradicted its own hidden-bar rule. Verified: CSS sanity check, edited files parse, repacked, image proof attached.


## 247. Slide arrows wear the scroll button's design (the office asked)

The slide-area arrows now look like the scroll-up button: dark glass circle with a gold chevron at night, light cream circle with a dark-gold chevron by day, same shadow, same hover lift, thicker chevron stroke. One restyle of `.aslides__arrow` covers all three stages (3D cuboid, flat swiper, spare) in both themes; sizes, positions, directional nudge, tap spring and the small-phone 32px rule are untouched. Verified: CSS sanity check, repacked, image proof attached.


## 248. Old copies can never pass silently again (the office asked)

Three guards plus a real bug fix. (1) `npm run dev` announces its update in the terminal on every boot, and `npm start` announces folder update vs dist update - with several extracts on one machine the terminal names which one is running. (2) `npm run build` stamps dist/version.json with the update number; `npm start` compares it and warns loudly when dist is older (`OLD BUILD: dist/ is update X but this folder is update Y - rebuild`), so a stale production build is spoken, not silent. (3) Fixed the delete-upload endpoint: serve.mjs called `rm` without importing it, so every office delete failed - `rm` is now imported and the two-tap delete works on the office server. Verified: edited files parse, repacked.


## 249. Maintenance until Publish after an update (the office asked)

Whenever a new update is deployed, visitors see maintenance only - the header's logo and a Maintenance notice, nothing else - while the whole admin console stays active. The first Publish from the new code lifts it everywhere. How: every publish blesses the publishing code's update number (`BUILD_NOTES` rides each patch; the server keeps the highest in its state; seed backups, the live feed and browser caches carry it). The public site compares it with its own code and waits when behind; `#/admin` never waits. A Publish with no content changes still blesses (notes-only sync), so the click always lifts. First-ever runs (nothing published yet) never wait. The admin shell shows `Visitors see maintenance right now` with a Review-and-publish shortcut while it lasts. Verified: edited files parse, maintenance matrix harness, repacked, image proof attached.


## 250. Maintenance can never trap the office again (the office asked)

Update 249's gate hid the whole site in three ordinary office flows, each reading as "I didn't see any changes": (1) a Publish with no server reachable never blessed, so local/dev copies waited forever — every offline Publish path now blesses the running update on its own copy; (2) a server-less copy (`npm run dev` with no office server) showed maintenance although it has no visitors — the gate now only applies when a server is or was in play; (3) there was no way to look at the new site before publishing — `?preview=1` (remembered for the visit) shows it, linked from the maintenance notice itself. The notice also names the installed update and the last published one, and the admin banner shows both numbers, so a stale copy is spotted, not guessed. Verified: edited files parse, repacked.


## 251. The running update on the page itself (the office asked)

"Still didn't change" can mean four different copies (old extract, stale dist, cached page, live host), and none of them would say so. The footer bottom-bar carried a quiet `· Update N` on every page, next to the copyright — the number the code was shipped with. (Retired in note 253: the office wanted nothing extra on the page; the console stamp `window.__womBuild` still names the running update.) Verified: edited files parse, repacked.


## 252. Clean slate — only the new update stays active (the office asked)

"Still showing the old" had three hiding places, and the new zip was byte-identical to the download, so the old came from the machine, not the file: (1) every extract shares one browser store under the same localhost address, so an old folder's cached words resurface inside the new one; (2) dist/ and Vite caches can serve an older build than the folder; (3) the live host serves whatever was last deployed to it, untouched by any zip. The fixes: Admin → Tools carries a **Clean slate** card that two-tap forgets the browser's old copies (cached words, drafts, history, waiting publishes, publish stamp) and reloads onto the shipped words, and says outright when the open copy itself is older than what the browser has seen; the admin shell shows the same old-copy banner; `npm run clean` (scripts/clean.mjs) wipes dist/ and Vite caches without touching data/; LOCALDEV.md's "one folder, one update" rule says to delete every old extract folder and notes the footer number as the arbiter. (Note 253 retired the Clean slate card and the footer number — the office wanted zero chores and nothing extra on the page. The update procedure is now only: extract, `npm install`, `npm run dev`.) Verified: edited files parse, repacked.


## 253. New updates clean up after themselves (the office asked)

No button rituals, nothing extra on the page: a new update's first boot opens on its own words by itself. How: the browser store is stamped with the code update that wrote it (`wom.cms.codegen`); when a boot finds a different update's stamp, it skips the older copy's cached instant-paint and lets the server sync fill the page, then records the new stamp. Same-update restarts behave exactly as before, the office's unsaved draft is still adopted, and anything published while offline still flushes — only the old ghost-paint is gone. The footer number and the Clean slate card are removed; `window.__womBuild` in the console still names the running update, the old-copy admin banner still speaks up if an old folder is opened, and `cms.resetLocalCopy()` stays as a support helper. Verified: edited files parse, repacked.


## 254. The update window: restore the backup, then Publish (the office asked)

The standing flow, now explicit in the product: when an update lands, visitors wait on maintenance while the admin stays fully active — that window is for bringing the office's words home. The admin banner says so and offers both doors: **Restore a backup** (opens Tools at the restore card — words and photos return as a draft, normalized to the new update's shape, retired sections named and left out) and **Review and publish**. Publish puts it live and lifts maintenance: the site comes back exactly as it was, with only the new update's changes new. The chain was verified in code: export carries published content plus embedded uploads, import writes photos back under their stored names, publish blesses the new update online and off. LOCALDEV.md carries the four-step recipe (back up → new folder → restore → publish). Verified: edited files parse, repacked.


## 255. One dev server only — old folders can't ghost the port (the office asked)

"Whenever I run on VS Code the updates are missing" had a silent cause: Vite's dev server slides to the next free port when 5173 is taken. An older folder's forgotten dev keeps 5173, the new folder lands on 5174, and the browser tab on 5173 keeps showing the old folder forever — no maintenance, no scroll button, no new scrollbar, with nothing saying why. `vite.config.ts` now pins `strictPort: true`: a clash fails loudly ("Port 5173 is already in use") instead of serving old code under your feet. The rule stays: one folder open, one `npm run dev`, old folders deleted. Verified: edited files parse, repacked.


## 256. Bar-only scrollbar, pill audit — one implementation everywhere (the office asked)

Full scan for anything that could hide the scroll features: no legacy `.to-top` button or styles ship anywhere (only `scroll-pill` exists, mounted on the site and on `/admin`, same code in dev and in every build — there is no environment branch, so VS Code and deploy render the identical button); the page-edge bar draws only the thumb (transparent track, no arrow buttons, transparent corner, inner areas barless) plus a new `track-piece` rule, because some Chromium builds paint that layer behind the thumb — that was the last place a "container" could come from. Why they still read as missing: while maintenance shows, the public page is the bare notice — nothing scrollable, no footer, no button by design. Finish restore → Publish and both stand on every long page in VS Code and on deploy. Verified: edited files parse, repacked.


## 257. Desktop scrollbar floats exactly like the phone's (the office asked)

The phone's bar floats over the page — no gutter, content keeps full width. Desktop Chrome instead reserved a gutter column. `html` now uses `overflow-y: overlay`: on Chromium the desktop bar floats over the content and behaves like the mobile one; Firefox, with no overlay, keeps its native thin bar as the closest equivalent. Thumb, track-piece, buttons and corner stay invisible-or-thumb-only, and inner areas stay barless, so in every engine only the bar draws. Sticky header and scroll measurement are untouched (the document scrolled before, it scrolls now). Verified: edited files parse, repacked.


## 259. The page ground reaches the bar — never browser white (the office asked)

Transparent track layers let the browser's own canvas show through wherever a gutter gets composited (classic mode, embeds, overscroll) — a white strip beside the bar. Every layer under the thumb is now painted the page ground itself: scrollbar base, track, track-piece and corner use the theme base, and the Firefox track color does too. The bar still floats exactly like the reference; only the ground changed. Verified: edited files parse, repacked.


## 260. Gutter fully gone — only the floating bar remains (the office asked)

The painted ground itself read as a gutter where the bar floats over content. Now every Chromium layer around the thumb is invisible again (scrollbar base, track, track-piece, corner) on top of the overlay, so no strip can render — only the 6px reference thumb floats over the page. Firefox keeps its track painted the page ground through `scrollbar-color`, which is its only layer and never whites out. Verified: edited files parse, repacked.


## 261. The document scrolls — only the thumb can remain (the office asked)

"Only the thumb" kept failing because the page wasn't the scroller: `overflow-x: hidden` on `body` forces the body into its own scroll container with a classic gutter, and the `html` overlay rule can never reach a nested scroller. `body` now uses `overflow-x: clip` (same horizontal cut, no container created, sticky untouched; the `hidden` line stays above it for browsers without `clip`). The document itself scrolls again, so the overlay owns the one scrollbar and only the 6px reference thumb draws — nothing beside it, in either theme, in VS Code and in every build. Verified: edited files parse, repacked.


## 262. The pill mounts on every screen, maintenance included (the office asked)

Why the button showed in the preview but never in the VS Code run: the preview mockup mounts it unconditionally, while the site mounted it on the site and on `/admin` — but not on the maintenance notice, which is exactly the screen a fresh update shows. No crash, just a missing mount on that one screen. `<ScrollTop />` now renders inside `MaintenanceSite` too: on tall screens it stays parked (nothing to scroll, correct), and on small screens where the notice itself overflows, one tap carries the visitor home like everywhere else. Verified: edited files parse, repacked.


## 263. Minimal floating scrollbar in both engines (the office: track and gutter invisible)

The one layer still painting a strip: Firefox's `scrollbar-color` track was `var(--ink)` (note 259's guard), while every Chromium layer was already transparent — so in Firefox a full-height ground strip drew behind the thumb. Both `scrollbar-color` tracks (dark + light) are now `transparent`: only the thin rounded gray handle draws, floating at the very edge directly against the page background. No browser white can show through — the page base lives on `html`, so transparent composites over theme ground. Scrolling behavior, layout, sticky header, and thumb styling unchanged in both engines. Verified: edited files parse, repacked.


## 264. Pill off the maintenance notice (the office: only where it can work)

The office doesn't want the button on the maintenance notice — and they're right, a notice that fits one screen has nothing to scroll. Update 262's mount there is reverted: the pill lives on the site and on `/admin`, the two places with real scrolling. Finding it in a VS Code run: open a long page (Sermons), scroll one full screen, and the circle pops up bottom-right; one tap returns to top. If a fresh update opens on the notice instead, click "Preview the new site" on the notice — that's the full new site with the pill — or restore a backup and Publish. Verified: edited files parse, repacked.


## 258. Scrollbar exactly like the office reference (the office asked)

The reference shot shows one slim light-grey rounded bar floating at the very edge — no padding ring, no container. The bar is now that: a 6px gutter with a borderless fully-rounded thumb (pale on dark pages, faint black on light ones, darkening on hover, 48px minimum grab), transparent track/track-piece/corner, no arrow buttons, inner areas barless. The scroll-up button is confirmed unconditional: no environment branches exist anywhere in the code, so VS Code and deploy mount the identical pill on the site and on `/admin`, appearing after one screenful (or near the bottom) with a tap home. Verified: edited files parse, repacked.


## 300. Last-published survives without a new update (the office asked)

The site went back to update-mode and looked new and fresh even when there was no new update, clearing the saved published. Four leaks combined: the boot manufactured a hold stamp on every behind copy (BUILD_NOTES - 1, persisted), the cached paint was skipped whenever the codegen stamp was merely missing, a storage hiccup zeroed the held stamp, and a restarted server forgot its own stamp (notes 0) so every visitor waited and "Last published" cleared. The rule now: a new, different update opens fresh and holds until the office publishes; with no new update the copy remains in the last published. The forced boot write is gone (a missing stamp waits as unreviewed but is never rewritten), the cache is skipped only on a proven new update (a stored codegen that exists and differs), the stamp is raise-only against storage failures, every cache write carries the update its words were published from (returning copies stay live on it even offline), and the seed fallback serves the bake's publish stamp again so a same-code restart keeps serving the last published — while a genuinely new release still outruns any old bake and waits for the office. Only the explicit office delete clears last-published now; sign-outs, password changes, restarts and rebuilds never do. The pre-ship verifier's new section G locks all of it. Verified: verifier section G passes, edited files parse, repacked.

## 301. Maintenance can never vanish again (the office asked)

The notice went missing after an update fix: the component still promised the update line + office doors in its comment and the stylesheet still styled them, but the JSX rendered neither — visitors saw a bare message with no way to preview or reach the console. Restored: the notice names the installed update and the last published one (or "nothing published yet"), plus "Preview the new site" (?preview=1) and "Open the admin console" (/admin), re-rendered on publish.

Hardened for every new update: a corrupt stamp (NaN/negative/unreadable) waits as unreviewed; seed immunity is read before the bake lands; blank server answers run before the stamp so they can never bless or clear; a new server history generation resets to unreviewed; heal still never blesses; only explicit office publish/undo/bless/offline-flush lifts. The notice itself stays bare by office request (logo + message, no update line or links; ?preview=1 and /admin still work when typed by hand). The pre-ship verifier's new section H locks all of it. Verified: verifier sections G+H pass, edited files parse, repacked.

## 302. No hard refresh ever again (the office asked)

After an update the maintenance notice kept vanishing: visitors saw the live site instead of the notice, and only Ctrl+Shift+R brought it back. Three caching leaks combined: the stale-build check used a one-shot session guard, so the first reload still serving cached files trapped the tab on the old bundle forever; version.json and index.html could be HTTP-cached (no headers shipped for static hosts, no-store missing on the office server), hiding the update entirely; and the app painted live before the async version check settled, while nothing showed maintenance until the (possibly stale) React bundle booted. Fixed: stale reloads are retryable (a few attempts in a few minutes, then keep waiting — never loop, never trap), the version fetch is cache-busted with no-store headers, the app holds the boot splash until the version check settles and waits while a newer update is known even on the old bundle, an inline gate in index.html paints the notice before React boots (same stamp, yields to preview), entry files are never cached anywhere (dist/_headers + dist/.htaccess for static hosts, no-store on the office server for version/seed/server/feed.json), and the dev bake keeps the publish stamp. After an update a plain reload lands every visitor on the notice until the office publishes. The pre-ship verifier's new section I locks all of it. Verified: verifier sections G+H+I pass, edited files parse, repacked.
