import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ct } from "../data/copy";

/* ---------- reactive local storage ---------- */

const bus = new Map<string, Set<(v: any) => void>>();

function publish(key: string, value: any) {
  bus.get(key)?.forEach((fn) => fn(value));
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStore<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    publish(key, value);
    return true;
  } catch (err) {
    return false;
  }
}

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStore(key, initial));
  const initialRef = useRef(initial);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /* Other tabs must not resurrect a choice this tab already made. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        valueRef.current = e.newValue === null ? initialRef.current : (JSON.parse(e.newValue) as T);
      } catch {
        valueRef.current = initialRef.current;
      }
      setValue(valueRef.current);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  useEffect(() => {
    const fn = (v: any) => {
      valueRef.current = v as T;
      setValue(v as T);
    };
    if (!bus.has(key)) bus.set(key, new Set());
    bus.get(key)!.add(fn);
    return () => {
      bus.get(key)!.delete(fn);
    };
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      /* Read the store fresh: back-to-back taps must merge, never overwrite. */
      let current: T;
      try {
        const raw = localStorage.getItem(key);
        current = raw === null ? valueRef.current : (JSON.parse(raw) as T);
      } catch {
        current = valueRef.current;
      }
      const resolved = typeof next === "function" ? (next as (p: T) => T)(current) : next;
      valueRef.current = resolved;
      if (!writeStore(key, resolved)) {
        fireToast(ct("site.toastStorageFull"), "error");
      }
      setValue(resolved);
    },
    [key]
  );

  const reset = useCallback(() => {
    /* Reset means back to the choice already stored, not a blank slate: the
       only writer of a dismissal is the visitor's own tap, so wiping the key
       would resurrect a notice they cancelled. */
    let current: T;
    try {
      const raw = localStorage.getItem(key);
      current = raw === null ? initialRef.current : (JSON.parse(raw) as T);
    } catch {
      current = initialRef.current;
    }
    valueRef.current = current;
    setValue(current);
    publish(key, current);
  }, [key]);

  return [value, set, reset] as const;
}

/* Which shipped code is running here — the office can read it in
   version.json, and in the browser console as window.__womBuild. Bump NOTES with
   every SPEC note so a stale deploy is spotted, not guessed (note 244). */
export const BUILD_NOTES = 401;
export const BUILD_DATE = "2026-10-12";
export function buildStamp() {
  return { notes: BUILD_NOTES, built: BUILD_DATE };
}
if (typeof window !== "undefined") {
  (window as unknown as { __womBuild?: { notes: number; built: string } }).__womBuild = buildStamp();
}

/* ---------- toasts (module level so any code can fire one) ---------- */

export type ToastKind = "info" | "success" | "error";
export type ToastItem = { id: number; message: string; kind: ToastKind };
let toastId = 1;
const toastListeners = new Set<(t: ToastItem[]) => void>();
let toasts: ToastItem[] = [];

export function fireToast(message: string, kind: ToastKind = "info") {
  const item = { id: toastId++, message, kind };
  toasts = [...toasts, item];
  toastListeners.forEach((fn) => fn(toasts));
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    toastListeners.forEach((fn) => fn(toasts));
  }, 4600);
}

export function useToasts() {
  const [list, setList] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    toastListeners.add(setList);
    return () => {
      toastListeners.delete(setList);
    };
  }, []);
  return list;
}

/* ---------- media / preferences ---------- */

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const fn = () => setMatches(mql.matches);
    fn();
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

export function useReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/* Singleton 30s auto-flip clock (notes 273-276): one ticker for the whole tab,
   shared by every useTheme caller, so mounting/unmounting the header never
   spawns extra timers. Default is the switch itself: it flips every 30s. A
   manual pick locks that mode for the session (auto stops) until a reload,
   which drops straight back into the 30s switching. */
let themeAutoId: number | null = null;
let themeLastChange = 0;
let themeManualLocked = false;
let themeBooted = false;

