# Storage & wake-up — operator guide

## 1. What the site already did (before this change)

- Permanent data lived in `data/` beside the code: `cms-state.bin` (sections,
  publish stamp + revision, publish history, admin accounts/sessions/2FA,
  undo), `cms-version.txt`, `uploads/`, security evidence.
- On hosts without a persistent disk (Render free), `data/` is wiped on every
  sleep/restart. The site already survived that with an *external durability
  net*: git auto-push of `data/` + `seed.json` on every publish, a baked
  `seed.json` fallback served on empty stores, feed/live mirrors that re-adopt
  the latest publish, upload backfill, boot-guard snapshots in `data-backups/`,
  and `ADMIN_HASH_OVERRIDE` so the password survives a wipe.
- This change keeps all of that and adds: explicit storage modes, a real
  persistent-disk path, a readiness gate the site wakes on, scheduled backups
  with integrity checks, and a safe migration tool.

## 2. Storage modes (explicit — never auto-detected)

| `STORAGE_MODE` | Permanent data lives in | Durability |
|---|---|---|
| `external` (default) | `data/` beside the code | git + seed bake + mirrors (as before) |
| `backend_disk` | `BACKEND_DISK_PATH` (e.g. `/var/data`) | the mounted disk |
| `hybrid` | disk (authoritative) + external net when configured | disk + git/seed/mirror |

Rules the code enforces:

- `backend_disk`/`hybrid` REQUIRE `BACKEND_DISK_PATH` (absolute). Missing,
  relative, non-directory, or unwritable = the server boots **degraded**
  (reads serve the baked seed, writes answer 503, `/api/health/ready` says why).
- A missing mount is NEVER auto-created and NEVER silently replaced with a
  local/temp directory.
- `DATA_DIR` is honored only as a path alias and only together with an
  explicit `STORAGE_MODE` — it never switches the mode by itself.
- Unknown `STORAGE_MODE` values fail closed.

Related knobs: `BACKUP_DIR` (absolute override; defaults: `data-backups/` in
external mode, `<disk>/backups` in disk modes), `BACKUP_INTERVAL_MIN`
(default 360, min 60), `EXTERNAL_MIRROR_URL` + `EXTERNAL_MIRROR_TOKEN`
(optional off-site PUT copy of snapshots, best-effort), `SECURITY_LOG_DIR`
(unchanged — evidence dir override).

## 3. Endpoints

- `GET /healthz` → `ok` (host probe; unchanged).
- `GET /api/health/ready` → `{ ok, mode, rev, notes, at, source, reason? }`.
  `ok:false` while the store is empty with no usable seed, while storage is
  degraded, or (transiently) on a clean deploy the office has not published.
  Public, tiny, no paths or secrets. Visitor browsers poll this (single-flight
  per address, exponential backoff, paused while hidden) and only then open
  the content socket — the page stays painted on the last published content
  throughout (the wait is silent — no banner).

## 4. Backups (mode-independent)

- Boot snapshot + scheduled snapshot every `BACKUP_INTERVAL_MIN`, integrity
  manifest (`storage-manifest.json`) per snapshot, `npm run backup:verify`
  (`node scripts/backup-data.mjs verify`), machine-readable
  `backup-status.json` beside the snapshots, terminal + security-log alerts
  (`BACKUP ALERT`) on failure or failed verification.
- Manual: `npm run backup`, `npm run restore [name|force]`, `npm run adopt`.

## 5. Migrating (e.g. free → persistent disk)

1. `npm run storage:status` — confirm what each side holds. Changes nothing.
2. Create the disk on Render (dashboard → service → Disks → e.g. mount path
   `/var/data`), set env `STORAGE_MODE=backend_disk`,
   `BACKEND_DISK_PATH=/var/data`, **redeploy first** (config only — data does
   not move yet).
3. On the machine holding the data (the office copy):
   `npm run storage:migrate -- --to disk` (or explicit
   `node scripts/storage-migrate.mjs copy --to disk --source <abs> --target <abs>`).
   The script copies state + version + uploads, writes + re-verifies a
   checksum manifest, cross-checks the state hash, refuses to overwrite a
   populated target with an empty source, and never deletes the source.
4. Restart the backend with the new env. Confirm `/api/health/ready` is `ok`
   and the site shows the words on two devices.
5. Rollback at any time: restore the previous env values, restart. Both
   locations stay intact — nothing was ever deleted.

Verify a location any time: `npm run storage:verify -- --dir <abs>`
(defaults to local `data/`).

## 6. Tests

- In-browser unit tests (config rules, migration, manifests) were executed
  during development — see the dev report, all passing.
- On a machine with Node 18+: `npm run storage:test` — temp-dir only, never
  touches live data. Covers config refusals, missing-mount failure (and that
  it is NOT auto-created), migrate copy/idempotency/verify/tamper/refusal,
  and the backup/restore/guard round-trip.
- Manual checklist (office): sleep/wake on free (words + images survive,
  admin login works after wake, publish from two browsers); disk mode (mount
  present, restart keeps data, redeploy keeps data, mode switch loses
  nothing, `backup:verify` clean); pull the network mid-publish (no empty
  CMS, pending work flushes on return).

## 7. What was NOT changed

Admin accounts, publish history, revisions, media URLs (`/data/uploads/*`),
livestream config, routes, design, security shields (WAF/rate limits/file
gates), the git deploy pipeline, or the seed-fallback survival net. A
misconfigured disk cannot reset the CMS, publish half a site, or strand the
office signed out silently — writes are refused loudly instead.
