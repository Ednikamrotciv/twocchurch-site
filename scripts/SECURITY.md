# Security shield — WAF + session anomaly + live terminal log

Zero new dependencies, zero build-step changes: frontend and backend deploys
take exactly as long as before (`npm run build` is untouched; the shield runs
only at request time, a few microseconds of regex per request).

What was added (all in `scripts/`, all active in BOTH `npm run dev` and
`npm start`):

- `waf.mjs` — ModSecurity-style shield that sits in FRONT of the entire code.
  Every request passes `checkRequest` before any file or RPC runs, and every
  POST RPC body passes `checkBody` before `cms.call`. Two layers:
  - STATIC: method allow-list, URL length, path traversal, sensitive-file
    probing (`.git/`, `.env`, `data/cms-state.bin`), SQLi / XSS / command
    injection / LFI signatures, SSRF double-check on `/__yt`.
  - CONTEXT: per-IP rate limit (>150 req/min throttled 60s), stricter
    auth-door limit (>20 login tries/min throttled 5 min). Publish-family
    bodies (`publish`, `adoptLive`, `adoptFeed`, `getContent`) carry real page
    HTML and are NEVER signature-scanned — Publish / Recover / live-relay keep
    working exactly as before.
- `session-anomaly.mjs` — real-time session detection:
  - possible travel: one session id from two distant networks within minutes
  - unusual data access volume: >300–600 requests / >30 admin writes / burst
    denied calls per 5–10 min window
  - privilege escalation: anonymous/expired sessions calling admin-only RPCs,
    forged `adoptLive`/`adoptFeed`, repeated file-door hits without sign-in
- `security-log.mjs` — the real-time log you watch in the terminal:
  - every event prints immediately as
    `[SEC][dev|serve][LEVEL][time][IP][route] kind — detail | Hint: ...`
    with severity color, IP address, and a hardening hint.
  - online/offline: `startLiveWatch()` polls the live deploy's
    `/version.json` every 60s and logs `live-online` / `live-offline`, so
    `npm run dev` narrates the live box whether it is reachable or sleeping.
  - all events append to `data/security-events.jsonl` (git-ignored).
  - every medium+ event (potential breach) auto-writes
    `data/security-report-latest.pdf` (plus a timestamped copy) — a pure-JS
    PDF writer, no dependencies.
- `security-report.mjs` — `npm run security:report` reprints the log and
  rewrites the PDF on demand.

Preserved behavior (nothing below changed):

- Maintenance notice: every build still stamps a fresh opaque deploy ID and
  holds fresh visitors until Publish; a Publish (even with zero changes)
  clears it via the same `deployPublished` / `codeBlessed` / notes stamp.
- New deploy: still wipes old service workers/caches, opens unsaved-clean
  (draft + pending + history + relay debt cleared per deploy ID), stages
  welcome-only until Recover + Publish, keeps live-relay intact, and stays
  fresh/clean/new. The WAF allow-lists `/version.json`, `/seed.json`,
  `/server.json`, `/feed.json`, `/__cms/*`, `/__live-url`, `/__cms/events`.
- Deploy speed: no new `dependencies`, no `prebuild`/`build` change, no Vite
  plugin change — only request-time middleware.

Using it:

```sh
npm run dev
# watch the terminal: [SEC] lines appear live, with severity + IP + hint.
# breaches also write data/security-report-latest.pdf automatically.

npm run security:report
# reprints the log + rewrites the PDF.

# As a signed-in admin (office copy), in the browser or with curl:
#   /__security/events.json?conn=YOUR_CONN   (last 200 events, JSON)
#   /__security/report.pdf?conn=YOUR_CONN    (download the PDF)
```

If a breach lands:

1. `critical` command-injection / `high` escalation from one IP → block that
   IP at the host firewall (Render/Dashboard → Access Control), then restart
   the backend (rotates the adopt token) and rotate the admin password
   (Admin → Security) if the session was admin.
2. `medium` volume/offline → usually a scraper, stuck tab, or Render sleep —
   the throttle + keep-awake ping note in the hint covers it.
3. Keep `data/` backups (`npm run backup`) — the PDF + JSONL are evidence,
   not content; content recovery is still Tools → Backup/Restore → Publish.
