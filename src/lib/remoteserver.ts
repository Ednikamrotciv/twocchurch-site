/* ============================================================================
   remoteserver.ts — talking to the office's own server from anywhere.

   The content backend is the same everywhere (the server plugin on
   perchance.org, the dev/office server locally). A deployed copy has no
   backend of its own — unless the office points it at one: either baked in
   at deploy time (cms-server.txt → dist/server.json, read below) or typed
   into the admin console (kept in this browser only). Then sign-in,
   publishing, uploads and live updates work on the deployed site exactly
   like they do locally, against the one shared store.
   ========================================================================== */

/** This browser's manual override (the admin console sets it). */
const OVERRIDE_KEY = "wom.cms.server";
/** The deploy-time address, written by scripts/build-static.mjs. */
const SITE_FILE = "server.json";

let cached = "";
let loaded = false;

/** An office address is an origin: https://office.example.com — nothing else. */
export function normalizeServerUrl(value: unknown): string {
  const v = String(value == null ? "" : value).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/i.test(v)) return "";
  return v;
}

/** This browser's override, or "" — the admin console writes it. */
export function serverOverride(): string {
  try {
    return normalizeServerUrl(localStorage.getItem(OVERRIDE_KEY));
  } catch {
    return "";
  }
}

export function setServerOverride(url: string) {
  try {
    const clean = normalizeServerUrl(url);
    if (clean) localStorage.setItem(OVERRIDE_KEY, clean);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* a browser that stores nothing still reads the site */ }
}

/* The deploy's own address, once — missing on local runs and on perchance.org
   (where the platform socket rules and no file is shipped). */
async function siteServer(): Promise<string> {
  try {
    if ((window as any).generatorName) return "";
  } catch {
    return "";
  }
  try {
    const res = await fetch(SITE_FILE, { cache: "no-store" });
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    return normalizeServerUrl(data && (data.url || data.server));
  } catch {
    return "";
  }
}

/** Resolve once at boot (override first, then the deploy's file). */
export async function initServerUrl(): Promise<string> {
  if (!loaded) {
    loaded = true;
    cached = serverOverride() || (await siteServer());
  }
  return cached;
}

/** The resolved office address, or "" when this copy stands alone. */
export function serverUrl(): string {
  return cached || serverOverride();
}

/* A content socket over plain HTTPS to the office server: the same shape as
   the local shim (scripts/local-shim.js) — an opened promise, an rpc proxy
   and open/message/close events — so cms.ts treats it identically. CORS on
   the server side makes the browser allow it (no cookies, no credentials). */
export function createRemoteSocket(base: string): any {
  const root = String(base || "").replace(/\/+$/, "");
  const connId = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const listeners: Record<string, ((ev: any) => void)[]> = {};
  let openedOnce = false;
  let failTimer = 0;
  let openedResolve!: () => void;
  let openedReject!: (err: any) => void;
  const opened = new Promise<void>((res, rej) => {
    openedResolve = res;
    openedReject = rej;
  });
  const fire = (type: string, ev: any) => {
    (listeners[type] || []).slice().forEach((fn) => {
      try {
        fn(ev);
      } catch (err) {
        setTimeout(() => {
          throw err;
        }, 0);
      }
    });
  };
  async function call(method: string, arg: any): Promise<string> {
    const res = await fetch(root + "/__cms/" + method + "?conn=" + encodeURIComponent(connId), {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: arg === undefined || arg === null ? "" : String(arg),
    });
    if (!res.ok) throw new Error("rpc " + method + ": http " + res.status);
    return res.text();
  }
  let es: EventSource | null = null;
  try {
    es = new EventSource(root + "/__cms/events?conn=" + encodeURIComponent(connId));
  } catch (err) {
    openedReject(err);
  }
  if (es) {
    es.onopen = () => {
      if (failTimer) {
        clearTimeout(failTimer);
        failTimer = 0;
      }
      fire("open", {});
      if (!openedOnce) {
        openedOnce = true;
        openedResolve();
      }
    };
    es.onmessage = (m) => fire("message", { data: (m as MessageEvent).data });
    es.onerror = () => {
      if (!openedOnce) {
        try {
          es && es.close();
        } catch {}
        openedReject(new Error("office server unreachable"));
      } else if (!failTimer) {
        failTimer = window.setTimeout(() => {
          failTimer = 0;
          fire("close", { code: 1006 });
        }, 15000);
      }
    };
  }
  const rpc = new Proxy(
    {},
    {
      get: (_, method: string) => {
        if (method === "then" || method === "catch" || method === "finally") return undefined;
        return (arg: any) => call(method, arg);
      },
    }
  );
  return {
    opened,
    rpc,
    binaryType: "arraybuffer",
    addEventListener: (t: string, fn: (ev: any) => void) => {
      (listeners[t] = listeners[t] || []).push(fn);
    },
    removeEventListener: (t: string, fn: (ev: any) => void) => {
      listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
    },
    close: () => {
      try {
        es && es.close();
      } catch {}
    },
  };
}
