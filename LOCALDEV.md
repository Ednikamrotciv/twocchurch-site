# Running the site on your own computer

Extract the zip, then double-click **start.bat** (Windows) or run `sh start.sh`
(Mac/Linux) — the site opens at http://localhost:5173/
(the admin console is at http://localhost:5173/admin). No `npm install`
needed: the server and the admin backend run on plain Node.js.

`npm install` is only for two extras: automatic rebuilding while you edit
files under `src/` (`npm run dev` watches and rebuilds), and the typecheck
(`npm run typecheck`).

What `npm run dev` starts (all in `scripts/`, no extra packages):

- a static file server for the site itself;
- the **admin publishing backend**: `scripts/cms-local.mjs` runs the site's
  own publishing code (the `<script type="text/x-server-plugin">` block in
  `index.html`) in Node, byte for byte — same passwords, same admin accounts,
  same publish log. Published content is stored in `data/cms-state.bin`
  (created on first publish; keep that file to keep your content).
- `scripts/local-shim.js` connects the site to that backend. It only loads
  here, never on the live Perchance site.

`npm run build` rebuilds `src/app.js` + `src/app.css` after editing anything
under `src/` (needs internet once, to fetch the React libraries).
`npm run dev` already rebuilds on every save, so you only need this if the
watcher is off.

## The Vite option (VS Code)

Prefer editing with instant refresh? Run the site with Vite instead:

```
npm install   (once — downloads React, Vite and the site's libraries)
npm run vite  (opens http://localhost:5173/, admin at /admin)
```

It is the same site and the same backend — `vite.config.mjs` serves
`src/main.tsx` directly (edits apply in the browser the moment you save, no
rebuild step) and wires in the admin publishing backend, the YouTube proxy and
the photo files, so Publish, sign-in, recent services and the live badge all
work exactly like the preview. Published content is still stored in
`data/cms-state.bin`, shared with `npm run dev` — switch between the two
freely. (If you edit the publishing rules themselves, the
`<script type="text/x-server-plugin">` block in `index.html`, restart Vite so
it picks them up.)

The extract you run is always the only state: the server prints a `[code …]`
fingerprint on boot, and any new code retires only the undo history
automatically — the office's draft, unsaved changes and anything waiting to
publish survive updates (the client rebases them onto the new code), and
nothing old can override the new site. Published sections are
kept across code updates; only the publish history (*Recent activity*) is
cleared, so it starts recording again from your next publish.
`data/cms-state.bin` ships the published content exactly as it stands on the
live site with no publish history, so the first local launch already matches
the preview; your own publishes continue from there.

Local limits: photo and video uploads from the console are kept on your own
computer (`data/uploads/`), so they work here — but they stay on that
computer (the live site keeps its own copies, uploaded from its own
console). YouTube reads
(the live badge, recent services) go through the local server itself, so they
work here exactly like the live site. The visitor's own time zone and currency
(the IP lookup behind the times and the Giving amounts) do too: when the
browser's direct lookup is blocked here, the page asks the local server
(`/__geo`, `/__rates`) instead, which looks it up from its side. Everything else —
pages, slides, admin sign-in, invites, sub-admins, publishing — works.
