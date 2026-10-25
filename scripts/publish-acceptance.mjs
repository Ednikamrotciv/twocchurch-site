/* publish-acceptance.mjs — acceptance tests for the fast parallel publish fix.
   Covers §8: office publish commits, cross-device sync, invalid creds, timeout
   idempotency, rapid publishes newest-wins, restart persistence, authz, and
   honest local-vs-live status. No deps, no network — drives the real
   scripts/cms-server.js through scripts/cms-local.mjs in temp dirs.
   Run: node scripts/publish-acceptance.mjs */
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ok - ${name}`); }
  else { fail++; failures.push(name); console.log(`  NOT OK - ${name}`); }
}
const J = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };
async function login(host, conn, pw) {
  const r = await host.call("login", conn, pw);
  return J(r);
}

console.log("publish:acceptance — fast parallel publish (§8)");

// Use the shipped default admin hash from cms-server.js so tests run anywhere.
let SHIPPED = "";
try {
  const src = await readFile(new URL("./cms-server.js", import.meta.url), "utf8");
  const m = /var ADMIN_HASH = "([0-9a-f]{64})"/.exec(src);
  if (m) SHIPPED = m[1];
} catch {}
// We cannot reverse the hash; instead mint a fresh password via env override.
const OFFICE_PW = "acceptance-" + Math.random().toString(36).slice(2) + "-pw";
process.env.ADMIN_HASH_OVERRIDE = createHash("sha256").update(OFFICE_PW, "utf8").digest("hex");

const dir = await mkdtemp(join(tmpdir(), "wom-pub-"));
const { createCmsHost } = await import("./cms-local.mjs");
const host = await createCmsHost(dir, {});

// 1. Office publish commits rev + timestamp on the production backend.
{
  const l = await login(host, "office", OFFICE_PW);
  ok(l.ok === true, "office signs in with env hash (no shipped fallback needed)");
  const before = J(await host.call("health", "office", ""));
  ok(before.ok === true && typeof before.rev === "number", "health stamp answers (lightweight, no words)");
  const pub = J(await host.call("publish", "office", JSON.stringify({
    by: "office", notes: 438, sections: { notices: JSON.stringify([{ id: "n1", text: "hello" }]) },
    changed: ["notices"], first: true, quiet: false, opId: "op-accept-1", baseRev: before.rev,
  })));
  ok(pub.ok === true && typeof pub.rev === "number" && typeof pub.at === "number", `publish commits rev+at receipt (rev ${pub.rev})`);
  var REV1 = pub.rev, AT1 = pub.at;
  const stamp = J(await host.call("contentRev", "office", ""));
  ok(stamp.ok === true && stamp.rev === REV1 && stamp.at === AT1, "contentRev matches the committed revision (server is source of truth)");
  const full = J(await host.call("getContent", "second-browser", ""));
  ok(full.ok === true && full.rev === REV1, "second browser reads the same revision via getContent (no cache clear)");
  try {
    const secs = JSON.parse(full.sections);
    ok(secs.notices && JSON.parse(secs.notices)[0].text === "hello", "second browser receives the new words");
  } catch { ok(false, "second browser receives the new words"); }
}

// 2. Invalid credentials fail safely without publishing.
{
  const bad = J(await host.call("publish", "attacker", JSON.stringify({ by: "x", sections: { notices: JSON.stringify([]) }, changed: ["notices"], opId: "op-bad-1" })));
  ok(bad.ok === false, "unauthenticated publish denied (never reports success)");
  const stamp = J(await host.call("contentRev", "office", ""));
  ok(stamp.rev === REV1, "failed auth leaves the committed revision untouched");
  const badLogin = await login(host, "attacker2", "wrong-password");
  ok(badLogin.ok !== true, "wrong password denied");
}

// 3. Timeout retry with the same opId never duplicates.
{
  const l = await login(host, "office2", OFFICE_PW);
  ok(l.ok === true || J(await host.call("checkAdmin", "office2", "")).admin === true, "office session holds for retry test");
  const before = J(await host.call("contentRev", "office2", ""));
  const payload = JSON.stringify({
    by: "office", notes: 438, sections: { notices: JSON.stringify([{ id: "n1", text: "hello-again" }]) },
    changed: ["notices"], first: true, quiet: false, opId: "op-retry-1", baseRev: before.rev,
  });
  const first = J(await host.call("publish", "office2", payload));
  ok(first.ok === true, `first attempt commits (rev ${first.rev})`);
  const second = J(await host.call("publish", "office2", payload));
  ok(second.ok === true && second.rev === first.rev, "retry with same opId returns the same rev (no duplicate bump)");
  const stamp = J(await host.call("contentRev", "office2", ""));
  ok(stamp.rev === first.rev, "store holds exactly one additional revision after retry");
  var REV2 = first.rev;
}

// 4. Two rapid publishes: newest wins; stale base loses instead of overwriting.
{
  const before = J(await host.call("contentRev", "office", ""));
  const pA = J(await host.call("publish", "office", JSON.stringify({
    by: "office", notes: 438, sections: { notices: JSON.stringify([{ id: "n1", text: "rapid-A" }]) },
    changed: ["notices"], first: true, quiet: false, opId: "op-rapid-A", baseRev: before.rev,
  })));
  ok(pA.ok === true, `rapid publish A commits (rev ${pA.rev})`);
  const stale = J(await host.call("publish", "office", JSON.stringify({
    by: "office", notes: 438, sections: { notices: JSON.stringify([{ id: "n1", text: "stale-overwrite" }]) },
    changed: ["notices"], first: true, quiet: false, opId: "op-rapid-stale", baseRev: before.rev,
  })));
  ok(stale.ok === false && stale.err === "conflict", "stale baseRev rejected (older never overwrites newer)");
  const pB = J(await host.call("publish", "office", JSON.stringify({
    by: "office", notes: 438, sections: { notices: JSON.stringify([{ id: "n1", text: "rapid-B" }]) },
    changed: ["notices"], first: true, quiet: false, opId: "op-rapid-B", baseRev: pA.rev,
  })));
  ok(pB.ok === true && pB.rev > pA.rev, `rapid publish B wins on a fresh base (rev ${pB.rev})`);
  const full = J(await host.call("getContent", "phone", ""));
  try {
    const secs = JSON.parse(full.sections);
    ok(JSON.parse(secs.notices)[0].text === "rapid-B", "phone reads the newest words (newest wins)");
  } catch { ok(false, "phone reads the newest words (newest wins)"); }
}

// 5. Restart/redeploy preserves content + admin accounts (durable disk state).
{
  const host2 = await createCmsHost(dir, {});
  const stamp = J(await host2.call("contentRev", "anyone", ""));
  ok(stamp.ok === true && stamp.rev > 0, `restart reloads the last committed revision (rev ${stamp.rev})`);
  const full = J(await host2.call("getContent", "anyone", ""));
  try {
    const secs = JSON.parse(full.sections);
    ok(secs.notices && JSON.parse(secs.notices)[0].text === "rapid-B", "restart keeps published words");
  } catch { ok(false, "restart keeps published words"); }
  const l = await login(host2, "office-after-restart", OFFICE_PW);
  ok(l.ok === true, "admin accounts survive restart (no re-registration needed)");
}

// 6. Unauthenticated users cannot change admin settings.
{
  const r = J(await host.call("setMainPassword", "attacker", "{}"));
  ok(r.ok === false, "setMainPassword without session denied");
  const c = J(await host.call("clearLog", "attacker", ""));
  ok(c.ok === false, "clearLog without session denied");
  const u = J(await host.call("undoPublish", "attacker", ""));
  ok(u.ok === false, "undoPublish without session denied");
}

// 7. Honest status: local-only never claims a server commit (client contract).
{
  // The server never returns ok:true with a rev to a stranger — the client's
  // local:true path is the only one that may claim "this device", and it
  // carries no rev. Enforced here at the boundary: denied publishes carry no receipt.
  const denied = J(await host.call("publish", "stranger", JSON.stringify({ by: "x", sections: { a: JSON.stringify({}) }, changed: ["a"], opId: "op-honest-1" })));
  ok(denied.ok === false && typeof denied.rev !== "number", "denied publish carries no commit receipt (client must not claim global delivery)");
}

delete process.env.ADMIN_HASH_OVERRIDE;
await rm(dir, { recursive: true, force: true });

console.log(`\npublish:acceptance ${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("failures:\n- " + failures.join("\n- "));
process.exitCode = fail ? 1 : 0;
