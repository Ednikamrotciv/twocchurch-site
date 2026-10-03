# Putting the site on the internet

`npm run dev` is a development server — it cannot be deployed. To publish
the site anywhere, build a static copy and upload that instead:

```
npm install   (once)
npm run build
```

This writes the whole site into `dist/` (pages, photos, styles, plus a
`seed.json` with everything the office has published from the admin console
so far). Upload the *contents* of `dist/` to any static host — Vercel,
Netlify, Cloudflare Pages, GitHub Pages, cPanel, an S3 bucket, anywhere
that serves files. No server and no settings needed: the pages use `#`
addresses (`/#/sermons`), so there is nothing to configure.

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
