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
  const notes = typeof res.notes === "number" ? res.notes : 0;
  await writeFile(target, JSON.stringify({ rev, notes, sections }));
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
  await bakeSeed(process.cwd());
}
