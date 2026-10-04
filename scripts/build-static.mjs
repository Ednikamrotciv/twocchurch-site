/* `npm run build` step two (right after `vite build`): finish dist/ for any
   static host — baked content, office-server + live-feed pointers, photos,
   uploads, and one page file per route (plus 404.html) so direct visits and
   refreshes work with no rewrite rules. Served from the domain root (clean
   addresses assume it). */

import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { bakeSeed } from "./bake-seed.mjs";
import { readFeedConfig, effectiveFeed } from "./feed-config.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");

try {
  await stat(path.join(OUT, "index.html"));
} catch {
  console.error("no dist/index.html — `vite build` must run first (plain `npm run build` does both).");
  process.exit(1);
}
await mkdir(OUT, { recursive: true });

/* Fresh words on every deploy: bake the pushed store into dist/seed.json, so the
   deployed seed always matches what the office last published. */
try {
  await bakeSeed(ROOT, path.join(OUT, "seed.json"));
} catch (err) {
  console.warn("seed not re-baked:", err?.message || err);
}

/* The live feed address: with a valid publish-feed.txt (a public source repo
   line, or a mirror repo line for private sources), deployed copies read fresh
   words straight off the repo within minutes of a publish — no rebuild needed,
   on any host. Without either, copies update on rebuilds only. */
try {
  const cfg = await readFeedConfig(ROOT);
  const feed = effectiveFeed(cfg);
  if (feed) {
    await writeFile(path.join(OUT, "feed.json"), JSON.stringify({ feed }));
    console.log(`live feed on: ${feed} — deployed copies refresh without rebuilds`);
  } else {
    const rawFeed = await readFile(path.join(ROOT, "publish-feed.txt"), "utf8").catch(() => "");
    const line = String(rawFeed).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#")) || "";
    if (!line) console.log("no live feed in publish-feed.txt — deployed copies update on rebuilds only");
    else console.warn(`publish-feed.txt ignored: "${line}" is not owner/repo@branch or a github.com repo address — deployed copies update on rebuilds only`);
  }
} catch (err) {
  console.warn("feed.json skipped:", err?.message || err);
}

/* The office server, baked in: when the repo carries a cms-server.txt with
   the office address (one origin, e.g. https://office.example.com), every
   deployed copy joins that shared backend automatically — sign-in,
   publishing, uploads and live updates, exactly like local. Absent file, or
   a blank one, and the copy stands alone. */
try {
  const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8").catch(() => "");
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const first = lines[0] || "";
  const url = first && /^https?:\/\/[^/\s]+$/i.test(first.replace(/\/+$/, "")) ? first.replace(/\/+$/, "") : "";
  if (url) {
    await writeFile(path.join(OUT, "server.json"), JSON.stringify({ url }));
    console.log(`office server baked in: ${url} — deployed copies join the shared backend`);
  } else if (!lines.length) {
    console.log("no office server in cms-server.txt — deployed copies stand alone (see DEPLOY.md, office server)");
  } else {
    console.warn(`cms-server.txt ignored: "${first}" is not an origin (want just https://your-server-address, nothing after it) — deployed copies stand alone`);
  }
} catch (err) {
  console.warn("server.json skipped:", err?.message || err);
}

/* String-URL files the app points at (photos are plain "src/assets/…" strings,
   never imports, so `vite build` skips them) plus the office's own uploads. */
try {
  await cp(path.join(ROOT, "src", "assets"), path.join(OUT, "src", "assets"), { recursive: true });
  console.log("photos copied to dist/src/assets");
} catch (err) {
  console.warn("photos not copied:", err?.message || err);
}
try {
  const st = await stat(path.join(ROOT, "data", "uploads")).catch(() => null);
  if (st && st.isDirectory()) {
    await cp(path.join(ROOT, "data", "uploads"), path.join(OUT, "data", "uploads"), { recursive: true });
    console.log("uploads copied to dist/data/uploads");
  }
} catch (err) {
  console.warn("uploads not copied:", err?.message || err);
}

/* Clean addresses on hosts with no rewrite rules: /admin, /sermons, … each
   get their own copy of the entry page, so a direct visit or refresh boots
   the app instead of a host 404. The route list is read from the site's own
   table (src/lib/routes.tsx), plus the office prefix beside every page. */
try {
  const routesSrc = await readFile(path.join(ROOT, "src", "lib", "routes.tsx"), "utf8");
  const patterns = [...routesSrc.matchAll(/pattern:\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.includes(":") && p !== "/")
    .map((p) => p.replace(/^\//, ""));
  const pages = [...new Set([...patterns, "admin"])];
  const shell = await readFile(path.join(OUT, "index.html"), "utf8");
  const writePage = async (dir) => {
    await mkdir(path.join(OUT, dir), { recursive: true });
    await writeFile(path.join(OUT, dir, "index.html"), shell);
  };
  for (const page of pages) {
    await writePage(page);
    await writePage(path.join("admin", page));
  }
  await writeFile(path.join(OUT, "404.html"), shell);
  console.log(`route pages written for: ${pages.join(", ")} (+ admin/*, 404.html)`);
} catch (err) {
  console.warn("route pages skipped:", err?.message || err);
}
console.log("dist/ ready to upload (the *contents* of dist/ go to the static host)");
