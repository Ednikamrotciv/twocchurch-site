# Running the site on your own computer

You need Node.js (v24, see `.nvmrc`) and nothing else.

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
