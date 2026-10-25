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
   The fallback carries the bake's sections, revision, publish stamp AND
   publish history (notes 300 + 303): the stamp is the bake-time record of the last real publish, so a
   restarted server keeps serving the last published update instead of
   dropping every visitor into update-mode (and clearing "last published")
   with no new update. A genuinely new code release still waits: its update
   number outruns any bake stamped before the office publishes from it — only
   an explicit publish moves the stamp further. The first explicit publish on
   the restarted server still stamps it for real.
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
  /* The publish history rides the same bake (note 303): Render's free tier
     wipes the live store on every sleep, and serving words+stamp without the
     history cleared "Last published" in the admin console on every wake. */
  const log = Array.isArray(obj.log) ? obj.log.slice(0, 20) : [];
  const by = typeof obj.by === "string" ? obj.by.slice(0, 60) : "";
  const at = typeof obj.at === "number" ? obj.at : 0;
  const publishedDeploy = typeof obj.publishedDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(obj.publishedDeploy) ? obj.publishedDeploy : "";
  /* The word the publish was blessed from (one click clears every device):
     a wiped box serves this bake with no memory of its own, so the bake
     carries the attestation the waiting copies prove. Absent on older
     bakes — which prove nothing, as before. */
  const code = typeof obj.code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(obj.code) ? obj.code : "";
  return { rev, notes, sections, log, by, at, publishedDeploy, code };
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
    /* The bake's stamp is last-published evidence (note 300), not a new
       blessing: it only ever records a publish that really happened, so a
       same-code restart keeps serving it while a new code release still
       waits for the office. See the header. */
    out.notes = good.notes;
    out.publishDeploy = good.publishedDeploy;
    /* …and its publish history (note 303): without log/by/at every host
       restart cleared "Last published" in the admin console. */
    out.log = good.log;
    out.by = good.by;
    out.at = good.at;
    /* …and its attestation: the bake's word releases waiting copies that prove
       it, exactly like a live answer would. Older bakes name no word — the
       server's own answer stands, as before. */
    if (good.code) out.code = good.code;
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
    /* Clean-deploy flag: with clean-deploy.txt beside package.json this deploy
       ships no words — the committed root seed is the office's own backup in
       git, never a visitor page, so a clean copy must never fall through to
       it and resurface the last publish. Without the flag the root seed stays
       the second source, as before. Never throws. */
    let cleanDeploy = false;
    try {
      if (rootDir) {
        await fs.readFile(path.join(rootDir, "clean-deploy.txt"), "utf8");
        cleanDeploy = true;
      }
    } catch { /* words ride as usual */ }
    if (!cleanDeploy && rootDir && rootDir !== distDir) tries.push(path.join(rootDir, "seed.json"));
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

/* Pure decision: a baked seed and a pushed mirror seed in, the one to serve.
   The mirror is the office's latest pushed publish; the bake is the deploy's.
   The mirror wins only when it is strictly newer work on the SAME-or-older
   update (rev higher, notes at or below the bake): a newer update in the
   mirror means the office moved on — this copy must wait for the update, not
   serve its words — and a clean/empty bake (notes 0, e.g. a clean deploy)
   never adopts mirror words by itself, EXCEPT as the first publish of its own
   deploy (opts.takeover below): the mirror then proves, by naming this
   deploy's own witness on the running update or older, that the office already
   published here — so a sleep-wake after that first publish serves it instead
   of the empty bake. Older mirrors, unstamped mirrors and newer-update
   mirrors still keep the bake, so a clean deploy can never resurrect retired
   words. Never throws. */
export function preferMirrorSeed(bake, mirror, opts) {
  try {
    const good = (s) => {
      if (!s || typeof s !== "object") return null;
      const sections = s.sections;
      if (!sections || typeof sections !== "object" || !Object.keys(sections).length) return null;
      return {
        rev: typeof s.rev === "number" ? s.rev : 0,
        notes: typeof s.notes === "number" ? s.notes : 0,
        seed: s,
      };
    };
    const b = good(bake);
    const m = good(mirror);
    /* Either side unusable keeps the bake: in particular a clean/empty bake
       (a clean deploy) never adopts mirror words by itself — UNLESS the
       mirror is this deploy's own first publish (same-deploy witness, running
       update or older): then the office published here already, and wakes
       serve it. The first Publish plus the rebuild that carries it still
       restores the bake itself afterwards. */
    if (!m || !b) {
      if (!b && m && opts && typeof opts === "object") {
        const myDeploy = typeof opts.deployId === "string" ? opts.deployId : "";
        const build = typeof opts.buildNotes === "number" && isFinite(opts.buildNotes) ? Math.floor(opts.buildNotes) : 0;
        const mDeploy = mirror && typeof mirror.publishedDeploy === "string" ? mirror.publishedDeploy : "";
        if (myDeploy && mDeploy === myDeploy && m.notes > 0 && build > 0 && m.notes <= build) {
          return { seed: mirror, from: "mirror-takeover" };
        }
      }
      return { seed: bake || null, from: "bake" };
    }
    if (m.rev > b.rev && m.notes <= b.notes) return { seed: mirror, from: "mirror" };
    return { seed: bake, from: "bake" };
  } catch {
    return { seed: bake || null, from: "bake" };
  }
}

