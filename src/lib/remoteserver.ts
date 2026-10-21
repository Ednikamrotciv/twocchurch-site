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
      else {
        /* Same-origin backend first (note 434): the host serving this page is
           awake by definition, and it may serve /__cms even when no address
           was ever baked in. Pure static hosts answer no JSON here, so the
           probe stays negative there and nothing changes. */
        try {
          const origin = sameOriginRoot();
          if (origin && (await probeCandidate(origin, 2200).catch(() => false))) cached = origin;
          else cached = (await probeLocalOffice().catch(() => "")) || "";
        } catch {
          cached = (await probeLocalOffice().catch(() => "")) || "";
        }
      }
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

/* ------------------------------------------------- same-origin backend */

/* A host that serves the site through scripts/serve.mjs answers /__cms on
   its own origin (note 434) — the page is already talking to that machine,
   so it is awake by definition. This is the fallback that keeps visitor
   copies joined when the baked office address is dead (typo'd, retired) or
   was never baked in: one publish then still reaches every visitor instead
   of stranding remote phones and desktops on the notice. Pure static hosts
   answer no JSON here, so the probe stays negative there and nothing
   changes. A slow answer (a waking host) counts as unknown, never as dead —
   the baked address is only retired on a fast, definitive refusal, so a
   sleeping backend is woken and kept, never abandoned. */
function sameOriginRoot(): string {
  try {
    if (typeof window === "undefined" || !window.location) return "";
    const o = window.location.origin;
    if (!/^https?:\/\/[^/\s]+$/i.test(o)) return "";
    return o;
  } catch { return ""; }
}

/** One-shot join: leave a configured address alone, else join a same-origin
    backend when this host serves one. Never throws. */
export async function adoptSameOrigin(timeoutMs = 2200): Promise<boolean> {
  try {
    if (serverOverride()) return false;
    await initServerUrl();
    if (cached) return false;
    const origin = sameOriginRoot();
    if (!origin) return false;
    if (await probeCandidate(origin, timeoutMs).catch(() => false)) {
      cached = origin;
      return true;
    }
    return false;
  } catch { return false; }
}

/** After repeated connect failures, re-home once per boot: a baked address
    that refuses fast is dead (typo'd/retired) — join the same-origin backend
    when this host serves one. A slow answer is a waking backend, so it is
    kept. Never throws; true when the cached address changed. */
let rehomedThisBoot = false;
export async function maybeRehomeAfterFailure(): Promise<boolean> {
  try {
    if (rehomedThisBoot) return false;
    if (serverOverride()) return false;
    await initServerUrl();
    const baked = cached;
    if (!baked) {
      const ok = await adoptSameOrigin().catch(() => false);
      if (ok) rehomedThisBoot = true;
      return ok;
    }
    const start = Date.now();
    const alive = await probeCandidate(baked, 4000).catch(() => false);
    const fast = Date.now() - start < 1500;
    if (alive || !fast) return false;
    const origin = sameOriginRoot();
    if (!origin || origin === baked) return false;
    if (await probeCandidate(origin, 2500).catch(() => false)) {
      cached = origin;
      rehomedThisBoot = true;
      return true;
    }
    return false;
  } catch { return false; }
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
export function createRemoteSocket(base: string, connId?: string): any {
  const root = String(base || "").replace(/\/+$/, "");
  /* HIGH fix: the file doors (/__upload, /__restore-file, /__delete-file) now
     require a signed-in admin conn — the tab sends this same id with those
     requests, so the server can tell the office apart from strangers. */
  const conn = typeof connId === "string" && connId ? connId : "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const connIdFinal = conn;
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
    const res = await fetch(root + "/__cms/" + method + "?conn=" + encodeURIComponent(connIdFinal), {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: arg === undefined || arg === null ? "" : String(arg),
    });
    if (!res.ok) throw new Error("rpc " + method + ": http " + res.status);
    return res.text();
  }
  let es: EventSource | null = null;
  try {
    es = new EventSource(root + "/__cms/events?conn=" + encodeURIComponent(connIdFinal));
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
    connId: connIdFinal,
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
