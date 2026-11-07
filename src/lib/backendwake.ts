/* backendwake.ts — wake a sleeping backend exactly once, then join it.
   One shared promise per backend address (single-flight): the boot join, the
   return-join, the server watch and the manual retry all funnel through the
   same wait instead of waking the box four times. Exponential backoff with
   jitter, paused while the tab is hidden, aborted while offline; the visitor
   stays on their page throughout, reading the last published paint. */

export type WakePhase = "idle" | "waking" | "ready" | "failed";
export type WakeState = {
  phase: WakePhase;
  /** 1-based attempt count while waking. */
  attempt: number;
  /** Human line for the banner (never an error dump). */
  detail: string;
  base: string;
};

type Listener = (s: WakeState) => void;
const listeners = new Set<Listener>();
let current: WakeState = { phase: "idle", attempt: 0, detail: "", base: "" };

function emit(next: WakeState) {
  current = next;
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {}
  });
}

export function wakeSnapshot(): WakeState {
  return current;
}

export function subscribeWake(fn: Listener): () => void {
  listeners.add(fn);
  try {
    fn(current);
  } catch {}
  return () => {
    listeners.delete(fn);
  };
}

const inflight = new Map<string, Promise<boolean>>();
const MAX_ATTEMPTS = 20;
const READY_TIMEOUT_MS = 9000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitVisible(): Promise<void> {
  try {
    if (typeof document === "undefined" || document.visibilityState === "visible") return Promise.resolve();
    return new Promise((resolve) => {
      const onVis = () => {
        if (document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVis);
          resolve();
        }
      };
      document.addEventListener("visibilitychange", onVis);
    });
  } catch {
    return Promise.resolve();
  }
}

function waitOnline(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve();
    return new Promise((resolve) => {
      const onUp = () => {
        window.removeEventListener("online", onUp);
        resolve();
      };
      window.addEventListener("online", onUp);
    });
  } catch {
    return Promise.resolve();
  }
}

async function fetchReady(base: string): Promise<{ http: number; body: any }> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), READY_TIMEOUT_MS) : 0;
  try {
    const res = await fetch(base.replace(/\/+$/, "") + "/api/health/ready", {
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    });
    const body = await res.json().catch(() => null);
    return { http: res.status, body };
  } finally {
    if (timer) clearTimeout(timer as any);
  }
}

/* Old backends predate /ready: a getContent that answers ok proves the box
   is awake and holding words (or a bake). Never throws. */
async function legacyProbe(base: string): Promise<boolean> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), READY_TIMEOUT_MS) : 0;
  try {
    const res = await fetch(base.replace(/\/+$/, "") + "/__cms/getContent?conn=wake-probe", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: "",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.ok === true);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer as any);
  }
}

/** Wait until the backend reports ready (or give up gracefully). Resolves
    true when joined-now is sensible, false when the page should keep serving
    its last published paint and retry in the background. */
export function ensureBackendReady(base: string): Promise<boolean> {
  const root = String(base || "").replace(/\/+$/, "");
  if (!root) return Promise.resolve(true);
  const running = inflight.get(root);
  if (running) return running;
  const job = runWake(root).catch(() => false);
  inflight.set(root, job);
  job.then(
    () => {
      inflight.delete(root);
    },
    () => {
      inflight.delete(root);
    }
  );
  return job;
}

async function runWake(root: string): Promise<boolean> {
  emit({ phase: "waking", attempt: 1, detail: "Waking the church server — your page stays right here.", base: root });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await waitOnline();
    } catch {}
    try {
      await waitVisible();
    } catch {}
    if (attempt > 1) {
      emit({
        phase: "waking",
        attempt,
        detail: attempt < 4 ? "Waking the church server — your page stays right here." : "Still waking the server — showing the latest published page meanwhile.",
        base: root,
      });
    }
    let ready = false;
    let failedStorage = "";
    try {
      const { http, body } = await fetchReady(root);
      if (http === 404) {
        /* No /ready door on this backend: fall back to the content probe. */
        ready = await legacyProbe(root);
      } else if (body && body.ok === true) {
        ready = true;
      } else if (body && body.reason === "storage-unavailable") {
        failedStorage = String(body.detail || body.reason || "storage unavailable").slice(0, 160);
      }
      /* ok:false for "empty"/cold (or a clean deploy the office has not
         published yet) is NOT failure — the baked paint stands, and the next
         round asks again. */
    } catch {
      /* Unreachable: asleep, starting, or offline — back off and re-ask. */
    }
    if (ready) {
      emit({ phase: "ready", attempt, detail: "", base: root });
      return true;
    }
    if (failedStorage) {
      emit({ phase: "failed", attempt, detail: "The server's storage needs the office — showing the latest published page.", base: root });
      return false;
    }
    /* Exponential backoff with jitter: 1s, 2s, 4s … capped at 30s. A Render
       free cold start takes ~a minute; the page is already painted, so the
       wait is invisible. */
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt - 1, 5))) + Math.random() * 500;
    await sleep(delay);
  }
  emit({ phase: "failed", attempt: MAX_ATTEMPTS, detail: "Still reaching the server in the background — you're reading the latest published page.", base: root });
  return false;
}

/** A tap that starts the wait over (the banner's button). */
export function wakeRetryNow(base: string): Promise<boolean> {
  return ensureBackendReady(String(base || ""));
}
