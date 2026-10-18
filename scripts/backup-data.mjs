import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

/* The office's published words live in one file (data/cms-state.bin). A fresh
   zip extracted over the folder replaces it with an older snapshot — and the
   newer words are gone unless a copy exists under a name the zip does not
   contain. That is what this does: timestamped snapshots in data-backups/
   (kept out of git and out of the zip), taken automatically every time the
   office server boots, plus a restore that puts one back.
   Uploaded photos/videos are NOT copied (they can be huge) — each snapshot
   records their names and sizes instead, so a restore can say what is missing.

   Clobber detection (the actual zip-overwrite scenario): every store this
   folder's own server ever wrote is fingerprinted into data/.last-seen, and
   every snapshot records its fingerprint too. Bytes on disk that this folder
   never produced came from outside (a zip extract, a hand copy) — the boot
   guard stashes them aside and brings the newest snapshot back, loudly, with
   instructions. Nothing is ever deleted to do it: the stash keeps the foreign
   bytes, and `adopt` blesses them if they were placed on purpose. */

const KEEP = 10;
const SEEN_FILE = ".last-seen";
const NAME_RE = /^(suspect-)?\d{8}-\d{6}$/;

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function hash(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

let seenCache = "";
export async function recordSeen(rootDir, sha) {
  if (!sha || sha === seenCache) return;
  seenCache = sha;
  try {
    await writeFile(path.join(rootDir, "data", SEEN_FILE), JSON.stringify({ sha, at: new Date().toISOString() }));
  } catch { /* a store that saves is safe even when the fingerprint is not */ }
}

async function lastSeen(rootDir) {
  if (seenCache) return seenCache;
  try {
    const rec = JSON.parse(await readFile(path.join(rootDir, "data", SEEN_FILE), "utf8"));
    if (rec && rec.sha) seenCache = rec.sha;
  } catch { /* never fingerprinted */ }
  return seenCache;
}

async function listBackups(rootDir) {
  const dir = path.join(rootDir, "data-backups");
  let names;
  try {
    names = (await readdir(dir)).filter((n) => NAME_RE.test(n)).sort();
  } catch {
    return { dir, names: [] };
  }
  return { dir, names };
}

async function readMeta(dir, name) {
  try {
    return JSON.parse(await readFile(path.join(dir, name, "meta.json"), "utf8"));
  } catch {
    return null;
  }
}

async function backupShas(dir, names) {
  const out = [];
  for (const n of names) {
    const m = await readMeta(dir, n);
    if (m && m.sha) out.push(m.sha);
  }
  return out;
}

async function uploadsManifest(rootDir) {
  let uploads = [];
  try {
    const files = await readdir(path.join(rootDir, "data", "uploads"));
    for (const f of files) {
      try {
        const bytes = (await readFile(path.join(rootDir, "data", "uploads", f))).length;
        uploads.push({ name: f, bytes });
      } catch { /* a directory, or vanished mid-listing */ }
    }
  } catch { /* no uploads yet */ }
  uploads.sort((a, b) => (a.name < b.name ? -1 : 1));
  return uploads;
}

/* Snapshot the current store. Skips when the bytes match the newest snapshot,
   and (unless minHours is 0) when the newest snapshot is younger than that —
   so publish bursts cost one snapshot, not ten. */
export async function backup(rootDir, why, minHours) {
  const dataDir = path.join(rootDir, "data");
  let state;
  try {
    state = await readFile(path.join(dataDir, "cms-state.bin"));
  } catch {
    return { skipped: "no state yet" };
  }
  if (!state.length) return { skipped: "state is empty" };
  const { dir, names } = await listBackups(rootDir);
  const sum = hash(state);
  const newestMeta = names.length ? await readMeta(dir, names[names.length - 1]) : null;
  if (newestMeta && newestMeta.sha === sum) return { skipped: "unchanged" };
  const waitMs = (minHours == null ? 6 : minHours) * 3600 * 1000;
  if (waitMs > 0 && newestMeta && newestMeta.at && Date.now() - Date.parse(newestMeta.at) < waitMs) {
    return { skipped: "recent snapshot exists" };
  }
  await mkdir(dir, { recursive: true });
  const name = stamp(new Date());
  const dest = path.join(dir, name);
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, "cms-state.bin"), state);
  try {
    const ver = await readFile(path.join(dataDir, "cms-version.txt"));
    await writeFile(path.join(dest, "cms-version.txt"), ver);
  } catch { /* first runs have no version file */ }
  await writeFile(
    path.join(dest, "meta.json"),
    JSON.stringify(
      { at: new Date().toISOString(), why: why || "manual", sha: sum, bytes: state.length, uploads: await uploadsManifest(rootDir) },
      null,
      1
    )
  );
  const regular = names.filter((n) => !n.startsWith("suspect-"));
  for (const old of regular.slice(0, Math.max(0, regular.length + 1 - KEEP))) {
    try {
      await rm(path.join(dir, old), { recursive: true, force: true });
    } catch { /* a snapshot that will not delete is kept, not fatal */ }
  }
  await recordSeen(rootDir, sum);
  return { saved: name, bytes: state.length };
}

