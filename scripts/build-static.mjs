import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");

async function copyExists(from, to) {
  try {
    await stat(path.join(ROOT, from));
  } catch {
    return false;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await cp(path.join(ROOT, from), to, { recursive: true });
  return true;
}

await mkdir(OUT, { recursive: true });
await copyExists("index.html", path.join(OUT, "index.html"));
await copyExists("seed.json", path.join(OUT, "seed.json"));
await copyExists("src/bundle.js", path.join(OUT, "src", "bundle.js"));
await copyExists("src/bundle.css", path.join(OUT, "src", "bundle.css"));
await copyExists("src/chunks", path.join(OUT, "src", "chunks"));
await copyExists("src/assets", path.join(OUT, "src", "assets"));
await copyExists("data/uploads", path.join(OUT, "data", "uploads"));
console.log("static dist assembled (no bundler needed — ships the working preview files as-is)");
