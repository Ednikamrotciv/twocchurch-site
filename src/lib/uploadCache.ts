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
    /* Chunked decode: one giant atob string + charCodeAt loop on a
       tens-of-MB video blocks the tab and can OOM — decode in slices. */
    const slice = 32768;
    const bytes = new Uint8Array(Math.ceil((b64.length * 3) / 4));
    let ptr = 0;
    for (let i = 0; i < b64.length; i += slice) {
      const chunk = b64.slice(i, i + slice);
      const bin = atob(chunk);
      for (let j = 0; j < bin.length; j++) bytes[ptr++] = bin.charCodeAt(j);
    }
    return new Blob([bytes.slice(0, ptr)], { type });
  } catch {
    return null;
  }
}

/** Async variant — lets the browser stream the decode off the hot path. */
export function dataUrlToBlobAsync(dataUrl: string): Promise<Blob | null> {
  try {
    return fetch(dataUrl).then((r) => (r.ok ? r.blob() : null)).catch(() => dataUrlToBlob(dataUrl));
  } catch {
    return Promise.resolve(dataUrlToBlob(dataUrl));
  }
}

export function uploadNameOf(url: string): string {
  const m = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(String(url || ""));
  return m ? m[1] : "";
}

/** Keep the last upload for this name in this browser. Never throws. */
export async function cacheUploadBlob(name: string, blob: Blob): Promise<void> {
  const clean = String(name || "").trim();
  if (!clean || !blob || !(blob as any).size) return;
  try {
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl.startsWith("data:")) return;
    MEM.set(clean, dataUrl);
    /* Bound the offline copy: a phone video can be hundreds of MB and
       would blow the IndexedDB quota and evict everything else. */
    if (dataUrl.length > 48_000_000) return;
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

/* Feed-backed durability (wipe survival): the baked feed address plus the
   baked uploads layout, resolved once per session. [] when no feed is baked
   (rebuild-only copies behave exactly as before). Never throws. */
let feedSpecCache: { spec: any; dir: string } | null | undefined = undefined;
export async function feedUrlsForUpload(name: string): Promise<string[]> {
  const clean = String(name || "").trim();
  if (!clean) return [];
  try {
    if (feedSpecCache === undefined) {
      const [spec, dir] = await Promise.all([bakedFeedSpec(), bakedFeedUploadsDir()]);
      feedSpecCache = spec ? { spec, dir } : null;
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

export { dataUrlToBlob };
