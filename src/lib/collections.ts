import { useMemo } from "react";
import { useCmsVersion } from "./cms";
import { useLocalState } from "./hooks";
import { KEYS, uid, type PrayerRequest, type Testimony, type WallPrayer, type GivingRecord, type VisitPlan } from "./store";
import { SEED_TESTIMONIES, SEED_WALL } from "../data/content";

export function useTestimonies() {
  const [mine, setMine] = useLocalState<Testimony[]>(KEYS.testimonies, []);
  const [amenMap, setAmenMap] = useLocalState<Record<string, boolean>>("wom.amenMap", {});

  /* The office's publishes re-bind the seed wall in place — without the cms
     version in the deps the memo would keep serving the pre-publish wall, and
     an edited monogram would never show (SPEC note 185). */
  const cmsVersion = useCmsVersion();
  const all = useMemo(
    () =>
      [...mine, ...SEED_TESTIMONIES]
        .map((t) => ({ ...t, iAmened: !!amenMap[t.id], amens: t.amens + (amenMap[t.id] ? 1 : 0) }))
        .sort((a, b) => b.createdAt - a.createdAt),
    [mine, amenMap, cmsVersion]
  );

  return {
    all,
    mine,
    totalAmens: all.reduce((n, t) => n + t.amens, 0),
    amen: (id: string) => setAmenMap((m) => ({ ...m, [id]: !m[id] })),
    add: (t: Omit<Testimony, "id" | "createdAt" | "amens" | "iAmened" | "mine">) =>
      setMine((list) => [{ ...t, id: uid("t"), createdAt: Date.now(), amens: 0, iAmened: false, mine: true }, ...list]),
    remove: (id: string) => setMine((list) => list.filter((t) => t.id !== id)),
  };
}

export function useWall() {
  const [mine, setMine] = useLocalState<WallPrayer[]>(KEYS.wall, []);
  const [prayedMap, setPrayedMap] = useLocalState<Record<string, boolean>>("wom.prayedMap", {});
  const all = useMemo(
    () =>
      [...mine.map((w) => ({ ...w, mine: true })), ...SEED_WALL]
        .map((w) => ({ ...w, prayed: w.prayed + (prayedMap[w.id] ? 1 : 0) }))
        .sort((a, b) => b.createdAt - a.createdAt),
    [mine, prayedMap]
  );
  return {
    all,
    mine,
    total: all.reduce((n, w) => n + w.prayed, 0),
    iPrayed: (id: string) => !!prayedMap[id],
    pray: (id: string) => setPrayedMap((m) => ({ ...m, [id]: !m[id] })),
    add: (w: Omit<WallPrayer, "id" | "createdAt" | "prayed" | "mine">) => setMine((list) => [{ ...w, id: uid("w"), createdAt: Date.now(), prayed: 0 }, ...list]),
    remove: (id: string) => setMine((list) => list.filter((w) => w.id !== id)),
  };
}

export function usePrayerRequests() {
  const [requests, setRequests] = useLocalState<PrayerRequest[]>(KEYS.prayers, []);
  return {
    requests,
    add: (r: Omit<PrayerRequest, "id" | "createdAt" | "answered" | "prayed" | "iPrayed">) =>
      setRequests((list) => [{ ...r, id: uid("pr"), createdAt: Date.now(), answered: false, prayed: 0, iPrayed: false }, ...list]),
    remove: (id: string) => setRequests((list) => list.filter((r) => r.id !== id)),
    toggleAnswered: (id: string) => setRequests((list) => list.map((r) => (r.id === id ? { ...r, answered: !r.answered } : r))),
    markPrayed: (id: string) => setRequests((list) => list.map((r) => (r.id === id ? { ...r, iPrayed: !r.iPrayed, prayed: r.prayed + (r.iPrayed ? -1 : 1) } : r))),
  };
}

export function useLibrary() {
  const [saved, setSaved] = useLocalState<string[]>(KEYS.saved, []);
  const [watched, setWatched] = useLocalState<string[]>(KEYS.watched, []);
  const [notes, setNotes] = useLocalState<Record<string, string>>(KEYS.notes, {});
  return {
    saved,
    watched,
    notes,
    isSaved: (id: string) => saved.includes(id),
    isWatched: (id: string) => watched.includes(id),
    toggleSaved: (id: string) => setSaved((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
    markWatched: (id: string) => setWatched((l) => (l.includes(id) ? l : [...l, id])),
    setNote: (id: string, text: string) => setNotes((n) => ({ ...n, [id]: text })),
  };
}

export function useGivingLog() {
  const [log, setLog] = useLocalState<GivingRecord[]>(KEYS.giving, []);
  return {
    log,
    total: log.reduce((n, r) => n + r.amount, 0),
    add: (r: Omit<GivingRecord, "id" | "createdAt">) => setLog((l) => [{ ...r, id: uid("g"), createdAt: Date.now() }, ...l]),
    remove: (id: string) => setLog((l) => l.filter((r) => r.id !== id)),
    clear: () => setLog([]),
  };
}

export function useVisitPlan() {
  const [plan, setPlan] = useLocalState<VisitPlan | null>(KEYS.visit, null);
  return { plan, setPlan, clear: () => setPlan(null) };
}

export function useReadingPlan() {
  const [done, setDone] = useLocalState<string[]>(KEYS.reading, []);
  return {
    done,
    toggle: (key: string) => setDone((l) => (l.includes(key) ? l.filter((x) => x !== key) : [...l, key])),
    clear: () => setDone([]),
  };
}
