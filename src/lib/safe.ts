/* safe.ts — never-throw helpers + future-error locks (note 440).
   Every helper here keeps a poisoned value from becoming a crash card:
   malformed storage, a half-loaded chunk after a deploy, or a render that
   throws twice on the same address. Callers stay unchanged when data is
   healthy — these only decide what happens when it is not. */

export function safeString(v: unknown, fallback = ""): string {
  try {
    if (typeof v === "string") return v;
    if (v === null || v === undefined) return fallback;
    return String(v);
  } catch {
    return fallback;
  }
}

export function asArray<T>(v: unknown): T[] {
  try {
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function safeParse<T>(raw: unknown, fallback: T): T {
  try {
    if (typeof raw !== "string") return fallback;
    const t = raw.trim();
    if (!t) return fallback;
    return JSON.parse(t) as T;
  } catch {
    return fallback;
  }
}

/* A lazy chunk that fails after a deploy (new files, old shell) must never
   become a crash card: retry a few times, then let the boundary hard-reload
   onto the new files. */
export function retryLazyImport<T>(loader: () => Promise<T>, retries = 3): () => Promise<T> {
  return async () => {
    let last: unknown = null;
    for (let i = 0; i <= retries; i++) {
      try {
        return await loader();
      } catch (err) {
        last = err;
        if (isChunkLoadError(err) && i < retries) {
          try {
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
          } catch {}
          continue;
        }
        throw err;
      }
    }
    throw last instanceof Error ? last : new Error("chunk load failed");
  };
}

export function isChunkLoadError(err: unknown): boolean {
  try {
    const m = String((err as any)?.message || err || "");
    return (
      /loading chunk/i.test(m) ||
      /loading css chunk/i.test(m) ||
      /chunkloaderror/i.test(m) ||
      /failed to fetch dynamically imported module/i.test(m) ||
      /importing a module script failed/i.test(m) ||
      /dynamically imported module/i.test(m)
    );
  } catch {
    return false;
  }
}

/* Crash-loop breaker: the same address crashing over and over must end on a
   safe page, never on the same card forever. Counts live in localStorage so
   they survive the hard reloads that fix single crashes. */
const LOOP_KEY = "wom.crashLoop";
const LOOP_MAX = 3;
const LOOP_MS = 5 * 60 * 1000;

type LoopRec = { route: string; count: number; at: number };

function readLoop(): LoopRec | null {
  try {
    const raw = localStorage.getItem(LOOP_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (!r || typeof r.route !== "string" || typeof r.count !== "number" || typeof r.at !== "number") return null;
    return r as LoopRec;
  } catch {
    return null;
  }
}

export function recordCrash(route: string): LoopRec {
  const now = Date.now();
  try {
    const prev = readLoop();
    const rec: LoopRec =
      prev && prev.route === route && now - prev.at < LOOP_MS
        ? { route, count: prev.count + 1, at: now }
        : { route, count: 1, at: now };
    try {
      localStorage.setItem(LOOP_KEY, JSON.stringify(rec));
    } catch {}
    return rec;
  } catch {
    return { route, count: 1, at: now };
  }
}

export function crashLooping(route: string): boolean {
  try {
    const rec = readLoop();
    if (!rec || rec.route !== route) return false;
    if (Date.now() - rec.at > LOOP_MS) return false;
    return rec.count >= LOOP_MAX;
  } catch {
    return false;
  }
}

export function clearCrashLoop() {
  try {
    localStorage.removeItem(LOOP_KEY);
  } catch {}
}

/* The last crash, kept for the office (never throws, never grows): message +
   route + time so the next screenshot is not the only evidence. */
const LAST_KEY = "wom.lastError";

export function rememberError(err: unknown, route: string) {
  try {
    const message = String((err as any)?.message || err || "unknown").slice(0, 300);
    const stack = String((err as any)?.stack || "").slice(0, 800);
    localStorage.setItem(LAST_KEY, JSON.stringify({ message, stack, route: String(route || "").slice(0, 120), at: Date.now() }));
  } catch {}
}

export function readLastError(): { message: string; route: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (!r || typeof r.message !== "string") return null;
    return { message: r.message, route: String(r.route || ""), at: typeof r.at === "number" ? r.at : 0 };
  } catch {
    return null;
  }
}
