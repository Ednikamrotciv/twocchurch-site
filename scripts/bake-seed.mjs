import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCmsHost } from "./cms-local.mjs";

/* Re-bake seed.json (the published snapshot static hosts read) from the
   office's local store (data/cms-state.bin). Run it after publishing:
   `npm run bake-seed`. The deploy build calls this too, so a pushed
   cms-state.bin always ships fresh words. Never wipes a good seed with an
   empty bake (a fresh/empty backend means "nothing published here", not
   "forget what was baked"). */
export async function bakeSeed(rootDir, outPath) {
  const target = outPath || path.join(rootDir, "seed.json");
  const cms = await createCmsHost(rootDir);
  cms.openConn("bake");
  const r = await cms.call("getContent", "bake", "");
  const res = JSON.parse(r.body);
  const sections = res && res.sections ? JSON.parse(res.sections) : {};
  const ids = Object.keys(sections);
  if (!ids.length) {
    try {
      const prev = JSON.parse(await readFile(target, "utf8"));
      if (prev && prev.sections && Object.keys(prev.sections).length) {
        console.log(`bake-seed: backend is empty — keeping existing seed.json (${Object.keys(prev.sections).length} sections)`);
        return { kept: true, count: Object.keys(prev.sections).length };
      }
    } catch { /* no usable seed — write the empty one below */ }
  }
  const rev = typeof res.rev === "number" ? res.rev : 0;
  /* Never wipe the publish stamp with an empty bake (note 279): a backend
     that reports no notes (or nothing at all) keeps the previous file's
     stamp, so a deployed copy can still tell it is behind the new code. */
  let notes = typeof res.notes === "number" && res.notes > 0 ? Math.floor(res.notes) : 0;
  if (!notes) {
    try {
      const prev = JSON.parse(await readFile(target, "utf8"));
      if (typeof prev?.notes === "number" && prev.notes > 0) notes = Math.floor(prev.notes);
    } catch { /* no previous stamp — ships 0, a first run never waits */ }
  }
  /* The publish history rides the same bake (note 303): Render's free tier
     wipes the live store on every sleep, and the stamp alone is not enough —
     without the history every wake cleared "Last published" in the admin
     console. Kept across empty bakes like the stamp above. */
  let log = Array.isArray(res.log) ? res.log.slice(0, 20) : [];
  let by = typeof res.by === "string" ? res.by.slice(0, 60) : "";
  let at = typeof res.at === "number" ? res.at : 0;
  if (!log.length && !by && !at) {
    try {
      const prev = JSON.parse(await readFile(target, "utf8"));
      if (Array.isArray(prev?.log)) log = prev.log.slice(0, 20);
      if (typeof prev?.by === "string") by = prev.by.slice(0, 60);
      if (typeof prev?.at === "number") at = prev.at;
    } catch { /* no previous history — ships empty */ }
  }
  await writeFile(target, JSON.stringify({ rev, notes, sections, log, by, at }));
  console.log(`bake-seed: baked ${ids.length} sections into ${path.relative(rootDir, target)}`);
  /* The recent-services list ships in the same file, so every copy paints the
     same services as the preview (see bake-recent.mjs). Best effort — a missed
     read keeps the previous bake. */
  try {
    const { bakeRecent } = await import("./bake-recent.mjs");
    await bakeRecent(rootDir);
  } catch (err) {
    console.warn("recent services not re-baked:", err?.message || err);
  }
  return { kept: false, count: ids.length };
}

if (process.argv[1] && process.argv[1].endsWith("bake-seed.mjs")) {
  /* Loud failure (note 307): auto-push only retries after the next publish,
     so a silent non-zero exit leaves the live bake stale with no hint. Say
     what broke and keep the previous seed — never wipe it on the way out. */
  try {
    await bakeSeed(process.cwd());
  } catch (err) {
    console.error("bake-seed failed:", err?.message || err);
    console.error("fix it, then run `npm run bake-seed` again — the previous seed.json was kept.");
    process.exitCode = 1;
  }
}
