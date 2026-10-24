import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCmsHost } from "./cms-local.mjs";
import { pickBakeSource, pickRecent } from "./seed-guard.mjs";

/* Re-bake seed.json (the published snapshot static hosts read) from the
   office's local store (data/cms-state.bin). Run it after publishing:
   `npm run bake-seed`. The deploy build calls this too, so a pushed
   cms-state.bin always ships fresh words. Never wipes a good seed with an
   empty bake (a fresh/empty backend means "nothing published here", not
   "forget what was baked"). */
export async function bakeSeed(rootDir, outPath) {
  const target = outPath || path.join(rootDir, "seed.json");
  const rootSeedPath = path.join(rootDir, "seed.json");
  /* Clean-deploy flag: with a `clean-deploy.txt` beside package.json, a NEW
     deploy ships no words — fresh, new and clean until the office clicks
     Recover and Publish (option A: the file is committed, so every deploy
     while it sits there opens clean; remove it + rebuild to carry words
     again). Only the DEPLOY bake goes clean — the root seed keeps its words
     (it is the office's own backup in git, never a visitor page), and an
     unwiped store on the same deploy keeps re-serving through the fallback
     exactly as before. */
  let cleanDeploy = false;
  try {
    await readFile(path.join(rootDir, "clean-deploy.txt"), "utf8");
    cleanDeploy = true;
  } catch { /* no flag — words ride as usual */ }
  if (cleanDeploy && target !== rootSeedPath) {
    console.log("clean deploy requested (clean-deploy.txt) — shipping an empty bake: Recover + Publish, then REMOVE the file and rebuild to lock words in");
    await writeFile(target, JSON.stringify({ rev: 0, notes: 0, sections: {}, log: [], by: "", at: 0 }));
    return { kept: false, count: 0, clean: true };
  }
  const readJson = async (p) => {
    try {
      return JSON.parse(await readFile(p, "utf8"));
    } catch {
      return null;
    }
  };
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
    } catch { /* no usable seed here — the repo copy is next */ }
    /* Empty backend and nothing usable at the target (note 366): ship the
       repo's own seed.json whole — words, recents, stamp — instead of an
       empty shell. A build farm has no backend; the repo seed IS the words. */
    if (target !== rootSeedPath) {
      const repo = await readJson(rootSeedPath);
      if (pickBakeSource({ backend: null, targetPrev: null, rootSeed: repo }).kind === "root") {
        await writeFile(target, JSON.stringify(repo));
        console.log(`bake-seed: backend is empty — shipping repo seed.json (${Object.keys(repo.sections).length} sections)`);
        return { kept: true, count: Object.keys(repo.sections).length, from: "root" };
      }
    }
    /* Nowhere has words (note 366): fail LOUD — build-static.mjs turns
       this into a red build, so an empty bake can never deploy silently. */
    const empty = new Error("bake-seed: refusing to ship an empty bake — the backend is empty and no seed.json with sections was found. Copy seed.json from the update zip next to package.json and rebuild.");
    empty.code = "EMPTY_BAKE";
    throw empty;
  }
  const rev = typeof res.rev === "number" ? res.rev : 0;
  /* Never wipe the publish stamp with an empty bake (note 279): a backend
     that reports no notes (or nothing at all) keeps the previous file's
     stamp, so a deployed copy can still tell it is behind the new code. */
  let notes = typeof res.notes === "number" && res.notes > 0 ? Math.floor(res.notes) : 0;
  /* Deploy lock: carry the publish deploy ID like the stamp above. */
  let publishedDeploy = typeof res.publishDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(res.publishDeploy) ? res.publishDeploy : "";
  /* Same-update attestation for brand-new arrivals (one click clears every
     device): the word the publish was blessed from rides the bake, so a copy
     that never reaches a server can still prove the publish came from its own
     running code. Absent on older backends — which prove nothing, as before. */
  let publishCode = typeof res.code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(res.code) ? res.code : "";
  if (!notes) {
    try {
      const prev = JSON.parse(await readFile(target, "utf8"));
      if (typeof prev?.notes === "number" && prev.notes > 0) notes = Math.floor(prev.notes);
    } catch { /* no previous stamp — ships 0, a first run never waits */ }
  }
  if (!publishedDeploy) {
    try {
      const prev = JSON.parse(await readFile(target, "utf8"));
      if (typeof prev?.publishedDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(prev.publishedDeploy)) publishedDeploy = prev.publishedDeploy;
    } catch {}
  }
  if (!publishCode) {
    try {
      const prev = JSON.parse(await readFile(target, "utf8"));
      if (typeof prev?.code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(prev.code)) publishCode = prev.code;
    } catch {}
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
  /* The recents ride the same file (note 366): the backend knows no `recent`,
     so carry the newest list already on disk — the refresh below overwrites
     with fresher. Without this a re-bake silently drops the list. */
  const carried = pickRecent((await readJson(rootSeedPath))?.recent, (await readJson(target))?.recent);
  await writeFile(target, JSON.stringify({ rev, notes, sections, log, by, at, ...(carried ? { recent: carried } : {}), ...(publishedDeploy ? { publishedDeploy } : {}), ...(publishCode ? { code: publishCode } : {}) }));
  console.log(`bake-seed: baked ${ids.length} sections into ${path.relative(rootDir, target)}`);
  /* The recent-services list ships in the same file, so every copy paints the
     same services as the preview (see bake-recent.mjs). Best effort — a missed
     read keeps the previous bake. Deploy builds set WOM_SKIP_RECENT=1 (see
     build-static.mjs): the office server re-runs this refresh every 20
     minutes and the feed carries it, so a deploy must not stall up to 25s on
     a datacenter-blocked YouTube read — the carried list stands. */
  if (process.env.WOM_SKIP_RECENT === "1") {
    console.log("bake-seed: recent refresh skipped (deploy build) — carried list stands");
  } else {
    try {
      const { bakeRecent } = await import("./bake-recent.mjs");
      await bakeRecent(rootDir);
    } catch (err) {
      console.warn("recent services not re-baked:", err?.message || err);
    }
  }
  /* The refresh above writes the repo seed only (note 366): copy its list
     into this bake too, so dist ships the same services as the preview. */
  if (target !== rootSeedPath) {
    try {
      const fresh = (await readJson(rootSeedPath))?.recent;
      if (fresh && Array.isArray(fresh.items) && fresh.items.length) {
        const cur = (await readJson(target)) || {};
        await writeFile(target, JSON.stringify({ ...cur, recent: fresh }));
      }
    } catch { /* the carried list above stands */ }
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
