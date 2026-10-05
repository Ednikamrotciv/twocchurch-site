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
npm run dev:fresh
```

then `npm run dev` again. (It clears Vite's dependency cache.)

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
