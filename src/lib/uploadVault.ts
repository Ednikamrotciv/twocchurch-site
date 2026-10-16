/* uploadVault.ts — the browser-side upload bytes vault (note 415).
   Words survive sleep through the baked seed + the localStorage cache, but
   upload BYTES do not: a photo is a separate file, and when the host sleeps
   (Render free wipes the disk) or the browser goes offline, the
   `/data/uploads/...` fetch fails and every page with that photo goes blank.
   The vault keeps the bytes the browser has already seen, so the last
   published stays whole offline and across a sleep: once a photo or film has
   loaded once, it paints from the vault until the server has it again.
   Backed by the Cache Storage API (`wom-uploads-v1`) — per-origin,
   persistent across sleep, big enough for films — with a bundled welcome
   photo as the last resort instead of a black box. Never throws. */

import { siteFile } from "./livefeed";

export const UPLOAD_VAULT = "wom-uploads-v1";
const WELCOME_FALLBACK = "src/assets/img/welcome.jpg";

/** True for an office-server upload address (relative or absolute). */
export function isUploadUrl(url: unknown): boolean {
  return typeof url === "string" && url.indexOf("/data/uploads/") >= 0;
}

/** The file name inside a `/data/uploads/<file>` address, or "". */
export function uploadNameOf(url: string): string {
  if (typeof url !== "string") return "";
  const m = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(url);
  return m ? m[1] : "";
}

/** Every upload file a content snapshot points at. Pure for the verifier. */
export function listUploadNames(content: unknown): string[] {
  const seen = new Set<string>();
  try {
    const re = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;
    const text = JSON.stringify(content);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) seen.add(m[1]);
  } catch {
    /* unstringifiable content names nothing */
  }
  return [...seen];
}

function vaultCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined" || !caches.open) return Promise.resolve(null);
    return caches.open(UPLOAD_VAULT).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/** Store one upload's bytes from a same-origin response. Best effort. */
async function vaultPut(name: string): Promise<boolean> {
  try {
    const cache = await vaultCache();
    if (!cache) return false;
    const req = new Request("/data/uploads/" + name);
    try {
      const hit = await cache.match(req).catch(() => null);
      if (hit) return true;
    } catch {
      /* match failed — fetch below */
    }
    const res = await fetch(req, { cache: "no-store" } as RequestInit).catch(() => null);
    if (!res || !res.ok) return false;
    try {
      await cache.put(req, res.clone());
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

let precacheAt = 0;
let precacheRunning = false;
const PRECACHE_MIN_MS = 30 * 1000;

/** Keep every upload the snapshot names in the vault (note 415). Throttled,
    fire-and-forget — call after every content paint and on every reconnect. */
export function ensureVaultForSnapshot(snap: unknown): void {
  try {
    const now = Date.now();
    if (precacheRunning || now - precacheAt < PRECACHE_MIN_MS) return;
    precacheAt = now;
    precacheRunning = true;
    const names = listUploadNames(snap);
    if (!names.length) {
      precacheRunning = false;
      return;
    }
    (async () => {
      for (const name of names.slice(0, 60)) {
        try {
          await vaultPut(name);
        } catch {
          /* one file never sinks the vault */
        }
      }
    })()
      .catch(() => {})
      .finally(() => {
        precacheRunning = false;
      });
  } catch {
    precacheRunning = false;
  }
}

/** A cached upload as a blob URL for an <img>/<video> fallback, or null. */
export async function vaultBlobUrl(url: string): Promise<string | null> {
  try {
    const name = uploadNameOf(url);
    if (!name) return null;
    const cache = await vaultCache();
    if (!cache) return null;
    const hit = await cache.match(new Request("/data/uploads/" + name)).catch(() => null);
    if (!hit) return null;
    const blob = await hit.blob().catch(() => null);
    if (!blob || !blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

let fallbackInstalled = false;

/** Failed upload images fall back to the vault, then the welcome photo —
    never a blank frame (note 415). One capture-phase listener for the page. */
export function installUploadFallback(): void {
  if (fallbackInstalled) return;
  fallbackInstalled = true;
  try {
    document.addEventListener(
      "error",
      (ev: Event) => {
        try {
          const el = ev.target as HTMLElement | null;
          if (!el || (el.tagName !== "IMG" && el.tagName !== "VIDEO" && el.tagName !== "SOURCE")) return;
          const src = (el as HTMLImageElement).src || (el as HTMLImageElement).currentSrc || el.getAttribute("src") || "";
          if (!isUploadUrl(src)) return;
          if ((el as HTMLElement).dataset.vaultTried === "1") {
            if (el.tagName === "IMG" && !(el as HTMLElement).dataset.vaultFellBack) {
              try {
                (el as HTMLElement).dataset.vaultFellBack = "1";
                (el as HTMLImageElement).src = siteFile(WELCOME_FALLBACK);
              } catch {
                /* the broken frame stands */
              }
            }
            return;
          }
          try {
            (el as HTMLElement).dataset.vaultTried = "1";
          } catch {
            /* dataset unwritable — try once anyway */
          }
          vaultBlobUrl(src)
            .then((blobUrl) => {
              try {
                if (blobUrl) {
                  if (el.tagName === "SOURCE") {
                    el.setAttribute("src", blobUrl);
                    const video = el.parentElement as HTMLVideoElement | null;
                    try {
                      video?.load();
                    } catch {
                      /* the player keeps its state */
                    }
                  } else {
                    (el as HTMLImageElement).src = blobUrl;
                  }
                } else if (el.tagName === "IMG") {
                  (el as HTMLElement).dataset.vaultFellBack = "1";
                  (el as HTMLImageElement).src = siteFile(WELCOME_FALLBACK);
                }
              } catch {
                /* the broken frame stands */
              }
            })
            .catch(() => {});
        } catch {
          /* the broken frame stands */
        }
      },
      true
    );
  } catch {
    /* a browser that refuses events keeps the standing behavior */
  }
}
