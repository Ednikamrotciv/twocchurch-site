/* storage.mjs — the site's storage abstraction (no CMS rewrite to change disks).
   One module answers three questions: WHERE does permanent data live, is that
   place actually usable, and how do bytes move between places safely.

   MODES (explicit only — never guessed from a directory existing):
     STORAGE_MODE=external      Local data/ beside the code is the operating
                                 copy; durability rides the existing external
                                 net (git auto-push of data/ + seed.json, the
                                 baked seed fallback, feed/live mirrors,
                                 upload backfill). Default. Render free.
     STORAGE_MODE=backend_disk  Permanent data lives on the mounted persistent
                                 disk named by BACKEND_DISK_PATH (e.g. the
                                 Render disk mount, default /var/data — set it
                                 explicitly, never rely on the default).
     STORAGE_MODE=hybrid        Disk is authoritative AND the external net stays
                                 on (git/seed/mirror whenever a repo/mirror is
                                 configured). Best-effort mirror, disk decides.

   BACKEND_DISK_PATH (or legacy alias DATA_DIR): the directory that PLAYS THE
   ROLE of data/ — it holds cms-state.bin, cms-version.txt, uploads/, and (by
   default) backups/. It must already exist, be a directory, and be writable:
   it is PROBED, never created (creating it would mask a missing mount).

   Failure rule: a misconfigured disk never falls back to temporary storage.
   The server boots degraded (reads may still serve the baked seed; every
   write is refused with a clear error) and /api/health/ready reports it.

   Backup / migration / mirror helpers live here too, behind an injectable
   `fs` + `fsp` so the pure parts stay unit-testable without Node. */

export const STORAGE_MODES = ["external", "backend_disk", "hybrid"];
export const DEFAULT_DISK_PATH = "/var/data";
export const STATE_FILE = "cms-state.bin";
export const VERSION_FILE = "cms-version.txt";
export const UPLOADS_DIR = "uploads";
export const MANIFEST_FILE = "storage-manifest.json";

function str(v) {
  return typeof v === "string" ? v : "";
}

/** sha256 hex without Node: node:crypto when present, SubtleCrypto otherwise
    (browsers, workers). Never throws — "unavailable" on total failure. */
export async function sha256hex(data) {
  try {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    try {
      const { createHash } = await import("node:crypto");
      return createHash("sha256").update(bytes).digest("hex");
    } catch { /* not Node — fall through to SubtleCrypto */ }
    const subtle = (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) || null;
    if (!subtle) return "unavailable";
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const digest = await subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unavailable";
  }
}

/* ------------------------------------------------------------------ config */

/** Pure: environment values in, validated config out. Never touches the fs,
    never throws. `env` defaults to process.env when available. */
export function resolveStorageConfig(env) {
  const e = env && typeof env === "object" ? env : {};
  const issues = [];
  let mode = str(e.STORAGE_MODE).trim().toLowerCase();
  if (!mode) mode = "external";
  if (!STORAGE_MODES.includes(mode)) {
    return {
      ok: false,
      mode,
      error: `STORAGE_MODE=${JSON.stringify(str(e.STORAGE_MODE))} is unknown — use one of: ${STORAGE_MODES.join(", ")}.`,
      issues,
    };
  }
  const needsDisk = mode === "backend_disk" || mode === "hybrid";
  let diskPath = str(e.BACKEND_DISK_PATH).trim() || str(e.DATA_DIR).trim();
  if (needsDisk && !diskPath) {
    return {
      ok: false,
      mode,
      error: `STORAGE_MODE=${mode} needs BACKEND_DISK_PATH (e.g. the Render disk mount, usually /var/data) — refusing to guess.`,
      issues,
    };
  }
  if (diskPath && !isAbsolutePath(diskPath)) {
    return {
      ok: false,
      mode,
      error: `BACKEND_DISK_PATH must be an absolute path, got ${JSON.stringify(diskPath)}.`,
      issues,
    };
  }
  let backupDir = str(e.BACKUP_DIR).trim();
  if (backupDir && !isAbsolutePath(backupDir)) {
    return {
      ok: false,
      mode,
      error: `BACKUP_DIR must be an absolute path, got ${JSON.stringify(backupDir)}.`,
      issues,
    };
  }
  const mirrorUrl = str(e.EXTERNAL_MIRROR_URL).trim();
  if (mirrorUrl && !/^https?:\/\/[^/\s]+(\/\S*)?$/i.test(mirrorUrl)) {
    issues.push(`EXTERNAL_MIRROR_URL ignored (not an http(s) URL): ${mirrorUrl.slice(0, 80)}`);
  }
  return {
    ok: true,
    mode,
    diskPath: diskPath || "",
    backupDir: backupDir || "",
    mirrorUrl: /^https?:\/\/[^/\s]+(\/\S*)?$/i.test(mirrorUrl) ? mirrorUrl : "",
    mirrorToken: str(e.EXTERNAL_MIRROR_TOKEN).trim(),
    issues,
  };
}

