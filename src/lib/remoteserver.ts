/* remoteserver.ts — reaches the office server from anywhere (same backend everywhere). */

import { siteFile } from "./livefeed";

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

/* The deploy's own address, once — missing on local runs (where the page
   talks to its own backend directly). The build also stamps it into a
   <meta name="wom-server"> tag (note 279), which is readable synchronously
   on first paint — no fetch wait, so a deployed copy knows immediately that
   it is server-backed and the maintenance gate decides correctly. */
function serverMeta(): string {
  try {
    const m = document.querySelector('meta[name="wom-server"]');
    return normalizeServerUrl(m && m.getAttribute("content"));
  } catch {
    return "";
  }
}
async function siteServer(): Promise<string> {
  const meta = serverMeta();
  if (meta) return meta;
  try {
    const res = await fetch(siteFile(SITE_FILE), { cache: "no-store" });
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

/* Re-resolve from scratch; boot's answer is cached, so this picks up late arrivals. */
export async function refreshServerUrl(): Promise<string> {
  loaded = false;
  cached = "";
  try {
    await initServerUrl();
    if (!cached) {
      const local = rememberedLocalOffice();
      if (local) cached = local;
      else cached = (await probeLocalOffice().catch(() => "")) || "";
    }
    return cached;
  } catch {
    return cached || serverOverride();
  }
}

/** The resolved office address, or "" when this copy stands alone. The baked
    meta tag is read synchronously (note 279), so even the very first paint
    on a deployed copy knows it is server-backed. */
export function serverUrl(): string {
  if (!cached) cached = serverMeta();
  return cached || serverOverride();
}

/* ------------------------------------------------------------------ same PC */

/** This browser's remembered same-machine office address (a validated probe
    winner — re-checked quickly before it is trusted again). */
const LOCAL_KEY = "wom.cms.localOffice";

function rememberedLocalOffice(): string {
  try {
    return normalizeServerUrl(localStorage.getItem(LOCAL_KEY));
  } catch {
    return "";
  }
}

function rememberLocalOffice(url: string) {
  try {
    if (url) localStorage.setItem(LOCAL_KEY, url);
    else localStorage.removeItem(LOCAL_KEY);
  } catch { /* a browser that stores nothing still reads the site */ }
}

/* The office server on its own computer: found with no address typed (loopback probe). */
const LOCAL_CANDIDATES = ["http://127.0.0.1:5173", "http://localhost:5173"];

async function probeCandidate(root: string, timeoutMs: number): Promise<boolean> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : 0;
  try {
    const res = await fetch(root + "/__cms/getContent?conn=probe-" + Math.random().toString(36).slice(2), {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: "",
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.ok === true);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
  }
}

/* Find the office server on this same machine (short budget, never throws).
   The winner is remembered so later visits skip probing; a remembered address
   that stops answering is forgotten at once. */
export async function probeLocalOffice(timeoutMs = 2500): Promise<string> {
  const known = rememberedLocalOffice();
  if (known) {
    try {
      if (await probeCandidate(known, 2000)) return known;
    } catch {}
    rememberLocalOffice("");
  }
  try {
    const hits = await Promise.all(LOCAL_CANDIDATES.map((c) => probeCandidate(c, timeoutMs)));
    for (let i = 0; i < LOCAL_CANDIDATES.length; i++) {
      if (hits[i]) {
        rememberLocalOffice(LOCAL_CANDIDATES[i]);
        return LOCAL_CANDIDATES[i];
      }
    }
  } catch {}
  return "";
}

/* HTTPS content socket shaped like the local shim, so cms.ts treats both alike. */
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
