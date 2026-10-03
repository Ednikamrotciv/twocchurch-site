# Running the site on your own computer

Extract the zip, then double-click **start.bat** (Windows) or run `sh start.sh`
(Mac/Linux) — the site opens at http://localhost:5173/
(the admin console is at http://localhost:5173/admin). No `npm install`
needed: the server and the admin backend run on plain Node.js.

To put the site on the internet (Vercel, Netlify, …), see **DEPLOY.md** —
`npm run vite` is a development server and cannot be deployed itself.

`npm install` is only for the Vite extras: instant refresh while you edit
(`npm run dev` runs Vite with Hot Module Reload), the static deploy build
(`npm run build`, see DEPLOY.md), and the typecheck
(`npm run typecheck`).

What `npm run dev` starts: Vite on http://localhost:5173/ (admin at /admin),
serving `src/main.tsx` directly — edits apply in the browser the moment you
save — with the site's own publishing backend wired in
(`scripts/cms-local.mjs`, the exact server code from index.html), so Publish,
sign-in, recent services and the live badge all behave exactly like the
preview. Published content is stored in `data/cms-state.bin`
(created on first publish; keep that file to keep your content).
`scripts/local-shim.js` connects the site to that backend. It only loads
here, never on the live Perchance site.

Prefer zero setup? `npm run serve` (or double-click **start.bat** / `sh
start.sh`) runs the same site on the plain-Node server in `scripts/`
instead — no install at all. Both servers share `data/cms-state.bin`, so
switch between them freely. (If you edit the publishing rules themselves, the
`<script type="text/x-server-plugin">` block in `index.html`, restart Vite so
it picks them up.)

`npm run build` rebuilds `src/bundle.js` + `src/bundle.css` and the deployable
`dist/` folder after editing anything
under `src/` (needs internet once, to fetch the React libraries).
`npm run serve` already rebuilds on every save, so you only need this if the
watcher is off.

## The stuck splash screen

The very first `npm run dev` start bundles the big libraries once (this can
take up to a minute in the terminal) — after that, page loads are fast. If
the logo screen still sits there after ~20 seconds, it will now say why (the
error is also in the browser console — press `F12`).

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
