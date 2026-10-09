/* seed-fallback.mjs — the no-disk survival net (note 290).
   A host without a persistent disk (Render with no disk mounted at data/)
   wipes data/cms-state.bin on every restart, and the backend comes back
   empty — fresh visitors see the baked words from dist/seed.json, but the
   server's own copy answers blank until an office tab heals it. This closes
   that gap at the source: when the live store answers getContent with no
   sections, the server answers from the baked seed instead (dist/seed.json,
   built at deploy time from the last published store, then the committed
   root seed.json). A restart serves the last deployed words immediately —
   never blank. Uploads already survive the same way (serve.mjs serves
   data/uploads/ out of dist/ when the disk copy is gone).
   Anything published or uploaded on the live box AFTER that deploy still
   lives on the ephemeral disk only, so a restart lets it go — the durable
   path stays: publish from the office, push, redeploy. A disk is now an
   optimization (it keeps between-deploy live publishes), not a requirement.
   The fallback answer carries `seeded: true`, so tabs holding NEWER words
   (published on live since the deploy) keep them and heal the server forward
   instead of painting the older bake (see syncFromServer, note 290). A
   deliberate clearing still works: cleared sections keep their keys, so the
   answer is never "empty" and the fallback never fires. */

/* Baked-seed cache: dist/ only changes on rebuild+restart, so one read per
   process is enough. */
let seedCache = null;
let seedLoaded = false;

function usableSeed(obj) {
  if (!obj || typeof obj !== "object") return null;
  const sections = obj.sections;
  if (!sections || typeof sections !== "object" || !Object.keys(sections).length) return null;
  const rev = typeof obj.rev === "number" ? obj.rev : 0;
  const notes = typeof obj.notes === "number" ? obj.notes : 0;
  return { rev, notes, sections };
}

/* Pure decision: a live getContent answer plus a baked seed in, the answer to
   send out. No filesystem, no Node — unit-testable anywhere. Never throws. */
export function fallbackGetContent(bodyText, seed) {
  try {
    const good = usableSeed(seed);
    if (!good) return bodyText;
    const ans = JSON.parse(bodyText);
    if (!ans || ans.ok !== true) return bodyText;
    let sections = {};
    try {
      sections = ans.sections ? JSON.parse(ans.sections) : {};
    } catch {
      return bodyText;
    }
    if (sections && typeof sections === "object" && Object.keys(sections).length) return bodyText;
    const out = { ...ans, ok: true };
    out.sections = JSON.stringify(good.sections);
    out.rev = good.rev;
    out.notes = good.notes;
    out.seeded = true;
    return JSON.stringify(out);
  } catch {
    return bodyText;
  }
}

/* Read the baked seed (deployed image first, committed root second). Node
   only runs inside this function, imported lazily so this module stays
   importable without Node (tests). Cached for the life of the process. */
export async function loadBakedSeed(rootDir, distDir) {
  if (seedLoaded) return seedCache;
  seedLoaded = true;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const tries = [];
    if (distDir) tries.push(path.join(distDir, "seed.json"));
    if (rootDir && rootDir !== distDir) tries.push(path.join(rootDir, "seed.json"));
    for (const file of tries) {
      try {
        const seed = usableSeed(JSON.parse(await fs.readFile(file, "utf8")));
        if (seed) {
          seedCache = seed;
          console.log(`seed fallback ready: ${Object.keys(seed.sections).length} sections from ${file === tries[0] ? "the deployed bake" : "the committed seed"}`);
          return seedCache;
        }
      } catch {
        /* missing or unreadable — try the next source */
      }
    }
  } catch {
    /* no filesystem — no fallback */
  }
  return null;
}

/* Drop-in for the /__cms/getContent answer path. Any other method passes
   through untouched; any failure returns the live answer unchanged — the
   fallback must never break content. */
export async function answerWithSeedFallback(method, bodyText, rootDir, distDir) {
  try {
    if (method !== "getContent" || typeof bodyText !== "string" || !bodyText.includes('"ok":true')) return bodyText;
    const seed = await loadBakedSeed(rootDir, distDir);
    return fallbackGetContent(bodyText, seed);
  } catch {
    return bodyText;
  }
}