export function isAbsolutePath(p) {
  const s = String(p || "");
  return s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s);
}

function joinPath(sep, ...parts) {
  return parts
    .filter((p) => p !== "")
    .join(sep)
    .replace(/\\/g, "/");
}

/* --------------------------------------------------------------- init (fs) */

/** Probe + open the active storage. `fsp` is node:fs/promises (injectable for
    tests). Never creates a configured disk path; never falls back to tmp. */
export async function initStorage({ rootDir, env, fsp, pathMod } = {}) {
  const cfg = resolveStorageConfig(env);
  const report = [...(cfg.issues || [])];
  if (!cfg.ok) return { ok: false, ...cfg, report, degraded: true };
  const path = pathMod || (await import("node:path")).default || (await import("node:path"));
  const fs = fsp || (await import("node:fs/promises"));
  const root = String(rootDir || process.cwd());
  const sep = path.sep || "/";

  let dataDir = "";
  if (cfg.mode === "external") {
    dataDir = path.join(root, "data");
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
      return { ok: false, ...cfg, error: `cannot use local data/ (${dataDir}): ${err?.message || err}`, report, degraded: true };
    }
  } else {
    /* backend_disk / hybrid: the mount must ALREADY exist and take writes.
       Probe file proves it; a missing mount fails here, loudly, with writes
       refused afterwards — never a quiet local stand-in. */
    dataDir = cfg.diskPath;
    try {
      const st = await fs.stat(dataDir);
      if (!st.isDirectory()) throw new Error("not a directory");
    } catch (err) {
      return {
        ok: false, ...cfg,
        error: `persistent disk unavailable at ${dataDir}: ${err?.message || err}. Mount the disk and set BACKEND_DISK_PATH to the mount, then restart. Permanent data is NOT being written anywhere.`,
        report, degraded: true,
      };
    }
    try {
      const probe = path.join(dataDir, ".wom-write-test");
      await fs.writeFile(probe, `wom ${new Date().toISOString()}`);
      await fs.unlink(probe);
    } catch (err) {
      return {
        ok: false, ...cfg,
        error: `persistent disk at ${dataDir} is not writable: ${err?.message || err}. Fix permissions/mount, then restart. Permanent data is NOT being written anywhere.`,
        report, degraded: true,
      };
    }
    report.push(`persistent disk active at ${dataDir} (mode ${cfg.mode})`);
  }

  let backupsDir = cfg.backupDir;
  if (!backupsDir) {
    backupsDir = cfg.mode === "external" ? path.join(root, "data-backups") : path.join(dataDir, "backups");
  }
  try {
    await fs.mkdir(backupsDir, { recursive: true });
  } catch (err) {
    return { ok: false, ...cfg, error: `cannot use backups dir (${backupsDir}): ${err?.message || err}`, report, degraded: true };
  }

  const uploadsDir = path.join(dataDir, UPLOADS_DIR);
  if (cfg.mode === "external") {
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
    } catch { /* uploads door creates it per write; boot must not fail on it */ }
  }

  return {
    ok: true,
    ...cfg,
    report,
    degraded: false,
    rootDir: root,
    dataDir,
    uploadsDir,
    backupsDir,
    statePath: path.join(dataDir, STATE_FILE),
    versionPath: path.join(dataDir, VERSION_FILE),
    manifestPath: path.join(dataDir, MANIFEST_FILE),
  };
}

/* ------------------------------------------------------------- inventory  */

/** What permanent data sits at a directory: state bytes + hash, uploads,
    version marker. Pure fs reads; never throws. */
