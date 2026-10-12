/* Live-follow, shared decision + address helpers (note 343).
   A publish tapped on live/admin must reach the office copy by itself — even
   with no browser tab open. The office backend runs this loop (see
   createCmsHost in cms-local.mjs): about once a minute it reads the live
   site's published words and adopts them when they are strictly newer.
   Everything impure (fetch, timers, the store) lives with the caller — this
   file stays pure and import-free so the update verifier can run it anywhere.

   Adoption rules (same guards as the browser pull, note 308):
   - never from an empty or unreadable live answer;
   - never across a newer update (apply the new zip on the office copy first);
   - never from a fallback bake onto a used store (last-resort evidence, not
     a publish — only a fresh office copy may be restored from it, by hand);
   - the wall clock arbitrates: live wins only when its publish is strictly
     newer (revision counters are per-store and mean nothing across boxes). */

/* The live site's address when no office copy named another one: the same
   default the browser pull uses (DEFAULT_LIVE_ORIGIN in src/lib/cms.ts). An
   explicit cms-server.txt first line still wins. */
export const DEFAULT_LIVE_ORIGIN = "https://twocchurch-site.onrender.com";

/* First usable origin from a cms-server.txt body, else the default. Pure:
   pass the file text (or "" when absent) in. */
export function pickLiveOrigin(fileText) {
  try {
    const lines = String(fileText == null ? "" : fileText).split(/\r?\n/);
    for (const line of lines) {
      const t = String(line || "").trim();
      if (!t || t.startsWith("#")) continue;
      const clean = t.replace(/\/+$/, "");
      if (/^https?:\/\/[^/\s]+$/i.test(clean)) return clean;
      /* First non-blank line wins even when unusable — same as the backend. */
      return DEFAULT_LIVE_ORIGIN;
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_LIVE_ORIGIN;
}

/* True for loopback remotes (with or without a zone suffix). The adopt door
   below only ever opens to these — the per-boot token is the real lock. */
export function isLoopbackAddr(remote) {
  const host = String(remote || "").split("%")[0].replace(/^\[|\]$/g, "").trim().toLowerCase();
  return host === "127.0.0.1" || host === "::1" || host === "::ffff:127.0.0.1" || host === "localhost";
}

/* Should the office store adopt the live answer? local/live are getContent
   shapes {notes, at, rev, seeded, sections}; buildNotes is this folder's
   BUILD_NOTES; localFresh is true while this store never published.
   Returns "adopt" or the reason to skip ("empty" | "newer-update" |
   "seeded" | "stale"). Never throws. */
export function shouldAdoptLive(local, live, buildNotes, localFresh) {
  try {
    if (!live || typeof live !== "object") return "empty";
    let sections = live.sections;
    if (typeof sections === "string") {
      try {
        sections = JSON.parse(sections);
      } catch {
        return "empty";
      }
    }
    if (!sections || typeof sections !== "object" || !Object.keys(sections).length) return "empty";
    const liveNotes = typeof live.notes === "number" && isFinite(live.notes) ? Math.floor(live.notes) : 0;
    const build = typeof buildNotes === "number" && isFinite(buildNotes) ? Math.floor(buildNotes) : 0;
    /* Never adopt across a newer update. */
    if (build > 0 && liveNotes > build) return "newer-update";
    /* A fallback bake must never regress office words. */
    if (live.seeded === true && !localFresh) return "seeded";
    const liveAt = typeof live.at === "number" && isFinite(live.at) ? live.at : 0;
    const localAt = local && typeof local.at === "number" && isFinite(local.at) ? local.at : 0;
    /* Ties and older go to the durable path (office publish → auto-deploy). */
    if (!localFresh && liveAt <= localAt && localAt > 0) return "stale";
    if (!localFresh && liveAt <= 0) return "stale";
    return "adopt";
  } catch {
    return "empty";
  }
}

/* Sections worth writing: live values for fixed section ids, values only
   (never null — sections are fixed, exactly like an office publish). The
   wire carries values parsed (objects), while an office publish sends them
   stringified — both shapes are accepted and stored stringified, so the
   stored bytes match a publish byte-for-byte. */
export function adoptPatch(liveSections) {
  const patch = {};
  try {
    const src = typeof liveSections === "string" ? JSON.parse(liveSections) : liveSections;
    if (!src || typeof src !== "object") return patch;
    for (const id of Object.keys(src)) {
      if (!/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(id)) continue;
      let v = src[id];
      if (v !== null && typeof v === "object") {
        try {
          v = JSON.stringify(v);
        } catch {
          continue;
        }
      }
      if (typeof v !== "string") continue;
      try {
        const parsed = JSON.parse(v);
        if (parsed === null || typeof parsed !== "object") continue;
      } catch {
        continue;
      }
      patch[id] = v;
    }
  } catch {
    /* unclear — nothing to write */
  }
  return patch;
}
