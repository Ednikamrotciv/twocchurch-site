/* Upload cache: sleep-free slide/photo retention (note 413).
   Free hosts wipe data/uploads/ on every sleep, which used to blank the box
   slides (grey placeholder) until the office re-uploaded. Every successful
   upload is now cached in this browser (IndexedDB + localStorage fallback),
   missing files are restored to the server on boot/online/visible, and slides
   paint the cached copy while the server copy is gone — so coming back online
   or running local immediately shows the last uploads, blank-free. */

import { useEffect, useState } from "react";
import { bakedFeedSpec, bakedFeedUploadsDir, feedUploadUrls } from "./livefeed";

const IDB_NAME = "wom-uploads";
const IDB_STORE = "files";
const LS_PREFIX = "wom.upload.";
const MEM = new Map<string, string>();

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
        } catch {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) return null;
    const type = m[1] || "application/octet-stream";
    const b64 = m[3] || "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

export function uploadNameOf(url: string): string {
  const m = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(String(url || ""));
  return m ? m[1] : "";
}

/** This copy's own address for an office upload: old absolute addresses (the
    previous host) become host-relative, so previews and players read the
    restored file here instead of the old host. Pasted links pass through. */
export function normalizeUploadUrl(url: string): string {
  const m = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(String(url || ""));
  return m ? "/data/uploads/" + m[1] : String(url || "");
}

/** Keep the last upload for this name in this browser. Never throws. */
export async function cacheUploadBlob(name: string, blob: Blob): Promise<void> {
  const clean = String(name || "").trim();
  if (!clean || !blob || !(blob as any).size) return;
  /* Big films must never ride the data-URL cache: base64-ing a 100 MB video
     spikes the tab by ~270 MB and can kill it on a phone (a blank page that
     looks exactly like a failed upload). Films paint from the session preview
     and the server copy instead. */
  if ((blob as any).size > 15_000_000) return;
  try {
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl.startsWith("data:")) return;
    MEM.set(clean, dataUrl);
    try {
      const db = await idb();
      if (db) {
        await new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(dataUrl, clean);
            tx.oncomplete = () => resolve();
            (tx as any).onerror = () => resolve();
            (tx as any).onabort = () => resolve();
          } catch {
            resolve();
          }
        });
        try { db.close(); } catch {}
      }
    } catch {}
    /* Small files also ride localStorage so a wiped IDB still paints. */
    try {
      if (dataUrl.length < 900_000) localStorage.setItem(LS_PREFIX + clean, dataUrl);
    } catch {}
  } catch {}
}

/** The cached copy for this upload name, if this browser ever saved it. */
export async function getCachedDataUrl(name: string): Promise<string> {
  const clean = String(name || "").trim();
  if (!clean) return "";
  const mem = MEM.get(clean);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(LS_PREFIX + clean);
    if (raw && raw.startsWith("data:")) {
      MEM.set(clean, raw);
      return raw;
    }
  } catch {}
  try {
    const db = await idb();
    if (db) {
      const found: string = await new Promise((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, "readonly");
          const rq = tx.objectStore(IDB_STORE).get(clean);
          rq.onsuccess = () => resolve(String(rq.result || ""));
          rq.onerror = () => resolve("");
        } catch {
          resolve("");
        }
      });
      try { db.close(); } catch {}
      if (found && found.startsWith("data:")) {
        MEM.set(clean, found);
        return found;
      }
    }
  } catch {}
  return "";
}

/** Cached copy for a full upload URL ("/data/uploads/x" or absolute). Sync: memory + localStorage only. */
export function getCachedDataUrlSync(url: string): string {
  const name = uploadNameOf(url);
  if (!name) return "";
  const mem = MEM.get(name);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(LS_PREFIX + name);
    if (raw && raw.startsWith("data:")) {
      MEM.set(name, raw);
      return raw;
    }
  } catch {}
  return "";
}