/* Boot-time prime (office request: sleep-wake serves the first publish, not
   the deploy-time bake): after a publish the office mirrors the seed, so a
   waking box asks the pushed mirror first — then the baked source-repo
   address (dist/origin.json, no feed config needed) — and serves pushed
   words within seconds instead of waiting out the feed-follow minute on a
   stale bake. On a clean deploy (empty bake) the mirror is adopted ONLY as
   this deploy's own first publish (same-deploy witness, running update or
   older) — retired mirrors can never resurrect onto a clean deploy. Best
   effort — unreachable mirror, unconfigured feed, or a guarded case above
   all fall back to the bake silently. Node only runs inside; the top-level
   stays importable without Node (tests). */
export async function primeMirrorSeed(rootDir, distDir) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { readFeedConfig, effectiveFeed } = await import("./feed-config.mjs");
    const cfg = await readFeedConfig(rootDir);
    const feed = effectiveFeed(cfg);
    const m = /^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_.\/-]+)\s*$/.exec(feed || "");
    const haveFeed = m && !(m[1] === "owner" && m[2] === "repo");
    /* Origin address for wake-time priming (sleep-wake after the first
       publish): build-static.mjs bakes the public source repo into
       dist/origin.json, so a waking box with no feed configured primes off
       the pushed source seed — the office push carries the first publish
       there. Same takeover/mirror-wins rules as the feed source below; a
       private repo 404s and stays skipped. Never throws. */
    let origin = "";
    try {
      const rawOrigin = JSON.parse(await fs.readFile(path.join(distDir, "origin.json"), "utf8"));
      const om = /^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_.\/-]+)\s*$/.exec(String((rawOrigin && rawOrigin.source) || ""));
      if (om && !(om[1] === "owner" && om[2] === "repo")) origin = `${om[1]}/${om[2]}@${om[3]}`;
    } catch { /* no origin baked — the feed alone stands */ }
    if (!haveFeed && !origin) return { primed: false };
    if (!seedCache) await loadBakedSeed(rootDir, distDir);
    /* This deploy's own witness and update, for the clean-bake takeover rule
       above: the deployed version.json names both (the takeover needs them,
       the normal mirror-wins path ignores them). */
    let myDeploy = "";
    try {
      myDeploy = String(JSON.parse(await fs.readFile(path.join(distDir, "version.json"), "utf8")).deployId || "");
    } catch { /* unknown deploy — takeovers stay off, the bake stands */ }
    let buildNotes = 0;
    try {
      const hooksSrc = await fs.readFile(path.join(rootDir, "src", "lib", "hooks.ts"), "utf8");
      buildNotes = Number((hooksSrc.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
    } catch { /* unknown update — takeovers stay off */ }
    const sources = [];
    if (haveFeed) sources.push({ base: `${m[1]}/${m[2]}`, branch: m[3], via: "the pushed mirror" });
    if (origin && (!haveFeed || origin.toLowerCase() !== `${m[1]}/${m[2]}@${m[3]}`.toLowerCase())) {
      const cut = origin.indexOf("/");
      const rest = origin.slice(cut + 1);
      const at = rest.indexOf("@");
      if (cut > 0 && at > 0) sources.push({ base: `${origin.slice(0, cut)}/${rest.slice(0, at)}`, branch: rest.slice(at + 1), via: "the source repo" });
    }
    for (const src of sources) {
    const urls = [
      `https://raw.githubusercontent.com/${src.base}/${src.branch}/seed.json`,
      `https://cdn.jsdelivr.net/gh/${src.base}@${src.branch}/seed.json`,
    ];
    for (const url of urls) {
      let data = null;
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : 0;
        try {
          const res = await fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
          if (!res.ok) continue;
          data = await res.json().catch(() => null);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch {
        continue;
      }
      /* A clean deploy bakes no usable seed (the cache stays null) — decide
         against an empty stand-in so the takeover rule below can still fire
         for this deploy's own first publish. Anything else keeps the bake. */
      const bake = seedCache || { rev: 0, notes: 0, sections: {}, log: [], by: "", at: 0, publishedDeploy: "" };
      const pick = preferMirrorSeed(
        { rev: bake.rev, notes: bake.notes, sections: bake.sections },
        data,
        { deployId: myDeploy, buildNotes }
      );
      /* A takeover serves the mirror's own witness (it names THIS deploy, so
         tabs release on it); the normal mirror-wins path keeps the bake's
         witness as before, so a newer deploy's words can never release this
         box by themselves. */
      if (pick.from === "mirror-takeover") {
        const kept = usableSeed({ ...data });
        if (kept) {
          seedCache = kept;
          console.log(`seed fallback primed from this deploy's first publish (rev ${kept.rev}) — wakes serve it, not the empty bake`);
          return { primed: true };
        }
      }
      if (pick.from === "mirror") {
        const kept = usableSeed({ ...data, publishedDeploy: bake.publishedDeploy });
        if (kept) {
          seedCache = kept;
          console.log(`seed fallback primed from ${src.via} (rev ${kept.rev}) — wakes serve the first publish, not the deploy bake`);
          return { primed: true };
        }
      }
      /* This address had nothing newer — the next address (or the origin
         source) still gets its turn. */
    }
    }
    return { primed: false };
  } catch {
    return { primed: false };
  }
}
/* Pure decision: a live contentRev stamp plus a baked seed in, the stamp to
   send out. When the store was wiped (rev 0 / words 0) but the bake carries a
   real publish, serve the bake's stamp — otherwise visitors polling the stamp
   stay on maintenance while getContent already serves the bake's words. Never
   across updates: only a bake stamped at or below the running update lifts;
   empty/unreadable bakes prove nothing. Never throws. */
export function fallbackContentRev(bodyText, seed, buildNotes) {
  try {
    const good = usableSeed(seed);
    if (!good) return bodyText;
    const ans = JSON.parse(bodyText);
    if (!ans || ans.ok !== true) return bodyText;
    const liveWords = typeof ans.words === "number" ? Math.floor(ans.words) : 0;
    const liveNotes = typeof ans.notes === "number" ? Math.floor(ans.notes) : 0;
    // Store holds words — its own stamp stands (no fallback).
    if (liveWords > 0 && liveNotes > 0) return bodyText;
    const build = typeof buildNotes === "number" && isFinite(buildNotes) ? Math.floor(buildNotes) : 0;
    // A newer-update bake must never release this box by itself.
    if (build > 0 && good.notes > build) return bodyText;
    if (!(good.notes > 0)) return bodyText;
    const out = { ...ans, ok: true };
    out.rev = good.rev;
    out.notes = good.notes;
    out.at = good.at;
    out.publishDeploy = good.publishedDeploy;
    if (good.code) out.code = good.code;
    try {
      const n = Object.keys(good.sections || {}).length;
      if (Number.isFinite(n) && n > 0) out.words = n;
    } catch {}
    out.seeded = true;
    return JSON.stringify(out);
  } catch {
    return bodyText;
  }
}
/* Drop-in for the /__cms/getContent + /__cms/contentRev answer paths. Any other
   method passes through untouched; any failure returns the live answer
   unchanged — the fallback must never break content. */
export async function answerWithSeedFallback(method, bodyText, rootDir, distDir) {
  try {
    if (typeof bodyText !== "string" || !bodyText.includes('"ok":true')) return bodyText;
    if (method === "getContent") {
      const seed = await loadBakedSeed(rootDir, distDir);
      return fallbackGetContent(bodyText, seed);
    }
    if (method === "contentRev") {
      const seed = await loadBakedSeed(rootDir, distDir);
      let buildNotes = 0;
      try {
        const fs = await import("node:fs/promises");
        const hooksSrc = await fs.readFile((await import("node:path")).join(rootDir, "src", "lib", "hooks.ts"), "utf8");
        buildNotes = Number((hooksSrc.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
      } catch {}
      return fallbackContentRev(bodyText, seed, buildNotes);
    }
    /* Health is the same tiny stamp under another name — a wiped store must
       report the bake it serves, or health checks flap while content is fine. */
    if (method === "health") {
      const seed = await loadBakedSeed(rootDir, distDir);
      let buildNotes = 0;
      try {
        const fs = await import("node:fs/promises");
        const hooksSrc = await fs.readFile((await import("node:path")).join(rootDir, "src", "lib", "hooks.ts"), "utf8");
        buildNotes = Number((hooksSrc.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
      } catch {}
      return fallbackContentRev(bodyText, seed, buildNotes);
    }
    return bodyText;
  } catch {
    return bodyText;
  }
}
