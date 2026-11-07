/* storage-test.mjs — prove the storage layer on a real machine (Node required).
   Run: npm run storage:test   (or: node scripts/storage-test.mjs)
   Uses only temp dirs under the OS temp folder — never touches data/, the
   disk path, or any live store. Exits non-zero on the first failure.

   Covers: config resolution incl. every refusal rule; external init in a
   temp root; disk-mode refusal when the mount is missing; no auto-creation
   of a configured disk path; migrate copy + idempotency + manifest verify +
   tamper detection + empty-source-vs-populated-target refusal; backup +
   verify round-trip through backup-data.mjs. */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initStorage, resolveStorageConfig, migrateStorage, inventoryLocation, verifyManifest, writeManifest, isAbsolutePath } from "./storage.mjs";

let failures = 0;
function t(name, cond, extra) {
  if (cond) console.log("PASS " + name);
  else {
    failures++;
    console.error("FAIL " + name + (extra ? " — " + extra : ""));
  }
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wom-storage-test-"));
try {
  /* ---------------- config ---------------- */
  let c = resolveStorageConfig({});
  t("default external", c.ok && c.mode === "external");
  c = resolveStorageConfig({ STORAGE_MODE: "nope" });
  t("unknown mode rejected", !c.ok);
  c = resolveStorageConfig({ STORAGE_MODE: "backend_disk" });
  t("disk without path rejected", !c.ok && /BACKEND_DISK_PATH/.test(c.error));
  c = resolveStorageConfig({ STORAGE_MODE: "backend_disk", BACKEND_DISK_PATH: "rel/path" });
  t("relative disk path rejected", !c.ok);
  c = resolveStorageConfig({ STORAGE_MODE: "backend_disk", BACKEND_DISK_PATH: "/var/data" });
  t("absolute disk path accepted", c.ok && c.diskPath === "/var/data");
  c = resolveStorageConfig({ DATA_DIR: "/mnt/x" });
  t("DATA_DIR alone never switches mode", c.ok && c.mode === "external");
  c = resolveStorageConfig({ STORAGE_MODE: "hybrid", DATA_DIR: "/mnt/x" });
  t("DATA_DIR alias under explicit mode", c.ok && c.diskPath === "/mnt/x");
  t("isAbsolutePath", isAbsolutePath("/a") && isAbsolutePath("C:\\b") && !isAbsolutePath("rel"));

  /* ---------------- external init ---------------- */
  const root = path.join(tmp, "root");
  await fs.mkdir(root, { recursive: true });
  const st = await initStorage({ rootDir: root, env: {} });
  t("external init ok", st.ok && st.mode === "external");
  t("external data dir", st.dataDir === path.join(root, "data"));
  t("external uploads/backups", st.uploadsDir.endsWith("uploads") && st.backupsDir.endsWith("data-backups"));
  t("state/version paths", st.statePath.endsWith("cms-state.bin") && st.versionPath.endsWith("cms-version.txt"));

  /* ---------------- disk refusals ---------------- */
  const missing = path.join(tmp, "no-such-mount");
  const bad = await initStorage({ rootDir: root, env: { STORAGE_MODE: "backend_disk", BACKEND_DISK_PATH: missing } });
  t("missing mount fails safe", !bad.ok && /unavailable|Mount the disk/i.test(bad.error));
  let created = false;
  try {
    await fs.stat(missing);
    created = true;
  } catch { /* good — not created */ }
  t("missing mount NOT auto-created", !created);
  const notDir = path.join(tmp, "file-not-dir");
  await fs.writeFile(notDir, "x");
  const nd = await initStorage({ rootDir: root, env: { STORAGE_MODE: "backend_disk", BACKEND_DISK_PATH: notDir } });
  t("non-directory disk path rejected", !nd.ok);
  const disk = path.join(tmp, "disk");
  await fs.mkdir(disk, { recursive: true });
  const good = await initStorage({ rootDir: root, env: { STORAGE_MODE: "backend_disk", BACKEND_DISK_PATH: disk } });
  t("present writable disk accepted", good.ok && good.dataDir === disk);

  /* ---------------- migrate round-trip ---------------- */
  const src = path.join(tmp, "src-home");
  await fs.mkdir(path.join(src, "uploads"), { recursive: true });
  const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  await fs.writeFile(path.join(src, "cms-state.bin"), bytes);
  await fs.writeFile(path.join(src, "cms-version.txt"), "abc123\n");
  await fs.writeFile(path.join(src, "uploads", "a.jpg"), Buffer.from([9, 9]));
  const dst = path.join(tmp, "dst-home");
  let r = await migrateStorage({ sourceDir: src, targetDir: dst });
  t("migrate ok", r.ok && r.copied === 3 && r.uploads === 1, r.error || "");
  const v = await verifyManifest(dst);
  t("target manifest verifies", v.ok && v.checked === 3, JSON.stringify(v.mismatches));
  const before = await fs.readFile(path.join(src, "cms-state.bin"));
  t("source untouched", Buffer.compare(before, bytes) === 0);
  r = await migrateStorage({ sourceDir: src, targetDir: dst });
  t("migrate idempotent", r.ok && r.copied === 0 && r.skipped === 3);
  await fs.writeFile(path.join(dst, "uploads", "a.jpg"), Buffer.from([0]));
  const v2 = await verifyManifest(dst);
  t("tamper detected", !v2.ok && v2.mismatches.length === 1);
  const inv = await inventoryLocation(src);
  t("inventory counts", inv.stateBytes === 8 && inv.uploads.length === 1 && inv.uploadBytes === 2);
  const emptyDir = path.join(tmp, "empty");
  await fs.mkdir(emptyDir, { recursive: true });
  const r2 = await migrateStorage({ sourceDir: emptyDir, targetDir: dst });
  t("empty source vs populated target refused", !r2.ok);
  const m = await writeManifest(src);
  t("manifest written", !!m.at && m.stateBytes === 8);

  /* ---------------- backup round-trip (backup-data.mjs) ---------------- */
  const { backup, restore, verifyAll, adoptLive, guardAtBoot } = await import("./backup-data.mjs");
  const broot = path.join(tmp, "broot");
  await fs.mkdir(path.join(broot, "data", "uploads"), { recursive: true });
  await fs.writeFile(path.join(broot, "data", "cms-state.bin"), Buffer.from("live-words-1"));
  await fs.writeFile(path.join(broot, "data", "cms-version.txt"), "v1\n");
  await fs.writeFile(path.join(broot, "data", "uploads", "p.png"), Buffer.from([7, 7, 7]));
  const b1 = await backup(broot, "test", 0);
  t("backup saved", !!b1.saved, b1.skipped || "");
  const b2 = await backup(broot, "test", 0);
  t("unchanged backup skipped", b2.skipped === "unchanged");
  const vall = await verifyAll(broot);
  t("all backups verify", vall.checked >= 1 && vall.failures.length === 0, JSON.stringify(vall.failures));
  await fs.writeFile(path.join(broot, "data", "cms-state.bin"), Buffer.from("live-words-2"));
  const g = await guardAtBoot(broot);
  t("boot guard snapshots", g.ok === true);
  const names = (await fs.readdir(path.join(broot, "data-backups"))).filter((n) => /^\d{8}-\d{6}$/.test(n)).sort();
  t("two snapshots kept", names.length === 2, names.join(","));
  const ad = await adoptLive(broot);
  t("adopt works", !!ad.adopted, ad.error || "");
  await fs.rm(path.join(broot, "data", "cms-state.bin"));
  const g2 = await guardAtBoot(broot);
  t("missing store recovered", g2.ok === true && !!g2.recovered);
  const liveBack = await fs.readFile(path.join(broot, "data", "cms-state.bin"));
  t("recovered bytes match", liveBack.toString() === "live-words-2");
  const vr = await restore(broot, names[0]);
  t("restore refuses live-difference", !!vr.error && /differs/.test(vr.error));
  const vf = await restore(broot, names[0], true);
  t("forced restore works", !!vf.restored);
} finally {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
}

if (failures) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exitCode = 1;
} else {
  console.log("\nall storage tests passed");
}
