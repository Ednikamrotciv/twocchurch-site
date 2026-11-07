/* storage-migrate.mjs — move permanent data between storage homes, safely.
   Copy, never move: the source is left untouched until the target is verified,
   and "rollback" is simply pointing STORAGE_MODE/BACKEND_DISK_PATH back at the
   source and restarting — nothing is ever deleted by this script.

   Usage (run on the machine that holds the data):
     node scripts/storage-migrate.mjs status
       Show the active config + inventory of local data/ and the configured
       disk path (if any). Changes nothing.
     node scripts/storage-migrate.mjs copy --to disk|external [--source DIR] [--target DIR]
       Copy state + version + uploads source -> target, write a checksum
       manifest on the target, re-verify it, and cross-check the state hash.
       Defaults: --to disk copies local data/ -> BACKEND_DISK_PATH;
       --to external copies BACKEND_DISK_PATH -> local data/.
       Refuses to overwrite a populated target with an empty source.
       Repeatable: identical files are skipped, re-runs change nothing.
     node scripts/storage-migrate.mjs verify [--dir DIR]
       Re-hash a location against its storage-manifest.json.

   AFTER a verified copy, switch modes by configuration only:
     1. Set STORAGE_MODE=backend_disk (or external) + BACKEND_DISK_PATH.
     2. Restart the backend.
     3. Confirm /api/health/ready says ok + the site shows the words.
   To roll back, restore the previous env values and restart. */

import path from "node:path";
import { inventoryLocation, migrateStorage, verifyManifest, resolveStorageConfig } from "./storage.mjs";

const rootDir = process.cwd();

function args() {
  const out = {};
  for (const a of process.argv.slice(3)) {
    const m = /^--([A-Za-z0-9_-]+)(=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[3] === undefined ? true : m[3];
  }
  return out;
}

function fmtInv(label, inv) {
  console.log(`${label}: ${inv.dir}`);
  if (inv.error && inv.error !== "no state file") console.log(`  error: ${inv.error}`);
  console.log(`  state: ${inv.stateBytes ? `${inv.stateBytes} bytes (sha ${inv.stateSha})` : "(none)"}${inv.version ? ` version ${inv.version}` : ""}`);
  console.log(`  uploads: ${inv.uploads.length} files, ${(inv.uploadBytes / 1048576).toFixed(1)} MB`);
}

async function cmdStatus() {
  const cfg = resolveStorageConfig(process.env);
  console.log(`active config: ${cfg.ok ? `STORAGE_MODE=${cfg.mode}${cfg.diskPath ? ` BACKEND_DISK_PATH=${cfg.diskPath} ` : " "}` : "INVALID — " + cfg.error}`);
  const local = await inventoryLocation(path.join(rootDir, "data"));
  fmtInv("local data/", local);
  if (cfg.diskPath) {
    const disk = await inventoryLocation(cfg.diskPath);
    fmtInv("configured disk", disk);
  } else {
    console.log("configured disk: (none — set BACKEND_DISK_PATH to use backend_disk/hybrid)");
  }
  console.log("note: status changes nothing. Copy with the copy command, switch with env + restart.");
}

async function cmdVerify() {
  const { dir } = args();
  const target = String(dir || path.join(rootDir, "data"));
  const v = await verifyManifest(target);
  if (v.ok) {
    console.log(`verify: ${target} intact (${v.checked} files match the manifest${v.at ? ` from ${v.at}` : ""})`);
  } else {
    console.error(`verify FAILED for ${target}: ${(v.mismatches || []).join(", ") || v.error || "unknown"}`);
    process.exitCode = 1;
  }
}

async function cmdCopy() {
  const a = args();
  const to = String(a.to || "").toLowerCase();
  if (to !== "disk" && to !== "external") {
    console.error("usage: node scripts/storage-migrate.mjs copy --to disk|external [--source DIR] [--target DIR]");
    process.exitCode = 1;
    return;
  }
  /* The target must be a KNOWN, explicitly configured home — never a guess.
     For --to disk the disk path must come from BACKEND_DISK_PATH/DATA_DIR;
     for --to external the target is local data/. Custom --source/--target
     override only when absolute (operator intent, still never tmp-like). */
  const cfg = resolveStorageConfig(process.env);
  let source = String(a.source || "");
  let target = String(a.target || "");
  if (to === "disk") {
    if (!source) source = path.join(rootDir, "data");
    if (!target) {
      if (!cfg.ok || !cfg.diskPath) {
        console.error("copy --to disk needs BACKEND_DISK_PATH set (or an explicit absolute --target). Refusing to guess the disk location.");
        process.exitCode = 1;
        return;
      }
      target = cfg.diskPath;
    }
  } else {
    if (!source) {
      if (!cfg.ok || !cfg.diskPath) {
        console.error("copy --to external needs the disk path (BACKEND_DISK_PATH, or an explicit absolute --source). Refusing to guess.");
        process.exitCode = 1;
        return;
      }
      source = cfg.diskPath;
    }
    if (!target) target = path.join(rootDir, "data");
  }
  for (const p of [source, target]) {
    if (!path.isAbsolute(p)) {
      console.error(`refusing: paths must be absolute, got ${JSON.stringify(p)}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`migrating storage: ${source}  ->  ${target}`);
  const src = await inventoryLocation(source);
  fmtInv("source (before, untouched)", src);
  const r = await migrateStorage({ sourceDir: source, targetDir: target });
  if (!r.ok) {
    console.error("migration REFUSED/FAILED: " + r.error);
    console.error("Nothing was changed. Fix the cause and run again (re-runs are safe).");
    process.exitCode = 1;
    return;
  }
  console.log(`copied ${r.copied} file(s), skipped ${r.skipped} identical, state ${r.stateBytes} bytes (sha ${r.stateSha}), ${r.uploads} uploads — target verified.`);
  console.log(r.note);
  if (to === "disk") {
    console.log("Next: set STORAGE_MODE=backend_disk + BACKEND_DISK_PATH=" + target + ", restart, confirm /api/health/ready is ok.");
  } else {
    console.log("Next: set STORAGE_MODE=external, restart, confirm /api/health/ready is ok.");
  }
}

const cmd = process.argv[2];
if (cmd === "status") await cmdStatus();
else if (cmd === "verify") await cmdVerify();
else if (cmd === "copy") await cmdCopy();
else {
  console.error("usage: node scripts/storage-migrate.mjs status | verify [--dir DIR] | copy --to disk|external [--source DIR] [--target DIR]");
  process.exitCode = 1;
}
