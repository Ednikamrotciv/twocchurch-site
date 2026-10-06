# The World Overcomers' Ministries Inc. — website

A complete, responsive church website built with **React 18 + TypeScript**, styled after the
church seal (gold on near-black, crimson and sky accents, serif display type).

Everything lives in this `src/` tree. `src/data/site.ts` holds the church-wide
strings (name, tagline, phone, email, timezone, currency), and `index.html` is a thin shell that loads `src/main.tsx`.

---

## 1. How it is built

React 18 + TypeScript, bundled by **Vite** (`npm run dev` for editing with instant refresh,
`npm run build` for the production `dist/`). No CDN, no runtime transpiling.

- Source of truth: **`src/**/*.tsx`**
- Dev: **`npm run dev`** (Vite + the publishing backend as middleware)
- Production: **`npm run build`** → `dist/` (served by `npm start`, or uploaded to any static host)
- Copy collector: **`src/tools/auto-copy.mjs`** (see *Every text, not just the headlines* below)

### Every text, not just the headlines

Everything the office can reword is a `ct("…")` call, so the strings have to live in
`src/data/copy.ts` (the hand-written headlines and paragraphs) or in the generated
`src/data/autocopy.ts` (the small words — labels, placeholders, button captions, tooltips). The
generated half is recovered from the components by **`src/tools/auto-copy.mjs`**, which finds every word a
visitor reads — JSX text, display attributes (label, placeholder, title, alt…), string literals in an
expression position (the fallback in `name || "Friend"`, a caption inside `{ready && <p>Ready</p>}`),
template literals whose holes are plain values, and the display-valued properties of the little record
lists behind breadcrumbs, tabs and the command palette — gives each a content-addressed key
(`auto.<page>.<hash>`) and rewrites the source to `{ct("…")}` or, for a template, to
`ct("…", { name: value })` with the wording stored as `{{name}}` tokens. `src/tools/auto-copy.mjs`
collects newly added literal text into `src/data/autocopy.ts` (run it from a workspace with file
access, then rebuild with `npm run build`).

It is idempotent: already-collected strings keep their key and their default value, so re-running it
only picks up what is actually new. The key is a hash of the file, the words and the occurrence, so
re-ordering code can never move an override onto different words.

It also records **what kind of words each one is**: `roleOf()` looks at the element the words sit in
and writes `role: "button"` for a `<Btn>` / `<IconBtn>` / `<button>` (or anything carrying a `btn`
class, e.g. `<Link className="share-btn">`) or a `label` / `aria-label` / `title` on one, and
`role: "sectionTitle"` / `pageTitle` for a direct child of `<h2>`–`<h6>` / `<h1>` or a heading prop on
`SectionHeading` / `PageHead`. Those roles are the *fixed* lines (see the locked list above); roles
are recomputed from the source on every run, so the enclosing element stays the truth.

What it deliberately leaves alone: comparisons and arithmetic (`kind === "video"`, `count + " items"`)
— a logical wrapper such as `cond && "…"` or `x ?? "…"` is walked through, but the operator's own
operands stay code; class names, URLs and the other logic attributes; import/type/storage positions;
anything at module scope (a `ct()` there would freeze before the published content loads); and the
office's own tools. A handful of things on screen are therefore *computed* rather than editable, by
design: clock and relative dates ("Wednesday", "7:00 PM", "in 4 days"), weekday names, countdown
units ("hrs", "min", "sec"), durations ("2 hr"), monogram initials (AO, JK), money ("US$25", which is
also converted into the reader's own currency — see *The money* below) and any
record text truncated with a trailing ellipsis. Everything a visitor reads that is not one of those
comes from either the copy layer or a record the office fills in from the drawer.

### Rebuilding after any change under `src/*.tsx`, `src/*.ts` or `src/styles/*.css`

Save and Vite refreshes the browser by itself (`npm run dev`). For production, `npm run build`
writes `dist/` (see `DEPLOY.md`). Type-check with `npm run typecheck` (`tsc --noEmit`) — the
bundler only transpiles, so type errors do not break the build but missing exports/imports do.

---

## 2. Editing content

| What | Where |
| --- | --- |
| Church name, tagline, phone, email, address, socials | `src/data/site.ts` (also editable in the console under Church profile) |
| Values, beliefs, timeline, leadership, ministries, FAQs, giving funds, departments | `src/data/site.ts` |
| Branches — country (Nigeria / America / Canada, in list order), the `isHq` head office (Lagos — its address is the one on Oke-Odo Road; set in the data since SPEC note 131), who a sub-branch belongs to (`parentId`, which is what makes it a sub-branch — the `isSub` flag is derived from it — and is read by `subBranchesOf`), city, address, coordinates, service schedule, pastor | `src/data/branches.ts` |
| Sermons (YouTube video link, speaker, date, scripture, summary, points, questions, venue — the drawer's form is thirteen fields since SPEC note 128) | `src/data/sermons.ts` |
| Events, scripture bank, seed testimonies + prayer wall, reading plan | `src/data/content.ts` |
| Page copy — every heading, lede, paragraph and button label | `src/data/copy.ts` (rendered through `ct()` + `<Rich>`) |
| The small words — labels, placeholders, button captions, tooltips | `src/data/autocopy.ts` (**generated** by `src/tools/auto-copy.mjs`; also editable from the drawer) |
| Country → currency, and the dated rate snapshot | `src/data/currencies.ts` (**generated** — from the `world-countries` dataset and a currency feed; recipe below) |
| Live stream: YouTube / Facebook, the channel watched for a live stream, the on-air flag with the session's own timestamps (since / cut / ended-by / last command) and the ways-to-watch cards (fixed content — the list left the drawer in SPEC note 110) | `src/data/live.ts` |
| The last six services we streamed — read from the church's own channel | `src/lib/recentstreams.ts` |
| The stop that makes itself when the stream ends (SPEC note 111) | `src/lib/autostop.ts` |
| Photos: every picture on the site, and where each one is used | `src/data/photos.ts` |
| Colours, type, spacing (design tokens) | `src/styles/global.css` (`:root`, `[data-theme="light"]`) — the glass material and the page gradient are the `--glass-*` tokens in `src/styles/glass.css` (§3a) |

The church office can also edit **all** of the above from the built-in editor at
`/admin` — see the section at the end of this file. Both routes write to the same data: the
editor stores *overrides* per section, and the shipped `src/data/*.ts` files remain the fallback
(and the source of truth for a fresh checkout).

The office's published values win over the defaults in `src/data/site.ts`, so the church can
rename itself from the console without touching TypeScript.

**Sermon videos:** the 19 messages currently point at publicly available teaching videos
(Desiring God, In Touch, Tony Evans…) used as demo content, with real titles, speakers and
durations. Replace `youtubeId`, `speaker`, `durationText` and the notes with your own channel's
uploads.

A message can also be a **Facebook** video: set `platform: "facebook"` and `facebookUrl` on the
sermon (both are editable per sermon in the drawer) and the player, poster and platform pill
follow. See `src/lib/embed.ts` for the URL parsing.

**Or a video the office uploaded.** `platform: "upload"` + `uploadUrl` (the drawer's *Upload the
video* field, a `video` field type) plays the file itself in a `<video controls>` element — the
`VideoPlayer` in `src/components/blocks.tsx` branches on `fileSrc(source)`. `VideoUpload` in
`src/components/editor.tsx` sends the file to Platform's upload service; if it is too large for
permanent storage (`file_too_big`) it is retried as a temporary file with a one-year expiry and the
office is told the date, so a full-length service still plays. Short clips are best kept permanent;
for a whole service a YouTube or Facebook link is better.

**The live stream** (`src/data/live.ts`, the drawer's *Live stream* section): the church broadcasts on
YouTube and on Facebook, so the screen at the top of `/watch-live` offers both whenever both are
configured — a visitor can switch with the segmented control **and** the player stays on the page
(the button row under it opens the platform itself). Set `youtubeId` (the whole YouTube link — the
bare id, a `youtu.be` share link and an embed link all still work), `facebookUrl` (a public Facebook
video / live-video link) and which one `provider` opens
first. Facebook supplies no thumbnail, so the player shows a platform-tinted gradient poster — that
is expected, not a broken image.

**Going on air is the drawer's job** (`LiveControlPanel` in `src/components/editor.tsx`, SPEC note
106): the *Live stream* section opens on the state in words (*You are on air right now* / *The stream
has been stopped* / *The stream is off air*), a line saying since when and how long, and the buttons —
**Start the livestream** (a new session: `LIVE.isLive` on and `liveSince` stamped), **Continue the
livestream** (the same session back on air after a stop, keeping its start so "on air since 10:04"
keeps counting) and **Stop the livestream** (`isLive` off, `liveCut` stamped, at which point the panel
promises the finished service files itself into *Recent services*). A stop during a scheduled
gathering also silences that gathering for the rest of its hours (`LIVE.liveCut`; `nextService` steps
over it), so the pages count down to the next gathering instead of printing `0h 0m` until the hours
run out. The state itself is still content — `LIVE.isLive` plus the two timestamps in
`src/data/live.ts` — and publishes like everything else. **The buttons are not the only way it stops**
(SPEC note 111): the drawer also ends the session by itself when the stream goes off air, and
`LIVE.liveEndedBy` ("office" or "channel") is what lets the panel say which of the two happened.

**The screen knows when the church is on air** (`src/lib/livestatus.ts`; the *Live stream* section's
*YouTube channel to watch for live* field): the page asks YouTube about the church's channel — a
handle, a channel id or a channel link, falling back to the stream link above when no channel is set
— and follows the answer. The church's own is **`@twocorg`**, which is all that field needs (a
channel follows whichever broadcast is on that day, where a stream *link* freezes the page to one
service; SPEC note 112). One marker decides the answer — `"isLiveNow":true`, which a broadcasting
player prints and a finished service's page does not. `"isLive":true` is **not** a marker: it also
sits in the view-count renderer of a finished or scheduled broadcast, and reading it once left a
quiet week saying *Live now* on the church's own channel. A page that carries none of YouTube's own
scaffolding at all is `"unknown"`, never `"off"` — an unreadable page must not be able to stop a site
that is on air. While that channel is broadcasting, the badge reads **Live now** with a
blinking red dot, the heading becomes the stream's own title, and the player opens the broadcast by
itself (the video id comes off the same page, so nobody has to touch the site on a Sunday morning).
When the check has no title of its own and the *clock* is what says the church is on air, the heading
names that gathering rather than the office's *Headline while live* (SPEC note 105), and while the
panel is on air with nothing to play the frame keeps the most recent service under a notice that says
exactly that.
When the stream stops the screen returns to a centred **Live has ended** state over a dimmed still of
the last *broadcast* (the video the check watched end, else the newest service on the channel — the
newest message only as a last resort), with buttons to the last message and to the archive. **While the
service is on and the stream has not opened yet the frame holds a third state instead** (SPEC note
133): the same faded still under a CSS-3D ticking clock with a synthesised tick — *The service is on ·
we will be live here shortly, please bear with us* (`src/components/liveclock.tsx`,
`src/lib/ticksound.ts`). It is only skipped for a site with no channel, no stream link and no Facebook
page, where the panel plays the most recent message as before. The check goes through
the office server's `/__yt` proxy — YouTube sends no CORS headers, so a plain `fetch` is refused —
every **45s** when a service is on the clock or a stream is running, and every **3 minutes** otherwise; hidden tabs are skipped and re-checked the moment they
come back. A failed check is *unknown*, never *not live*, so a flaky proxy can only fall back to the
old behaviour — the office's own on-air state (the *Live stream* section's **Start** / **Continue** /
**Stop** buttons, which write `LIVE.isLive`) and, when there is nothing to check at all, the service
clock. **The office's switch is read through `onAir()` in `src/lib/store.ts`** (switch, clock, or the
stream itself — SPEC note 133), so
pressing **Start the livestream** puts the whole site on air — the header's service pill, the home
hero and next-gathering card and the Watch live panel — rather than the panel alone; with no stream
configured at all the panel heads the next scheduled service and counts down to it (SPEC note 83).
Pressing **Stop** during a scheduled gathering silences that gathering for the rest of its hours too,
so the site goes back to counting down to the next one rather than flicking to live a minute later
(SPEC note 106).

