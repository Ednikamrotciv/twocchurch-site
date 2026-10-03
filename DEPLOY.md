# Putting the site on the internet

Nothing here belongs to one host. Publish locally and the new words push to
GitHub by themselves — every host that deploys from git picks them up
exactly the same way: Vercel, Netlify, Cloudflare Pages, GitHub Pages, and
the rest. `npm run dev` is a development server — it cannot be deployed. Two
ways to publish the site:

**Option A — no build at all (easiest).** The repo already contains a working
site (`index.html` + `src/bundle.js`, plus `seed.json` with everything the
office has published). In the host's dashboard set the build command to
*empty / disabled* and the output / publish directory to `./` (the repo
root), then deploy. Nothing to install, nothing that can fail. When the
office changes something, refresh the bundle locally
(`npm run build:bundle`, plus a fresh `seed.json` baked from
`data/cms-state.bin`), commit, and push.

**Option B — build on the host:**

```
npm install   (once)
npm run build
```

This assembles the whole site into `dist/` — the working pages, photos,
styles, uploaded files, plus `seed.json` with everything the office has
published from the admin console so far. It needs nothing but Node itself
(no downloads, no bundler), so it cannot fail on the host. Upload the
*contents* of `dist/` to any static host — Netlify,
Cloudflare Pages, GitHub Pages, cPanel, an S3 bucket, anywhere
that serves files. No server and no settings needed: the pages use `#`
addresses (`/sermons`), so there is nothing to configure — except serve the
site from the domain root (clean addresses assume it; a subfolder would look
like part of the page address). Every route (`/admin`, `/sermons`, …) ships
as its own page file, so direct visits and refreshes work on any host. (After editing
anything under `src/`, run `npm run build:bundle` first so the shipped
bundle is fresh; `npm run vite-build` does a from-source production build
instead, for those who want it.)

## The update routine (automatic)

Publish from the admin console on your own computer (`npm run dev`,
`npm run serve`, or `start.bat`) and you are done. A couple of minutes after
the last change, the new words bake into `seed.json` and push themselves to
GitHub, and the host redeploys on its own — the live site catches up in a
few minutes. Only content files ever move (`data/`, `seed.json`); code is
never touched, and if a push fails (offline, login expired) the words stay
safe locally and go out after the next publish. To turn this off, create an
empty file named `no-auto-push.txt` beside `package.json` and go back to
pushing by hand (`npm run bake-seed`, commit, push).

## The live feed (content without rebuilds)

One-time setup, two minutes, and every deployed copy stays fresh on its own —
the repo stays exactly as it is, private or public:

- **Repo already public:** put `owner/repo@branch` (e.g.
  `mychurch/world-overcomers-site@main`) in `publish-feed.txt`, commit, push.
- **Repo private (keep it so):** create an empty **public** repo on github.com
  (30 seconds, any name — it holds only the tiny snapshot), paste its address
  (`https://github.com/owner/name`) in `publish-feed.txt` instead, commit,
  push. Each publish mirrors the snapshot there by itself, using the login
  pushing already uses.

From then on, each publish lands in every copy within minutes — Vercel,
Netlify, Cloudflare Pages, GitHub Pages, even a host you update by hand with
`dist/` — with no rebuild and no redeploy. Until then, copies update on
rebuilds (still automatic via auto-push).

If your host does not watch git and instead rebuilds when a URL is called
(a "deploy hook" / "build hook" from its dashboard), put that URL alone in a
file named `deploy-hook.txt` beside `package.json`. It is called after every
successful push. The file never leaves your computer (it is git-ignored).
Hosts with neither git nor a hook take the `dist/` upload in option B, by
hand, after publishing.

When taking a fresh zip over your folder, your published words are safe:
every time the office server starts it snapshots `data/cms-state.bin` into
`data-backups/<date-time>/` (a name no zip contains, kept out of git and out
of the zip), and if the live file ever turns out to be foreign — an older
snapshot from a zip extract, say — the newest snapshot is put back
automatically and the foreign bytes are stashed aside, never deleted. If the
replaced words were placed on purpose, run `npm run adopt` to keep them, or
`npm run restore` to pick a snapshot by hand (`npm run backup` takes one on
demand). Uploaded photos and videos are not copied into snapshots, so if any
are missing after a recovery the console says which — re-upload them from the
admin console.

## The office server (optional — only for editing away from your computer)

The flow above needs nothing left running. If you also want to publish from a
second device (another computer, a phone) straight into the live site, that
takes one shared backend behind every copy:

1. On an always-on office computer, run the site (`npm run serve`, or
   double-click `start.bat`) and leave it running. That machine *is* the
   server (http://localhost:5173/ there).
2. Expose it over HTTPS with a free tunnel (e.g. Cloudflare Tunnel:
   `cloudflared tunnel --url http://localhost:5173`) — you get an address
   like `https://office-something.trycloudflare.com`. It must be HTTPS:
   browsers only send the admin password over an encrypted connection, and
   the tunnel gives you that for free.
3. Put that address alone on its own line in `cms-server.txt` in the repo
   folder (the file is there already, with instructions inside — or run
   `npm run set-server` with the address), commit it, and push. Every deploy
   then joins the office server automatically. (No address, and each copy
   stands alone as before; any browser can also point itself at a server
   from the admin sign-in box, under *Office server*.)
4. Keep that computer awake and online. If it goes dark, every copy keeps
   working from its last baked words and syncs back up when it returns.

Anyone who reaches the server can *read* the (public) site content; changing
anything still takes the admin password, and guessing stays rate-limited.
Never expose the server over plain http.

## What works on the deployed copy — and what does not

Works: every public page, photos, videos, the live-service badge, search,
visitor time zone and currency, contact and prayer forms (they open the
office's email/WhatsApp).

Limited without the office server above: the admin console cannot sign in on
a standalone deployed copy (there is no server to check the password), so
content is managed locally and re-uploaded as above. Photos the office
uploaded locally are included in the build automatically (`data/uploads/`).

## If the host says "Permission denied" or "command not found"

That means `node_modules/` got committed to the repo by mistake (it must
never be committed — the host installs it fresh). In the repo folder run:

```
git rm -r --cached node_modules dist
git add .gitignore
git commit -m "remove committed dependencies"
git push
```