/* Put a snapshot back. No name = the newest. Refuses to overwrite a differing
   live store unless forced (a differing store means real publishing happened). */
export async function restore(rootDir, name, force) {
  const { dir, names } = await listBackups(rootDir);
  if (!names.length) return { error: "no backups found in data-backups/" };
  const pick = name || names[names.length - 1];
  if (!NAME_RE.test(pick) || !names.includes(pick)) {
    return { error: `no backup named ${pick} (have: ${names.join(", ")})` };
  }
  const meta = await readMeta(dir, pick);
  const dataDir = path.join(rootDir, "data");
  await mkdir(dataDir, { recursive: true });
  let live = null;
  try {
    live = await readFile(path.join(dataDir, "cms-state.bin"));
  } catch { /* nothing live — always safe to restore */ }
  if (live && live.length && !force) {
    const snap = await readFile(path.join(dir, pick, "cms-state.bin")).catch(() => null);
    if (snap && hash(snap) === hash(live)) return { kept: pick, note: "live store already matches this backup" };
    return { error: "live store exists and differs — publish history kept. Add the word force to overwrite it." };
  }
  const snap = await readFile(path.join(dir, pick, "cms-state.bin")).catch(() => null);
  if (!snap) return { error: `backup ${pick} has no state file` };
  await writeFile(path.join(dataDir, "cms-state.bin"), snap);
  try {
    const ver = await readFile(path.join(dir, pick, "cms-version.txt"));
    await writeFile(path.join(dataDir, "cms-version.txt"), ver);
  } catch { /* snapshot predates versioning */ }
  await recordSeen(rootDir, hash(snap));
  let missingUploads = [];
  if (meta && meta.uploads) {
    for (const u of meta.uploads) {
      const st = await readFile(path.join(dataDir, "uploads", u.name)).catch(() => null);
      if (!st) missingUploads.push(u.name);
    }
  }
  return { restored: pick, at: meta && meta.at, missingUploads };
}

/* Bless the live bytes as this folder's own (after deliberately placing a
   store by hand, e.g. adopting a state file from a zip). Stops the boot guard
   from "recovering" it away. */
export async function adoptLive(rootDir) {
  let live;
  try {
    live = await readFile(path.join(rootDir, "data", "cms-state.bin"));
  } catch {
    return { error: "no live store to adopt" };
  }
  if (!live.length) return { error: "live store is empty — nothing to adopt" };
  await recordSeen(rootDir, hash(live));
  return { adopted: hash(live) };
}

/* Boot guard for the office server: snapshot what is there (a zip extract
   cannot touch the timestamped names), and if the live bytes are foreign —
   missing, or never produced by this folder — bring the newest snapshot back
   before anything else loads. */
