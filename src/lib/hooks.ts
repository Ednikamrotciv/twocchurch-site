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

export function useTheme() {
  const [theme, setTheme] = useLocalState<"dark" | "light">("wom.theme", "dark");
  /* Showcase cycle: dark is home, and the two trade places every 30 seconds —
     until the visitor picks one, which holds for this load. A reload clears
     the pick and the cycle resumes. */
  useEffect(() => {
    armThemeCycle();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f7f1e4" : "#08080a");
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [setTheme]);
  return { theme, setTheme, toggle };
}

/** Every 30s flip dark ⇄ light unless the visitor picked one this load. */
const THEME_CYCLE_MS = 30_000;
let themeCycleArmed = false;

function armThemeCycle() {
  if (themeCycleArmed || typeof window === "undefined") return;
  themeCycleArmed = true;
  /* A pick only ever holds for one load: forget it, start at dark, cycle on. */
  try {
    localStorage.removeItem("wom.theme");
  } catch {
    /* private mode — the cycle below then stands down to protect the default */
  }
  publish("wom.theme", "dark");
  window.setInterval(() => {
    let manual = true;
    try {
      manual = localStorage.getItem("wom.theme") !== null;
    } catch {
      manual = true;
    }
    if (manual) return;
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    writeStore<"dark" | "light">("wom.theme", current === "dark" ? "light" : "dark");
  }, THEME_CYCLE_MS);
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
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
      setScrolled(h.scrollTop > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return { progress, scrolled };
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
