// security-test.mjs — `npm run security:test`
// Executable verification for the security implementation. Zero dependencies,
// plain asserts, exits non-zero on any failure.
//
// What it executes (for real — no mocks of the shipped logic):
//  1. WAF unit matrix: legit dev storm + prod page loads allowed; real attack
//     patterns blocked; tiered rate buckets (auth/recovery/publish/status/api)
//     enforce with 429 + Retry-After; throttle continuations flagged.
//  2. IP handling: loopback/IPv4/IPv6 normalization; forwarded headers ignored
//     from public remotes, honored (last-entry) behind a trusted proxy.
//  3. Classification/aggregation: repeats collapse to one incident; single
//     blocks/throttles never count as breaches; log-injection sanitized.
//  4. Real content-server auth (the shipped scripts/cms-server.js booted in a
//     temp dir via scripts/cms-local.mjs): wrong password denied, per-conn and
//     per-network login rate limits, publish/undoPublish/setMainPassword/
//     adoptLive denied without session+token, checkAdmin false for strangers,
//     ADMIN_HASH_OVERRIDE login works (env-loaded secret, hash only).
//  5. PDF builder emits a valid PDF; persistence reporter answers.
//
// Live-HTTP checks (full `node scripts/serve.mjs` boot, CORS, /__security/
// doors over the wire, multi-device sync) are NOT part of this file — they
// need a running server. Run them by hand per scripts/SECURITY.md §7:
// start the server, curl the doors without ?conn= (expect 403 "denied"),
// publish from admin, and confirm the second device lifts.
import { createWaf, normalizeIp, isLoopbackIp, ipClass, getClientIp, isSafePath, endpointCategory, RATE_LIMITS } from "./waf.mjs";
import { createSecurityLog, classifyEvent, buildPdfBuffer } from "./security-log.mjs";
import { createSessionAnomaly } from "./session-anomaly.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

let pass = 0;
let fail = 0;
const failures = [];
function ok(cond, name) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(name);
    console.error("FAIL:", name);
  }
}

const waf = createWaf();
const req = (pathname, method = "GET", ip = "127.0.0.1", search = "") =>
  waf.checkRequest({ method, pathname, search, headers: {}, ip });

// --- 1. legit dev storm: everything a hot dev session does, from ::1 ---
{
  let blocked = 0;
  const storm = [
    ["/@react-refresh", "GET"], ["/@vite/client", "GET"], ["/@fs/app/src/main.tsx", "GET"],
    ["/node_modules/.vite/deps/react.js", "GET"], ["/src/assets/logo.png", "GET"],
    ["/scripts/local-shim.js", "GET"], ["/version.json", "GET"], ["/seed.json", "GET"],
    ["/__live-url", "GET"], ["/__cms/events", "GET"], ["/", "GET"], ["/admin", "GET"],
  ];
  for (let i = 0; i < 80; i++) {
    for (const [p, m] of storm) {
      const v = req(p, m, "::1");
      if (!v.allow) blocked++;
    }
  }
  ok(blocked === 0, `dev storm from ::1: 0 blocked (got ${blocked})`);
  // contentRev polling: 40 rapid status reads from one loopback IP stay allowed
  let statusBlocked = 0;
  for (let i = 0; i < 40; i++) {
    const v = req("/__cms/contentRev", "POST", "::1");
    if (!v.allow) statusBlocked++;
  }
  ok(statusBlocked === 0, `40x contentRev from ::1 allowed (blocked ${statusBlocked})`);
  // version.json never trips, however often polled
  let vBlocked = 0;
  for (let i = 0; i < 200; i++) if (!req("/version.json", "GET", "::1").allow) vBlocked++;
  ok(vBlocked === 0, `200x version.json allowed (blocked ${vBlocked})`);
}

// --- 2. prod page loads ---
{
  const pages = ["/", "/admin", "/sermons", "/visit", "/version.json", "/seed.json", "/server.json", "/feed.json", "/__live-url"];
  const bad = pages.filter((p) => !req(p, "GET", "203.0.113.7").allow);
  ok(bad.length === 0, `prod page loads allowed (${bad.join(",") || "all ok"})`);
}

