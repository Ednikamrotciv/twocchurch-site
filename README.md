# World Overcomers Website

React + TypeScript (Vite).

## Run it

```sh
npm install
npm run dev      # → http://localhost:5173/  (admin: /admin)
```

Edits apply in the browser the moment you save (Vite HMR). Sign-in, Publish,
uploads and recent services all work in dev — it runs the site's own backend,
so what you see is what you get.

If dev ever shows a stale or blank page, run once:

```sh
npm run dev:fresh
```

then `npm run dev` again. (It clears Vite's dependency cache.)

Content you publish is stored in `data/cms-state.bin` (created on first
publish — keep that file to keep your content); photo/video uploads land in
`data/uploads/`.

## Scripts

| Command           | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `npm run dev`     | Edit locally (HMR + admin backend)                     |
| `npm run dev:fresh` | Same, after clearing Vite's cache (run once if stale) |
| `npm run build`   | Production build → `dist/`                             |
| `npm run typecheck` | `tsc --noEmit`                                       |

## Layout

- `index.html` — entry shell (`/src/main.tsx` + page `<title>`)
- `src/` — the app (pages, components, data, styles, CMS client)
- `scripts/cms-server.js` — the content server (sign-in, publishing, uploads)
- `scripts/vite-cms-backend.mjs` — same backend as Vite middleware for dev
- `scripts/cms-local.mjs` — runs the content server in Node for dev
- `data/cms-state.bin` — the published content (created on first publish)
- `seed.json` — content snapshot the app falls back to

Generated, never committed: `node_modules/`, `dist/`. (`src/README.md`, `src/SPEC.md`
and `src/TODO.md` are the long-form feature docs and history.)
