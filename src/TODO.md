# TODO / handover notes

## Before going live

1. **Swap the sermon videos.** `src/data/sermons.ts` currently points at public teaching videos
   (demo content) with real titles/speakers/durations. Replace each `youtubeId` with the church's
   own uploads and update `speaker`, `durationText`, `summary`, `points`, `questions` and `venue`.
   Note what the drawer asks for now (SPEC notes 124, 126 and 128): *Message title*, *Speaker*,
   *Date preached*, *Where it plays from*, *YouTube video link*, *Facebook video link*, *Upload the
   video*, *Duration*, *Scripture*, *Summary*, *Sermon points*, *Discussion questions* and *Venue* —
   a message's `id` is made from its title and **`speakerRole` has no field any more**, so the
   "Guest Teacher" line under each demo speaker is edited here in the data (or removed from
   `SermonDetail.tsx`'s downloaded outline — the line that printed it on the message page's *Watch &
   share* tab went in SPEC note 129) if the church wants it gone. A demo message's
   date comes from its `weeksAgo` (there is no field for that either — it is what gives the shipped
   nineteen messages their Sundays); once a `date` is set it wins.
2. **Replace the photography** — either from the editor (the *Photos & covers* group in the drawer,
   where any picture can be swapped for an upload) or by dropping new files into `src/assets/img/` (same
   filenames, or update `PHOTO_SLOTS` in `src/data/photos.ts`). Keep files ≲ 250 KB. The home hero's
   background picture is the church's own event photo (`hero-faint.jpg`, slot *Home page background*,
   SPEC notes 119–120) — swap it there if a different photo should sit behind the headline. It is a
   *landscape* photo and is cropped to fill the hero, so on a phone only a vertical slice of it shows.
3. **Confirm the real details**: church name/address/phone/email (`src/data/site.ts`),
   branch addresses, coordinates, service times, pastor names, bank accounts, department emails
   (`src/data/branches.ts`, `src/data/site.ts`). **Confirm the currency too** — *Church profile →
   Currency* (in `src/data/site.ts`) is the currency every amount on
   the site is *written* in and visitors are shown in their own country's, converted (SPEC note 98);
   it ships as `USD`, which matches the giving amounts and the event costs as written. Change it and
   every figure the office types means that currency instead. **The head office is Lagos, at Oke-Odo** — the city
   string reads just `Lagos` (SPEC note 82) while its street address is *Overcomers' Cathedral,
   Oke-Odo Road, Agbado Oke-Odo, Alimosho, Lagos State*; it has been the head office since
   SPEC note 79 — its coordinates are approximate and should be verified (item 5), and **the
   church phone/WhatsApp are still the Dallas numbers** (`site.ts`
   `phone`/`whatsapp`, and Dallas's own `phone`) while the HQ is in Lagos: decide which line should be the
   reception number and set it in *Church profile* / the *Branches* section. **The published
   content follows the list order** — the site now shows Nigeria first (Lagos HQ, then the Nigerian
   sub-branches, then America and Canada), so if a list is reordered in `branches.ts` the office must
   reset that section in the drawer (a stored list section fully overrides the shipped one).
4. **Confirm the branch structure** — the site organises `src/data/branches.ts` by `country`
   (**Nigeria, then America, then Canada** — the countries are emitted in the order the branches are
   listed, so put a country's first branch first, SPEC note 79). The Lagos branch is the **global
   head office** (`isHq`); **Abuja, Edo and Ogun are branches in their own right** — the church asked
   for Lagos, which used to carry them as sub-branches, to be empty like every other branch, so no
   entry in the shipped list has `isSub`/`parentId` at all (SPEC note 87) and every *Sub-branches*
   button opens on its empty state. All of it is editable from the drawer's *Branches* section (the
   **Sub-branch of** picker — the *Global HQ* and *Sub-branch* switches left the form at the office's
   request, SPEC note 131, so which branch is the head office is set here as `isHq: true` in
   `branches.ts`, and a gathering is made a sub-branch by the picker or by *Add a sub-branch*); the
   demo content for Abuja/Edo/Ogun
   (addresses, pastors, coordinates, phones, emails) is placeholder to be replaced with the church's
   real details. A gathering that belongs under one particular branch can be given it with
   **Sub-branch of** — or by adding it with *Add a sub-branch* on that branch (SPEC note 78), which
   is the same thing: `parentId` is what makes a gathering a sub-branch, and the Branches `bind`
   keeps `isSub` in step with it (SPEC note 131); the
   Locations page then lists it in the gold-ruled panel beneath that branch (and behind that branch's
   *Sub-branches* button, SPEC note 86) instead of the country's plain sub-branch block. The
   copyright line's double full stop (*…Ministries Inc.. All rights reserved.*) is **fixed** — the
   footer strips a trailing stop from the name in that one row (SPEC notes 94 and 103), so it reads
   *…Ministries Inc. All rights reserved.* whatever name is set.
5. **Verify each branch's coordinates** — the Get directions buttons and maps are built from
   `lat`/`lng`. While you are there, check each branch's **Time zone** (`Africa/Lagos` for the
   Nigerian branches, `America/Chicago` / `America/New_York` / `America/Toronto` for the North
   American ones): it is the clock that branch's next gathering is counted down to (SPEC note 84).
6. Check the social links in `src/data/site.ts` (`SITE.socials`) — they are placeholders.
7. Optional: set a nicer `$meta.image` (a worship photo) instead of the logo, and add
   `$meta.dynamic` if listings should vary per branch (`dynamic-metadata` skill).
