# Running the site on your own computer

You need Node.js 20 or newer (LTS recommended — see `.nvmrc`) and nothing else.
Vite 6 runs on Node 18+, but 20 LTS avoids the `ExperimentalWarning:
require(ESM)` noise newer Node prints from npm itself (harmless, but it scared
people into thinking the install was broken).

Easiest on Windows: extract the zip, then double-click **`install.bat`**.
It prints your Node/npm versions, clears the half-installed folders that
corrupt most often, verifies the npm cache, and runs `npm install` with full
output so the real error is visible if one happens. When it says DONE:

```sh
npm run dev   # → http://localhost:5173/  (admin console: /admin)
```

Or the manual way (same thing install.bat does):

```sh
npm install   # once
npm run dev   # → http://localhost:5173/  (admin console: /admin)
```

Edits apply in the browser the moment you save (Vite HMR). Sign-in, Publish,
uploads, recent services and the live badge all work in dev — it runs the same
backend the production server runs, so what you see is what the office gets.

If dev ever shows a stale or blank page after updating these files, run once:

```sh
npm run clean
```

then `npm run dev` again. (It clears dist/ and Vite's dependency cache.)

## One folder, one update (note 253)

Extract the newest zip, then:

```sh
npm install   # once
npm run dev   # → http://localhost:5173/  (admin console: /admin)
```

That is the whole update procedure — a new update's first boot opens on its
own words by itself, ignoring any older copy's saved cache. Your own unsaved
draft and anything published while offline are kept and behave as before.
Delete old extract folders when you can, so only one copy stays. `npm run
clean` clears dist/ and Vite caches if a page ever looks stale; your words in
`data/` are never touched.

## Updating: backup first, restore after (note 254)

Each update holds visitors on maintenance while the admin stays fully active —
that window is for bringing your words home:

1. Before switching folders: Admin → Tools → **Back up now**. Keep the file.
2. Extract the newest zip, `npm install`, `npm run dev`, sign in at `/admin`.
3. The banner says visitors are waiting: **Restore a backup** opens Tools —
   upload the file (words and photos return as a draft, shaped to the new
   update; anything the update retired is named and left out).
4. Review the site, then **Review and publish** → Publish. The site returns
   exactly as it was, with only the new update's changes new.

## The always-on office computer (and Render)

Editing away from your own computer needs one shared backend behind every copy
(see `DEPLOY.md`, "The office server"):

```sh
npm run build   # → dist/
npm start       # serves dist/ + the backend (or double-click start.bat)
```

Leave that running on the always-on machine. Content is stored in
`data/cms-state.bin` (created on first publish — keep that file to keep your
content); photo/video uploads land in `data/uploads/`.

## If `npm install` fails on Windows

1. Use Node 20 LTS from https://nodejs.org/ (check with `node -v`).
   Node 18+ works, but 20 LTS is the smoothest on Windows.
2. Close editors/antivirus scans of the folder, then delete the half-made
   `node_modules` folder and run again:
   ```sh
   npm cache verify
   npm install
   ```
   Or just double-click `install.bat` — it does all of this for you.
3. The `ExperimentalWarning: ... loading ES Module ... using require()` line
   comes from npm itself on newer Node — it is harmless noise, not the
   failure. The real reason is the `npm error code ...` line above it, or the
   tail of the newest file in `%LOCALAPPDATA%\npm-cache\_logs\`.
   (This project's old `.npmrc` hid those lines with `loglevel=error` —
   that setting has been removed, so you will now see the reason.)
4. Still stuck? Copy the whole terminal output (or the log tail) and send it
   — it names the exact cause (`EBADENGINE`, `ERESOLVE`, `EPERM`, `ENET`…).

## Security log (WAF + anomaly)

`npm run dev` and `npm start` both run a zero-dependency shield in front of
the server (see `scripts/SECURITY.md`): malicious patterns are blocked before
they reach the code, and every event prints in this terminal with severity +
IP + hint. Potential breaches also auto-write
`data/security-report-latest.pdf`; `npm run security:report` rewrites it on
demand. As a signed-in admin: `/__security/events.json?conn=…` (JSON) and
`/__security/report.pdf?conn=…` (PDF download).