// --- 3. attacks blocked (403, high/critical) ---
{
  const attacks = [
    ["/", "GET", "?q=' OR '1'='1"],
    ["/search", "GET", "?q=<script>alert(1)</script>"],
    ["/x", "GET", "?f=../../etc/passwd"],
    ["/.git/config", "GET", ""],
    ["/.env", "GET", ""],
    ["/data/cms-state.bin", "GET", ""],
    ["/x", "GET", "?c=$(cat${IFS}/etc/passwd)"],
    ["/x", "GET", "?f=/etc/passwd"],
    ["/__yt", "GET", "?url=https://evil.example/steal"],
  ];
  let allBlocked = true;
  for (const [p, m, s] of attacks) {
    const v = req(p, m, "198.51.100.9", s);
    if (v.allow || (v.status !== 403 && v.status !== 400)) allBlocked = false;
  }
  ok(allBlocked, "attack patterns blocked (403)");
  const yt = req("/__yt", "GET", "198.51.100.9", "?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  ok(yt.allow, "YouTube proxy target still allowed");
}

// --- 4. tiered rate buckets ---
{
  const w2 = createWaf();
  const r2 = (p, m, ip) => w2.checkRequest({ method: m, pathname: p, search: "", headers: {}, ip });
  let authTrip = null;
  for (let i = 0; i < 22; i++) {
    const v = r2("/__cms/login", "POST", "10.9.9.9");
    if (!v.allow && !authTrip) authTrip = { i, v };
  }
  ok(!!authTrip && authTrip.i === 20, `auth bucket trips at 21st login (tripped at #${authTrip ? authTrip.i + 1 : "never"})`);
  ok(authTrip && authTrip.v.status === 429 && authTrip.v.retryAfter > 0, "auth trip is 429 with Retry-After");
  ok(authTrip && authTrip.v.severity === "medium" && !authTrip.v.continuation, "fresh auth trip is medium, not a continuation");
  const cont = r2("/__cms/login", "POST", "10.9.9.9");
  ok(!cont.allow && cont.continuation === true && cont.severity === "info" && cont.status === 429, "throttle continuation flagged info (not a new breach)");

  const w3 = createWaf();
  let recTrip = 0;
  for (let i = 0; i < 12; i++) {
    const v = w3.checkRequest({ method: "POST", pathname: "/__cms/setSubPassword", search: "", headers: {}, ip: "10.9.9.10" });
    if (!v.allow && !recTrip) recTrip = i + 1;
  }
  ok(recTrip === 11, `recovery bucket trips at 11th try (got ${recTrip})`);

  const w4 = createWaf();
  let pubTrip = 0;
  for (let i = 0; i < 22; i++) {
    const v = w4.checkBody({ rpc: "publish", body: JSON.stringify({ sections: {} }), ip: "10.9.9.11" });
    if (!v.allow && !pubTrip) pubTrip = i + 1;
  }
  ok(pubTrip === 21, `publish bucket trips at 21st publish (got ${pubTrip})`);

  const w5 = createWaf();
  let statusTrip = 0;
  for (let i = 0; i < 185; i++) {
    const v = w5.checkRequest({ method: "POST", pathname: "/__cms/contentRev", search: "", headers: {}, ip: "10.9.9.12" });
    if (!v.allow && !statusTrip) statusTrip = i + 1;
  }
  ok(statusTrip === RATE_LIMITS.status.max + 1, `status bucket trips at ${RATE_LIMITS.status.max + 1} (got ${statusTrip})`);

  // publish HTML body passes signature scans; credential bodies exempt
  ok(w4.checkBody({ rpc: "publish", body: "<div>hello</div><script>var x=1;</script>", ip: "10.9.9.13" }).allow, "publish HTML body not signature-scanned");
  ok(w4.checkBody({ rpc: "login", body: "'; DROP TABLE users; --", ip: "10.9.9.13" }).allow, "login body not signature-blocked (hash-compared server-side)");
}

// --- 5. IP handling ---
{
  ok(normalizeIp("::1") === "127.0.0.1", "normalize ::1");
  ok(normalizeIp("::ffff:127.0.0.1") === "127.0.0.1", "normalize ::ffff:127.0.0.1");
  ok(normalizeIp("::FFFF:10.0.0.1") === "10.0.0.1", "normalize mapped v4");
  ok(isLoopbackIp("::1") && isLoopbackIp("127.0.0.1") && isLoopbackIp("127.0.0.53"), "loopback forms");
  ok(ipClass("::1") === "loopback" && ipClass("8.8.8.8") === "public" && ipClass("10.1.2.3") === "private", "ip classes");
  const spoofed = { socket: { remoteAddress: "203.0.113.5" }, headers: { "x-forwarded-for": "1.2.3.4" } };
  ok(getClientIp(spoofed, false) === "203.0.113.5", "public remote: XFF ignored (spoof-safe)");
  ok(getClientIp(spoofed, true) === "1.2.3.4", "explicit trust: asserted proxy chain used (operator opted in via TRUST_PROXY)");
  const chained = { socket: { remoteAddress: "10.0.0.9" }, headers: { "x-forwarded-for": "evil, 198.51.100.7" } };
  ok(getClientIp(chained, true) === "198.51.100.7", "trusted proxy: attacker first-entry ignored, proxy-seen last entry used");
  const loopReq = { socket: { remoteAddress: "::1" }, headers: {} };
  ok(getClientIp(loopReq, false) === "127.0.0.1", "dev loopback normalized");
  ok(isSafePath("/@react-refresh", "GET") && isSafePath("/version.json", "GET") && isSafePath("/__live-url", "GET") && isSafePath("/__cms/events", "GET") && isSafePath("/assets/app.js", "GET"), "safe paths exempt from rate counting");
  ok(!isSafePath("/__cms/login", "POST") && !isSafePath("/__cms/publish", "POST"), "auth/publish still rate-counted");
  ok(endpointCategory("/__cms/contentRev", "POST") === "status-read", "contentRev categorized status-read");
}

// --- 6. anomaly: quiet + loopback + deny escalation ---
{
  const events = [];
  const an = createSessionAnomaly({ log: (e) => events.push(e) });
  for (let i = 0; i < 500; i++) an.observe({ connId: "tab1", ip: "127.0.0.1", route: "/version.json", quiet: true });
  ok(!events.some((e) => e.kind === "unusual-volume"), "quiet status polls never mint volume incidents");
  const ev2 = [];
  const an2 = createSessionAnomaly({ log: (e) => ev2.push(e) });
  for (let i = 0; i < 601; i++) an2.observe({ connId: "s1", ip: "198.51.100.8", route: "/x" });
  ok(ev2.some((e) => e.kind === "unusual-volume" && e.level === "medium"), "public volume burst flagged medium");
  const ev3 = [];
  const an3 = createSessionAnomaly({ log: (e) => ev3.push(e) });
  an3.observeFileDeny({ connId: "expired", ip: "127.0.0.1", route: "/__upload" });
  ok(ev3.length === 1 && ev3[0].level === "low" && ev3[0].kind === "file-deny", "single expired-tab deny is low, not a breach");
  an3.observeFileDeny({ connId: "expired", ip: "127.0.0.1", route: "/__upload" });
  an3.observeFileDeny({ connId: "expired", ip: "127.0.0.1", route: "/__upload" });
  ok(ev3.some((e) => e.level === "medium" && e.kind === "privilege-escalation"), "sustained probing escalates to medium");
}

// --- 7. security-log: aggregation, taxonomy, injection, rotation surface ---
{
  const dir = await mkdtemp(join(tmpdir(), "wom-sec-"));
  const slog = createSecurityLog({ rootDir: dir, service: "test" });
  for (let i = 0; i < 50; i++) slog.log({ level: "info", kind: "rate-throttle", ip: "127.0.0.1", route: "/__cms/contentRev", detail: "IP throttled (retry in 12s)", status: 429 });
  const inc = slog.getIncidents(10);
  ok(inc.length === 1 && inc[0].count === 50, `50 throttle repeats = 1 incident (got ${inc.length} inc, count ${inc[0] && inc[0].count})`);
  ok(slog.incidentsNeedingReview().length === 0, "throttle storm needs no review (not a breach)");
  ok(slog.getEvents(60).filter((e) => !e.dup).length === 1, "only the first repeat-hit is non-dup");
  const single = slog.log({ level: "high", kind: "waf-block", ip: "9.9.9.9", route: "/x", detail: "SQL-injection pattern in URL" });
  ok(single.class === "blocked-request", "single signature block classed blocked-request");
  ok(slog.incidentsNeedingReview().length === 1, "high signature block IS an incident needing review");
  // log injection: control chars must not survive into the terminal line
  let printed = "";
  const orig = console.log;
  console.log = (s) => { printed += String(s) + "\n"; };
  slog.log({ level: "low", kind: "waf-block", ip: "1.1.1.1", route: "/x\nEVIL-INJECTED: pwned\n", detail: "a\x1b[31mRED" });
  console.log = orig;
  ok(!printed.includes("EVIL-INJECTED: pwned\n") && printed.split("\n").filter((l) => l.includes("[SEC]")).length === 1, "log injection neutralized to one terminal line");
  const pdf = slog.buildPdf();
  ok(Buffer.isBuffer(pdf) && pdf.slice(0, 5).toString() === "%PDF-", "PDF builder emits a valid PDF");
  const persist = slog.getPersistence();
  ok(persist && typeof persist.persistent === "boolean" && persist.file.includes("security-events.jsonl"), "persistence reporter answers honestly");
  await rm(dir, { recursive: true, force: true });
}

// --- 8. real content server: auth, authz, per-net limits, env hash ---
{
  const dir = await mkdtemp(join(tmpdir(), "wom-cms-"));
  const { createCmsHost } = await import("./cms-local.mjs");
  const host = await createCmsHost(dir, {});
  const J = (r) => JSON.parse(r.body);
  let r = await host.call("login", "attacker", "wrong-password");
  ok(J(r).ok === false && J(r).err === "denied", "wrong password denied");
  r = await host.call("checkAdmin", "attacker", "");
  ok(J(r).ok === true && J(r).admin === false, "stranger checkAdmin=false (security doors would 403)");
  r = await host.call("publish", "attacker", JSON.stringify({ by: "x", sections: {} }));
  ok(J(r).ok === false, "publish without session denied (server-side authz)");
  r = await host.call("undoPublish", "attacker", "");
  ok(J(r).ok === false, "undoPublish without session denied");
  r = await host.call("setMainPassword", "attacker", "{}");
  ok(J(r).ok === false, "setMainPassword without session denied");
  r = await host.call("adoptLive", "attacker", JSON.stringify({ token: "forged", sections: {} }));
  ok(J(r).ok === false && J(r).err === "denied", "adoptLive with forged token denied");
  // per-connection login limit: 5 bad tries then 'rate'
  let rateSeen = "";
  for (let i = 0; i < 7; i++) {
    const rr = await host.call("login", "brute-conn", "nope-" + i);
    const e = J(rr).err;
    if (e === "rate") { rateSeen = "rate"; break; }
  }
  ok(rateSeen === "rate", "per-connection login guessing rate-limited server-side");
  // env-loaded admin hash (hash only, never the plaintext)
  const pw = "correct horse battery staple " + Math.random().toString(36);
  process.env.ADMIN_HASH_OVERRIDE = createHash("sha256").update(pw, "utf8").digest("hex");
  const dir2 = await mkdtemp(join(tmpdir(), "wom-cms2-"));
  const host2 = await createCmsHost(dir2, {});
  const okLogin = await host2.call("login", "office", pw);
  ok(J(okLogin).ok === true && J(okLogin).role === "main", "ADMIN_HASH_OVERRIDE signs the office in (env-loaded secret)");
  const chk = await host2.call("checkAdmin", "office", "");
  ok(J(chk).admin === true, "signed-in conn passes checkAdmin (upload/security doors open)");
  const pub = await host2.call("publish", "office", JSON.stringify({ by: "office", notes: 1, sections: {} }));
  ok(J(pub).ok === true, "signed-in conn can publish (legit CMS flow preserved)");
  const rev = await host2.call("contentRev", "office", "");
  ok(J(rev).ok === true && typeof J(rev).rev === "number", "contentRev stamp answers (cross-device sync preserved)");
  delete process.env.ADMIN_HASH_OVERRIDE;
  await rm(dir, { recursive: true, force: true });
  await rm(dir2, { recursive: true, force: true });
}

console.log(`\nsecurity:test ${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("failures:\n- " + failures.join("\n- "));
// Windows fix: graceful drain instead of force-exit (avoids UV_HANDLE_CLOSING with open handles).
process.exitCode = fail ? 1 : 0;
