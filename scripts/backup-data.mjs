import { mkdir, readdir, readFile, rm, rename, writeFile } from "node:fs/promises";
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
        if (f.includes("..") || f.includes("/") || f.includes("\\")) continue;
        const bytes = await readFile(path.join(rootDir, "data", "uploads", f));
        /* A sha per file (note: restore repair): a later restore can tell a
           truncated/corrupt survivor apart from the bytes that were backed up,
           not just present from absent. Old snapshots without shas still
           restore — they validate by magic bytes instead. */
        uploads.push({ name: f, bytes: bytes.length, sha: hash(bytes) });
      } catch { /* a directory, or vanished mid-listing */ }
    }
  } catch { /* no uploads yet */ }
  uploads.sort((a, b) => (a.name < b.name ? -1 : 1));
  return uploads;
}

/* Byte truth for restore repair (mirrors the upload doors and
   src/lib/cms.ts backupBytesMatchExtension): only magic bytes prove a file.
   Broken (truncated/zero-byte) and infected (HTML page planted as media)
   bytes fail here and are quarantined, never served. */
function restoreBytesLookLikeHtml(buf) {
  try {
    const head = buf.slice(0, 2048).toString("latin1").toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html") || head.includes("<head") || head.includes("<meta") || head.includes("<script") || head.includes("<link") || head.includes("wom-deploy") || head.includes("wom-notes") || head.includes("__wom")) return true;
    if (head.trimStart().startsWith("<")) return true;
    return false;
  } catch { return false; }
}
function restoreBytesMatchExtension(name, buf) {
  try {
    if (!buf || buf.length < 4) return false;
    const ext = String(name.split(".").pop() || "").toLowerCase();
    const b = buf;
    if (ext === "jpg" || ext === "jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (ext === "gif") return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
    if (ext === "webp") return b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    if (ext === "avif") {
      if (b.length < 12) return false;
      const box = String.fromCharCode(b[4], b[5], b[6], b[7]);
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
      return box === "ftyp" && (brand.indexOf("avif") !== -1 || brand.indexOf("heic") !== -1 || brand.indexOf("mif1") !== -1 || brand.indexOf("msf1") !== -1);
    }
    if (ext === "mp4" || ext === "mov" || ext === "m4v" || ext === "m4a") {
      if (b.length < 8) return false;
      return String.fromCharCode(b[4], b[5], b[6], b[7]) === "ftyp";
    }
    if (ext === "webm") return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    if (ext === "ogv" || ext === "ogg" || ext === "oga" || ext === "opus") return b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
    if (ext === "mp3") {
      if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true;
      return b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2 || (b[1] & 0xe0) === 0xe0);
    }
    if (ext === "wav") return b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45;
    if (ext === "flac") return b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43;
    if (ext === "aac") return b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9);
    if (ext === "mid" || ext === "midi") return b[0] === 0x4d && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64;
    if (ext === "svg" || ext === "svgz") return false;
    return true;
  } catch { return false; }
}
function restoreBytesOk(name, buf) {
  try {
    if (!buf || !buf.length) return false;
    if (restoreBytesLookLikeHtml(buf)) return false;
    if (!restoreBytesMatchExtension(name, buf)) return false;
    return true;
  } catch { return false; }
}

/* Validate every upload on disk after a restore: missing files are named so
   the browser heal loop refetches them, and broken/infected files (empty,
   HTML, magic-mismatched, or sha-diverged from the manifest) are moved aside
   into data/.trash/ — which unblocks the heal loop (a corrupt survivor used
   to read as "present" forever) and takes the bad bytes out of serving.
   Nothing is ever deleted: the trash keeps them for 72h like any removal. */
async function repairUploadsOnDisk(rootDir, meta) {
  const missingUploads = [];
  const quarantined = [];
  const dataDir = path.join(rootDir, "data", "uploads");
  const trashDir = path.join(rootDir, "data", ".trash");
  let disk = [];
  try {
    disk = await readdir(dataDir);
  } catch { disk = []; }
  const manifest = new Map();
  try {
    for (const u of (meta && meta.uploads) || []) {
      if (u && u.name) manifest.set(u.name, u);
    }
  } catch {}
  for (const f of disk) {
    try {
      if (!f || f.includes("..") || f.includes("/") || f.includes("\\")) continue;
      const full = path.join(dataDir, f);
      const bytes = await readFile(full).catch(() => null);
      if (!bytes) continue;
      const entry = manifest.get(f);
      const shaMismatch = !!(entry && entry.sha && hash(bytes) !== entry.sha);
      if (!shaMismatch && restoreBytesOk(f, bytes)) continue;
      await mkdir(trashDir, { recursive: true });
      const dest = path.join(trashDir, Date.now().toString() + "-" + f);
      try {
        await rename(full, dest);
      } catch {
        continue;
      }
      quarantined.push(f);
    } catch {}
  }
  try {
    for (const [name] of manifest) {
      const st = await readFile(path.join(dataDir, name)).catch(() => null);
      if (!st) missingUploads.push(name);
    }
  } catch {}
  missingUploads.sort();
  quarantined.sort();
  return { missingUploads, quarantined };
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
  /* Restore repair: the state is back — now take the broken/infected files
     out of serving (quarantine) and name what's still missing, so the browser
     heal loop refetches every one of them from cache, the live box or the
     mirrors on the next Publish. A restore that only replaced words used to
     leave corrupt survivors behind, reading as "present" forever. */
  const repair = await repairUploadsOnDisk(rootDir, meta);
  return { restored: pick, at: meta && meta.at, missingUploads: repair.missingUploads, quarantined: repair.quarantined };
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
     clean-deploy.txt sits beside package.json the live store is snapshotted
     (a timestamped backup like every snapshot, restorable with
     `npm run restore`) but LEFT IN PLACE — the server boots it with the
     words cleared and the administrator accounts kept (note 433: deploys
     never reset accounts). Nothing is ever deleted here. The first Publish
     consumes the flag (see auto-push.mjs) and normal guarding resumes on
     the next boot. */
  try {
    await readFile(path.join(rootDir, "clean-deploy.txt"), "utf8");
    try {
      const r = await backup(rootDir, "clean deploy snapshot", 0);
      if (r.saved) {
        console.log(`clean deploy: snapshotted the previous store in data-backups/${r.saved}/ — this deploy opens fresh (welcome-home slide only) until Recover + Publish. Accounts are kept. Nothing was deleted.`);
        return { ok: true, clean: true, parked: r.saved };
      }
      if (r.skipped) {
        console.log(`clean deploy: previous store already snapshotted (${r.skipped}) — this deploy opens fresh (welcome-home slide only) until Recover + Publish. Accounts are kept.`);
      }
    } catch (err) {
      console.warn("clean deploy: could not snapshot the previous store:", err?.message || err);
    }
    return { ok: true, clean: true, fresh: false };
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
  const quarantined = _r.quarantined || [];
  if (quarantined.length) {
    console.log(`repaired: ${quarantined.length} broken/infected upload(s) moved aside to data/.trash/ for the heal loop to refetch: ${quarantined.slice(0, 5).join(", ")}${quarantined.length > 5 ? ", …" : ""}`);
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
      if ((r.quarantined || []).length) console.log(`quarantined (moved to data/.trash/ for refetch): ${r.quarantined.join(", ")}`);
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