export async function guardAtBoot(rootDir) {
  /* Clean-deploy mode (office request: every new deploy opens fresh —
     welcome-home slide only — until Recover + Publish): while
     clean-deploy.txt sits beside package.json the live store is parked aside
     (never deleted — stashed under a timestamped name like every snapshot,
     restorable with `npm run restore`) and the boot starts empty. No backup
     is restored here: restoring would resurrect the last publish onto the
     clean deploy within seconds of boot, which is exactly how old slides
     kept reappearing on new deploys. The first Publish consumes the flag
     (see auto-push.mjs) and normal guarding resumes on the next boot. */
  try {
    await readFile(path.join(rootDir, "clean-deploy.txt"), "utf8");
    let live = null;
    try {
      live = await readFile(path.join(rootDir, "data", "cms-state.bin"));
    } catch { /* gone — already clean */ }
    if (live && live.length) {
      let nonZero = false;
      for (let i = 0; i < Math.min(live.length, 64); i++) {
        if (live[i] !== 0) {
          nonZero = true;
          break;
        }
      }
      if (nonZero) {
        const name = stamp(new Date());
        try {
          await mkdir(path.join(rootDir, "data-backups", name), { recursive: true });
          await writeFile(path.join(rootDir, "data-backups", name, "cms-state.bin"), live);
          try {
            const ver = await readFile(path.join(rootDir, "data", "cms-version.txt"));
            await writeFile(path.join(rootDir, "data-backups", name, "cms-version.txt"), ver);
          } catch { /* first runs have no version file */ }
          await writeFile(
            path.join(rootDir, "data-backups", name, "meta.json"),
            JSON.stringify({ at: new Date().toISOString(), why: "parked for clean deploy (clean-deploy.txt) — restore it after Recover if those words are ever needed", sha: hash(live), bytes: live.length }, null, 1)
          );
          console.log(`clean deploy: parked the previous store in data-backups/${name}/ — this deploy opens fresh (welcome-home slide only) until Recover + Publish. Nothing was deleted.`);
        } catch (err) {
          console.warn("clean deploy: could not park the previous store:", err?.message || err);
          return { ok: true, clean: true };
        }
        try {
          await rm(path.join(rootDir, "data", "cms-state.bin"), { force: true });
        } catch { /* the backend starts clean regardless (see cms-local.mjs) */ }
        return { ok: true, clean: true, parked: name };
      }
    }
    return { ok: true, clean: true, fresh: true };
  } catch { /* no flag — guard as usual below */ }
  const dataDir = path.join(rootDir, "data");
  let live = null;
  try {
    live = await readFile(path.join(dataDir, "cms-state.bin"));
  } catch { /* gone */ }
  if (!live || !live.length) {
    const { names } = await listBackups(rootDir);
    if (!names.length) return { ok: true, fresh: true };
    const r = await restore(rootDir, names[names.length - 1], true);
    if (r.restored) {
      console.log(`content recovered: live store was missing — restored data-backups/${r.restored}/ from ${r.at || "unknown time"}`);
      reportMissingUploads(rootDir, r);
    }
    return { ok: true, recovered: r.restored };
  }
  const sum = hash(live);
  const seen = await lastSeen(rootDir);
  const { dir, names } = await listBackups(rootDir);
  const known = seen ? [seen, ...(await backupShas(dir, names))] : await backupShas(dir, names);
  if (names.length && !known.includes(sum)) {
    const sname = "suspect-" + stamp(new Date());
    try {
      const dest = path.join(dir, sname);
      await mkdir(dest, { recursive: true });
      await writeFile(path.join(dest, "cms-state.bin"), live);
      await writeFile(
        path.join(dest, "meta.json"),
        JSON.stringify({ at: new Date().toISOString(), why: "stashed foreign bytes at boot", sha: sum, bytes: live.length }, null, 1)
      );
    } catch { /* stashing failed — restore still proceeds below */ }
    const r = await restore(rootDir, names[names.length - 1], true);
    console.log("================================================================");
    console.log("CONTENT GUARD: the store on disk was NOT this folder's own work —");
    console.log("most likely a fresh zip was extracted over it. The newest snapshot");
    console.log(`was put back (${r.restored || "restore failed"}). The foreign bytes were kept`);
    console.log(`as data-backups/${sname}/ — nothing was deleted.`);
    console.log("If the replaced words were placed ON PURPOSE, run: npm run adopt");
    console.log("To choose a different snapshot instead, run: npm run restore");
    console.log("================================================================");
    if (r.restored) reportMissingUploads(rootDir, r);
    return { ok: true, recovered: r.restored, stashed: sname };
  }
  const r = await backup(rootDir, "server boot");
  if (r.saved) console.log(`content backup saved: data-backups/${r.saved}/ (${r.bytes} bytes)`);
  await recordSeen(rootDir, sum);
  return { ok: true };
}

function reportMissingUploads(_rootDir, _r) {
  const missing = _r.missingUploads || [];
  if (missing.length) {
    console.log(`note: ${missing.length} uploaded file(s) from that day are not on disk: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`);
  }
}

export async function list(rootDir) {
  return (await listBackups(rootDir)).names;
}

const CLI = typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("backup-data.mjs");
if (CLI) {
  const [cmd, arg, extra] = process.argv.slice(2);
  const root = process.cwd();
  if (cmd === "backup") {
    const r = await backup(root, "manual", 0);
    console.log(r.saved ? `saved data-backups/${r.saved}/` : `skipped (${r.skipped})`);
  } else if (cmd === "restore") {
    const r = await restore(root, arg === "force" ? undefined : arg, arg === "force" || extra === "force");
    if (r.error) {
      console.error("restore: " + r.error);
      process.exitCode = 1;
    } else if (r.kept) {
      console.log(`kept: ${r.kept} — ${r.note}`);
    } else {
      console.log(`restored data-backups/${r.restored}/ from ${r.at || "unknown time"}`);
      reportMissingUploads(root, r);
      if ((r.missingUploads || []).length) console.log(`missing uploads: ${r.missingUploads.join(", ")}`);
    }
  } else if (cmd === "adopt") {
    const r = await adoptLive(root);
    if (r.error) {
      console.error("adopt: " + r.error);
      process.exitCode = 1;
    } else {
      console.log("adopted the live store — the boot guard will leave it alone from here on");
    }
  } else if (cmd === "list" || !cmd) {
    const names = await list(root);
    console.log(names.length ? names.join("\n") : "no backups yet — one is taken on every server start");
  } else {
    console.error("usage: npm run backup | npm run restore [name|force] | npm run adopt | node scripts/backup-data.mjs list");
    process.exitCode = 1;
  }
}
