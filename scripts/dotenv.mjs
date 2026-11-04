/* dotenv.mjs — zero-dependency .env loader (livestream key setup).
   Node has no built-in dotenv, and this repo keeps zero backend deps, so both
   backends (scripts/serve.mjs + scripts/vite-cms-backend.mjs) share this tiny
   parser instead of a package. Reads .env then .env.local in the project root
   (latter wins); never overrides a real environment variable, so Render /
   Netlify dashboard values always win over the file. Never throws. */

import { readFile } from "node:fs/promises";
import path from "node:path";

function parseDotEnv(text) {
  const out = {};
  for (const rawLine of String(text == null ? "" : text).split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') || (val[0] === "'" && val[val.length - 1] === "'"))) {
      const q = val[0];
      val = val.slice(1, -1);
      if (q === '"') val = val.split("\\n").join("\n").split("\\r").join("\r").split("\\t").join("\t");
    } else {
      const hash = val.indexOf(" #");
      if (hash >= 0) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

export async function loadDotEnv(root) {
  const loaded = [];
  try {
    const dir = root || process.cwd();
    for (const name of [".env", ".env.local"]) {
      let text = "";
      try { text = await readFile(path.join(dir, name), "utf8"); } catch { continue; }
      const parsed = parseDotEnv(text);
      let n = 0;
      for (const k of Object.keys(parsed)) {
        if (typeof process.env[k] === "undefined" || process.env[k] === "") {
          try { process.env[k] = parsed[k]; n++; } catch {}
        }
      }
      loaded.push({ file: name, keys: n });
    }
  } catch {}
  return loaded;
}

export { parseDotEnv };