/** React hook: cached copy for an upload URL, loaded from IDB when needed. */
export function useCachedUploadUrl(url: string): string {
  const name = uploadNameOf(url);
  const [cached, setCached] = useState(() => getCachedDataUrlSync(url));
  useEffect(() => {
    if (!name || cached) return;
    let alive = true;
    getCachedDataUrl(name).then((v) => {
      if (alive && v) setCached(v);
    }).catch(() => {});
    return () => { alive = false; };
  }, [name]);
  return cached;
}

/** True when this URL is an office-server upload (needs the disk to exist). */
export function isOfficeUploadUrl(url: string): boolean {
  return !!uploadNameOf(url);
}

/* Session preview: the exact bytes just uploaded, as a same-tab object URL.
   This is what makes an upload paint INSTANTLY — the preview never waits on
   the server GET, so a slow/wiped/unreachable disk can never blank the admin
   right after a successful upload. Keyed by upload name (server names are
   unique per upload); the previous object URL for a name is revoked. */
const sessionPreviews = new Map<string, string>();
export function rememberUploadPreview(name: string, blob: Blob): string {
  const clean = String(name || "").trim();
  if (!clean || !blob || !(blob as any).size) return "";
  try {
    const prev = sessionPreviews.get(clean);
    if (prev) {
      try { URL.revokeObjectURL(prev); } catch {}
    }
    const url = URL.createObjectURL(blob);
    sessionPreviews.set(clean, url);
    return url;
  } catch {
    return "";
  }
}

export function forgetUploadPreview(name: string): void {
  const clean = String(name || "").trim();
  if (!clean) return;
  try {
    const prev = sessionPreviews.get(clean);
    if (prev) {
      try { URL.revokeObjectURL(prev); } catch {}
      sessionPreviews.delete(clean);
    }
  } catch {}
}

/** Drop every same-browser copy of an upload: session bytes, IDB + memory + localStorage cache. Never throws. */
export async function forgetCachedUpload(name: string): Promise<void> {
  const clean = String(name || "").trim();
  if (!clean) return;
  try { MEM.delete(clean); } catch {}
  try { localStorage.removeItem(LS_PREFIX + clean); } catch {}
  try {
    const db = await idb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).delete(clean);
          tx.oncomplete = () => resolve();
          (tx as any).onerror = () => resolve();
          (tx as any).onabort = () => resolve();
        } catch {
          resolve();
        }
      });
      try { db.close(); } catch {}
    }
  } catch {}
}
/** Sync read of the session preview for a full upload URL ("" when none). */
export function sessionPreviewForUrl(url: string): string {
  const name = uploadNameOf(url);
  if (!name) return "";
  return sessionPreviews.get(name) || "";
}

/** React hook: the session preview for an upload URL, if this tab uploaded it. */
export function useUploadPreviewUrl(url: string): string {
  const name = uploadNameOf(url);
  const [preview, setPreview] = useState(() => sessionPreviewForUrl(url));
  useEffect(() => {
    setPreview(sessionPreviewForUrl(url));
  }, [name, url]);
  return preview;
}

/* Same-copy fallback for absolute office addresses: an upload stored as
   https://old-host/data/uploads/x paints THIS copy's /data/uploads/x when the
   absolute address fails (host moved, disk wiped here-not-there, relayed live
   copy). Same file names are unique per upload, so the same name is the same
   bytes on every copy that holds it. "" unless the URL is absolute. */
