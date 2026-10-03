# Putting the site on the internet

`npm run dev` is a development server — it cannot be deployed. Two ways to
publish the site, both work on any static host — Netlify, Cloudflare Pages,
GitHub Pages, cPanel, an S3 bucket, anywhere that serves files:

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
addresses (`/#/sermons`), so there is nothing to configure. (After editing
anything under `src/`, run `npm run build:bundle` first so the shipped
bundle is fresh; `npm run vite-build` does a from-source production build
instead, for those who want it.)

## The update routine

The deployed copy is a snapshot. When the office changes something:

1. Open the site locally (`npm run dev` or `start.bat`) and publish the
   change from the admin console as usual.
2. Run `npm run build` again (this re-bakes the new words into
   `seed.json`).
3. Re-upload the new `dist/` contents.

## What works on the deployed copy — and what does not

Works: every public page, photos, videos, the live-service badge, search,
visitor time zone and currency, contact and prayer forms (they open the
office's email/WhatsApp).

Limited: the admin console cannot sign in on the deployed copy (there is no
server to check the password), so content is managed locally and
re-uploaded as above. Photos the office uploaded locally are included in
the build automatically (`data/uploads/`).

## If the host says "Permission denied" or "command not found"

That means `node_modules/` got committed to the repo by mistake (it must
never be committed — the host installs it fresh). In the repo folder run:

```
git rm -r --cached node_modules dist
git add .gitignore
git commit -m "remove committed dependencies"
git push
```