**And when the stream ends, the drawer stops with it** (`src/lib/autostop.ts`, SPEC note 111): while
the office is on `/admin` the live check is watched from the shell of the page, and when a broadcast
it had *seen* live comes back ended it writes what **Stop the livestream** writes — `isLive` off,
`liveCut` stamped with the moment the stream ended, `liveEndedBy: "channel"` — and seeds the finished
service into *Recent services*, so nobody has to be at the desk when a service closes. It counts only
a definitive answer ("off", twice in a row, about a minute apart), only ever ends a broadcast that was
on air and that began before the ending, and leaves a stop the office has already made alone — as it
does their last command: an ending older than the office's *Start* / *Continue* / *Stop* is history, so
pressing *Continue* on a stream the site had stopped is left alone. It
writes the **draft**, so the office still presses Publish. That write is the office's bookkeeping, not the
display: since SPEC note 133 the pages follow the stream itself, so they stop at the ending whether or not
anyone is at the desk to publish it. Facebook is asked as well, but only from the
drawer and only ever as a *confirmation* — Facebook tells a browser that is not signed in nothing it
can be trusted for, a finished live video included — so in practice the stop follows YouTube, which is
also where *Recent services* comes from.

**The recent services look after themselves; previous sermons are the office's own work**
(`src/lib/recentstreams.ts`, the drawer's *Live stream* section, panel *Recent services*).
*Recent services* on `/watch-live` is read from the church's YouTube channel — its **RSS feed**, which
is the only one of YouTube's lists that carries *every* kind of upload: the `/videos` tab leaves out a
channel's live archives, and a church's Sunday services are exactly those (the grid is still read, for
its own "3 weeks ago" line and for the depth behind the feed, but the feed's exact dates win). The
list is then **ordered by date and folded to one card per message** — a service YouTube published two
or three times, minutes or hours apart and under one headline, is one service, and the card is the
first of them, so the player opens it from the beginning (SPEC note 113). It holds **as many as the
office asks for** (field *How many recent services to show*, six to start with; `recentLimit()` in
`src/data/live.ts` clamps it): a service takes its place the moment its stream ends (the page re-reads
the channel
the moment the live check flips back to *off*), and the oldest drops off. Nothing is typed in, and
the section tells the visitor that older livestreams live on YouTube and Facebook. *Previous
sermons* is the other way round: it is the sermon archive — the messages the office writes up and
uploads in the *Sermons* section, with their notes and discussion questions — and **no broadcast
ever rolls into it on its own**. It shows the newest of them up to the office's own number (field
*How many previous sermons to show*, twenty to start with; `pastLimit()`), so as a new message is
published the oldest one drops off the band **without anything being deleted** — the archive at
`/sermons` keeps every message. Its line promises the office's own turnaround — *Hours
until a service is written up*, five to start with — and both that line and the panel follow
whatever number the office sets. Nothing is filed from the live section
any more (there is no `autoArchive` switch, and `src/data/broadcasts.ts` is gone).

**The live section is the controls and the numbers, and nothing said twice** (SPEC notes 130 and 130a
took the section's hints and both of its long panels' prose out). The drawer shows: the on-air card
(*Start* / *Continue* / *Stop the livestream*), the seven fields, the *Recent services* panel (its
list, with *Take it off* on every row and *Put it back* for the ones taken off), and at the foot the
two remaining controls — the field *How many previous sermons to show* and the button *Open the sermon
list*. That field is the one field of the
section drawn outside the form: it is declared on the `live` section like the others (so
`pendingEdits`, the export and the drawer's search all see it) but `Admin.tsx` passes it to
`LiveEndingPanel`, which is why it stands beside the sermon-list button — it belongs to the
*Sermons* side of the site rather than to the stream. There is no *Read the channel again* button any
more: the list is filled by the watcher and by *Stop* (note 111, `askForRecentServices`).

**A message's picture comes from where it plays** (SPEC note 126 took the cover picture out of the
drawer). A message that plays from YouTube uses YouTube's still; a Facebook one, and a video file
the office uploaded, fall back to a bundled church photo (formerly its series cover, SPEC note 123).
Until note 126 the *Sermons* section also had a *Cover image* field and a dashed panel under
*Upload the video* that took a cover out of the uploaded file (`captureVideoFrames`, formerly in
`src/lib/store.ts`, one moment out of five, scored on brightness so a black frame never won). The
office asked for both to go: `poster` stays in the record data, so a value set before then still
shows on the card, but nothing in the drawer writes it any more — so a message whose video the
office uploaded has no picture of its own.

**A message is no longer marked as *filed from the live stream* from the drawer** (SPEC note 128
took the switch out, with the hint under it). `fromLive` stays in the record data and is still read
by the *Broadcast* pill on a card (`src/components/blocks.tsx`) and the tag beside the scripture on
a message's page (`src/pages/SermonDetail.tsx`), and `makeNew` still seeds it `false`; no shipped
record carries it, so the site looks unchanged. The *YouTube video link* field above *Facebook
video link* holds the whole `https://www.youtube.com/watch?v=…` link (SPEC note 127).

**A message's page keeps to the video itself.** Its *Watch & share* tab is the one row for the
platform the message plays from (the *Podcast*, *Sermon outline* and hosting rows were taken out at
the office's request — SPEC notes 125 and 129), and the *Sermon notes* tab's empty state (a message
with no points) reads *The outline for this service is not written up yet — add the points from the
admin console.* (note 129). The downloaded outline still carries the *speaker — role* line.

**Photos** (`src/data/photos.ts`, the *Photos & covers* group in the drawer). Every picture on the site is
one of the bundled files in `src/assets/img/`, and `PHOTO_SLOTS` lists each one together with a
plain-language name and where it appears. The office can replace any of them from the editor —
**upload a photo** from their phone or computer, pick a different bundled one, or paste a link —
and the editor shows the picture that is currently in place, so nobody has to guess. One of them is a
*texture* rather than a picture in its own right: **Home page background** is laid over the home
banner as a visible-but-subdued layer — `soft-light` at 0.55 in the light theme, `screen` at 0.5 in
the dark, `blur(1px)`, with the copy's own scrim widened so the photo never reaches the words
(`styles/pages.css`; SPEC notes 119–120).

The two levels work together:

- banners, the home hero and anything else rendered through `img()` resolve their photo when they
  render, so they follow a change immediately;
- records that carry a photo of their own (branches, ministries, leadership, events, sermons) are
  re-pointed in place at apply time — but only while they are still on the original
  bundled photo, so a branch or a person who has been given their own photo keeps it.

Under the hood: `img(name)` is `photoSrc(name)`, the editor stores only the *address* of a photo
(so a published revision stays a few KB), and uploaded photos are shrunk in the browser
(`compressImageBlob`, 1600 px wide JPEG) and kept on the office server (`data/uploads/`).
**The logo is not in `PHOTO_SLOTS`** — it is part of the site's identity (`LOGO` / `LOGO_MARK`)
and is deliberately not editable, along with the church name.

**Events** are stored as `offsetDays` from today, so the calendar never goes stale. The section in the
drawer opens on **Happening now** (SPEC note 106) — the activity the site is carrying, the one on
right now or else the next one, with an *Edit this event* button that opens its form in the list
below, and today's other activities listed under it.

---

## 3a. The glass pass (`src/styles/glass.css`)

The site's material — the frosted panels and the shadier page gradient (SPEC note 132) — lives in
**one sheet imported last**, after `global.css`, `pages.css`, `admin.css` and `edit.css` (see
`src/main.tsx`), so it can restate surfaces the other sheets already declared without touching them.
Two things to know before editing it:

- **Everything is a token.** `--glass-fill`, `--glass-spec`, `--glass-inset`, `--glass-shadow`,
  `--glass-edge`, `--glass-blur`, `--glass-sat` and the composite `--glass-surface` are declared on
  `:root` (dark), re-declared on `[data-theme="light"]`, and re-declared again on `.section--light`
  — that band is *light in both themes*, so it pins the light values for its own subtree. Custom
  properties resolve on the element that uses them, so overriding the tokens re-materials every
  panel inside that scope. To change the look, change the tokens, not the selector list.
- **Do not put a gradient on the border.** `--glass-surface` is two `padding-box` layers (a corner
  specular over the tint) and the lit/shaded edges are `box-shadow` insets. A `border-box` gradient
  rim paints the whole box and therefore shows *through* a translucent fill as a diagonal wash that
  reads as a bevel on small cards; a diagonal *fill* gradient does the same at card scale, which is
  why the fill runs at 166°.

`body` gets the aurora (a `background-attachment: fixed` stack of radial blooms over a deep linear
base). Panels are split into a blurred group (big surfaces — `backdrop-filter: blur() saturate()`)
and a matte group (chips, pills, quiet buttons), so the material is consistent without a backdrop
filter on every tag. The light theme's glass is deliberately *more transparent* than the dark
theme's: white glass on a near-white page is invisible otherwise. Because the page is deeper now, the
light theme also carries `--muted: #564f45` / `--faint: #635c51` for contrast.

## 3. Architecture

```
src/
  main.tsx                entry — mounts <App/>, imports the stylesheets
  App.tsx                 picks the site or the admin shell, error boundary, scroll restoration
  lib/
    router.tsx            ~140-line path router (Link, navigate, matchPath, absoluteLink);
                          reads `/admin` as the office's word wherever it appears in the address
                          ("/admin/ministries" and "/ministries/admin" are the same page) and
                          settles the URL on the tidy spelling as it goes
    routes.tsx            the route table (ROUTES, resolvePath) — shared by the public site and
                          /admin; resolvePath() is forgiving, so a mistyped or outdated address
                          ("/live", "/about-us", "/sermons/2024/03/x") lands on the page it meant
                          and the address bar is rewritten to the real one
    pageMap.ts            route → the page's name (drawn in the drawer header) and the ordered
                          section ids that page prints (kept for reference — SPEC note 52)
    jobs.ts               the office's job list (JOBS) + searchEverything() — the friendly way
                          around /admin: everyday jobs, and one search box over the words,
                          the records, the photos and the sections
    hooks.ts              useLocalState (reactive localStorage bus), theme, toasts, hotkeys,
                          scroll progress (`useReveal` still drives Stat's count-up trigger)
    motion.ts             the one motion language (SPEC note 148): shared ease, springs and
                          variants for reveals, modals, toasts, accordions and collapses
    store.ts              persistence keys, the zone-aware clocks (see *The clock* below:
                          `DEFAULT_TIMEZONE`, `churchTimezone`, `visitorTimezone`/`siteTimezone`,
                          `zonedParts`, `zonedTimeToUtc`, `clockAt`/`clockHere`, `fmtDate`/`fmtTime`,
                          `todayKey`), the money helpers (see *The money* below: `baseCurrency`,
                          `displayCurrency`, `convertMoney`, `fmtMoney`, `moneyText`), next-service
                          maths, geo/distance, ICS + text download, image compression,
                          clipboard/share, record types
    visitor.ts            where the visitor is: asks an IP-geolocation service (a *plain* fetch —
                          never a server proxy, which would answer with the server's location) for the
                          zone, country and currency, caches them, and re-renders the site onto that
                          clock and that money (SPEC notes 85, 98)
    rates.ts              today's exchange rates, fetched by the visitor's own browser, cached for
                          half a day, with the shipped snapshot as the fallback (SPEC note 98)
    collections.ts        opinionated hooks over the store: testimonies, prayer wall, requests,
                          library (saved/watched/notes), giving log, visit plan, reading plan
    embed.ts              YouTube / Facebook / uploaded-video sources: ids, embeds, stills
    livestatus.ts         "are we on air?" — asks YouTube (and, from the drawer only, Facebook)
                          about the church's channel through the office-server proxy (markers, cadence, cache,
                          and the moment a broadcast we watched ended) so the live screen follows
                          the real broadcast (SPEC notes 68, 111); one ref-counted poll shared by
                          the whole site through `onAir()` in `store.ts` (SPEC note 133)
    shaderbg.ts           the living page background — a slow WebGL gradient in the church's
                          colours behind everything, theme-aware, still under
                          *prefers-reduced-motion* (SPEC note 134)
    ticksound.ts          the waiting clock's tick, synthesised — a noise click plus a wooden body,
                          deliberately light, on by itself (SPEC note 133)
    autostop.ts           the stop that makes itself: the drawer watches the live check and does
                          what *Stop the livestream* does when the stream ends on its own —
                          `isLive` off, `liveCut` stamped with the ending, the finished service
                          seeded into *Recent services* (SPEC note 111)
    recentstreams.ts      *Recent services*: the channel's feed (every kind of upload — the
                          /videos tab leaves out live archives) merged with its video grid,
                          ordered by date and folded to one card per message, so the office's
                          number picks the services nearest each other in date (SPEC note 113)
    cms.ts / cmsSchema.ts the content client (draft, publish, pending sections) + the field schema
                          for all 54 sections
    embed.ts              video helpers for YouTube, Facebook and an uploaded file (id parsing,
                          embed / file sources, thumbnail + "open there" URLs)
    palette.ts            the colours of a picture: samples an uploaded slide's photo on a canvas,
                          finds its dominant hue (vividity-weighted, circular-averaged), builds the
                          whole poster palette — every text/ground pair nudged to clear WCAG
                          contrast, a colourless picture kept neutral — plus the quietest side
                          (`calm`) and the busiest cell (`focusX/Y`). Cached in
                          `localStorage["wom.slidePalette"]`; `window.__slidePalette` reads a
                          picture from the console (SPEC notes 117, 118)
    slideFrame.ts         the one frame every announcement slide is cut to — SLIDE_FRAME
                          (1600×1200, 4:3): frameImageBlob re-cuts a picture as it is uploaded and
                          framedImageUrl cuts one that is already on the site in the browser as it
                          is shown — the whole picture is contained on a blurred, taken-down copy
                          of itself, never cropped. `window.__slideFrame` drives it from the
                          console (SPEC notes 122, 122b)
  data/
    site.ts branches.ts sermons.ts content.ts
    currencies.ts         GENERATED — country → currency (246 countries) and a dated snapshot of
                          the exchange rates the live feed gives (SPEC note 98; recipe above)
    copy.ts               every editable page string, plus ct() / COPY_PAGES, the role rules
                          (button / page title / section title) and copySegmentsOf()
    autocopy.ts           GENERATED by tools/auto-copy.mjs — the small words recovered from
                          the components with their role, merged into COPY_PAGES by copy.ts
    live.ts               the live stream: provider, links, on-air flag, watch cards
    photos.ts             every picture on the site: slots, where each is used, overrides
    slides.ts             the home page's announcement slides: the eight designs, the two the
                          site ships with, and the assigner that gives every upload a design of
                          its own (SPEC note 116)
  components/
    ui.tsx                icon set, buttons, cards, badges, fields, modal, accordion, toasts,
                          tabs, counters, monograms, share row, Rich (inline copy markup) —
                          reveals, modals, toasts, accordions and collapses all animate
                          through framer-motion variants from `src/lib/motion.ts`
    editor.tsx            the office's widgets — status pill, dashboard, photo upload, field
                          video upload (which re-cuts a picture to the slide frame when the field
                          asks it to), publish + tools modals (shared by the drawer), the live
                          controls (LiveControlPanel) and the events *Happening now* panel
    layout.tsx            top bar + live service pill, header, menu dropdown, command palette,
                          footer, page head, scroll-to-top
    blocks.tsx            sermon/branch/event/testimony/ministry/person cards, video
                          player (embedded or uploaded file), SermonWatch (plays in place, with a
                          platform switch), map panel, the sub-branches popup, countdown,
                          next-service card, newsletter
    liveclock.tsx         the waiting screen while the service is on and the stream has not opened:
                          the last broadcast's still, faded, under a CSS-3D ticking clock
                          (SPEC note 133)
    slides.tsx            the announcement slide space: the eight poster designs, the track
                          carousel (arrows, dots, drag/swipe, self-advance that stops when
                          touched), the auto-fit (re-measured on a ResizeObserver) that keeps the
                          words inside the poster, the picture's own palette driving every design
                          (src/lib/palette.ts) on the one slide frame every picture is cut to
                          (src/lib/slideFrame.ts), and the ?slides=all preview of the whole set
                          (SPEC notes 116–118, 122)
    ErrorBoundary.tsx
  pages/                  Home, About, Locations, Sermons, SermonDetail, WatchLive, Events,
                          Testimonies, Giving, Prayer, Contact, Visit, Devotional, Ministries,
                          Library, NotFound, Admin (the editing shell laid over any page)
  styles/                 global.css (tokens + primitives), pages.css (page/section styles),
                          admin.css (field controls), edit.css (bar, drawer, the jobs/search/gate)
  tools/auto-copy.mjs     finds the remaining hard-coded words, records their role (button /
                          page title / section title) and turns them into copy entries
  assets/
    logo.png              the church seal — the original uploaded file (source of truth)
    logo-mark.png         transparent-background cutout of the same logo, auto-derived from
                          logo.png (black backdrop stripped, un-premultiplied edges) and
                          cropped to the artwork. This is what the header + footer use so the
                          logo melts into the page background. Rebuild recipe below.
    img/*.jpg             photography used across the site
```

### logo-mark.png rebuild recipe

```js
// execute_js: derive the transparent logo from the original
const bytes = await fs.readFile("src/assets/logo.png");
const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
// alpha = clamp((max(r,g,b) - 12) / 22, 0, 1); un-premultiply rgb where 0 < alpha < 1;
// then crop to the alpha>6 bounding box + 6px padding and write src/assets/logo-mark.png
```

The header logo is inverted in light theme with `filter: invert(1) hue-rotate(180deg)`
(see `[data-theme="light"] .brand__logo` in `styles/global.css`) so the white logo text stays
legible on the cream background without any box behind it.

**The `tone="light"` band stays light in both themes.** `.section--light` reads its colours from
`--band-invert-*`, which are cream/parchment + dark ink in *both* themes (light theme included), so
the "Get involved" band sits inside a light page instead of cutting a dark
slab through it; `[data-theme="light"] .section--light` adds the warm wash + hairline edges. The
`.section--light .eyebrow/.badge--*/.tag/.muted` accents use `--on-light-*`, which therefore hold the
dark inks in both themes too.

**Button colour gotcha:** the platform injects `normalize.css` containing
`button:not([disabled]) { color: inherit }` (specificity 0,1,1), which out-ranks single-class colour
rules — so anything that must set ink on a `<button>` needs `:not([disabled])` (or ≥2 classes) in its
selector. All of ours are collected in one block in `styles/global.css`; add new button components
there if their colour must differ from inherited text. (Where a plain `<button>` only needs *part*
of itself inked — the `.branch-card__subs` row's words and chevron, SPEC note 86 — the colour sits on
the inner span/svg's own class instead, which the reset never touches.)

**Theme parity rules of thumb** (both themes were audited page-by-page):
- Surfaces that stay dark in *both* themes — the top bar, the footer, photo badges
  (`.split__badge`, `.event-card__date`) and the "tap to reveal" curtain — must use the
  theme-independent shades: `--gold-on-dark`, `--muted-on-dark`, `--line-on-dark`. The top
  bar/footer do this by re-declaring the dark tokens inside `[data-theme="light"] .topbar`/`.footer`.
- Never use `--gold-2` as a fill stop: it is a *dark* shade in the light theme. Gold fills
  (`.btn`, `.amount-btn--active`, `.monogram--gold`) use `--gold-sheen` instead.
- Text colours: `--text` > `--muted` > `--faint`. `--faint` is only for small captions and is
  tuned to just clear 4.5:1 on the page background in each theme.
- Re-run the audit after theme/styling changes (a scratch script compositing real effective
  backgrounds + checking WCAG ratios and overflow across every route × theme).

### The clocks and the money — the church's own, and the visitor's own (SPEC notes 84/85, 98)

Where a time is *written* and where it is *shown* are two different questions, and the site keeps
them apart:

1. **The church's own clock** — `churchTimezone()` in `src/lib/store.ts`. The head office is in
   Lagos, so a time the church writes down (the Sunday gathering, the office hours, the day today's
   verse belongs to) is written in `Africa/Lagos`. Set it in the drawer (*Church profile → Time
   zone*); an unknown zone name never throws — it falls back.
2. **A branch's own clock** — `branchZone(branch)`, the branch's `timezone` field (editable under
   *Service times & branches*), or the church's when it names none. 9:00 AM in Dallas *is* 3:00 PM
   in Lagos, so the *instant* of a gathering is worked out in the zone of the city it happens in.
3. **The visitor's own clock** — `visitorTimezone()`, found from the visitor's **IP address** the
   moment the site loads (`src/lib/visitor.ts`) and remembered in `localStorage`
   (`wom.visitorClock`), so a returning visitor is painted in their own time on the first frame.
   This is the clock the site **shows**: `siteTimezone()` returns it when it is known, so every time
   a visitor reads — the header pill, the countdowns, the schedule tables, the event dates, a
   gathering's "ends about" — is their own. `clockAt(instant)` and `clockHere(time, day, fromZone)`
   are the two helpers that turn an instant or a weekly schedule entry into the day + time the
   reader's clock shows. The small "which clock is this" pill that used to say so
   (`<LocalTimeNote />`, *Times shown in your local time · <place>*) was removed at the church's
   request (SPEC note 93), so nothing on the page names the reader's clock any more — the times are
   still the reader's own while the office's switch is on.

The office can switch the whole thing off — *Church profile → **Show each visitor their own time
zone*** (`SITE.visitorTime`, `setVisitorTimeEnabled()`) — which puts every reader back on the
church's clock; that is the switch to use if the church ever wants one clock for everybody.

The lookup is a **plain `fetch`**, never a server proxy: the proxy sends the request from the
server's address, so the service would answer with the *server's own* location and every visitor would be told
the same city. Four keyless, CORS-open services are tried in turn (`ipapi.co/json`, `get.geojs.io`,
`ipinfo.io`, `ipapi.co/timezone`) and the answer carries the country and its currency as well as the
zone; if none answers, the visitor's *device* is used instead — its time zone, and the region of its
own language ("en-NG" → "NG") for the currency; failing even that the site stays on the church's
clock and the church's currency. Nothing is stored on a server.

Passing no zone means "the reader's" for anything that *shows* a time — `todayKey(d)`,
`fmtDate(date, style)`, `fmtTime(date)`, `zonedParts(date)` — and "the church's" for anything that
*creates* an instant — `nextOccurrence(slot, now)`, `nextService(schedule, now)`,
`zonedTimeToUtc(...)`. **Never** reach for `getHours()`, `getDay()`, `setHours()` or
`toLocaleDateString()` without a zone when the value decides something a visitor reads: that is
exactly the bug note 84 replaced (a member in Dallas used to be told the Lagos 7:00 AM service
started at 7:00 AM his time).

> **One React trap to know about:** the pages are built once and cached (`src/lib/routes.tsx` hands
> back the same element every time), so when only something *above* the page changes — the visitor's
> clock arriving, for instance — React skips re-rendering the page. `SiteApp` clones the element to
> carry such a change down without remounting, and the drawer's `pageNode` memo lists the visitor's
> zone among its dependencies. Remove either and the page keeps the old clock until the reader
> navigates.

### The money — written in the church's currency, read in the visitor's

The same answer that gives a visitor their clock gives them their **money** (SPEC note 98). The site's
figures are written in one currency — `baseCurrency()`, from *Church profile → Currency*,
US dollars by default — and every visitor reads them in their own:
`displayCurrency()` returns the currency of the country their IP is in when the office's switch is on
and a rate exists for it, and the church's own otherwise. `fmtMoney(amount, currency)` names the
currency the *amount* is in (defaulting to the church's) and prints it in `displayCurrency()`;
converting into the currency an amount is already in is a no-op, so a reader of the church's currency
sees the office's own figures untouched. Converted amounts are rounded to three significant figures
(`roundNice`, inside `fmtMoney`) so a rate never prints "₦38,281.34" where the office typed $25.
`moneyText(text)` rewrites the `$…` figures inside the church's own prose (an event's *"$15 per teen"*,
*"Where every $100 goes"*) for the same reason — a `$` in the office's copy always means the church's
currency.

### A count of one — `tidyCount`

The countdown and duration lines are composed from a number and a unit the office can reword
(`{{days}} days`, `hours`, `{{v0}} days`), so a line that lands on one would read *1 days*.
`tidyCount(text)` (`src/lib/store.ts`) puts the phrase right as it is drawn — *1 day* — the same idea
as `moneyText()`, for counts (SPEC note 103). The places that compose a count and a unit wrap it: the
events page's featured eyebrow, its timeline's day badge and the featured card's `… · {n} hours`,
the visit wizard's service length, and the live panel's next-broadcast line. The event card's own
*when* line already branches to *Today* / *Tomorrow*; the header's countdown uses bare unit letters
(`2d 5h 30m`), the big `Countdown` clock uses `days/hrs/min/sec` labels, and `relativeTime()` goes
through `Intl.RelativeTimeFormat` — none of those need it.

- **The rate** (`src/lib/rates.ts`) is fetched by the visitor's browser from a keyless, CORS-open
  daily feed (`@fawazahmed0/currency-api`, its second mirror, then `open.er-api.com`), kept in
  `localStorage` (`wom.fxRates`) for half a day, and re-checked on wake. `ratesNeeded()` is false when
  the reader's own currency is the church's, so nothing is fetched for them.
- **The snapshot** (`FALLBACK_RATES` in `src/data/currencies.ts`) is used until — and if — the fetch
  lands, so no page ever waits on money. It is regenerated by hand when it drifts too far:

```js
// Regenerate src/data/currencies.ts (SPEC note 98). Country → currency comes from
// world-countries (restcountries data); rates from the feed's usd.json, keeping only
// the currencies that table uses. Seven countries are pinned by hand afterwards —
// they are listed in the file's own header.
await tools.fetch_url({ url: "https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json", path: "scratch/fx/world-countries.json" });
await tools.fetch_url({ url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", path: "scratch/fx/currency-api.json" });
// then rebuild the two tables in execute_js and write src/data/currencies.ts
```
- **The switch** is *Church profile → Show each visitor their own currency* (`SITE.visitorCurrency`,
  `setVisitorCurrencyEnabled()`); off, every reader gets the church's currency and figures exactly as
  the office typed them. Nothing on the page announces the conversion: the short note that used to sit
  under the amount buttons (*Amounts are set in USD and shown in NGN …*) was removed at the church's
  request the same day it was added (SPEC note 99), so do not add a rate line back without asking.

### Branches and their sub-branches (SPEC notes 78–82, 86, 87)

A branch is one entry of `BRANCHES` (`src/data/branches.ts`); a **sub-branch** is an entry that names
a parent in `parentId` (the drawer's *Add a sub-branch* button sets it, and the *Sub-branch of* picker
changes it — SPEC note 131 took the *Global HQ* and *Sub-branch* switches out of the form, so
`parentId` is now the one thing the office sets; the section's `bind` keeps the `isSub` flag in step
with it, which is what the page's own readers use). `subBranchesOf(branch)` is the one definition of
"what a branch has under it" —
the Locations page's nesting, the branch card's *Sub-branches* button and the drawer's row count all
read it, so they can never disagree. The button opens `SubBranchesPopup` (in
`src/components/blocks.tsx`), which lists each sub-branch with its address, its next gathering (on
the reader's clock, note 85) and *View branch* / *Get directions*. In the drawer, a branch row's
aside reads `Lagos · 3 sub-branches` when it has any (`Lagos` alone when it hasn't); the count comes
from the section's **live** list (`SectionDef.itemMeta(item, list)`), so an entry the office has just
added is counted before it is published.

**No branch ships with sub-branches** — the church asked for Lagos, the one branch that had them, to
be empty like the rest (SPEC note 87) — so the shared `isSub`/`parentId` machinery is there and
unused until the office adds one. Two consequences worth knowing: the stats row on the Locations page
prints its third chip (`N sub-branches`) only when there are any, and **a stored draft can pin the
old sub-branch structure** — the drawer's *Branches* section is a list, and a stored list overrides
the shipped one, so after changing `branches.ts` the section must be reset in the drawer
(*Put this back to the original*) or the drawer will disagree with the page and count a change nobody
made. If the section is reset, its `dirty` flag (in `wom.cms.draft`) is set, and a flagged section is
never re-based onto the shipped list again — clear that flag by hand if the section should stay a
follower.

### Routes (clean addresses, so every page is shareable)

/ · /about · /locations · /sermons · /sermons/:id · /watch-live · /events ·
/testimonies · /giving (aliases /give, /donate) · /prayer · /contact · /visit ·
/devotional · /ministries · /library · anything else → 404 page.

Old `#/…` bookmarks still open: they become the same clean address on load. The
giving page's three panels are addressable too: `/giving?tab=funds` and `/giving?tab=other` open
*Where it goes* and *Account details* (`/giving` alone is *Steps*, the wizard, and anything unknown
falls back to it). Home's giving band uses this, and so does the *Give now* button at the top of the
giving page — it opens *Account details*.

### Data & privacy

There is no backend. Everything a visitor creates — prayer requests, testimonies (with
optimised photos), giving records, notes, reading progress, visit plans, saved sermons — is kept
in `localStorage` under `wom.*` keys and can be wiped from **My library → Clear my data**.
Forms that need to actually reach the church open the visitor's own mail client (or WhatsApp)
with the content pre-filled; nothing is transmitted without them sending it.

Two small lookups leave the visitor's browser by themselves (never through a server proxy, and
neither is stored on a server): the IP-geolocation service that answers *where is this visitor* —
which their time zone and their currency both come from, and which is cached in `wom.visitorClock` —
and the public exchange-rate feed the money is converted with, cached in `wom.fxRates`. Both send
nothing but the request itself, the same address every request to any server already reveals.

---

## 4. Feature list (per the brief)

- **Home** with the four required calls to action: *Watch sermons*, *Locate our family*,
  *Prayer request*, *Share your testimony* (the hero buttons carry all four; the quick-action tile
  grid and the stats strip that used to repeat them were removed at the user's request), plus a live
  next-service countdown, latest sermons, testimonies, events, branch strip, ministries,
  verse of the day and a giving band. The hero itself is the banner photo with the church's own
  picture laid over it as a visible texture behind the words (SPEC notes 119–120) — swapped, like
  every photo, from *Photos & covers*.
- **The welcome box is a slide space, not a photograph** (SPEC notes 116–118). The office uploads
  announcement pictures under *Events & notices → Announcement slides* and each one is **composed**
  into a designed poster carrying their own words — eight hand-drawn designs, one per picture,
  chosen from the picture's address so it never changes behind their back. **Each slide takes its
  colours from its own picture** (`src/lib/palette.ts`: the upload is sampled for its dominant hue,
  and the poster's ground, paper, accent and every ink are built from it with the contrast checked
  and nudged until the words read) — a blue flyer, a red one and a black-and-white one are three
  different posters rather than one poster three times; the same read says which side of the picture
  is quiet (where the words may sit) and where it is busiest (so the artwork keeps it).
  **Its shape, though, is one frame for every slide** — 1600×1200, 4:3, `src/lib/slideFrame.ts`
  (SPEC note 122) — so the band is the same size whichever announcement is on it. The office's
  picture is *re-cut to that frame rather than cropped into it*: the whole picture is shown, and the
  room it leaves is filled with its own colours, blurred and taken down, with a soft shadow under
  the print. That happens as the picture is uploaded, and again in the browser for any picture
  already on the site at another shape, so the space is uniform however a slide's picture arrived.
  (A one-press *Fit the slides I have already posted* action for re-cutting the stored pictures was
  removed at the office's request — SPEC note 122b.) **No design crops the picture**: seven draw it
  full-bleed
  and the eighth (*Sanctuary arch*) holds it in an arch cut to the frame's own landscape shape, so
  the whole drawing is on show in every one of them (measured: every picture box in the eight-design
  preview is 4:3 — SPEC note 122a).
  The slide then runs the **full length of the page** (edge to edge, no frame, starting at the top of
  the band) with the welcome copy underneath it — two columns where there is room, one on a narrow
  screen (SPEC note 121). The space is a **slider**: the slides
  ride a track that glides sideways, with arrows, dots, a finger-drag, and a 9-second self-advance
  that holds the moment a visitor touches it; the words auto-fit so they can never run off the
  poster, and the years-of-ministry count is the poster's **caption underneath it**, lined up with
  the page's own gutter — as a chip *over* the picture it landed on the poster's own words in five
  of the eight designs, so it sits below instead. `?slides=all`
  on any address shows every design at once.
- **Watch sermons** — its own page: featured player, search + speaker/year filters and
  sorting, and a per-sermon page with player, key points, scripture, discussion
  questions, personal notes (saved per sermon), save-to-library, mark-watched, outline/ICS
  downloads, share row and a "Previous sermons" strip whose cards play in place (`SermonWatch`).
- **Watch live** — its own page: a screen at the top that plays the service **on the site**, with a
  YouTube/Facebook switch and buttons that open either platform. The screen tells the truth about
  the broadcast — *Live now* with a blinking red dot and the player opening by itself while the
  church's channel is on air, and a *Live has ended* state (over a dimmed still of the last service,
  with a *Catch up with recent services* button that scrolls down to the band below and a *See
  previous sermons* button to the archive) when it is not. On air with nothing to play — no stream
  link given yet — the frame keeps the most recent service under a notice that says so, and the
  heading names the gathering the clock has on rather than the office's *Headline while live* (SPEC
  note 105); then *Last message*, *Recent services*
  (the last six services we streamed, read from the channel, each
  playing in place with a *Watch on YouTube* link and an "older livestreams" note with buttons to
  both platforms) and *Previous sermons* (the office's uploaded messages, newest first, up to the
  office's own number — twenty to start with — each an in-place player), and the
  ways-to-watch cards — *Live stream*, *YouTube*,
  *Facebook* and *Sermon archive*, the same four cards the sermon archive shows (`WatchCards`, one
  component for both pages; the YouTube and Facebook cards open the stream link, the channel or the
  site's socials entry; fixed content since SPEC note 110). (The *"Where to tune in"*
  broadcast-partner segment was removed at the user's request.)
- **Locate our family** — its own page: the seven branches grouped into their countries (**Nigeria,
  America, Canada**, in the order the countries appear in the data — Nigeria leads because the head
  office is Lagos), each block headed by its flag and count. **No branch ships with sub-branches** —
  the office asked for Lagos, the one branch that had them, to be empty like the rest (SPEC note 87),
  so every country is one grid of plain cards. A branch that *is* given sub-branches (the drawer's
  *Add a sub-branch*) shows them beneath it in a panel of its own — a border and a gold rule on its
  left edge, and **no words at all**: the office had the `Sub-branches · Lagos` header and the
  `SUB-BRANCH` chips on the cards removed, and the head office's name shortened to *Overcomers'
  Cathedral, Lagos* (SPEC note 80). What says it now is that panel, the box that no other branch has,
  and the branch's own **Sub-branches** button (SPEC note 86).
  Country chips +
  search, “use my location” (geolocation → distance sorting), **Get directions** — a popup with the
  branch in a 16:9 landscape map, the next gathering and the address, plus *Open in Google Maps* and
  *Copy address*, never a jump to another page — copy address, call, email, set-as-my-branch,
  weekly rhythm, and a branch panel that lists the branch's own details beside **Other branches in
  {country}** (a branch's country-mates, or the nearest branches once a location is shared)
  with each row switching the panel to that branch. There is no embedded map on the page — one is a
  press away behind *Get directions* (SPEC note 79).
- **Prayer request** — its own page: full request form (category, urgency, anonymity,
  follow-up), validation, a scripture of encouragement matched to the category, one-tap email /
  WhatsApp / copy, a public **prayer wall** with “I'll pray for this” counters, and a private
  “My requests” tracker with mark-as-answered.
- **Share testimonies with a “Share with us” button** — its own page: submission form with photo
  upload (resized client-side), category, city, anonymous option and consent, testimonies gallery
  with filters/search/sort, amen counters, full-story modal and share row.
- **Also included:** About (mission, vision, 8 convictions, story timeline, beliefs, leadership,
  FAQs), Giving (six preset amounts, six funds, the wizard's two ways to give — bank transfer and
  in person — under tabs *Steps*, *Where it goes* and *Account details*, the last holding only the
  Lagos account, which the *Give now* button in the page head opens, allocation breakdown),
  Contact (topic routing, office hours with live open/closed status, department table, map, emergency pastoral care), Events
  (featured event with countdown, filters, list/grid views, add-to-calendar that opens the
  device's own calendar), Plan Your Visit
  (4-step wizard → printable visit pass), Daily Devotional (verse of the day, 7-day reading plan,
  memory verses, reflection journal), Ministries (9 ministries, serving rotas, volunteer form),
  Watch Live (broadcast schedule, reminders, broadcast partners), My Library, and a command
  palette (⌘K/Ctrl-K) searching pages, sermons, branches, events and testimonies.
- **Advanced criteria:** dark/light theme with persistence, scroll reveals, scroll progress bar,
  live “LIVE NOW” service detection from the branch schedule, per-branch schedules, accessibility
  (skip link, focus-visible rings, aria labels, reduced-motion support, semantic landmarks),
  fully responsive layouts (verified at 390×844 and 1440×900), no horizontal overflow, error
  boundary, toasts, and zero runtime dependencies.

---

## 5. Known constraints

- Photos are AI-generated stock imagery for the template; swap `src/assets/img/*` for real
  photography (keep the same filenames or update `img()` in `src/data/site.ts`).
- The map embeds come from `openstreetmap.org` (no API key needed). Swap in a Google Maps embed
  in `src/lib/store.ts → mapEmbedUrl()` if the church prefers one.
- YouTube thumbnails/players hotlink to `i.ytimg.com` / `youtube.com`, which is normal for
  sermon archives. Some privacy setups send no referrer, and YouTube refuses to boot a player
  that arrives with none (`Error 153`), so every player `<iframe>` sets
  `referrerPolicy={EMBED_REFERRER_POLICY}` (`src/lib/embed.ts`). Keep that attribute
  on any new embed you add (the map iframe under it opts in the same way).

---

## Editing the site — the office's view (`/admin`)

The office opens **`/admin`** on the site. **/admin is not a separate console — it *is* the website.**
Every page under the prefix (`/admin`, `/admin/sermons`, `/admin/sermons/<id>`, `/admin/giving`, …)
renders the same page components as the public site, through `src/lib/routes.tsx`. The page itself is left exactly as the
visitor sees it — nothing is underlined, outlined or clickable — and every change is made from the
panel that slides in from the right:

- **The panel is the only door.** The bar's gold **What do you want to change?** button opens it
  (it is drawn only while the panel is closed — with the panel open the drawer's own ✕ closes it;
  SPEC note 63 removed the *Close the tools* form the button used to switch into).
  Its header reads **Admin Access**, and it has three tabs — *Edit*, *Update*, *Status* (*Update* is
  the default, and the bar's button opens *Edit*). *Update* holds the raw list of the sections the
  drawer offers, in 8 searchable groups — 35 of the schema's 54, because fifteen page-text sections
  are not offered anywhere at all and the four photo sections belong to the jobs (see *Page text the
  church had taken out* below). The
  **Edit** tab is the front door — a list of **eleven jobs** in plain language (*the words on every
  page*, *photos & banners*, *service times & branches*, *sermons & the live stream*, *events &
  notices*, *giving*, *church details & contact*, *ministries & serving*, *about/beliefs/numbers*,
  *prayer & testimonies*, *devotional & verses*) and the search box (`src/lib/jobs.ts`). **Every
  section the drawer offers belongs to exactly one of those jobs**, so any change can be made by
  clicking through the cards. A per-page card (*Everything on this page*) used to stand above them
  and left in note 52; the two broad cards left in note 57, their content was folded into the jobs in
  note 58, and the office asked for both back in note 62, so they stand first again and the fold was
  undone. `sectionsWithoutJob()` is the check that the promise still holds.
- **The words.** Page text is an ordinary field in the drawer (the *Page text* group, one section per
  page, plus *Site-wide text*), and its lines arrive in the order a visitor meets them
  (`copySegmentsOf` decides that order; the segment headings themselves are not printed — each line
  carries its own caption). It comes from `ct()`:
  the hand-written strings in `src/data/copy.ts` plus the small words (labels, placeholders, messages,
  tooltips) collected by `src/tools/auto-copy.mjs` into `src/data/autocopy.ts`. Typing shows in the
  field at once and reaches the page a moment later — the draft is applied live but *paced*, never
  once per keystroke (`applyDraftLiveSoon` in `src/lib/cms.ts`, SPEC note 61). Lines that
  are buttons, page titles or section titles are shown dimmed and read-only (`copyIsFixed`) — in the
  closed group at the foot of each page, with the labels and captions (see *A text section opens on
  its paragraphs* below) — and the lines marked `locked` (120 of them: the hero's CARE statement,
  the watch-live page's nine paragraphs, and the paragraph rows of every page-text section from
  About's Leadership line and Sermons down to Site-wide) are not
  listed at all (`copyIsLocked`).
- **Photos.** Every picture has a row in the part of the site it belongs to: the four *Photos &
  covers* sections are carried by the **Photos & banners** card (SPEC note 62), so a photo is changed
  where it is used — upload one from the phone/computer, or paste the address of one (`setPhotoValue`).
- **A message's video.** In *Sermons*, *Upload the video* takes a file from the phone/computer (up
  to about 25 MB is kept for good; a bigger one is hosted as a temporary file for a year and the
  office is told). It is the address that is stored; the field has no cover picture to set any more
  (SPEC note 126) — see *A message's picture comes from where it plays* above.
- **Find anything by its own words.** One box at the top of the drawer searches the whole site:
  the words visitors read (both their plain name and their wording), the items the office has added
  (a sermon, a branch, an event, a person), the photos by the name the office knows them by, and the
  sections themselves. Clicking a result takes you to the right page, opens the right part, and
  highlights the exact line or item it found.
- **Rows.** A list of records can be added to, reordered, duplicated and deleted inside the drawer;
  action bars stay out of the way until something is selected. A list whose entries can carry
  children of their own (the branches) declares a `tree` on its section: **every** entry then wears a
  **Sub-branch** button on its row (and a labelled *Add a sub-branch* once it is open) beside **Add a
  branch**, its children are indented under it with a chip naming its parent, and the relationship is
  editable through a *Sub-branch of* picker (SPEC note 78) — that picker, not a switch, is what puts a
  gathering under a branch (SPEC note 131). The foot of such a list adds a branch, a
  whole new country, or a sub-branch under a branch chosen from a list (`makeCountry` / `makeNewFor`,
  SPEC note 81). The button keeps its word at every width: on a phone the row wraps, so the branch's
  name stays uncut and the named **Sub-branch** button sits beneath it (SPEC note 82). Nothing is
  public until **Publish**.
- **Undo one change.** **Undo** in the bar takes back your last change (typing a sentence counts as
  one); **Discard** throws away everything you have not published yet. The drawer header's **ⓘ**
  opens *How to update the website* (the bar's own copy of that button left in SPEC note 63).
- **See what you have not published.** The bar's `N unsaved change(s)` pill is a button: it opens the
  drawer on one row per changed part of the site, each said in the office's own words (*Live stream —
  YouTube channel to watch for live: empty → @twocorg*), each row opening that section's fields, and
  each carrying a small **Delete** that drops that one change alone (`pendingEdits()` /
  `revertSection()` in `src/lib/cms.ts`, SPEC notes 114 and 137). The count it opens with *is* the pill's count
  — both come from `pendingSections()`, so they can never disagree.

Browsing from /admin stays in /admin: `buildUrl` in `src/lib/router.tsx` prefixes every internal
link while the route is under `/admin`, and `absoluteLink()` (share links, QR codes) deliberately
does not. Links that must leave — "Open the live site" — pass `{ plain: true }`. Leaving that way
writes the drawer's place (page, tab, section, open or not) to
`sessionStorage["wom.cms.exitReturn"]`, so coming back reopens it exactly there; if the office has
not come back within five minutes the public site takes them back itself (`readAdminReturn()` /
`ADMIN_RETURN_MS` in `src/pages/Admin.tsx`, timer in `SiteApp`, SPEC note 152). A bare `/admin`
visit returns to the exact page last open there, while the memory is fresh (SPEC note 154).

### How it works

#/admin renders the same components as the public site — that is what makes the panel's preview
exact — but the page itself is read-only, and `ct()` returns plain text everywhere. The only edits
come from the drawer, which is driven entirely by the schema in `src/lib/cmsSchema.ts`: a field
writes through `setCopyValue` / `setPhotoValue` / `patchSection` into the draft, and
`cms.setAutoPreview(true)` (set while Admin is mounted) applies the draft to the data modules, so
both the admin route and, in the same browser, the public route re-render as you edit. Because of
that, `applied()` shows the **draft** while editing, so `pendingSections()` compares the draft
against **the last published** overrides (never against `applied`) — the "N unsaved changes" count
and the publish patch both depend on this. `pendingEdits()` says *what* those changes are (the drawer
view the pill opens, one line per field/entry, SPEC note 114) and `revertSection(id)` puts one
section back to what is live, alone and undoably. The draft follows the content the other way too: the
editor's draft is a clone of whatever was applied at the moment it was first opened, so
`applyOverrides()` (the one place what-is-live changes: the local cache landing, the server
answering, a re-publish after a reload) calls `rebaseDraft()` — sections the office has not touched
are pulled back into line with the new content, sections they have touched are left alone. That write
is why `startCms()` reads the **stored draft first** and `persistDraft()` refuses to write anything
until it has (`draftLoaded`): the drawer mounts first and makes itself a draft of the shipped words,
so applying the cache before reading the stored draft wrote that draft over the office's own — a
reload silently threw away everything they had not published yet (SPEC note 112). Without
it, opening `/admin` directly in a browser would open a draft of the *shipped* words, report a
change nobody made, and publish those shipped words over the office's own. The same pass must then
**put the draft back on the page** (`showDraftIfEditing()`, at the end of `applyOverrides` and of
`startCms`): the drawer mounts before the stored draft is read, so without it a reload leaves the
page behind the drawer showing the *published* content while the drawer shows the office's own edits
— an edit that is saved and looks dead (SPEC note 83).

**The live preview is paced, and the page behind the drawer is never remounted.** Two rules, both
learned the hard way (SPEC note 61):
1. **Apply the draft on a timer, not per keystroke** (`applyDraftLiveSoon`: ~160ms after the last
   change, never less often than 600ms while typing). The drawer reads the *draft*, so its fields
   update on the spot; only the page behind them needs the applied snapshot. Applying per keystroke
   also re-bound all 54 sections and re-drew the page 30×/second, which is what "it hangs while
   making changes" was.
2. **Keep `<main>`'s page node stable** — memoised on `resolved.to` and `state.version`, with
   `cloneElement` to force the re-draw when the content changes. `resolvePath` hands back a fresh
   element on every Admin render and `key={state.version}` used to *remount* the whole page on every
   preview: that threw away and rebuilt the site (and every IntersectionObserver in it) once per
   keystroke. The page subtree is a child of the Admin shell, so anything that makes the shell
   re-render per keystroke re-renders the page too unless the element it is handed stays the same
   object — hence the `useMemo`.

**Derived values key on data, never on a record's identity.** The CMS applies an edit by mutating the
record in place (`syncObject` in `src/lib/cmsSchema.ts`), so a sermon, an event or a card keeps the *same
object* after the office changes it — which is what makes the draft rebase and the publish patch cheap, and
what silently breaks any `useMemo`/`useEffect` keyed on that object: the source list of a message, its
player. Key on the fields you actually read (`sermon.youtubeId`, `event.branchId`, …). Two of
those were found and fixed when the *last message & previous sermons* board was built (SPEC note 108);
treat this as the rule for anything new.

One convention is load-bearing: **the shell root carries both classes, `className="admin eshell"`.**
Almost every rule in `src/styles/admin.css` is scoped `.admin …` and the shell rules live in
`src/styles/edit.css` under `.eshell`/`.editbar`; trimming the root to `eshell` alone silently
unstyles every field control.

Layout: `src/styles/edit.css` (the bottom bar `.editbar`, the drawer `.epanel`, the update centre's
jobs/search/gate) plus `src/styles/admin.css` (the controls themselves). The bar measures itself into
`--editbar-h`, which pads the page and lifts the scroll-to-top pill. Both themes come from the site
tokens; at ≤860px the drawer goes full-width, the connection pill and utility labels drop, and below
700px the call-to-action button becomes its pencil icon.

One CSS rule in that file is load-bearing: **the drawer's body must never squeeze its rows.**
`.epanel__body` is a one-column grid with `flex: 1; min-height: 0; overflow-y: auto`, and it carries
`grid-auto-rows: max-content`. Without it, a grid whose container is shorter than its content shrinks
`auto` rows toward their min-content size — and a section card is `overflow: hidden`, whose minimum is
0 — so on a short window every section collapsed to a 15px sliver with its title clipped out (the
"empty bars" of SPEC note 60). Keep that line if the body's display ever changes.

### What it edits

**54 sections in 9 groups**, driven entirely by the schema in **`src/lib/cmsSchema.ts`** — creating a
new editable field means adding one entry to a list, not writing UI. The drawer does not offer all
54 of them: fifteen page-text sections are `hidden` (they are gone from the editor entirely) and the
four photo sections are `everythingHidden` (out of the *Update* tab, carried by the **Photos &
banners** card instead) —
see *Page text the church had taken out* below and SPEC notes 51 and 62.

| Group | Sections |
| --- | --- |
| Church | Church profile, Leadership, Contact desks, FAQs, Message topics |
| Services & activities | Weekly services, Branches (grouped by country, with the **Sub-branch of** picker and *Add a branch* / *Add a country* / *Add a sub-branch* at the foot plus a **Sub-branch** button on every row), Ministries, Events & activities, Announcements, Announcement slides (the home page's slide space: a picture the office uploads is composed into a designed poster with their words on it, one design per picture, SPEC note 116), Serving rotas, Serving questions, What to expect, First-timer questions, Calendar filters |
| Teaching | Sermons (video link, notes, questions), Verse pool, Reading plan, Memory verses |
| Giving | Giving funds, Where giving goes, Bank details, Ways to give, Giving questions |
| About & numbers | Values, Statement of faith, Our story, Headline numbers |
| Live & broadcasts | Live stream (the YouTube / Facebook stream that plays on the page, the channel the page watches for a live broadcast **and** reads for the recent services — the last few services by date, one card per message however many times YouTube published it, SPEC note 113 — the office's three numbers — how many recent services to show, the hours promised for a write-up, and how many previous sermons the band lists — the on-air controls at the top of the section, **Start** / **Continue** / **Stop the livestream** — which the drawer also presses for itself when the stream ends on its own (SPEC note 111) — and the *Recent services* panel: the finished services the site is carrying, each with **Take it off the site** / **Put it back** — the write-ups themselves are edited in the *Sermons* section, with their own YouTube link, Facebook link and upload; the *Ways to watch cards* used to sit here too and were taken out at the church's request, SPEC note 110, so the four cards are fixed content now) |
| Prayer & testimonies | Prayer focus list, Prayer categories, Testimony categories |
| Photos & covers | Main photos, Ministries & programmes, Leadership photos — upload, choose or link a photo for every picture on the site |
| Page text | One section per page (16) — every heading, lede, paragraph, label, placeholder and caption on that page, e.g. *Home page text*, *Giving page text*, *Watch live page text*, *Site-wide text* (the header, footer and shared components, which every page can reach). The drawer now offers *Home* alone — *Watch live* came out at the church's request (SPEC note 105); the other fifteen are `hidden` |

Those nine groups are the schema's own organisation — they are what the **Update** tab prints apart
from the two it leaves to the jobs (all 35 of the 39 sections the drawer offers; it skips the fifteen
`hidden` page-text ones and the four `everythingHidden` photo ones) and how `cmsSchema.ts` is
arranged. The **Edit** tab in front of them is the office's view of the same content, split into the
**eleven jobs** in `src/lib/jobs.ts`; a new section should be added to a job there (a page's text
belongs to *The words on every page* and a photo to *Photos & banners*, whichever page it appears on;
the other cards carry the records of the part of the site they look after), and
`sectionsWithoutJob()` is the check that every offered section belongs to exactly one job — it reports
a section with no job *and* one listed twice (`sectionsInSeveralJobs()` reports duplicates alone).

**A door card names the door it opens.** The four *Ways to watch cards* are fixed content (their list
left the drawer, SPEC note 110), so their stored lines cannot follow the office's own settings — and
they had drifted: the YouTube card read `@worldovercomers` while opening whatever the channel, the
stream link or the socials entry said. `platformDoorName` (`src/lib/embed.ts`) takes the handle out
of the address the card links to (`youtube.com/@twocorg` → `@twocorg`, `facebook.com/church` →
`/church`) and `WatchCards` (`src/components/blocks.tsx`) prints that, keeping the stored words for an
address with no handle in it (a video, a search, an empty field) — so the card can never name a
different place from the one it opens (SPEC note 112).

**Icons are fixed.** Five sections used to offer an *Icon* picker — the social links, the
*Ways to watch cards* (that list left the drawer altogether in SPEC note 110), *Values*, *Prayer
categories* and *What to expect* — and the church asked for
every way to change an icon to go, so the `"icon"` field type left the schema and `FieldControl`
(SPEC note 107). The icons stay in the content (`live.watchOptions[].icon`, `contact.socials[].icon`,
…), so the site renders them exactly as before, and a new card still gets one from the section's
`makeNew`. `ICON_NAMES` in `src/lib/cmsSchema.ts` is kept as the list of valid names for code.

**Built for people who do not write code.** Everything is changed from the drawer beside the page
(the *Admin Access* panel) — nothing on the page itself is clicked, underlined or decorated, so
what the office sees is exactly what a visitor sees. The panel opens on the **Update** tab: the
parts of the site it still offers, grouped the way it is built, each opening into its fields (a
page's text opens on its paragraphs — see below),
with a search box over every word, record, photo and section. The **Edit** tab is the office's own
view of the same content — a short list of plain-language jobs for the whole site, each of which
opens that job's sections **in the same tab** (SPEC note 59; the drawer header
reads **Admin Access** alone — the page name it used to print left in SPEC note 62, as did the same
name in the bar's *Editing* pill). Between them the eleven jobs hold **every word, item and
photo on the site**, so a change is never more than one card away. **Status** shows
publishing state, the numbers and the activity log, with every number, notice, next activity and log
entry a link that opens the exact part it came from — the section, and the event or notice it names
(SPEC notes 53, 55, 56 and 58). The first visit opens a short welcome note and
a four-step explanation of how editing works, with the `*stars*` / `{{braces}}` reminder as a line
under it (both dismissible, and the welcome is remembered).

Because the office edits the real page, the pages show the *draft* while the panel is open: what you
type appears in the field at once and on the page underneath a moment later (the preview is paced, so
the panel never freezes — SPEC note 61). Read-only fields render dimmed with a dashed
border, so it is obvious at a glance what can and cannot be changed; entries fixed by the code (page
text, for example) have no Add or Delete.

**Page text is grouped into the page's own segments.** Opening a page's text section does not show
one flat list: the lines are grouped into the segments a visitor actually sees — *Hero*, *Welcome*,
*Latest sermon*, *Watch here*, *Sermon card* … in the order they appear on the page. `copySegmentsOf(pageId)` in
`src/data/copy.ts` builds those groups from the ids (the first two dotted parts, e.g.
`home.sermons.title` → the *Latest sermon* group; the group's name comes from the first entry's
label) and the group order is the order of the entries, which is page order. The group names
themselves are no longer printed (each line carries its own caption); the grouping is what decides
the order of the lines on screen.

**A text section opens on its paragraphs.** Only the lines with paragraphs in them are shown — the
church's own wording, in the order a visitor meets it, each in a box as tall as its sentence
(`copyIsParagraph(id)` / `copyLineRows(id)`, judged from the *shipped* wording so a box never changes
shape under the cursor mid-sentence; the CSS adds `field-sizing: content` so a box grows with what
the office types instead of clipping it). Everything else on that page — the site's own buttons and
titles (which cannot be reworded anyway) and the small words around them: labels, placeholders,
tooltips, email templates — waits in one closed group at the foot of the section, *The small words,
buttons & titles (N)*, so it is reachable without ever being in the way. A line the office has
already reworded is always shown up top, wherever it lives. A *locked* line is the one exception:
it is filtered out of both lists before they are built (`copyIsLocked`), so a line the church asked
to be left alone — 120 of them today: the hero's CARE statement, the watch-live page's eight
paragraphs, the paragraph rows of every page-text section from About's Leadership line and Sermons
down to Site-wide, the home page's whole *The small words, buttons & titles* group and About's four
remaining paragraphs (SPEC notes 47–50 and 64; the 15 recovered home lines are locked from the
`LOCKED_AUTO` set in `src/data/copy.ts`, because `src/data/autocopy.ts` is generated and only
`id`/`label`/`value`/`role` survive a re-run of the collector) — is not
listed, searched for or editable at
all (SPEC notes 47–50). What is left of *Home* is deliberately the office's: its six
paragraphs (About's went the same way — SPEC notes 64, 65 and 67). There is no help paragraph above the
lines — it was on all sixteen page-text sections and said the same thing — and its remainder (the
`*stars*` / `**bold**` / `[link](/giving)` / `{{brace}}` reminder, formerly `COPY_HINT` in
`src/lib/cmsSchema.ts`) was removed from the help note at the office's request too (SPEC note 63), so
it now appears nowhere in the drawer — it is documented here for whoever writes copy. The rule it
carried still holds: `<Rich>` in `src/components/ui.tsx` reads `*italic*`, `**bold**`,
`[label](/route)`, `{{token}}` and bare line breaks, so keep those characters where they are in an
existing line.

**How an entry's role is worked out.** `CopyEntry.role` is one of `button`, `pageTitle`,
`sectionTitle` (see `inferRole()` in `src/data/copy.ts` for the hand-written ids and `roleOf()` in
`src/tools/auto-copy.mjs` for the recovered ones, which records the enclosing JSX element — `<Btn>` /
anything with a `btn` class / a direct child of `<h1>`–`<h6>` / a `label` or `title` attribute on a
button-ish element). `copyIsFixed(id)` is the single question the rest of the code asks.

**Seven things are deliberately locked:** the **church name** (it comes from `src/data/site.ts` and the `site`
section neither reads nor writes it), the **logo** (no field at all — the artwork in
`src/assets/logo-mark.png`), the site's **buttons, page titles and section titles**, which are part
of the design rather than its content, and the lines the church asked to be taken out of the editor
altogether — 120 rows marked `locked: true` in `src/data/copy.ts` (the hero's CARE statement, the
watch-live page's nine paragraphs, and the paragraph rows of every page-text section from About's
Leadership line and Sermons down to Site-wide — `copyIsLocked()` reports them, the page-text section
drops them from both lists and the search box skips them, so the sentences still greet every visitor
while nothing in the drawer mentions them; SPEC notes 47–50). Fixed lines are still *shown*
in the editor (dimmed,
with a `Fixed · Button caption` tag) so nothing on a page is hidden from the office — they sit in
the closed group at the foot of the page's text section; they simply
cannot be reworded. `bindCopyPage()` refuses to store a value for one, `mergeSection()` in
`src/lib/cms.ts` ignores a stored value from before the rule existed, and `copyPageList()` reports
the shipped wording — so a fixed line always shows what the code ships.

**Page text the church had taken out.** A section can also be *not offered at all*: `SectionDef.hidden`
(`src/lib/cmsSchema.ts`) drops it from the *Update* tab, from its job and from the search box, and
`SectionDef.everythingHidden` drops it from the *Update* tab
only, leaving it to the jobs. Nothing in `src/lib/cms.ts` filters anything, so a hidden section's
content still loads, applies, publishes and renders — only the drawer stops listing it. Fourteen
page-text sections are `hidden` today (`HIDDEN_COPY_PAGES`: *Sermons, Sermon, Events,
Giving, Prayer, Testimonies, Plan a visit, Contact, Locations, Ministries, Devotional, My library,
Site-wide, About*), so the two page-text sections the drawer offers are *Home page text* and
*Watch live page text*, both carried
by **The words on every page** — the broad card that left the landing in SPEC note 57 and came back,
with the fold that had moved its content undone, in SPEC note 62. What it offers is Home's six
paragraphs; its small-words group is locked out entirely (SPEC note 64). About went the same way, twice:
its four paragraphs were locked in note 64, the section itself joined the hidden list in SPEC note 65,
was asked back in note 66, and was taken out again one request later in note 67. What the section holds
never changed through that round trip — its 26 small words, its `locked` paragraphs and
`about.leaders.lede` (locked since note 49) — which is why each step cost a single line. *Watch live*
came back the same way in SPEC note 73 (out since note 51) and went back out at the church's request
in SPEC note 105, so the lines behind *Recent services* and *Previous sermons* — their headings, their
card link and the small words around them — are no longer offered anywhere in the drawer (they still
render exactly as they do now, and its paragraphs stay `locked`, as the church asked). The four photo
sections are `everythingHidden` — they are the raw list's clutter: the **Photos & banners** card
carries them (SPEC note 62), so the office meets a photo under that card rather than in the raw list.
Both flags are read through `sectionIsHidden()` / `sectionIsEverythingHidden()`; see SPEC notes 51, 62, 65–67.

**Page text values** (`src/data/copy.ts`) are plain strings with light inline markup, rendered by
`<Rich>` in `src/components/ui.tsx`:

| You type | You get |
| --- | --- |
| `*slow*` / `**bold**` | italic / bold |
| `[Plan your visit](/visit)` | a router link (or a full `https://…` link) |
| a line break | `<br>` |
| `{{city}}` | interpolated by the page (e.g. the branch you are watching from) |

The drawer shows a plain description of the line (read-only) and the editable text. Small in-form UI —
validation messages, wizard chips, tab labels, button captions — is collected too (see *Every text,
not just the headlines*), so it is editable from the same list even though it reads as chrome rather
than the church's words; the captions that sit on buttons are the exception (see the locked list
above). Recovered lines without a home of their own are grouped at the end of their page's text
section under *Buttons, labels & small words*.

(The office inherits the theme the visitor picked on the site; the locked-field rule uses
`:not([disabled])` to beat the platform's `input:not([disabled]) { color: inherit }` reset — see
the button-colour gotcha in §3.)

Each section is plain JSON. `SectionDef.read()` clones the live data module to build the
defaults; `SectionDef.bind(value)` writes a snapshot back **in place** (arrays are emptied and
refilled, objects are `Object.assign`ed, items with an `id` keep their identity) so the page
components that hold references to those modules never go stale.

### Photos and covers

Every picture on the site is the office's to change, and all of them reach the page through
`src/data/photos.ts`:

- **`PHOTO_SLOTS`** lists the 17 shared photos (the home banner, the welcome picture, the ministry
  and leadership pictures …) with the drawer section each belongs to.
  Anything rendered through `img()` resolves at render time, so a replacement shows immediately;
  records that hold a bundled path of their own (a branch, a ministry, an event) are
  rewritten in place by `applyPhotos()`, but only while they are still on the original — a record
  given its own picture keeps it.
- **A record's own picture** is a normal `type: "image"` field in its section (leadership,
  branches, ministries, events, sermons `poster`).
- **`photoOr(value, fallbackKey)`** is how every card renders: an empty value falls back to a
  bundled photo instead of an `<img src="">`. The field definition carries the same fallback
  (`fallbackPhoto`) plus `emptyNote` for the cases where the site shows something other than a
  picture (a person's initials, a video's own still), so the drawer can say what a visitor sees.
- **The one control** (`ImageField`, `type: "image"`) offers exactly two ways to set a picture:
  upload from the device (`PhotoUpload` → `compressImageBlob` → the office server's `/__upload`,
  stored as the hosted URL), or paste the address of any photo. The caption above them says which picture is in
  use — no dropdown of names and no strip of ours, and the pasted-address box stays empty while a
  photo of ours is in use, so the raw bundled path is never shown. *Use the original photo* clears
  the field. The logo is deliberately not editable.

### How storing and sharing works

`scripts/cms-server.js` is the content server: sign-in, publishing, uploads, live updates. It runs
inside Node (`npm run dev` via `scripts/vite-cms-backend.mjs`, production via `npm start` /
`scripts/serve.mjs`), keeping the published content in `data/cms-state.bin`.

- The office edits a **draft** (kept in `localStorage` so a reload loses nothing) and presses
  **Publish**. Only the sections that actually changed are sent.
- The server stores **one blob per section** as UTF-16 code units, so every publish stays a few
  KB; `JSON.parse` is native and cheap, so the index/meta stay JSON.
- After a publish the server nudges every connected visitor over server-sent events; clients
  re-fetch and re-render — no reload needed for anyone, admin or visitor.
- The site renders **`{ ...defaults, ...overrides }`**: sections nobody has edited are the
  shipped code. `getContent` therefore only ever transfers what the office has actually changed.
- If a colleague publishes while you have a draft open, your untouched sections are rebased onto
  their change; only the sections you actually edited are kept (and re-published).
- If the office server is unreachable, the editor cannot sign in: editing takes an online
  sign-in and there is no offline back door
  (the old passwordless local preview mode was removed at the office's request). The sign-in
  card says so and keeps retrying by itself. A publish that fails mid-session
  still lands in this browser's pending queue and syncs when the server is back.

### The admin password

- Set to the **temporary password `12345678`** at the user's request (Aug 2026) so the office can
  get in immediately; rotate it to a machine-generated 40-hex-char secret before going public.
- Only its **SHA-256 hash** lives in the shipped source (`ADMIN_HASH` in `scripts/cms-server.js`);
  the plaintext appears nowhere in the code.
- The password is sent over HTTPS, hashed server-side (synchronous pure-JS SHA-256 in the
  server file) and compared. Failed attempts are rate-limited per connection and per
  network group.
- The unlocked state is kept in `sessionStorage` for that browser tab, so a reload does not
  force a re-type; the server still re-checks it on every privileged call, and only ever trusts
  a connection id it has authenticated itself.
- **To change the password:** pick a new secret, compute its SHA-256 hex, and replace
  `ADMIN_HASH` in `scripts/cms-server.js`:

```sh
node -e 'console.log(require("node:crypto").createHash("sha256").update("THE-NEW-PASSWORD","utf8").digest("hex"))'
```

then give the password to the office and tell nobody else. (Changing the server file bumps its
version stamp, which clears the publish *history* on next boot while keeping every published
section — so rotate it before content piles up, or re-publish once afterwards.)

Because the hash is public, a human-chosen password can be recovered offline by anyone who reads
the source — the current `12345678` is intentionally **temporary**; prefer a machine-generated
secret (40 hex chars is fine) for the real thing.

### Sub-admins (SPEC note 164)

- The main admin invites others from the **Tools** tab (*Who can edit the site → Sub-admins*).
  The browser invents a one-time code (`XXXX-XXXX-XXXX`, ~60 bits) and shows it **once**; only
  its SHA-256 ever reaches the server.
- The invited person picks *Use a one-time invite code* on the sign-in gate, enters the code,
  then creates their own password. The code dies the moment it is spent (and expires after
  7 days regardless). Afterwards they sign in exactly like the main admin — same tabs, same
  editing and publishing — except their Tools page holds only *Undo the last publish* and
  *End this session*.
- The main admin can delete a sub-admin (their live sessions drop at once) or revoke an unused
  invite. Records live in the server's meta blob (`subs`/`invites`, hashes only, caps 20/20);
  every privileged call re-checks the connection server-side, and the roster RPC never sends
  hashes out.
- Sub-admin password hashes are **not** in the shipped source (unlike `ADMIN_HASH`), so they
  can only be attacked online, behind the same per-connection / per-network rate limits as login.

### Main-admin two-factor (SPEC notes 165, 170)

- The main admin can switch on an authenticator app from the **Tools** tab (*Authenticator app*
  card): scan the QR (or type the 32-character secret) into Google Authenticator / Authy /
  1Password, prove it with a live 6-digit code, and set a security question + answer that only
  the office knows.
- Afterwards the password alone only earns the second step — every sign-in (any device, every
  reload) also takes the current app code, or the security answer when the phone is out of
  reach (capitals and spacing do not matter). The question can be refreshed any time from the
  same card (proof: a current code or the current answer). Flipping the card's switch off
  brings the security question — Done (a correct answer or a current app code) is what
  actually switches it off — and switching off clears the previous authentication: the
  signed-in main session is the proof, so only
  the main admin can do it. Only the answer's SHA-256 hash is stored — never the answer itself.
- The office password itself can be changed from the **Tools** tab (*Office password*
  card, main admin only) — but only while the authenticator app is on, and it first
  asks for the security answer (or a current app code), which travels with the change:
  the signed-in session alone is not enough. The new password works
  at once everywhere, and only its SHA-256 hash is ever stored (the shipped password
  stays as the fallback until the first change).
- The main password cannot be retired from the UI anymore (the **Main admin** card was
  removed at the office's request, SPEC note 169) — it always works. The server still
  refuses every change that would leave no way in (deleting the last sub-admin or revoking
  the last invite while the main sign-in is off, were it ever switched off via the kept
  `setMainOff` RPC — e.g. a signed-in sub-admin restoring an already-retired state).
- Server side (`scripts/cms-server.js`): pure-JS SHA-1/HMAC/TOTP with a ±1 step window, secret + answer
  hash in the meta blob, `login` returning the question with `needCode`, plus `login2fa` /
  `totpSetup` / `totpDisable` / `setSecurityQA` RPCs behind the same rate limits as login
  (5 tries per connection, 40 per network per 10 minutes — so the answer must still be
  something only the office knows). The secret is made by the office browser
  (`crypto.getRandomValues`) and only stored after a live code checks out, so a bad scan can
  never lock anyone out. Old spare codes, where present, are still honoured — but no new
  ones are made.

### Other tools

The bar's **tools** button opens the rest of the toolkit (the drawer's **Status** tab is the other
way in; its *Tools* button opens the same modal):

- **Undo the last publish** — re-publishes the override set from before the last publish (the last
  five are remembered in `localStorage`, per browser).
- **End this session** — signs the admin out: the drawer locks behind the office password again, in
  every mode (SPEC note 138).
- **Announcements** are a live-feature section: notices dated within the last 21 days and flagged
  active render in a dismissible strip under the header (`AnnouncementBanner` in
  `components/blocks.tsx`). No list in the drawer asks the office for a *URL id* any more —
  entries are named after themselves as they are applied (`mintIds()` in `lib/cmsSchema.ts`,
  SPEC notes 104, 124, 191).
- A diagnostic handle is exposed for the browser console: `window.__churchCms.socket()`,
  `.state()`, `.overrides()`, `.applied()`, `.sync()`, `.unsaved()`, `.draft()`, `.set(id, value)`,
  `.pending()` (what has not been published, the drawer list's own data), `.revert(id)`,
  `.planned()`, `.finishPlanned()`.

### Copies without the office server

A deployed copy with no office address (blank `cms-server.txt`, no console override) stands alone:
it reads its baked words plus the live feed, and the admin console's sign-in card says plainly
that editing needs the office connection. Drafts and the pending queue still work in the browser,
and sync when a server is joined. See `DEPLOY.md`.
