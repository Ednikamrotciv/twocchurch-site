import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCmsHost } from "./cms-local.mjs";

/* The recent-services list, baked — so every copy shows the same services as
   the preview, with no scraping and no proxy on the visitor's browser.

   Why: the Watch live page used to read the church's YouTube channel live from
   each visitor's browser (the office server's /__yt proxy in dev, a public CORS
   proxy on static hosts). The public proxy is flaky and often blocked, so a
   deployed copy fell back to sermon cards while the preview showed real
   services — same site, different lists. Now the office reads the channel once
   (Node has no CORS problem) and the list ships inside seed.json beside the
   published words: every copy paints it on first load, the live feed carries
   it to deployed copies within minutes, and the browser's own channel read
   stays as a refresh on top. Run after publishing (`npm run bake-seed` does
   it too), and the office server re-runs it every 20 minutes by itself. */

const KEEP = 24;
const FETCH_MS = 25000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, signal: ctrl.signal });
    if (!res.ok) throw new Error("http " + res.status);
    const text = await res.text();
    if (!text) throw new Error("empty");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function channelIdIn(value) {
  return /(UC[\w-]{20,24})/.exec(String(value || ""))?.[1] || "";
}

function channelPageTargets(pasted) {
  const raw = String(pasted || "").trim();
  if (!raw) return [];
  if (/^https?:\/\//i.test(raw)) return [raw.replace(/\/+$/, "")];
  const m = /^@?([\w.-]+)$/.exec(raw);
  if (m) return [`https://www.youtube.com/@${m[1]}`];
  return [];
}

async function resolveChannelId(pasted) {
  const direct = channelIdIn(pasted);
  if (direct) return direct;
  for (const page of channelPageTargets(pasted)) {
    try {
      const html = await fetchText(page);
      const id =
        /"externalId":"(UC[\w-]{20,24})"/.exec(html)?.[1] ||
        /"channelId":"(UC[\w-]{20,24})"/.exec(html)?.[1] ||
        /youtube\.com\/channel\/(UC[\w-]{20,24})/.exec(html)?.[1] ||
        "";
      if (id) return id;
    } catch { /* try the next shape */ }
  }
  return "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseFeed(xml) {
  const items = [];
  for (const entry of String(xml || "").split("<entry>").slice(1)) {
    const videoId = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    if (!videoId) continue;
    const at = Date.parse(/<published>([^<]+)<\/published>/.exec(entry)?.[1] || "") || 0;
    if (!at) continue;
    const title = decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] || "").trim() || "Service";
    items.push({ videoId, title, at, ago: "", thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` });
  }
  return items;
}

async function publishedChannel(rootDir) {
  try {
    const cms = await createCmsHost(rootDir);
    cms.openConn("bake-recent");
    const r = await cms.call("getContent", "bake-recent", "");
    const res = JSON.parse(r.body);
    const sections = res && res.sections ? JSON.parse(res.sections) : {};
    if (sections && sections.live && typeof sections.live.youtubeChannel === "string") {
      return sections.live.youtubeChannel.trim();
    }
  } catch { /* an unreadable store means no channel from here */ }
  return "";
}

/* Read the channel, bake its latest uploads into seed.json's `recent`, and say
   whether the list actually changed. Never wipes: any failure keeps the
   previous bake (or the file as it was). */
export async function bakeRecent(rootDir) {
  const target = path.join(rootDir, "seed.json");
  let prev = null;
  try {
    prev = JSON.parse(await readFile(target, "utf8"));
  } catch { /* no seed yet — one is written below */ }
  const prevItems = prev && prev.recent && Array.isArray(prev.recent.items) ? prev.recent.items : [];

  const pasted = await publishedChannel(rootDir);
  if (!pasted) return { skipped: "no channel published yet", count: prevItems.length };
  const channelId = channelIdIn(pasted) || (await resolveChannelId(pasted).catch(() => ""));
  if (!channelId) return { skipped: "channel would not resolve", count: prevItems.length };
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`).catch(() => "");
  if (!xml) return { skipped: "feed unreachable", count: prevItems.length };
  const items = parseFeed(xml).slice(0, KEEP);
  if (!items.length) return { skipped: "feed empty", count: prevItems.length };

  const before = prevItems.map((it) => it && it.videoId).join(",");
  const after = items.map((it) => it.videoId).join(",");
  const next = { ...(prev || { rev: 0, sections: {} }), recent: { items, at: Date.now(), channelId } };
  await writeFile(target, JSON.stringify(next));
  const changed = before !== after;
  console.log(`bake-recent: ${items.length} services from ${channelId}${changed ? "" : " (unchanged)"}`);
  return { changed, count: items.length, channelId };
}

if (process.argv[1] && process.argv[1].endsWith("bake-recent.mjs")) {
  try {
    await bakeRecent(process.cwd());
  } catch (err) {
    console.warn("bake-recent skipped:", err?.message || err);
  }
}
