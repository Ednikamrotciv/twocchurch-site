# Putting the site on the internet

```sh
npm install   # once
npm run build # → dist/
```

Upload the *contents* of `dist/` to any static file host — Netlify,
Cloudflare Pages, GitHub Pages, cPanel, an S3 bucket, anywhere that serves
files. No server and no settings needed: the pages use root-absolute addresses,
so serve the site from the domain root. Every route (`/admin`, `/sermons`, …)
ships as its own page file plus a `404.html` fallback, so direct visits and
refreshes work on any host.

`npm run build` is `vite build` (React + TypeScript → `dist/`) followed by
`scripts/build-static.mjs`, which bakes in the published content (`seed.json`),
the office-server pointer (`server.json`), the live-feed pointer (`feed.json`),
the photos, the uploads, and the route pages.

## Host build settings (deploying straight from the repo)

Uploading `dist/` by hand needs nothing, but if the host builds from the repo
itself, enter these same values in its dashboard (every host calls them
something similar — build command, output / publish directory):

- Install command: `npm install` (usually already the default)
- Build command: `npm run build` — the full command, not just the bundler, so
  the content, the server pointer, and the route pages all get baked in
- Output / publish directory: `dist`
- Framework preset: none / static / "other". A one-click framework preset that
  runs only the bundler would skip the baking step above and ship empty pages.
- Environment variables: none. The repo builds with the Node version in
  `.nvmrc`.

## Holding visitors in maintenance

New code normally holds visitors by itself (it is newer than the last
publish), but when there is no older stamp to be newer than — a fresh backend,
a wiped disk — a deploy would open straight away. To hold visitors until you
publish anyway, keep the `maintenance-hold.txt` file beside `package.json`,
then build and upload as usual. Fresh visitors see the maintenance notice;
publishing from the admin console releases them on the spot, with no rebuild.
Delete the file when holding should stop — it never leaves your computer
(git-ignored), so hosts rebuilding from git always ship clean.

## Clean new deploys (option A)

To open a NEW deploy fresh, new and clean — no retained words until you say
so — put an empty file named `clean-deploy.txt` beside `package.json`,
commit it, and push. Every deploy while it sits there ships no words:
visitors wait on maintenance, and the site goes live only when you click
Recover (Tools restore of your downloaded content backup) and then Publish —
always Recover FIRST, or the clean site goes live over your real words.
Nothing is ever deleted (backups, the office disk and the root seed keep
everything); sleep-wakes on the same deploy keep re-serving as before.
To exit the cycle: after Recover + Publish, DELETE `clean-deploy.txt`,
commit+push, and rebuild — the next bake carries the words again. Without
the file, deploys carry words exactly as before.

## The update routine

Publish from the admin console on your own computer and you are done — with
the live feed below, every copy catches up within minutes with no rebuild.
Without the feed, rebuild and re-upload after publishing
(`npm run build`, upload `dist/`).

## The live feed (content without rebuilds)

One-time setup, two minutes, and every deployed copy stays fresh on its own —
the repo stays exactly as it is, private or public:

- **Repo already public:** put `owner/repo@branch` (e.g.
  `mychurch/world-overcomers-site@main`) in `publish-feed.txt`, commit, push.
- **Repo private (keep it so):** create an empty **public** repo on github.com
  (30 seconds, any name — it holds the tiny snapshot plus the uploads the
  published words point at), paste its address
  (`https://github.com/owner/name`) in `publish-feed.txt` instead, commit,
  push. Each publish mirrors the snapshot there by itself, using the login
  pushing already uses.

If your host rebuilds when a URL is called (a "deploy hook" / "build hook"
from its dashboard), put that URL alone in a file named `deploy-hook.txt`
beside `package.json`. It is called after every successful push. The file never
leaves your computer (it is git-ignored).

## The office server (only for editing away from your computer)

Static copies are read-only: the admin console cannot sign in on them (there
is no server to check the password), so content is managed locally and
re-uploaded as above. If you also want to publish from a second device
(another computer, a phone) straight into the live site, that takes one shared
backend behind every copy:

1. On the always-on office computer, run `npm run build` once, then `npm
   start` (or double-click `start.bat`), and leave it running. It must be
   HTTPS (browsers only send the admin password over an encrypted connection)
   — on a home/office machine the start attaches a secure tunnel by itself
   (sharing ships ON via `auto-share.txt`; `npm run share-off` turns it off).
2. Every deploy then joins the office server automatically after the next
   rebuild (a few minutes). If the address cannot register itself (no git
   remote, login expired), put the printed address alone on its own line in
   `cms-server.txt` — or run `npm run set-server` with it — commit, and push.
3. Keep that computer awake and online. If it goes dark, every copy keeps
   working from its last baked words and syncs back up when it returns.

Anyone who reaches the server can *read* the (public) site content; changing
anything still takes the admin password, and guessing stays rate-limited.
Never expose the server over plain http.

## Render (instead of the office computer)

A Render Web Service works as the always-on backend:

- Build command: `npm install && npm run build`
- Start command: `node scripts/serve.mjs`
- No disk needed: every restart the server re-serves its last deployed words
  and uploads from the build itself (note 290) — it never comes back blank.
  A persistent disk mounted at `data` is still a fine optimization (it keeps
  things published or uploaded on the live box *between* deploys), but without
  one the worst a restart does is return to the last deploy, never to empty.
  Either way, keep taking Tools backups: they are the way back if words are
  ever deleted by hand.
- Use the paid (non-sleeping) instance type, or the service sleeps and every
  copy works from its last baked words until it wakes.
- Free tier sleeps — and that is fine now (notes 303–309): sleep wipes the live
  store, but the wake re-serves the last publish whole (words, stamp AND
  history) from the deploy's own bake, so visitors stay live and "Last
  published" stays put with no office action. The one rule: publish LOCALLY
  (the office computer has the disk, the git login and the auto-push), and let
  the push + rebuild carry each publish to Render. A publish on live /admin
  between deploys works but lives on the ephemeral disk only — the next sleep
  lets it go, so always publish the same words locally afterwards. Optional:
  a free keep-awake ping (e.g. UptimeRobot every 5 minutes to
  `https://xxx.onrender.com/version.json`) skips the 30–60s cold boot after a
  sleep; it only makes first loads faster, nothing depends on it.
- Uploads survive the same way, with one extra rule: only uploads baked at
  deploy time ride in `dist/data/uploads/` (the wake serves those from the
  build itself when the disk copy is gone). An upload published on live /admin
  between deploys is ephemeral — the next sleep takes it. So publish uploads
  locally too, then let the auto-push + rebuild bake them in. The sleep-free
  browser cache (this build) covers the gap: a browser that uploaded restores
  the missing file to the server on its next visit — but only that browser,
  and only files small enough to keep (videos near/over 100 MB also break the
  git push itself — the terminal says so now — so keep videos short or host
  them off-disk). With the live feed set up (above), pushed uploads are also
  fetchable straight off the public repo by EVERY copy: a wiped disk paints
  the repo copy and any open copy heals the server from it — recovery no
  longer needs the uploader's browser. Without the feed, only the uploader's
  browser can heal.

Then put the service's `https://xxx.onrender.com` URL alone in
`cms-server.txt`, commit, push, and rebuild the static site once.

## Recent services on every copy

*Recent services* no longer depends on the visitor's browser reaching
YouTube: the office reads the channel itself and the list ships inside
`seed.json`, so every copy paints the same services as the preview on first
load. While the office server runs it re-reads the channel every 20 minutes
and pushes a changed list out by itself — a Sunday's service lands on the
deployed sites on its own.

## Backups

Every time the office server boots it snapshots `data/cms-state.bin` into
`data-backups/<date-time>/` (kept out of git). `npm run backup` takes one on
demand, `npm run restore` picks a snapshot by hand. Uploaded photos and videos
are not copied into snapshots — if any are missing after a recovery the
console says which.

## If the host says "Permission denied" or "command not found"

That means `node_modules/` got committed to the repo by mistake (it must
never be committed — the host installs it fresh). In the repo folder run:

```sh
git rm -r --cached node_modules dist
git add .gitignore
git commit -m "remove committed dependencies"
git push
```