8. **Post the church's own announcements in the slide space** (SPEC notes 116, 117, 122). The home
   page's welcome band is a designed announcement **slider** now — the slide runs the full length of
   the page (edge to edge) with the welcome copy underneath it (SPEC note 121) — and **every slide is
   one frame, 1600×1200, 4:3**: a picture is re-cut to that frame as it is uploaded, so the whole
   picture is shown and the band is always the same size (SPEC note 122); pictures already posted at
   another shape are re-cut in the browser as they are shown, so there is nothing to press — the
   one-press *Fit the slides I have already posted* action was removed at the office's request
   (SPEC note 122b). The two slides it ships with
   (`src/data/slides.ts`) are placeholders: *Welcome home* (the `choir` photo, pointing at `/visit`)
   and *We are live every Sunday* (the `worshipband` photo, pointing at `/watch-live`). The office
   replaces them under *Events & notices → Announcement slides* — upload the poster or flyer, type
   the two or three big words and the one small line, point the button somewhere, and leave *Design*
   on *Automatic* unless they want a particular one. Nothing has to be changed in code for that, and
   each upload gets a design of its own — and the slide takes its **colours** from
   that upload (`src/lib/palette.ts`: the picture's dominant hue becomes the poster's ground, paper
   and accent with the contrast checked), while its **shape** is the same frame for every slide
   (`src/lib/slideFrame.ts`, 1600×1200), so a real flyer in the church's own colours looks like
   itself rather than like the demo and sits in the same space as every other announcement. Worth
   checking the first
   real flyers in the preview (`?slides=all` shows all eight designs side by side) in case a very pale
   or very busy picture wants a different design pinned. Two things to keep in mind: the **years-of-ministry caption**
   (the caption underneath the poster, lined up with the page gutter) is
   `zoneYear() − SITE.founded`, so it moves with *Church profile → Founded (year)*,
   and the welcome **photo slot** (`welcome`) is now only the fallback used when there are no slides
   at all or a slide has no picture.

## Possible next steps

- Real giving integration (Stripe/Paystack/Flutterwave checkout link per fund). The page now
  documents the two real channels only — bank transfer and envelopes — plus the Lagos account, and
  adds no reference of its own (SPEC notes 88–90). The page's *Give now* button and Home's both open
  the *Account details* panel, and the panel is in the address (`#/giving?tab=funds` / `?tab=other`,
  SPEC note 91) — so a real checkout link, when there is one, should be given its own tab id there.
  The note field at the foot of step 3 is still collected and read by nothing.
- Sermon audio/podcast feed (RSS) and per-sermon transcripts.
- Small-group finder with per-group geography (reuse the geolocation code in `Locations.tsx`).
- Online giving statements (export as CSV/PDF) — worth doing once there is a real processor behind
  the page; the local giving log an older version filled is now read-only (SPEC note 88).
- Multi-language UI (the data files are already split from the components).
- Event registration with capacity counts (needs a backend endpoint on the office server).
- Push reminders for services/events (Notification API is already requested for service
  reminders in `WatchLive.tsx`).
- **Look over the glass pass on a real device.** The material is CSS only
  (`src/styles/glass.css`, SPEC note 132) and was checked in the preview at 1440×900 and 390×844 with
  no overflow and no collapsed panels, but `backdrop-filter` is the one property whose cost varies
  most between devices: if an older phone scrolls badly, the first thing to try is dropping
  `--glass-blur` on the wide `.section--raised`/`.section--light` bands (the panel group is cheap).
  The light theme's page gradient is also a judgement call — it is deliberately deeper than the old
  flat cream, so if the office wants the page brighter, lift the last stop of the light
  `body { background-image }` linear-gradient.

## Maintenance gotchas

- **A `position: fixed` overlay opened from inside a grid card is trapped in that card** if any
  ancestor establishes a containing block — `transform`, `filter`, `perspective`, `contain: paint`,
  or **`will-change` of one of those**. `.mreveal` (the wrapper every card in a grid gets —
  Motion since SPEC note 148, CSS before) carries only `will-change: opacity, transform`, which is
  what made the first *Get
  directions* popup render 368px wide inside a card; Motion clears the inline transform once a
  reveal finishes, but while it is animating the hint is there. Do not put a transform or a
  permanent `will-change` on a card/card wrapper without checking the popups that open from it.
  (Portalling `Modal` to `<body>` would also fix it, but importing `createPortal` from `react-dom`
  pulls a *second* copy of react-dom into the bundle — `app.js` went 669 KB → 805 KB — so don't.)

- **The workspace can lose files if the browser evicts this tab's local storage** (happens in
  incognito/private windows, or under storage pressure): files can come back empty or missing.
  Two defences: (1) keep the repo pushed to git and take regular Tools backups
  (`npm run backup`); (2) if a file does go missing, restore it from git or from the
  newest backup in `data-backups/`.
- **Photos** live in `src/data/photos.ts` (the *Photos & covers* group in the drawer). Add a picture to
  `src/assets/img/`, add a slot to `PHOTO_SLOTS` with its friendly name and where it appears, and it
  turns up in the drawer; `img("name")` resolves it. Uploaded photos are only ever referenced by
  URL, so they do not sit in `src/`. The logo (`LOGO` / `LOGO_MARK`) is deliberately not a slot.
- **Editable page text lives in `src/data/copy.ts`** (~397 hand-written strings, one group per
  page) **and `src/data/autocopy.ts`** (~691 collected ones — labels, placeholders, captions,
  tooltips, breadcrumb and tab names, command-palette entries). Pages call `ct("group.key")` (or `ct("group.key", { token: value })`) and render
  markup-bearing values through `<Rich>`; the matching admin sections are generated from
  `COPY_PAGES`, so **a hand-written string means one more entry in a page group in `copy.ts`** and
  the drawer picks it up with no other change. Aliases used inside a value (`{{city}}`) only work
  where the page passes them.