export function localUploadFallback(url: string): string {
  const s = String(url || "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  const m = /\/(data\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*)/.exec(s);
  if (!m) return "";
  return "/" + m[1];
}

/* Feed-backed durability (wipe survival): the baked feed address plus the
   baked uploads layout, resolved once per session. [] when no feed is baked
   (rebuild-only copies behave exactly as before). Never throws. */
let feedSpecCache: { spec: any; dir: string } | null | undefined = undefined;
let feedSpecCachedAt = 0;
export async function feedUrlsForUpload(name: string): Promise<string[]> {
  const clean = String(name || "").trim();
  if (!clean) return [];
  try {
    if (feedSpecCache === undefined || (feedSpecCache === null && Date.now() - feedSpecCachedAt > 30_000)) {
      const [spec, dir] = await Promise.all([bakedFeedSpec(), bakedFeedUploadsDir()]);
      feedSpecCache = spec ? { spec, dir } : null;
      feedSpecCachedAt = Date.now();
    }
    if (!feedSpecCache) return [];
    return feedUploadUrls(feedSpecCache.spec, clean, feedSpecCache.dir);
  } catch {
    return [];
  }
}

/** React hook: repo-copy URLs for an upload URL, once the baked feed resolves. */
export function useFeedUploadUrl(url: string): string {
  const name = uploadNameOf(url);
  const [feed, setFeed] = useState("");
  useEffect(() => {
    if (!name) return;
    let alive = true;
    feedUrlsForUpload(name).then((urls) => {
      if (alive && urls.length) setFeed(urls[0]);
    }).catch(() => {});
    return () => { alive = false; };
  }, [name]);
  return feed;
}

/** React hook: BOTH repo-copy URLs (raw + jsdelivr) so a missing raw still
    paints from the mirror instead of blank. Never throws. */
export function useFeedUploadUrls(url: string): string[] {
  const name = uploadNameOf(url);
  const [feeds, setFeeds] = useState<string[]>([]);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    feedUrlsForUpload(name).then((urls) => {
      if (alive) setFeeds(urls);
    }).catch(() => {});
    return () => { alive = false; };
  }, [name]);
  return feeds;
}

/* Recent uploads (no-copy reuse): every successful upload in any field is
   remembered here (name + stored address, newest first, capped), so every
   photo field can offer a one-tap "Recent uploads" strip — a picture uploaded
   for a slide or a leader lands in Photos & banners with one tap, never a
   copied link. Names/addresses ride localStorage; bytes reuse the session
   preview and the IDB/data-URL cache above. Never throws. */
export type RecentUpload = { name: string; url: string; at: number };
const RECENT_KEY = "wom.recentUploads";
const RECENT_CAP = 12;
let recentCache: RecentUpload[] | null = null;
const recentSubs = new Set<() => void>();
function readRecentUploads(): RecentUpload[] {
  if (recentCache) return recentCache;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    recentCache = Array.isArray(list)
      ? list.filter((x) => x && typeof x.name === "string" && typeof x.url === "string").slice(0, RECENT_CAP)
      : [];
  } catch {
    recentCache = [];
  }
  return recentCache;
}
export function rememberRecentUpload(name: string, url: string): void {
  const n = String(name || "").trim();
  const u = String(url || "").trim();
  if (!n || !u) return;
  try {
    const list = readRecentUploads().filter((x) => x.name !== n);
    list.unshift({ name: n, url: u, at: Date.now() });
    recentCache = list.slice(0, RECENT_CAP);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentCache)); } catch {}
    recentSubs.forEach((fn) => { try { fn(); } catch {} });
  } catch {}
}
/** Drop an upload from the recent strip (replaced uploads leave no link behind). Never throws. */
export function forgetRecentUpload(name: string): void {
  const n = String(name || "").trim();
  if (!n) return;
  try {
    recentCache = readRecentUploads().filter((x) => x.name !== n);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentCache)); } catch {}
    recentSubs.forEach((fn) => { try { fn(); } catch {} });
  } catch {}
}
/** Best same-browser bytes for a recent upload, sync: session, cache, stored. */
export function recentUploadThumb(url: string): string {
  try {
    return sessionPreviewForUrl(url) || getCachedDataUrlSync(url) || String(url || "");
  } catch {
    return String(url || "");
  }
}
/** The remembered uploads, live-updating; kind filters films out of (or into) the strip. */
export function useRecentUploads(kind?: "image" | "video"): RecentUpload[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((v) => v + 1);
    recentSubs.add(fn);
    return () => { recentSubs.delete(fn); };
  }, []);
  const all = readRecentUploads();
  if (!kind) return all;
  const isFilm = (r: RecentUpload) => /\.(mp4|m4v|webm|ogv|ogg|mov)(\?|#|$)/i.test(r.name || "");
  return all.filter((r) => (kind === "video" ? isFilm(r) : !isFilm(r)));
}

export { dataUrlToBlob };