export function useTheme() {
  const [theme, setThemeRaw] = useLocalState<"dark" | "light">("wom.theme", "dark");
  /* Default is the 30s switching (note 276): a tapped mode stays put for the
     session (auto off) until a reload returns to the switching. A stored
     value that is not exactly dark or light is thrown out in favour of dark
     (note 244). The flip only writes the theme key — header open/menu/scroll
     state is untouched, so there is no header interference (note 273). */
  const safe = theme === "light" ? "light" : "dark";
  useEffect(() => {
    document.documentElement.dataset.theme = safe;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", safe === "light" ? "#f7f1e4" : "#08080a");
  }, [safe]);
  /* Keep the flip clock in step with real changes (manual or auto). */
  useEffect(() => {
    themeLastChange = Date.now();
  }, [safe]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (themeAutoId !== null) return;
    themeAutoId = 1;
    /* Fresh page load: unlock and rejoin the 30s switching from wherever the
       stored mode is (dark if nothing valid is stored). Last session's tap
       never carries over as a lock. */
    if (!themeBooted) {
      themeBooted = true;
      themeManualLocked = false;
      themeLastChange = Date.now();
      try {
        const cur = readStore<unknown>("wom.theme", "dark");
        if (cur !== "dark" && cur !== "light") writeStore("wom.theme", "dark");
      } catch {}
    }
    themeAutoId = window.setInterval(() => {
      if (themeManualLocked) return;
      if (Date.now() - themeLastChange < 30_000) return;
      const cur = readStore<"dark" | "light">("wom.theme", "dark");
      const safeCur = cur === "light" ? "light" : "dark";
      writeStore("wom.theme", safeCur === "dark" ? "light" : "dark");
      themeLastChange = Date.now();
    }, 1000);
    return () => {};
  }, []);
  const lockManual = useCallback(() => {
    themeManualLocked = true;
    themeLastChange = Date.now();
  }, []);
  const toggle = useCallback(() => {
    lockManual();
    setThemeRaw((t) => (t === "dark" ? "light" : "dark"));
  }, [setThemeRaw, lockManual]);
  const setTheme = useCallback(
    (v: "dark" | "light" | ((p: "dark" | "light") => "dark" | "light")) => {
      lockManual();
      setThemeRaw(v as any);
    },
    [setThemeRaw, lockManual]
  );
  return { theme: safe, setTheme, toggle };
}

/* ---------- clock ---------- */

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useCountdown(target: number | null) {
  const now = useNow(1000);
  if (target === null) return null;
  const diff = Math.max(0, target - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    total: diff,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/* ---------- dom helpers ---------- */

export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: { threshold?: number; once?: boolean }) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            if (options?.once !== false) obs.unobserve(el);
          } else if (options?.once === false) {
            el.classList.remove("is-visible");
          }
        });
      },
      { threshold: options?.threshold ?? 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    // Safety net: if the observer never fires (wedged preview, screenshot tools,
    // exotic browsers) the content still becomes visible instead of staying hidden.
    const fallback = window.setTimeout(() => el.classList.add("is-visible"), 2500);
    return () => {
      obs.disconnect();
      window.clearTimeout(fallback);
    };
  }, [reduced, options?.threshold, options?.once]);
  return ref;
}

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onOutside]);
  return ref;
}

export function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const parts = combo.toLowerCase().split("+");
    const needCtrl = parts.includes("ctrl") || parts.includes("cmd") || parts.includes("mod");
    const needShift = parts.includes("shift");
    const key = parts[parts.length - 1];
    const fn = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (needCtrl && !mod) return;
      if (!needCtrl && mod) return;
      if (needShift && !e.shiftKey) return;
      if (e.key.toLowerCase() !== key && e.code.toLowerCase() !== "key" + key) return;
      handler(e);
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [combo, handler]);
}

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  /* True only when the visitor has reached the foot of the page — the
     scroll-to-top pill lives on this, so it appears at the bottom only. */
  const [atBottom, setAtBottom] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
      setScrolled(h.scrollTop > 24);
      setAtBottom(max > 200 && h.scrollHeight - (h.scrollTop + h.clientHeight) < 160);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return { progress, scrolled, atBottom };
}

export function useStaticValue<T>(factory: () => T): T {
  return useMemo(factory, []);
}

export function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
