# Security shield — WAF + session anomaly + live terminal log

Zero new dependencies, zero build-step changes: frontend and backend deploys
take exactly as long as before (`npm run build` is untouched; the shield runs
only at request time, microseconds of regex per request).

## 1. Dev vs production — what runs where

| | `npm run dev` (laptop) | `npm start` / Render (production) |
|---|---|---|
| Enforcer | `scripts/vite-cms-backend.mjs` | `scripts/serve.mjs` (Render start command) |
| WAF module | `scripts/waf.mjs` — the SAME file | `scripts/waf.mjs` — the SAME file |
| Anomaly detector | `scripts/session-anomaly.mjs` | `scripts/session-anomaly.mjs` |
| Verdicts | same signatures, same buckets | same signatures, same buckets |

Every check executes **server-side in Node, in the HTTP layer before any file
or RPC runs**. Nothing trusts the browser: there are no client-side gates to
bypass, no secrets in frontend code (the admin password exists server-side
only as a SHA-256 hash), and editing frontend JavaScript cannot weaken any
control. The boot line states the mode honestly — a `DEV` line never protects
the deployed site; production is guarded by `scripts/serve.mjs`.

Vite development paths (`/@vite/*`, `/@react-refresh`, `/@fs/*`,
`/node_modules/*`, `/src/*`) exist only in dev. They are recognized as
dev-only noise: still signature-scanned, but never rate-counted. They do not
exist in production (unknown paths serve the app shell), so nothing dev-only
is exposed there.

## 2. Rate limits (per IP, per bucket — the production policy)

| Bucket | Doors | Limit | Throttle | Trip severity |
|---|---|---|---|---|
| `status` | contentRev/getContent/checkAdmin/liveReport reads, GET navigations | 180/min | 15 s | low |
| `api` | all other RPCs, uploads, security doors | 90/min | 30 s | low |
| `auth` | login, login2fa | 20/min | 5 min | medium |
| `recovery` | setSubPassword (invite redemption) | 10/min | 5 min | medium |
| `publish` | publish/undoPublish (+adopt, counted once in the body gate) | 20/min | 60 s | low |

Fully exempt from counting (still signature-scanned): `/version.json`,
`/seed.json`, `/server.json`, `/feed.json`, `/__live-url`,
`/scripts/local-shim.js`, the `/__cms/events` stream, Vite dev paths,
static assets. Trips answer **429 + Retry-After**; signature blocks answer
403. A repeat inside one throttle window is the SAME incident (`rate-throttle`,
info) — never a new breach, never a new PDF.

On top of the WAF, the content server rate-limits logins per connection
(5 fails/10 min) and per network (40 fails/10 min). The http layer now stamps
each connection with a hash of the real client IP (`setConnNet`), so the
network backstop is genuinely per-IP instead of one global bucket.

## 3. Event taxonomy (what the report counts)

- `blocked-request` — one signature deny (traversal, SQLi, XSS, …). A block
  is **not** a breach by itself.
- `rate-limit` — a throttle-window trip (429). Policy event, not an attack
  verdict. Routine polling must never read as "20 breaches".
- `suspicious-pattern` — anomaly watch (volume, auth failures, offline) to
  review.
- `security-incident` — needs a human: privilege escalation, auth-probing
  bursts, command injection, stuck publishes. Only a reviewed incident may
  escalate — a confirmed compromise is NEVER auto-declared.
- `notice` — operational info (shield-on, publish accepted, live-online,
  PDF written). Never a breach.

Repeats from one source+endpoint inside 10 minutes aggregate into ONE
incident (count, first/last timestamps, status codes, category, request id).
`npm run security:report` prints unique incidents vs raw events and writes
the PDF from incidents.

## 4. Client IPs (no spoofing, loopback handled)

One helper (`getClientIp` in `waf.mjs`): `::1`, `::ffff:127.0.0.1`,
`127.x` all normalize to one spelling; IPv4/IPv6/private/loopback are
classified. Forwarded headers (`X-Forwarded-For`) are honored ONLY behind a
trusted proxy (`RENDER=1` on Render, or `TRUST_PROXY=1`); otherwise the
socket address is the client. When trusted, the LAST entry is used (the
address the proxy actually saw — the first entry is attacker-controlled).

## 5. Logs, PDFs, persistence

- Backend-owned: `data/security-events.jsonl` (capped ~5 MB with rotation),
  written by the server — never browser state.
- `GET /__security/events.json` and `GET /__security/report.pdf` require a
  signed-in admin conn (`?conn=` checked server-side against the live
  session table). Strangers get 403 `denied` (first hit logs low; repeats
  escalate). Test: `curl https://SITE/__security/report.pdf` → `denied`.
- On a laptop the disk persists. **On Render the local disk is EPHEMERAL
  unless a persistent disk is mounted**: without one, sleeps/restarts wipe
  the JSONL + PDFs. The boot line and `security:report` say which it is.
  To keep evidence: mount a disk at `data/`, or set `SECURITY_LOG_DIR` to a
  mounted path. The live in-memory log + admin doors keep working regardless.
- Terminal output is sanitized (no newlines/control chars from request
  data): logged paths cannot inject fake lines (log injection).

## 6. Authentication & CMS (unchanged guarantees, hardened wiring)

- Administrator accounts, password hashes, roles, sub-admins, invites,
  two-factor live in `data/cms-state.bin` and survive every deploy; clean
  deploys clear words only, never the roster.
