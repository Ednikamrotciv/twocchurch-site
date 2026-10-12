/* Seed-source guard (note 365): pure helpers deciding which words a bake
   ships, so an empty bake can never slip out silently. No imports — the
   pre-ship verifier runs this module directly. */

export function countSections(seed) {
  if (!seed || typeof seed !== "object" || !seed.sections || typeof seed.sections !== "object") return 0;
  return Object.keys(seed.sections).length;
}

/* Backend first, then the file already at the target, then the repo's own
   seed — empty only when nowhere has words. */
export function pickBakeSource({ backend = null, targetPrev = null, rootSeed = null } = {}) {
  if (countSections(backend) > 0) return { kind: "backend", seed: backend };
  if (countSections(targetPrev) > 0) return { kind: "target", seed: targetPrev };
  if (countSections(rootSeed) > 0) return { kind: "root", seed: rootSeed };
  return { kind: "empty", seed: null };
}

/* The newest non-empty `recent` list among the candidates (null when none):
   a re-bake must never drop the previous livestreams. */
export function pickRecent(...cands) {
  let best = null;
  for (const c of cands) {
    if (!c || !Array.isArray(c.items) || !c.items.length) continue;
    if (!best || Number(c.at) > Number(best.at)) best = c;
  }
  return best;
}