export async function inventoryLocation(dir, fsp) {
  const fs = fsp || (await import("node:fs/promises"));
  const inv = { dir: String(dir || ""), stateBytes: 0, stateSha: "", version: "", uploads: [], uploadBytes: 0, error: "" };
  try {
    const state = await fs.readFile(joinNode(dir, STATE_FILE, fs));
    inv.stateBytes = state.length;
    inv.stateSha = (await sha256hex(state)).slice(0, 16);
  } catch (err) {
    if (err && (err.code === "ENOENT" || /no such file/i.test(String(err.message)))) inv.error = "no state file";
    else inv.error = String(err?.message || err);
  }
  try {
    const { default: path } = await import("node:path").catch(() => ({ default: null }));
    const up = path ? path.join(String(dir || ""), UPLOADS_DIR) : String(dir || "") + "/" + UPLOADS_DIR;
    const files = await fs.readdir(up);
    for (const f of files.sort()) {
      try {
        const st = await fs.stat(up + "/" + f);
        if (st.isFile()) {
          inv.uploads.push({ name: f, bytes: st.size });
          inv.uploadBytes += st.size;
        }
      } catch { /* vanished mid-listing */ }
    }
  } catch { /* no uploads yet */ }
  try {
    const v = await fs.readFile(joinNode(dir, VERSION_FILE, fs), "utf8");
    inv.version = String(v || "").trim().slice(0, 64);
  } catch { /* first runs have none */ }
  return inv;
}

function joinNode(dir, file, _fs) {
  return String(dir || "").replace(/\/+$/, "") + "/" + file;
}

/* ------------------------------------------------------ manifest + verify */

/** Write a checksum manifest for a location (migration/verify evidence). */
export async function writeManifest(dir, extra, fsp) {
  const fs = fsp || (await import("node:fs/promises"));
  const inv = await inventoryLocation(dir, fs);
  const files = {};
  const hashFile = async (rel) => {
    try {
      const buf = await fs.readFile(joinNode(dir, rel, fs));
      files[rel] = { bytes: buf.length, sha256: await sha256hex(buf) };
      return true;
    } catch {
      return false;
    }
  };
  await hashFile(STATE_FILE);
  await hashFile(VERSION_FILE);
  for (const u of inv.uploads) await hashFile(`${UPLOADS_DIR}/${u.name}`);
  const manifest = {
    at: new Date().toISOString(),
    dir: String(dir || ""),
    stateSha: inv.stateSha,
    stateBytes: inv.stateBytes,
    uploads: inv.uploads.length,
    uploadBytes: inv.uploadBytes,
    files,
    ...(extra && typeof extra === "object" ? extra : {}),
  };
  await fs.writeFile(joinNode(dir, MANIFEST_FILE, fs), JSON.stringify(manifest, null, 1));
  return manifest;
}

/** Re-hash a location and compare with its manifest. Never throws. */
export async function verifyManifest(dir, fsp) {
  try {
    const fs = fsp || (await import("node:fs/promises"));
    const raw = await fs.readFile(joinNode(dir, MANIFEST_FILE, fs), "utf8");
    const manifest = JSON.parse(raw);
    const mismatches = [];
    let checked = 0;
    for (const [rel, meta] of Object.entries(manifest.files || {})) {
      checked++;
      try {
        const buf = await fs.readFile(joinNode(dir, rel, fs));
        const sha = await sha256hex(buf);
        if (sha !== meta.sha256 || buf.length !== meta.bytes) mismatches.push(rel);
      } catch {
        mismatches.push(rel + " (missing)");
      }
    }
    return { ok: mismatches.length === 0, checked, mismatches, at: manifest.at || "" };
  } catch (err) {
    return { ok: false, checked: 0, mismatches: [], error: String(err?.message || err) };
  }
}

/* ------------------------------------------------------------- migration  */

/** Copy permanent data source -> target (bytes + uploads + version), then
    write + verify the target manifest. NEVER deletes the source. Refuses to
    let an empty/missing source clobber a populated target. Idempotent:
    identical files are skipped, so re-runs change nothing. */
