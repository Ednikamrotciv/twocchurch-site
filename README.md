# World Overcomers Website

React + TypeScript (Vite). Same content, same admin console — this layout just
runs and deploys the standard way.

## Run it

```sh
npm install
npm run dev      # → http://localhost:5173/  (admin: /admin)
```

Details: `LOCALDEV.md`. Deploying: `DEPLOY.md`. Content/feature guide:
`src/README.md`.

## Scripts

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Edit locally (HMR + admin backend)                        |
| `npm run dev:fresh`  | Same, after clearing Vite's cache (run once if stale)    |
| `npm run build`      | Production build → `dist/` (+ baked content, route pages) |
| `npm start`          | Serve `dist/` + the shared backend (office PC / Render)  |
| `npm run typecheck`  | `tsc --noEmit`                                            |
| `npm run bake-seed`  | Re-bake `seed.json` from `data/cms-state.bin`            |
| `npm run backup`     | Snapshot content now (`data-backups/`)                    |
| `npm run restore`    | Restore a snapshot by hand                                |
| `npm run set-server` | Point deploys at the office server (`cms-server.txt`)     |
| `npm run expose`     | Open this machine over a secure tunnel (foreground)       |

## Layout

- `index.html` — entry shell (`/src/main.tsx` + Perchance server block)
- `main.pjs` — site config + Perchance plugin imports
- `src/` — the app (pages, components, data, styles, CMS client)
- `scripts/serve.mjs` — office/production server (serves `dist/`)
- `scripts/vite-cms-backend.mjs` — same backend as Vite middleware for dev
- `scripts/build-static.mjs` — `vite build` post-step (bakes `dist/`)
- `data/cms-state.bin` — the published content (created on first publish)
- `seed.json` — baked snapshot shipped to static hosts

Generated, never committed: `node_modules/`, `dist/`, `src/bundle.js`,
`src/chunks/`, `server.json`, `feed.json`. (`src/README.md`, `src/SPEC.md`
and `src/TODO.md` are the long-form feature docs and history.)