- Publish, user management, password changes, security-report doors all
  enforce server-side session checks (`sessionDeny`/`sessionLive`); public
  reads (content, stamps, version) stay public by design.
- `ADMIN_HASH_OVERRIDE`: set it (64-hex SHA-256 of the password, never the
  password) in Render dashboard > Environment to keep the office's real
  password across diskless sleep/resets instead of falling back to the
  shipped default. Sessions themselves stay in-memory by design (15-min
  idle expiry; a restart signs the office back in — deploy-bound sessions
  do this automatically).
- The WAF body gate never blocks credential or publish bodies on signatures
  (hash-compared / allow-listed); per-IP buckets + server-side limits still
  apply, so guessing is throttled without locking out legit logins.
- Cross-device sync is untouched: contentRev stamps, SSE shouts, HTTP
  stamp-polling, live-follow loops and publish-watch all bypass nothing and
  are rate-exempt or generously bucketed.

## 7. Render production checklist

- Start command `node scripts/serve.mjs`; single instance is exact for the
  in-memory buckets (if ever scaled horizontally, add sticky sessions or a
  shared store — see `createWaf` note).
- Optional env: `TRUST_PROXY=1` (non-Render reverse proxy),
  `ADMIN_HASH_OVERRIDE=<64-hex>` (stable office password without a disk),
  `SECURITY_LOG_DIR=/var/data/security` (evidence on a mounted disk),
  `SECURITY_PERSISTENT=1` (assert persistence reporting when the dir is
  mounted at `data/`).
- CORS stays `*` (deployed copies read the office server cross-origin);
  writes still take an admin session, so openness buys no authority.
- Uploads between deploys stay ephemeral without a disk (see DEPLOY.md) —
  publish uploads locally so they bake in.

## Using it

```sh
npm run dev
# watch the terminal: [SEC] lines live, with severity + IP + hint.
# Unique incidents auto-write data/security-report-latest.pdf.

npm run security:report
# reprints unique incidents + raw counts, persistence status, rewrites the PDF.

npm run security:test
# executes the WAF/anomaly/classification/auth test matrix (no server needed).
# Live-HTTP checks (boot, CORS, doors over the wire, two-device sync) need a
# running server — see §7 + DEPLOY.md and run them by hand before declaring
# done. Never claim tests passed unless they were executed.

# As a signed-in admin (office copy), in the browser or with curl:
#   /__security/events.json?conn=YOUR_CONN   (events + incidents, JSON)
#   /__security/report.pdf?conn=YOUR_CONN    (download the PDF)
```

If an incident needs review:

1. `critical` command-injection / sustained `security-incident` from one
   IP → block that IP at the host firewall (Render Dashboard → Access
   Control), restart the backend (rotates the adopt token), rotate the admin
   password (Admin → Security) if the session was admin.
2. `suspicious-pattern` volume / `live-offline` → usually a scraper, stuck
   tab, or Render sleep — the throttle + keep-awake ping hint covers it.
3. Keep `npm run backup` snapshots: the PDF + JSONL are evidence, not
   content; Tools → Backup/Restore + Publish is the way back for words.
4. Record the review so the board clears honestly: `npm run security:ack`
   lists the open keys, then
   `npm run security:ack -- ack "<kind|ip|route>" "<what you verified>"`
   writes `data/security-reviewed.json` + a `review-ack` line in the JSONL.
   RED means UNREVIEWED — a triaged alert clears on the next run while the
   evidence and the note stay on disk. A fresh hit re-raises immediately.
   Triage guide: a single denied `privilege-escalation` from 127.0.0.1 on
   `/__cms/publish` is an expired office tab (15-min idle) pressing Publish
   — denied 403, nothing written, benign. A `publish-stuck` after ~50s
   means the office→live relay missed: read the Publish toast — a denied
   live login is fixed once by typing the live box's CURRENT password on the
   Status tab (diskless sleeps reset it; ADMIN_HASH_OVERRIDE ends that), a
   "not a git checkout" line means publish from a git checkout or Publish on
   live/admin, and a merely asleep live box is carried by its retry + wake.

## 8. Seven-area posture board (terminal + PDF)

Every `npm run dev` prints the posture table first (the `predev` hook runs
`node scripts/security-status.mjs`; `dev` itself stays `vite`), the dev
and production backends re-print it at boot, and every PDF carries it on page
one — same checks, same wording, in all three places.

Areas: Security event monitoring | Incident classification |
Production backend availability | Admin login and password protection |
Protection against unauthorized publishing | Persistent storage and backups |
Protection against common web attacks.

Severity rule: the most serious problems — live attacks, probing bursts,
privilege escalation, WAF holes, missing publish guards — are RED ALERT
(red in the terminal, red in the PDF). Anything that is NOT an attack
(ephemeral disk, no snapshot yet, live box asleep, default-password hygiene,
dev-only gaps) is WARNING or NOTICE (yellow/green/grey — low/medium, never
red). A blocked request or a throttle is never a compromise; only a reviewed
security-incident may escalate.

```sh
npm run dev              # predev prints the 7-area board, then vite starts
npm run security:status  # board only (terminal + data/security-status.json + PDF refresh)
npm run security:report  # board + unique incidents + PDF rewrite
npm run security:test    # full WAF/anomaly/auth test matrix (unchanged)
```
