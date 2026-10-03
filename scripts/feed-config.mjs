import { readFile } from "node:fs/promises";
import path from "node:path";

/* One file, two optional lines (publish-feed.txt, committed — all public info):
     owner/repo@branch            the live source, when THAT repo is public
     https://github.com/o/r       a MIRROR repo (empty public repo holding only
                                  seed.json), for when the source is private
   The mirror wins when both are set. Nothing secret ever lives here. */

const SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_./-]+)$/;
const URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i;

export function parseFeedLine(line) {
  const t = String(line || "").trim();
  if (!t || t.startsWith("#")) return null;
  let m = SOURCE_RE.exec(t);
  if (m && !(m[1] === "owner" && m[2] === "repo")) {
    return { kind: "source", owner: m[1], repo: m[2], branch: m[3] };
  }
  m = URL_RE.exec(t);
  if (m) return { kind: "mirror", owner: m[1], repo: m[2] };
  return null;
}

export async function readFeedConfig(rootDir) {
  let raw = "";
  try {
    raw = await readFile(path.join(rootDir, "publish-feed.txt"), "utf8");
  } catch {
    return { source: null, mirror: null };
  }
  let source = null;
  let mirror = null;
  for (const line of String(raw).split(/\r?\n/)) {
    const p = parseFeedLine(line);
    if (!p) continue;
    if (p.kind === "source" && !source) source = p;
    if (p.kind === "mirror" && !mirror) mirror = p;
  }
  return { source, mirror };
}

/* What the deployed copies read: the mirror when set, else the public source,
   else nothing (rebuild-only updates, as before). */
export function effectiveFeed(cfg, branch) {
  if (cfg && cfg.mirror) return `${cfg.mirror.owner}/${cfg.mirror.repo}@${branch || "main"}`;
  if (cfg && cfg.source) return `${cfg.source.owner}/${cfg.source.repo}@${cfg.source.branch}`;
  return "";
}

const CLI = typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("feed-config.mjs");
if (CLI) {
  const cfg = await readFeedConfig(process.cwd());
  console.log(JSON.stringify({ ...cfg, effective: effectiveFeed(cfg) }, null, 1));
}
