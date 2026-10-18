/* clean.mjs — `npm run clean`: forget every build artifact on this folder so the
   next boot is the new code and nothing else (note 252). Removes dist/ and
   Vite's caches. Never touches data/ (the office's words live there) or
   node_modules itself. The browser's own old-copy cache is cleared from
   Admin → Tools → "Clean slate" inside the running site. */
import { rm } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const targets = ["dist", "node_modules/.vite", ".vite"];
let removed = 0;
for (const t of targets) {
  try {
    await rm(path.join(ROOT, t), { recursive: true, force: true });
    console.log(`cleaned ${t}`);
    removed++;
  } catch (err) {
    console.warn(`could not clean ${t}:`, err?.message || err);
  }
}
console.log(removed ? "clean done — run `npm run dev` (or build + start) next." : "nothing to clean.");
