/* Central fault tolerance: detection + bounded recovery for the whole site.
   - Global error / unhandled-rejection capture (deduped, capped, console-visible).
   - fetchWithTimeout: every new fetch should ride this — abort timeout, bounded
     exponential backoff, retries ONLY for network-level failures on idempotent
     (GET/HEAD) requests; HTTP errors and non-GET are never retried.
   - Global image fallback: a capture-phase error listener swaps genuinely
     broken <img> (missing uploads, dead thumbs) for a neutral placeholder —
     players (.player) keep their own purpose-built stills and are skipped.
   Installed once from main.tsx; safe to call twice (module guard). */

let installed = false;

/** What we caught, newest last (in-memory cap; session ring for the office). */
export type FaultRecord = { at: number; kind: string; message: string };
const faults: FaultRecord[] = [];
const MAX_FAULTS = 50;
const DEDUPE_MS = 5_000;
let lastKey = "";
let lastAt = 0;

function record(kind: string, message: string): void {
  try {
    const msg = String(message || "unknown error").slice(0, 300);
    const key = kind + "|" + msg;
    const now = Date.now();
    if (key === lastKey && now - lastAt < DEDUPE_MS) return;
    lastKey = key;
    lastAt = now;
    faults.push({ at: now, kind, message: msg });
    if (faults.length > MAX_FAULTS) faults.splice(0, faults.length - MAX_FAULTS);
    try {
      const ring = JSON.parse(String(sessionStorage.getItem("wom.faults") || "[]"));
      const list = Array.isArray(ring) ? ring : [];
      list.push({ at: now, kind, message: msg });
      while (list.length > 20) list.shift();
      sessionStorage.setItem("wom.faults", JSON.stringify(list));
    } catch {}
  } catch {}
}

/** Recent faults for the office console (newest last). Never throws. */
export function recentFaults(): FaultRecord[] {
  try {
    return faults.slice();
  } catch {
    return [];
  }
}

/** True when the browser currently believes it is offline. */
export function isOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

export type FetchWithTimeoutOptions = {
  /** Abort after this long (ms). Default 12s; cold starts need room. */
  timeoutMs?: number;
  /** Extra tries after the first attempt (network failures only). Default 1. */
  retries?: number;
  /** First backoff wait (ms), doubles per retry. Default 800. */
  backoffMs?: number;
};

/** fetch that cannot hang forever and cannot hammer: bounded backoff, retries
    only network-level failures (DNS/reset/timeout/abort) on GET/HEAD, never
    HTTP error statuses and never non-idempotent methods. Throws the last
    error with `.code` ("timeout" | "offline" | "http-NNN"). */
export async function fetchWithTimeout(input: string, init?: RequestInit, opts?: FetchWithTimeoutOptions): Promise<Response> {
  const timeoutMs = Math.max(1_000, Math.min(120_000, Number(opts?.timeoutMs) || 12_000));
  const retries = Math.max(0, Math.min(3, Number(opts?.retries ?? 1)));
  const backoffMs = Math.max(200, Math.min(10_000, Number(opts?.backoffMs) || 800));
  const method = String((init as { method?: string } | undefined)?.method || "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD";
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      if (isOffline()) {
        const off = new Error("fetch aborted: browser is offline");
        (off as { code?: string }).code = "offline";
        throw off;
      }
      await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : 0;
    try {
      const res = await fetch(input, { ...(init || {}), signal: ctrl ? ctrl.signal : (init as { signal?: AbortSignal } | undefined)?.signal });
      if (!res.ok) {
        const http = new Error("fetch failed: http " + res.status);
        (http as { code?: string }).code = "http-" + res.status;
        throw http;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string } | null)?.code;
      /* HTTP errors and aborts we caused deliberately are final; only bare
         network failures on idempotent requests may retry. */
      if (typeof code === "string" && code.indexOf("http-") === 0) throw err;
      if (!idempotent) throw err;
      if (attempt >= retries) throw err;
    } finally {
      if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

/** Neutral placeholder a broken image falls back to (tiny inline SVG). */
export const BROKEN_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#14141c"/><g fill="none" stroke="#8a8fa3" stroke-width="10" opacity="0.8"><rect x="248" y="128" width="144" height="104" rx="14"/><circle cx="288" cy="160" r="12" fill="#8a8fa3" stroke="none"/><path d="M248 216l48-44 32 30 40-38 24 22"/></g></svg>'
  );

/** One-shot broken-image swap. Returns true when it handled the failure. */
export function swapBrokenImage(el: HTMLImageElement, fallback?: string): boolean {
  try {
    if (!el || el.tagName !== "IMG") return false;
    if (el.dataset.faultSwapped === "1") return false;
    const next = fallback || BROKEN_IMAGE_PLACEHOLDER;
    if (!next || el.src === next) return false;
    el.dataset.faultSwapped = "1";
    el.src = next;
    return true;
  } catch {
    return false;
  }
}

/** Document-level net for genuinely broken images (missing uploads, dead
    thumbs): capture phase, one swap each, then left alone. Players keep their
    own stills (skipped), so Watch/sermon fallbacks never fight this. */
export function installImageFallback(): void {
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc || (doc as unknown as Record<string, unknown>).__womImgFallback) return;
    (doc as unknown as Record<string, unknown>).__womImgFallback = true;
    doc.addEventListener(
      "error",
      (e) => {
        try {
          const t = e.target as HTMLElement | null;
          if (!t || t.tagName !== "IMG") return;
          if ((t as HTMLElement).closest && (t as HTMLElement).closest(".player")) return;
          swapBrokenImage(t as HTMLImageElement);
        } catch {}
      },
      true
    );
  } catch {}
}

/** Post-boot global handlers: every runtime error and unhandled rejection is
    recorded (deduped) instead of vanishing. The UI keeps running — ErrorBoundary
    owns the visible recovery; this owns the record. */
export function installFaultHandlers(): void {
  if (installed) return;
  installed = true;
  try {
    window.addEventListener("error", (e) => {
      try {
        const msg = (e as ErrorEvent).message || "runtime error";
        const file = (e as ErrorEvent).filename ? " @ " + String((e as ErrorEvent).filename).split("/").pop() : "";
        record("error", msg + file);
      } catch {}
    });
  } catch {}
  try {
    window.addEventListener("unhandledrejection", (e) => {
      try {
        const r = (e as PromiseRejectionEvent).reason;
        const msg = (r && (r.message || r.statusText)) || (typeof r === "string" ? r : null) || "unhandled promise rejection";
        record("rejection", String(msg));
      } catch {}
    });
  } catch {}
  installImageFallback();
}