- **Buttons, page titles and section titles are fixed — do not make them editable again without
  being asked.** A copy entry carries `role: "button" | "pageTitle" | "sectionTitle"` (hand ids get
  theirs from `inferRole()` in `src/data/copy.ts`; collected ones from `roleOf()` in
  `src/tools/auto-copy.mjs`, which reads the enclosing JSX element). `copyIsFixed(id)` is the single
  question the rest of the code asks: the drawer shows a fixed line dimmed and read-only,
  `setCopyValue()` refuses it, `bindCopyPage()` never stores it, and `mergeSection()` in
  `src/lib/cms.ts` ignores a stored value from an older save. If the church asks for those words
  back, delete the `inferRole` branches and re-run the collector with `roleOf()` returning
  `undefined`. **A second kind of furniture** is a line marked `locked: true` in `copy.ts` (120 of them
  today: the hero's CARE statement, the eight paragraph lines of the watch-live page — whose whole
  section is hidden from the drawer now, SPEC note 105 — the paragraph row
  of `about.leaders.lede`, every paragraph row of the Sermons, Sermon, Events, Giving, Prayer,
  Testimonies, Plan-a-visit, Contact, Locations, Ministries, Devotional, My-library and Site-wide
  sections, the whole *The small words, buttons & titles* group of the home page and About's four
  remaining paragraphs — SPEC notes 47–50 and 64; Home's other six paragraphs are deliberately still
  the office's): `copyIsLocked(id)` reports it, the drawer's
  page-text section filters it out of both its prose list and the closed group, and the search box
  skips it — `copyIsFixed()` covers it too, so no stored wording can ever replace it. Read SPEC
  note 47 before adding another locked line; the point of the flag is that the line is *removed from
  the editor*, not merely shown dimmed. **Recovered (`auto.*`) lines cannot carry the flag** — their
  file, `src/data/autocopy.ts`, is generated and the collector reads only `id`/`label`/`value`/`role`
  back out of it — so they are named in the `LOCKED_AUTO` set in `src/data/copy.ts`, which the same
  `LOCKED` guard reads (SPEC note 64).
- **A section can be “not offered”, like a line can be locked.** `SectionDef.hidden` in
  `src/lib/cmsSchema.ts` takes a whole section out of the editor — the full list (the *Update* tab),
  its job and the
  search box (`sectionIsHidden`) — and `SectionDef.everythingHidden`
  takes it out of the full list (the *Update* tab) only, leaving it reachable from its job
  (`sectionIsEverythingHidden`). It is set on the four photo sections, and that is the pattern to
  copy: the **Photos & banners** card names them (SPEC note 62), so a *new*
  `everythingHidden` section must be named by a job in `jobs.ts`.
  Today 15 page-text sections are `hidden` (`HIDDEN_COPY_PAGES`, SPEC note 51 — *About* was taken out in
  note 65, asked back in note 66, and taken out again in note 67). **Nothing in
  `src/lib/cms.ts` may filter on these flags** — the
  content must still load, apply and publish; the filtering belongs in `Admin.tsx` (`groups`,
  `defsById`), `jobs.ts` (`searchEverything`, `sectionsWithoutJob`) and the Status tab's chips. When
  adding a place that lists sections, ask both questions (`sectionIsHidden` /
  `sectionIsEverythingHidden`) or the hidden ones will leak back into the drawer.
- **Page text is grouped into the page's own segments** by `copySegmentsOf(pageId)`
  (`src/data/copy.ts`): the first two dotted parts of an id make the group (`home.sermons.title` →
  *Latest sermon*), the order is page order (the headings themselves are **not printed** any more —
  each line carries its own caption, so *Hero* + *Hero paragraph* was the same words twice). Only the
  lines with paragraphs in them are shown; the rest — the site's own buttons and titles, and the
  small words (labels, placeholders, tooltips, email templates) — sit in one closed group at the foot
  of the section, so hiding them must never lose them: keep them in the DOM (the search box must
  still find them, and `copyIsParagraph`/`copyIsEdited` decide who is visible, so a reworded line
  always shows). There is no per-section help paragraph either: the markup reminder that was
  `COPY_HINT` in `src/lib/cmsSchema.ts` (repeated on all sixteen page-text sections) was removed from
  the *How to update the website* note at the office's request (SPEC note 63), so it now appears
  nowhere in the drawer — the rule itself still holds (`<Rich>` reads `*italic*`, `**bold**`,
  `[label](/route)` and `{{token}}`, so keep those characters in an existing line). A copy section's
  `blurb` is `""` (the block
  body prints the blurb only when there is one). A new
  hand-written id therefore needs `<page>.<segment>.<line>` — three parts — or it will join a group
  called `<page>`.
- **New literal words in a component are collected automatically** — run
  `src/tools/auto-copy.mjs` (recipe in README §1), then rebuild. It rewrites the literals to
  `{ct("auto.<page>.<hash>")}`, writes `src/data/autocopy.ts`, and is idempotent: existing strings
  keep their key *and* their default, so an office override can never land on different words. Never
  hand-edit `autocopy.ts` except to change a default in place (the tool preserves it) — and that is
  also how a dead line *leaves*: delete its last `ct()` call from the source and the next run drops
  the entry (the collector keeps only what a `ct()` still points at; SPEC note 80 lost the
  *Sub-branch* / *Sub-branches* lines that way). It reads JSX
  text and display attributes, string literals in an expression position (the fallback in
  `name || "Friend"`, a caption inside `{ready && <p>Ready</p>}`), template literals whose holes are
  plain values, *and* display-valued object properties (`label`, `title`, `sub`, `text`, `hint`,
  `tip`, `caption`, `note`, `body`) — that is where the breadcrumb, tab, option and command-palette
  wording lives. It walks through a logical wrapper (`&&`, `||`, `??`) but still refuses a
  comparison or arithmetic (`kind === "video"`, `count + " items"`), so a value's own vocabulary
  never becomes an editable line. Clock/relative dates, weekday names, countdown units, durations,
  monogram initials, money and truncated record text stay computed on purpose — see README *Every
  text, not just the headlines*.
- **The page is read-only; every edit is in the drawer.** An earlier in-place click-to-edit layer
  (private-use marks inside `ct()`, a post-commit DOM pass, dotted underlines, photo outlines, a
  "Guides" toggle) was removed on purpose, at the church's request: the preview now shows the page
  exactly as visitors see it. Do not re-add a `data-copy`/`ed-copy` wrapper or a Guides toggle —
  `ct()` returns plain text, and `src/lib/editstate.ts` / `src/lib/editdom.ts` no longer exist.
  (Some of that layer's CSS survives, unused, in `src/styles/edit.css`.)
- **Do not un-lock the church name or the logo.** The `site` section deliberately omits the name
  (its `read()`/`bind()` strip it) and there is no logo field: both would otherwise be overwritable
  from the editor. The name is surfaced from `src/data/site.ts` through `pick()`.
- **A value the office has edited cannot be changed by editing the code alone.** Sections the office
  has touched are `dirty`, live in `wom.cms.draft`, and are never re-based onto the shipped data
  again — so a wording change made only in `src/data/*.ts` shows on a public visit (which reads the
  shipped/published content) and then comes back the moment the office presses Publish. Change the
  field through the drawer as well (SPEC note 99 did exactly that for the *Live stream* card's value,
  which is why their unsaved *We are on air right now* switch survived), or have the office reset the
  section (*Put this back to the original*) and lose their own edits to it. **Check
  `window.__churchCms.draft()` against `applied()` before assuming a data-file change is enough** —
  `cms.ts`'s `mergeSection()` only fills in *missing* keys of an object section and replaces a list
  section's items wholesale.
- **Never give the visitor a lesson about the currency.** The money is converted into their own
  currency (SPEC notes 98/99) and nothing on the page says so: the one explanatory line that existed
  was removed at the church's request the same day it was added. If a rate line is ever wanted again,
  ask first.
- **The live stream** is `src/data/live.ts` (the drawer's *Live stream* section); YouTube and Facebook
  parsing/embedding is `src/lib/embed.ts`, which also handles an **uploaded video file**
  (`platform: "upload"` + `uploadUrl`; `fileSrc()` + the `<video>` branch in `VideoPlayer`). If you
  add another platform, extend `VideoPlatform` there and the `sources`/switch logic in
  `src/components/blocks.tsx` (`sermonSources`, `SermonWatch`) and `src/pages/WatchLive.tsx`. The
  *"Where to tune in" broadcast-partner segment was removed at the church's request — do not bring
  it back, and note that `/watch-live` now always shows a screen the visitor can watch on the page
  (the broadcast while one is detected, the *Live has ended* state otherwise — SPEC note 68; the
  most recent message only while the panel is manually on air with nothing to play). The *Ways to
  watch* row's *Live stream* card carries a **statement, not a timetable** — *Plays here whenever our
  broadcast is active* (SPEC note 99, which replaced *Sundays 9:00 & 11:30 AM (CT)*); the other three
  cards are a platform door or words only. The four cards are `LIVE.watchOptions` and they are **fixed
  content**: the *Ways to watch cards* list left the drawer at the church's request (SPEC note 110),
  so the live section offers no *Add a card*, no *Title* and no *Line underneath* any more. The panel's
  *While you watch* list has four rows since SPEC note 69 — its *Prayer line* row was removed on
  request and the remaining rows were renumbered `live.side.1…4`. Uploads go to the office
  server's `/__upload` (`localHostFile` in `src/components/editor.tsx`); a full-length service
  is still best kept on YouTube or Facebook.
- **Whether the church is on air is asked of YouTube, not guessed** (SPEC note 68).
  `src/lib/livestatus.ts` checks the channel in `LIVE.youtubeChannel` (or `LIVE.youtubeId` when no
  channel is set) through the office server's `/__yt` proxy, because
  YouTube sends no CORS headers and a plain `fetch` is refused. The marker is `"isLiveNow":true` and
  nothing else — **never** `"isLiveContent":true` (a finished stream keeps it forever) and **never**
  `"isLive":true` (that also sits in the view-count renderer of a finished or scheduled broadcast:
  it is what once made the church's own channel read as on air, SPEC note 112). A page carrying none
  of YouTube's own scaffolding is `"unknown"`, not `"off"`, so an unreadable page cannot stop a site
  that is on air. The answer
  lives in `localStorage["wom.livestatus"]`, is polled every 45s while a service is on the clock or a
  stream is running and every 3 minutes otherwise, and a failed check is `"unknown"` — never `"off"`,
  so a flaky proxy can only fall back to the `isLive` switch and the service clock. `VideoPlayer`'s
  new `autoPlay` prop is what opens the stream without a click; only the live panel passes it.
- **The site stops itself when the stream ends** (SPEC note 111). `src/lib/autostop.ts`
  (`useAutoStopLive`, mounted in the shell of `#/admin` in `src/pages/Admin.tsx`, so it watches from
  whichever card the office has open) does what *Stop the livestream* does the moment a broadcast it
  had seen live comes back ended: `isLive` off, `liveCut` stamped with **when the stream ended**
  (the status's `endedAt`, not the moment we noticed), `liveEndedBy: "channel"` (a content field the
  panel reads to say *ended by itself*; the buttons write `"office"`), and
  `askForRecentServices({videoId, title})` so the service is seeded into *Recent services* at once.
  The status keeps `endedAt` **sticky** until a broadcast comes back — an "off" answer that cleared it
  was the first bug this had, and the drawer's watcher then never saw the ending. Rules to keep: two
  consecutive definitive `"off"` answers before acting (a flaky read must not close a service);
  nothing is written when the site was not on air; an ending older than the session's last command
  (`liveCommandAt`, then `liveSince`, then the gathering's own start — so *Continue* after an auto-stop
  is the office's word and does not get stopped again); `liveCut >= endedAt` means the office already
  stopped that stream; only a YouTube broadcast is seeded (*Recent services* is YouTube videos, and
  `parseYoutubeId` accepts any 6–20 char token, so a Facebook id would otherwise be seeded as one).
  It writes the **draft** — never the published site; the office still presses Publish.
  **Facebook can only ever confirm a broadcast, never deny one**: fetching the church's page, its
  `/live` tab and Facebook's live directory through the proxy showed no live markers at all for a
  signed-out browser, and a finished live video keeps "was live" marks. So `facebookTarget()` /
  `parseFacebookLivePage()` are asked **only from the drawer** (`checkLiveStream({facebook:true})`)
  and a silent Facebook is `"unknown"`, which never ends anything. In practice the stop follows
  YouTube — which is also where *Recent services* comes from. Do not "fix" that by treating a silent
  Facebook as an ending: it would either do nothing real or end a live service on a proxy hiccup.
- **The sermon form is the office's short list** (SPEC note 126, trimmed again in note 128).
  *Message title*, *Speaker*, *Date preached*, *Where it plays from*, *YouTube video link*,
  *Facebook video link*, *Upload the video*, *Duration*, *Scripture*, *Summary*, *Sermon points*,
  *Discussion questions*, *Venue* — no *Filed from the live stream* (note 128; `fromLive` stays in
  the data and still draws the *Broadcast* pill) and no hints under *Date preached* or *Upload the
  video*.
  **If a message ever needs a picture of its own again**, it is the record's `poster`: the field was
  removed from the drawer (with *Tags*) at the office's request, and so was the machinery that took
  a cover out of an uploaded video (`captureVideoFrames` + `bestVideoFrame`, formerly in
  `src/lib/store.ts`; `coverPath` on a field definition, `VideoField`'s dashed panel, and
  `getSibling`/`setSibling` from `Admin.tsx`). Note 43 in SPEC.md describes how the pipeline worked;
  two writes landed in one async flow there (the video address, then the cover), which is why
  **`patch()` in `Admin.tsx` must keep patching `cms.getDraft()`** — patch the copy a render was
  given and the second write silently reverts the first.
- **"Recent services" is read from the church's channel, not from the content** (`src/lib/recentstreams.ts`).
  `LIVE.youtubeChannel` is the single input: the /live address is the live check
  (`src/lib/livestatus.ts`) and the channel's page is the /videos list, both parsed from what the
  office pasted. The grid gives the order and YouTube's own *"3 weeks ago"*; the channel's RSS feed
  (needs the channel id, resolved once from the channel page and cached under `wom.ytchannel`) gives
  the exact dates; Shorts are skipped by their `/shorts/` link. The list is cached under
  `wom.recentstreams` and re-read every 10 minutes (90 seconds while a service is on the clock),
  and at once when the live check flips *live → off*. **Nothing rolls into "Previous sermons"** —
  that section is the sermon archive the office fills in by hand (SPEC note 71), so do not
  reintroduce a filing step. If a channel changes its page markup, the section falls back to the
  newest messages the site already holds — which is also what a site with no channel set shows.
  The count is the office's own field (*How many recent services to show* in the *Live stream*
  section, read through `recentLimit()` in `src/data/live.ts` — six to start with), and the band sits
  **above** *Previous sermons* on the page (SPEC note 72). The hours *Previous sermons* promises
  (*Hours until a service is written up*, five to start with) come from the same section, and both
  page-ledes take their numbers from it. So does the number of write-ups under *Previous sermons*
  (*How many previous sermons to show*, twenty to start with, `pastLimit()`) — that band is the
  newest slice of the archive, so the oldest drops off it as a new message is published, and
  **nothing is ever deleted**: `/sermons` keeps every message whatever the band's number is.
  *Last message* and *Previous sermons* are one list, newest first (the newest write-up is the last
  message, and the first previous sermon the moment a newer one is published, SPEC notes 135–136).
  Their video sources are
  edited in the **Sermons** section alone — the drawer's *Live stream* section carries no sermon fields
  (SPEC note 109 undid the board of note 108 that put them there). Because the CMS mutates records in
  place, key any memo on the *fields* (`sermon.youtubeId`), never on the record object —
  `SermonWatch`'s source list was caught by exactly that in note 108.
  The live section's own panel is **`RecentServicesPanel`** (`src/components/editor.tsx`): the finished
  services the site is carrying, with *Take it off the site* / *Put it back* writing the video ids into
  **`LIVE.hiddenReplays`** (a content field, `src/data/live.ts`), filtered where the list is built in
  `WatchLive.tsx` — so a take-off holds for every visitor and nothing is deleted from the channel. The
  list belongs to the broadcast: a service that comes off air is in it at once, because *Stop* seeds the
  broadcast that was on air into the cached list (`askForRecentServices` / `seedRecentService`, kept at
  most twelve hours and replaced by YouTube's own entry when the read carries it) and pokes every open
  page's read, which then keeps the 90-second cadence for six minutes (`BURST_MS`) while YouTube finishes
  publishing the recording. Do not make the office file a service by hand, and do not let a seeded card
  outlive the read that knows better. **Stop is not the only seeder**: when the stream ends by itself the
  drawer's watcher seeds the same way (`src/lib/autostop.ts`, SPEC note 111) — so a change to the seed's
  shape has two callers, and only a *YouTube* broadcast may be seeded. Since SPEC note 130 the panel has
  **no *Read the channel again* button** nor a "this list was read …" line (the list is filled by the
  watcher, by *Stop* and by the read on a fresh load, and the panel is its heading and its rows alone —
  SPEC notes 130, 130a), and the live section's foot is
  `LiveEndingPanel`: **the field *How many previous sermons to show* and the *Open the sermon list*
  button**, nothing else. That field is the one field of the section drawn outside the form — `Admin.tsx`
  filters it out of `formFields` and passes it into the panel as `children`; it is still *declared* on the
  schema section, which is what `pendingEdits`, the export and the drawer's search read, so move its
  label/type in one place (`src/lib/cmsSchema.ts`) and both readers follow. No hint under any field of
  this section either — the office asked for them out (note 130).
- **The editor lives at `#/admin`, and it is the website itself** — every page under the prefix
  renders the real page components (`src/lib/routes.tsx`) with the office's drawer on top
  (`src/pages/Admin.tsx` + `src/components/editor.tsx`, per-route page names in `src/lib/pageMap.ts`,
  the office's job list + site-wide search in `src/lib/jobs.ts`,
  schema in `src/lib/cmsSchema.ts`, content server in `index.html`, client in `src/lib/cms.ts`).
  The admin password's SHA-256 is `ADMIN_HASH` in `index.html`; rotate it with the recipe in
  `README.md`. Published content lives on the office server disk (`data/cms-state.bin`, mirrored into git by
  auto-push) with the shipped content in `src/data/` as the fallback, so **moving the
  office server or changing the site origin starts publishing over** — keep the
  `cms-server.txt` address stable and take a Tools backup before moving hosts. The office no longer signs its edits — the *Signing your edits* field left the Status
  tab at the church's request (SPEC note 54), so `cms.setEditorName()` has no caller and publishes
  record an empty `by`; the log renders that without a dangling "by". The setter is still exported,
  so putting the field back is one block.
- **Two conventions that keep the editor working** (see README *How it works* and SPEC note 32):
  1. its root keeps **both** the `admin` and `eshell` classes — the `.admin …` rules in
     `src/styles/admin.css` style the field controls and the `.eshell`/`.editbar` rules in
     `src/styles/edit.css` style the bar/drawer, so trimming either class silently unstyles a layer;
  2. while editing, `applied()` shows the **draft**, so anything counting unsaved changes or
     building a publish patch must compare against the **last published** overrides
     (`publishedSection`/`pendingSections()` in `src/lib/cms.ts`), never against `applied`.
     `pendingEdits()` — the list the bar's `N unsaved change(s)` pill opens (SPEC note 114) — obeys
     the same rule: it *counts* with `pendingSections()` and only says *what* changed, and
     `revertSection(id)` puts one section back to what is live (alone, and through `pushEditUndo`)
     without touching anything else the office has typed. The unsaved list's **Delete** is the other
     direction (SPEC note 140): `dropAddedAndRevertedEdits(id)` keeps only the removals, then
     `publishSection(id)` publishes that one section at once — never the whole draft — so other
     unsaved sections stay exactly as they are.
- **The drawer's body must never squeeze its rows** (SPEC note 60). `.epanel__body` in
  `src/styles/edit.css` is a one-column grid that scrolls, and it carries
  **`grid-auto-rows: max-content`**. Drop that line and a short window shrinks every `auto` row toward
  its min-content size — and a `.pblock` is `overflow: hidden`, whose automatic minimum is **0** — so
  every section card collapses to a 15px sliver with its title clipped out, i.e. the office sees blank
  bars and no way to update anything. The same trap applies to any scroll container of blocks: let
  rows keep their natural height and let the container scroll. It only shows on *short* windows, so
  check the drawer at ~900×300 as well as at a tall one.
- **A list row's *name* outranks its aside** (SPEC note 81). The drawer is `min(580px, 100%)` because
  a branch row holds three things — the name, the chip naming its parent and the **Sub-branch** button
  every branch wears — and the flex priority is deliberate: `.pitem__head b` is `flex: 1 1 auto`, its
  `em` is `flex: 0 1 auto`, and `.pitem__parent` is `flex: 0 6 auto` with an ellipsis, so the *name* is
  the last thing to give way (it used to be the first, which printed “Overcomers' T…” on every row). A
  child row hides its aside (`.pitem--child .pitem__head em { display: none }`). If you add anything
  else to a row, measure each name's `scrollWidth - clientWidth` on the seven real branches before
  calling it done, and keep the three add controls at the foot of a `tree` list on one line.
- **Never apply the draft per keystroke, and never remount the page per preview** (SPEC note 61 — the
  *"it hangs while making changes"* bug). Two rules in two files, and both are load-bearing:
  1. `src/lib/cms.ts`: the live preview goes through **`applyDraftLiveSoon`** (~160ms after a pause,
     at most 600ms behind while typing) — not `applyDraftLive()`. The drawer reads the *draft*, so
     fields still update instantly; only the page behind them needs the applied snapshot. Anything
     that changes what "the draft" means (publish, discard, a server sync → `applyOverrides`) must
     **drop** the waiting preview, and `undoEdit` applies at once. If you add a new writer, call
     `notify()` **and** `applyDraftLiveSoon()` — not `applyDraftLive()`.
  2. `src/pages/Admin.tsx`: `<main>`'s page node stays the *same element object* across the drawer's
     own re-renders (`useMemo` on `[resolved.to, state.version]` + `cloneElement`). `resolvePath`
     returns a fresh element every render, so without the memo the whole church page re-renders on
     every keystroke — and with `key={state.version}` it was **remounted** (every observer, image and
     effect rebuilt) once per letter. Measure with a typing burst (~25 synthetic `input` events on a
     paragraph line): expect ~10ms per keystroke, no keystroke over ~100ms; if you see 40ms+, one of
     these two has regressed. Note the per-keystroke cost grows with the *length* of the paragraph, so
     test with a long one.
  3. the draft is a *clone of `applied`* the moment the editor opens it (`getDraft()`), so
     `applyOverrides()` — the one place live content changes — must `rebaseDraft()` afterwards:
     every section the office has not touched (`dirty`) is pulled back into line with what is now
     live and the rest are left alone. Without it a browser that opens `#/admin` directly carries a
     draft of *shipped* content (the admin shell mounts before `startCms()` restores the local
     cache, and a reload empties the unsaved preview's server, so `flushPending()` re-publishes what
     the cache held), the drawer reports a change nobody made, and pressing Publish puts the shipped
     words back over the office's own.
     **And with it, `showDraftIfEditing()`** — at the end of `applyOverrides` and of `startCms()`.
     The drawer mounts before `startCms()` reads the stored draft, so a pass that changes what is
     live without putting the draft back leaves the office looking at the *published* site while the
     drawer shows their own edits: the change is saved and appears to do nothing until they touch a
     field (SPEC note 83, the *"every change I make gives effect in the admin"* report). Both calls
     are no-ops unless `#/admin` is open (`autoPreview`) **and** a draft exists, so publish, discard,
     rollback and the public site keep their own behaviour.
  Adding an editable line is just `ct("page.key")` in the component — it turns up in the drawer's
  *Page text* group by itself; adding a section is one entry in `cmsSchema.ts` plus (if it belongs
  to a page) an id in `pageMap.ts`.
- **Anything that shows "we are on air" must ask `displayLive()`** (`src/lib/store.ts`: the office's
  on-air state — written by the *Live stream* section's **Start** / **Continue** / **Stop**
  buttons, `LIVE.isLive` — or the stream itself; never the bare service clock, SPEC note 386).
  The short cadence still asks `onAir()` (which also hears the clock). The switch used to be read in
  `WatchLive.tsx` alone, so flipping it lit the panel and left the header pill, the home hero and the
  next-gathering card counting down to the next service — the office's own words for that were *"my
  change gives no effect"* (SPEC note 83). Only the clock can name the gathering or its end time, so
  name/end-time lines stay clock-only; the switch adds the live state itself. **A gathering the
  office has stopped by hand is the clock's business too**: `nextService` steps over one the office
  ended while it was inside its hours (`LIVE.liveCut`), so nothing counts down to `0h 0m` and the
  pages wait for the next gathering — do not re-read `LIVE.isLive` directly, and do not "fix" the
  clock by hand (SPEC note 106).
- **Anything that shows a time must say *which clock* it is on** (SPEC notes 84 and 85). Three clocks
  are in play, and each one has a name in `src/lib/store.ts`:
  - **the visitor's own** — `visitorTimezone()`, found from their IP address when the page loads
    (`src/lib/visitor.ts`) and remembered in `localStorage`; this is the clock the site *shows*,
    because `siteTimezone()` returns it when it is known.
  - **the church's** — `churchTimezone()`: the drawer's *Church profile → Time zone*,
    `DEFAULT_TIMEZONE` = `Africa/Lagos`. It is where the
    church's own times are *written*, and it is the fallback whenever the visitor's clock is unknown
    — or when the office switches it off (*Church profile → Show each visitor their own time zone*),
    which puts every reader back on the church's clock.
  - **a branch's own** — `branchZone(branch)`, the branch's `timezone` field: where that branch's
    service times are written (9:00 AM in Dallas is 3:00 PM in Lagos).

  The rule of thumb is two steps: work out the **instant** in the zone it is written in
  (`nextOccurrence`/`nextService` take that zone; `eventZone(e)` for an activity), then **show** that
  instant on the reader's clock — `clockAt(instant)`, or `clockHere(time, day, fromZone)` for a weekly
  schedule entry. Both hand back `{day, time}` for `DAY_NAMES`/`to12h`, so a card and its countdown
  always agree. `fmtDate`/`fmtTime`/`todayKey`/`zonedParts` default to the *reader's* clock;
  `zonedTimeToUtc`/`nextOccurrence`/`nextService` default to the *church's*, because they create
  instants rather than show them. A bare `new Date().getDay()` or an unzoned `toLocaleDateString()`
  is the bug note 84 replaced. Never hand-roll a zone offset — everything goes through the platform's
  `Intl` data, so daylight saving looks after itself. The little *Times shown in your local time ·
  <place>* pill that named the reader's clock (`<LocalTimeNote />` in `src/components/blocks.tsx`) is
  **gone** — the church asked for it not to be visible (SPEC note 93), so the component, its copy
  string and its imports were deleted; the seven places it sat are listed in that note, so putting it
  back is the component (about twenty lines) plus those lines. If the church would rather have one
  clock for everybody, the switch is *Church profile → Show each visitor their own time zone*.

  **The IP lookup must be a plain `fetch`, never a server proxy** (`src/lib/visitor.ts`): the proxy
  sends the request from the server's address, so the geolocation service would answer with the server's
  location and every visitor on earth would be told the same city. Also remember that a page element
  is cached in `src/lib/routes.tsx`, so React skips re-rendering a page when only a clock above it
  changed — that is what `SiteApp`'s `cloneElement` (and the drawer's memo dependency) is for.
- **The same rule applies to money, and money has its own two functions** (SPEC note 98). Every
  figure on the site is written in the *church's* currency and read in the *visitor's*, so:
  **format money with `fmtMoney(amount)`** (`src/lib/store.ts`) and never with a bare
  `Intl.NumberFormat(…, {style: "currency"})` — the helper is what converts, rounds to three
  significant figures and picks the currency; pass its second argument **only** when the amount is
  not in the church's currency (default is `baseCurrency()`). For a dollar figure *inside a sentence*
  — an event's *"$15 per teen"*, *"Where every $100 goes"* — wrap the string in **`moneyText()`**,
  which reads a `$` as the church's currency (so never write a `$` that means some other country's
  dollars). The currencies, and the country → currency table behind them, are the generated
  `src/data/currencies.ts` (recipe in README §3): regenerate it rather than hand-editing, and keep
  the seven hand-pinned countries from its header. The rate is fetched by the visitor's browser in
  `src/lib/rates.ts` and cached under `wom.fxRates` for half a day; the shipped snapshot carries the
  site until (and if) that lands, so **never make a page wait on a rate**. A visit is converted from
  the visitor's *country*, which arrives on the same cached clock as their time zone
  (`wom.visitorClock`, `VISITOR_CLOCK_V`) — if you add another field to that lookup, **bump
  `VISITOR_CLOCK_V`** so caches from the older shape are looked up again instead of used as they are.
  The office switches the whole thing off with *Church profile → Show each visitor their own
  currency* (`SITE.visitorCurrency`); a reader whose own currency *is* the church's never even
  fetches a rate (`ratesNeeded()`), and sees the office's figures exactly as typed.
- **A count of one is put right as the line is drawn** (SPEC note 103). The countdown and duration
  lines are built from a number and a unit the office can reword (`{{days}} days`, `hours`,
  `{{v0}} days`), so a line that lands on one would read *1 days*. **Wrap the composed phrase in
  `tidyCount(text)`** (`src/lib/store.ts`, the same idiom as `moneyText()`), as the events page, the
  visit wizard and the live panel do. `Intl.RelativeTimeFormat` (inside `relativeTime()`) already
  knows its singulars; the header's `2d 5h 30m` fragments and the `Countdown` clock's *days/hrs/min*
  labels are invariant and need nothing.
- **The office's way in is the job list, not the section list.** `src/lib/jobs.ts` holds `JOBS` —
  the eleven plain-language jobs the drawer's **Edit** tab is built from (*The words on every page*
  and *Photos & banners* stand first; they left the landing in SPEC note 57, their content was folded
  into the jobs that look after it in note 58, and both came back — fold undone — in note 62; a
  per-page card stood above them before all that) — and
  `searchEverything()`, the one search box over the words, the records, the photos and the
  sections. **Every offered section must belong to exactly one job** — that is what makes "any change
  is behind one of these cards" true, and SPEC note 58 is what it cost to forget it. After editing
  `JOBS`, run `sectionsWithoutJob()` from a scratch script (it reports a section with no job *and* one
  in two jobs; `sectionsInSeveralJobs()` reports duplicates alone). *The words on every page* carries
  a page's text and *Photos & banners* carries the photos, whichever page they appear on; the other
  cards carry the records of the part of the site they look after. So: a new section in
  `cmsSchema.ts` needs *two* extra lines — an id in a job here, and
  (if it belongs to a page) an id in `pageMap.ts`, whose `sections` list is now descriptive only
  (nothing reads it since SPEC note 52 — jobs are the way in). The tabs are labelled *Edit* (the
  jobs), *Update* (every section) and *Status*; `PanelMode`'s own values are `"edit" | "list" |
  "status"` (`"list"` is the default — the bar's *What do you want to change?* button opens *Edit*,
  `askWhatToChange`), and the drawer auto-opens until the office dismisses the welcome note
  (`wom.cms.welcome`). **Anything in the drawer that names site content — a Status number, an
  activity-log entry, a chip, a notice or next-activity link — must jump to that exact thing**:
  call `onOpen(sectionId, entryKey?)`, where the entry key is the record's own `id`, so the office
  lands on the section *and* on the record it clicked (opened, outlined and scrolled to its top —
  SPEC note 56). The "found section" **and** the single-job branches both have to stay **ahead of**
  the full-list branch in `Admin.tsx`, or every one of those jumps silently draws the whole list
  instead (the bug behind SPEC note 53, and why the Status numbers were wired up in note 55). A job
  card keeps the tab the office is standing in — `openJob()` sets `PanelMode` `"edit"`, `openHit()`
  keeps the current mode when it is `"edit"` and uses `"list"` otherwise (SPEC note 59) — so only the
  Status tab's own `openSection()` jumps deliberately switch to the raw *Update* list.
- **Publish flow (standalone, no host editor):** `Publish` writes straight to the shared content
  server (plus the live relay and the feed mirror) — there is no website-save step, no
  `planPublishAfterSave` queue and no save-first branch in `PublishModal`. The old
  host-editor helpers were removed in update 426 (`websiteIsUnsaved()` always false,
  `requestWebsiteSave()` a no-op); do not re-add a save gate in front of Publish.
- The admin's publish path keeps the per-section blob model: send only changed sections, store
  UTF-16 blobs, and never add a whole-site per-character loop to a handler.

- **Vite refreshes** after touching anything under `src/*.ts(x)` or `src/styles/*.css`
  (`npm run dev`). See `README.md` §1.
- **A section's list is refilled *in place* (`applyToList`), so never memoise a page's view of it on
  something that doesn't change.** The rows a page builds must be recomputed when the draft is
  applied — `Locations.tsx` ticks on the CMS version for exactly this reason (SPEC note 78). Matching
  is by `id`, and an entry with an **empty** id is never matched against another (two just-added
  branches used to collapse onto one object); each existing object is consumed once, so duplicated
  ids can't hollow out the list. **A sub-branch carries no words of its own on the page** — the
  office had the panel's `Sub-branches · <branch>` header and the two gold chips on every sub-branch
  card removed (SPEC note 80). What marks the group is only the `.branch-sub` panel (border + gold
  left rule). The one place the word is allowed back is the **`Sub-branches` button** the office
  asked for (SPEC note 86) — on every branch card and in the branch detail panel, opening
  `SubBranchesPopup` — so do not re-label the cards or the group header themselves. Anything derived from the list
  at module load (`COUNTRIES`, `HQ`)
  must be refilled in place too — the branches section calls `syncCountries()` from its `bind`, and
  `HQ` (a **copy** of the head-office branch, not a reference) is kept in step by `syncHq()`, called
  from the same `bind` **and** from `refreshDerived()`. Never restore the old
  `Object.assign(HQ, BRANCHES[0])` pattern: once the head office moved off position 0 it would copy
  the wrong branch over the real HQ. When the office changes a **list** section, remember that a
  stored section wholly overrides the shipped list — reorder `branches.ts` and a returning visitor
  still sees the stored order until the section is reset in the drawer (this is why note 79's
  Nigeria-first order needed the `branches` section reset).
- **The watch-live page has no branch schedule table** any more (SPEC note 97): the *Coming up* band,
  its country chips and its per-branch service-times table were removed at the church's request, and
  `zone` / `upcoming` / `filtered` went with them. The branch schedule is still shown on `/locations`
  through `ServiceTimesList` (`.times-list`) — do not re-add a second copy to the live page, and note
  that `.schedule-table`'s styling is now dead in `src/styles/global.css`.
- **Every "Add to calendar" goes through `addToCalendar()`** (`src/lib/store.ts`, SPEC note 96) —
  never the old `downloadText(….ics, toIcs(…), "text/calendar")`. The helper builds the invite
  (`calendarInvite()`: the .ics text, a slugged filename, a pre-filled Google Calendar URL), opens
  the Google Calendar page on everything but Apple, hands the .ics to Safari on an Apple device, and
  only downloads when the browser blocks the tab. Pass it the record's own title — the title is what
  makes the reminder useful — and do not put a `to=` on that button: the tap is meant to leave the
  visitor where they are (the Watch Live one used to download an empty file *and* jump to /events).
- Never edit `src/bundle.js` / `src/bundle.css` directly — they are build output.
- `localStorage` keys are prefixed `wom.`; the “Clear my data” button in My Library removes them
  (plus `wom.amenMap`, `wom.prayedMap`, `wom.memorised`, `wom.reminders`).
- Moving the site to a new domain/origin orphans visitors' saved data (localStorage is
  per-origin) — pick the address before sharing widely.