export async function migrateStorage({ sourceDir, targetDir, fsp, onLog } = {}) {
  const fs = fsp || (await import("node:fs/promises"));
  const log = (...a) => {
    try {
      (onLog || console.log)(...a);
    } catch {}
  };
  const src = await inventoryLocation(sourceDir, fs);
  const dst = await inventoryLocation(targetDir, fs);
  const srcEmpty = !src.stateBytes && !src.uploads.length;
  const dstFull = !!dst.stateBytes || !!dst.uploads.length;
  if (srcEmpty && dstFull) {
    return {
      ok: false,
      error: `refusing: source ${sourceDir} is empty but target ${targetDir} already holds data (state ${dst.stateBytes} bytes, ${dst.uploads.length} uploads). A populated location is never overwritten with an empty one. To move the other way, swap source and target.`,
    };
  }
  if (srcEmpty) {
    return { ok: false, error: `refusing: source ${sourceDir} holds nothing to migrate (no state, no uploads).` };
  }
  const { default: path } = await import("node:path").catch(() => ({ default: null }));
  const join = (a, b) => (path ? path.join(a, b) : a + "/" + b);
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(join(targetDir, UPLOADS_DIR), { recursive: true });
  } catch (err) {
    return { ok: false, error: `cannot prepare target ${targetDir}: ${err?.message || err}` };
  }
  const copied = [];
  const skipped = [];
  const copyIfDifferent = async (rel) => {
    const from = join(String(sourceDir), rel);
    const to = join(String(targetDir), rel);
    let sbuf = null;
    try {
      sbuf = await fs.readFile(from);
    } catch {
      return;
    }
    if (!sbuf || !sbuf.length) return;
    let same = false;
    try {
      const tbuf = await fs.readFile(to);
      same = tbuf.length === sbuf.length && bytesEqual(tbuf, sbuf);
    } catch { /* target missing — copy below */ }
    if (same) {
      skipped.push(rel);
      return;
    }
    await fs.writeFile(to, sbuf);
    copied.push(rel);
  };
  await copyIfDifferent(STATE_FILE);
  await copyIfDifferent(VERSION_FILE);
  for (const u of src.uploads) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(u.name)) {
      log(`migration: skipping odd upload name ${u.name}`);
      continue;
    }
    await copyIfDifferent(`${UPLOADS_DIR}/${u.name}`);
  }
  const manifest = await writeManifest(targetDir, { migratedFrom: String(sourceDir), copied: copied.length, skipped: skipped.length }, fs);
  const verify = await verifyManifest(targetDir, fs);
  if (!verify.ok) {
    return { ok: false, error: `target verification failed after copy: ${(verify.mismatches || []).join(", ")}`, copied: copied.length, skipped: skipped.length };
  }
  /* Post-copy cross-check: the target's state hash must equal the source's. */
  const dstAfter = await inventoryLocation(targetDir, fs);
  if (src.stateSha && dstAfter.stateSha !== src.stateSha) {
    return { ok: false, error: `state hash mismatch after copy (source ${src.stateSha}, target ${dstAfter.stateSha})` };
  }
  return {
    ok: true,
    copied: copied.length,
    skipped: skipped.length,
    stateBytes: dstAfter.stateBytes,
    stateSha: dstAfter.stateSha,
    uploads: dstAfter.uploads.length,
    manifestAt: manifest.at,
    note: `source left untouched at ${sourceDir}. Roll back by pointing STORAGE_MODE/BACKEND_DISK_PATH at the source again and restarting — nothing was deleted anywhere.`,
  };
}

function bytesEqual(a, b) {
  try {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ web mirror  */

/** Best-effort off-site copy of the latest state snapshot to a configured
    HTTPS endpoint (disk mode's second copy). Never throws, never blocks. */
export async function mirrorBackup({ mirrorUrl, mirrorToken, stateBytes, meta }) {
  try {
    const url = String(mirrorUrl || "").trim();
    if (!url || !stateBytes || !stateBytes.length) return { mirrored: false };
    let metaB64 = "";
    try {
      const json = JSON.stringify(meta || {});
      if (typeof Buffer !== "undefined") metaB64 = Buffer.from(json).toString("base64");
      else metaB64 = btoa(unescape(encodeURIComponent(json)));
    } catch { metaB64 = ""; }
    const body = stateBytes instanceof Uint8Array ? stateBytes : new Uint8Array(stateBytes || []);
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : 0;
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          ...(mirrorToken ? { authorization: "Bearer " + mirrorToken } : {}),
          ...(metaB64 ? { "x-wom-meta": metaB64 } : {}),
        },
        body,
        signal: ctrl ? ctrl.signal : undefined,
      });
      return { mirrored: !!res.ok, status: res.status };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    return { mirrored: false, error: String(err?.message || err).slice(0, 160) };
  }
}
