/* cms.ts — the content store behind #/admin: draft editing, changed-only
   publishes, live preview. Falls back: server, cached overrides, defaults. */

import { useSyncExternalStore } from "react";
import { SECTION_DEFS, buildDefaults, clone, getPath, photoSectionId, refreshDerived, sectionById, setPath, type Field, type SectionDef } from "./cmsSchema";
import { copyIsFixed, copySectionOf } from "../data/copy";
import { TESTIMONY_CATEGORIES } from "../data/content";
import { purgeExpiredSlides } from "../data/slides";
import { purgeExpiredAnnouncements } from "../data/announcements";
import { fmtDate } from "./store";
import { fireToast } from "./hooks";
import { createRemoteSocket, initServerUrl, refreshServerUrl, serverOverride, serverUrl, setServerOverride } from "./remoteserver";
import { applyBakedRecent } from "./recentstreams";
import { bakedFeedSpec, feedIsNewer, peekSeed, siteFile, type FeedSeed, type FeedSpec } from "./livefeed";
import { BUILD_NOTES } from "./hooks";

export type Snapshot = Record<string, any>;
export type CmsStatus = "connecting" | "online" | "offline" | "local";
export type LogEntry = { rev: number; at: number; by: string; role?: string; note: string; changed: string[] };

const CACHE_KEY = "wom.cms.cache";
const DRAFT_KEY = "wom.cms.draft";
const HISTORY_KEY = "wom.cms.history";
const PENDING_KEY = "wom.cms.pending";
const AFTER_SAVE_KEY = "wom.cms.publishAfterSave";
/** A publish waiting for the website to be saved is forgotten after this long. */
const AFTER_SAVE_MAX_AGE_MS = 15 * 60 * 1000;
const NAME_KEY = "wom.cms.editor";
const SESSION_KEY = "wom.cms.session";
const REQUEST_TIMEOUT = 9000;

const NOTES_KEY = "wom.cms.notes";
/* Which code update the browser's saved store belongs to (note 253). */
const CODEGEN_KEY = "wom.cms.codegen";
/* The code update the live content was last published from (note 249). */
let publishedNotes = 0;
try {
  const raw = localStorage.getItem(NOTES_KEY);
  const n = raw === null ? 0 : Number(JSON.parse(raw));
  if (Number.isFinite(n) && (n as number) > 0) publishedNotes = Math.floor(n as number);
} catch {
  /* storage may be blocked — startCms re-reads later */
}
/** The update number the running content was last published from (note 250). */
export function publishedNotesVersion(): number {
  return publishedNotes;
}
/* Why the maintenance notice is or isn't showing (note 278): call from the
   console as window.__maintState() on the deployed copy. */
if (typeof window !== "undefined") {
  (window as unknown as { __maintState?: () => object }).__maintState = () => ({
    publishedNotes,
    buildNotes: BUILD_NOTES,
    status,
    hasSocket: !!socket,
    serverInvolved: serverInvolved(),
    preview: maintenancePreview(),
    shouldWait: maintenanceShouldWait(),
    waiting: maintenanceShouldWait() && !maintenancePreview(),
    ready: bootReady,
  });
}
function setPublishedNotes(n: unknown) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= publishedNotes) return;
  publishedNotes = Math.floor(n);
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(publishedNotes));
  } catch {
    /* a full store keeps the memory value for this visit */
  }
}
/* Last-published is a high-water mark of witnessed publishes (note 300): it
   only ever moves UP — from an explicit office action on this copy (publish,
   undo click, offline flush), a server answer, the live feed, the baked seed,
   or the browser's own cache — and it is NEVER manufactured downwards. Only
   a proven new update (stored codegen exists and differs) changes what the
   copy shows, and only an explicit office delete (resetLocalCopy) clears the
   stamp. So a copy that has seen a publish stays on that publish until a new
   different update lands — it can never fall back to update-mode by itself. */
/** True only when the browser proves the running code is a NEW update: a
    stored codegen exists AND differs. A missing or unreadable stamp proves
    nothing (fresh profile is not a new update), so it must never skip the
    cached paint or manufacture a hold. */
function storedCodegenProvesNewUpdate(): boolean {
  try {
    const cg = readJSON<number>(CODEGEN_KEY, 0);
    return typeof cg === "number" && cg > 0 && Math.floor(cg) !== BUILD_NOTES;
  } catch {
    return false;
  }
}
/** The instant paint, stamped with the update its words were published from
    (note 300) — so a returning copy stays live on its last publish even
    before (or without) the first server answer. */
function writeCache() {
  writeJSON(CACHE_KEY, { rev, overrides, notes: publishedNotes });
}
/* The office's preview pass: ?preview=1 shows the new site before it is
   published, so an update is verifiable first (note 250). The grant is
   remembered for the visit BUT scoped to the update that granted it, so a
   desktop preview cannot stick around and make one mode look live while
   another mode (e.g. a phone that never previewed) correctly waits on the
   maintenance notice. */
const PREVIEW_KEY = "wom.cms.preview";
const PREVIEW_NOTES_KEY = "wom.cms.previewNotes";
function maintenancePreview(): boolean {
  try {
    const q = new URLSearchParams(window.location.search || "");
    if (q.get("preview") === "1") {
      try {
        sessionStorage.setItem(PREVIEW_KEY, "1");
        sessionStorage.setItem(PREVIEW_NOTES_KEY, String(BUILD_NOTES));
      } catch {}
      return true;
    }
    if (sessionStorage.getItem(PREVIEW_KEY) !== "1") return false;
    /* A remembered grant only counts for the update that granted it. */
    try {
      const stamped = sessionStorage.getItem(PREVIEW_NOTES_KEY);
      if (stamped !== null) {
        const forNotes = Number(stamped);
        if (!Number.isFinite(forNotes) || Math.floor(forNotes) !== BUILD_NOTES) return false;
      }
    } catch {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
/** True while this tab is bypassing maintenance via the office preview pass. */
export function isMaintenancePreview(): boolean {
  try {
    return maintenancePreview();
  } catch {
    return false;
  }
}
/** Leave the preview pass: visitors' maintenance notice shows again on this tab. */
export function exitMaintenancePreview(): void {
  try {
    sessionStorage.removeItem(PREVIEW_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(PREVIEW_NOTES_KEY);
  } catch {}
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("preview");
    window.history.replaceState(null, "", u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash);
  } catch {}
  try {
    window.location.reload();
  } catch {}
}
/** True while a server is (or was) in play: online, offline after contact, a
    socket waiting, or an address to reach. A copy that never had a server has
    no visitors to protect, so it never waits (note 250). */
function serverInvolved(): boolean {
  if (socket || status === "online" || status === "offline") return true;
  try {
    return !!socketFactory();
  } catch {
    return false;
  }
}
/** Pure check without the preview bypass: would visitors wait on this copy?
    Used for the preview banner, so the office can see that visitors wait.
    The stamp is only ever witnessed evidence (note 300) — never manufactured
    — so waiting here means a publish was actually seen from an older update
    (or nothing was ever published on a server-backed copy: fresh visitor,
    wiped store, or a server reset to notes 0 — still unreviewed, still
    waits). Server-less copies never wait (no visitors). A publish lifts. */
export function maintenanceShouldWait(): boolean {
  /* Note 301: a corrupt stamp is unreviewed, never published — wait when server-backed. */
  const held = typeof publishedNotes === "number" && Number.isFinite(publishedNotes) ? Math.floor(publishedNotes) : 0;
  if (held >= BUILD_NOTES) return false;
  if (!serverInvolved()) return false;
  return true;
}
/* True while visitors must wait: new code is ahead of the last publish.
   Server-backed copies with no witnessed publish yet wait too (note 300: a
   zero stamp is "nothing proven", not "behind" — but an unreviewed copy all
   the same), so mobile and desktop agree. Never on a server-less copy (local
   dev has no visitors), never on the office's preview pass, and never in the
   office console (#/admin) — which renders around this (note 250).
   This also subscribes to connection state, so the first-paint answer cannot
   stick on one device while the server address lands a moment later. */
export function useMaintenance(): boolean {
  useCmsVersion();
  /* Re-render when status/socket changes (notify without a version bump). */
  useSyncExternalStore(subscribe, () => stateObj);
  /* Note 301: a corrupt stamp is unreviewed, never published. */
  const held = typeof publishedNotes === "number" && Number.isFinite(publishedNotes) ? Math.floor(publishedNotes) : 0;
  if (held >= BUILD_NOTES) return false;
  if (!serverInvolved()) return false;
  try {
    if (maintenancePreview()) return false;
  } catch {}
  return true;
}
/** True while this tab previews the new site although visitors wait. */
export function usePreviewingWhileWaiting(): boolean {
  useCmsVersion();
  useSyncExternalStore(subscribe, () => stateObj);
  try {
    if (!maintenancePreview()) return false;
  } catch {
    return false;
  }
  return maintenanceShouldWait();
}

/** True while this copy is older than what this browser has already seen
    (note 252): the office opened an old extract or an old build — the running
    update is lower than the last-published stamp. The footer already names the
    old number; Admin says so out loud with the way out. */
export function useOlderCopy(): boolean {
  useCmsVersion();
  useSyncExternalStore(subscribe, () => stateObj);
  return publishedNotes > BUILD_NOTES;
}
/* A deployed host can serve a newer bundle than this tab runs (desktop cached
   the old JS while the phone fetched the new one): the two modes then decide
   maintenance from different BUILD_NOTES and disagree. When version.json names
   a newer update, reload once onto it so both modes run the same code. */
const STALE_RELOAD_KEY = "wom.cms.staleReload";
export async function checkStaleBuild(): Promise<void> {
  try {
    const res = await fetch(siteFile("version.json"), { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const n = Number(data && (data as any).notes);
    if (!Number.isFinite(n) || n <= BUILD_NOTES) return;
    try {
      if (sessionStorage.getItem(STALE_RELOAD_KEY) === String(Math.floor(n))) return;
      sessionStorage.setItem(STALE_RELOAD_KEY, String(Math.floor(n)));
    } catch {}
    window.location.reload();
  } catch {
    /* dev runs and hosts without version.json simply skip */
  }
}

/* Forget everything this browser kept from older copies (note 252): cached
   words, drafts, history, waiting publishes and the publish stamp — then
   reload onto the shipped words. The server's published words are untouched.
   Anything published ONLY on this device while offline is lost with it, so
   the button carrying this says so before it arms. This is the explicit
   office delete (note 300) — the ONLY path that clears last-published. */
export function resetLocalCopy(): void {
  const keys = [CACHE_KEY, DRAFT_KEY, HISTORY_KEY, PENDING_KEY, NOTES_KEY, AFTER_SAVE_KEY];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  try {
    sessionStorage.removeItem(PREVIEW_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(PREVIEW_NOTES_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(STALE_RELOAD_KEY);
  } catch {}
  publishedNotes = 0;
  try {
    window.location.reload();
  } catch {}
}

/* ------------------------------------------------------------------- state */

const defaults: Snapshot = buildDefaults();
let overrides: Snapshot = {};
let applied: Snapshot = clone(defaults);
let draft: Snapshot | null = null;
let draftFromRev = 0;
let dirty: Record<string, true> = {};
/** True once the stored draft has been read; nothing writes DRAFT_KEY before that (note 112). */
let draftLoaded = false;
let history: { rev: number; at: number; by: string; overrides: Snapshot }[] = [];
/** Overrides published while the server was unreachable, waiting to be sent. */
let pending: Snapshot | null = null;
/* A publish deletes the previous publish — except for one ~15-minute undo
   window kept on the server (note 291). The server reports the seconds left
   on every content answer; this tab turns it into a local deadline so the
   Tools card can count down between syncs. */
const UNDO_MS = 15 * 60 * 1000;
let undoUntilAt = 0;
/** Seconds left to undo the last publish on the server (0 = none). */
export function undoCountdownSec(): number {
  if (!undoUntilAt) return 0;
  const left = Math.ceil((undoUntilAt - Date.now()) / 1000);
  return left > 0 ? left : 0;
}
/* Expired local undo entries are forgotten, like the server forgets its own —
   an undo older than the window is gone everywhere. */
function pruneHistory() {
  if (!history.length) return;
  const now = Date.now();
  const kept = history.filter((h) => typeof h?.at === "number" && now - h.at <= UNDO_MS);
  if (kept.length !== history.length) {
    history = kept;
    writeJSON(HISTORY_KEY, history);
  }
}

let status: CmsStatus = "connecting";
/* Why the server is not connected, in the office's own words for the sign-in
   card ("last try: office server unreachable") — empty while connected. */
let connNote = "";
let rev = 0;
let updatedAt = 0;
let updatedBy = "";
let log: LogEntry[] = [];

/** Last value per section, for one-step undo (edits within a moment coalesce). */
let editUndos: { sectionId: string; prev: any; at: number }[] = [];
const EDIT_COALESCE_MS = 1600;

let authed = false;
/* This tab's role (main/sub/signed out). The server re-checks; this only shapes the drawer. */
let myRole: "main" | "sub" | null = null;
let myName = "";
let socket: any = null;
let reconnectTimer = 0;
let reconnectAttempt = 0;
let starting = false;
let localOnly = false;

let version = 0;
/* First-paint gate: false until boot (seed + stamp) AND the first server sync
   attempt settle — the page renders nothing until then, so a published site
   never flashes the maintenance notice while the numbers are still loading. */
let bootReady = false;
function setBootReady() {
  if (bootReady) return;
  bootReady = true;
  notify();
}
function settleInitialSync() {
  initialSyncPending = false;
  try {
    initialSyncResolve?.();
  } catch {}
  initialSyncResolve = null;
}
export function useCmsReady(): boolean {
  return useSyncExternalStore(subscribe, () => bootReady);
}
/* Resolved once connect()'s first open settles (synced or failed). */
let initialSyncPending = false;
let initialSyncDone: Promise<void> = Promise.resolve();
let initialSyncResolve: (() => void) | null = null;
let previewing = false;
let previewBase: Snapshot | null = null;
/** True while #/admin is open: the pages show the draft, and edits land live. */
let autoPreview = false;
const listeners = new Set<() => void>();

let stateObj = readState();
function readState() {
  pruneHistory();
  return {
    version,
    status,
    connNote,
    rev,
    updatedAt,
    updatedBy,
    log,
    authed,
    role: myRole,
    adminName: myName,
    dirty: !!draft && hasChanges(),
    hasDraft: !!draft,
    localOnly,
    previewing,
    canUndo: (history.length > 0 || undoCountdownSec() > 0) && status === "online",
    canUndoEdit: editUndos.length > 0,
    pendingLocal: !!pending,
    editor: editorName(),
  };
}
function notify() {
  stateObj = readState();
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCms() {
  return useSyncExternalStore(subscribe, () => stateObj);
}
export function useCmsVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/* -------------------------------------------------------------- persistence */

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("cms: could not write", key, err);
  }
}

export function editorName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}
export function setEditorName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 60));
  } catch {}
  notify();
}

/* ------------------------------------------------------------------- apply */

/** Old saves may miss newer fields; object sections fill the gaps from defaults. */
function mergeSection(id: string, base: any, value: any) {
  const def = sectionById(id);
  /* Fixed line lists keep shipped order and values; unknown stored keys are ignored. */
  if (def?.kind === "list" && def.fixed && def.idKey && Array.isArray(base) && Array.isArray(value)) {
    const key = def.idKey;
    const mine = new Map((value as any[]).map((item: any) => [String(item?.[key] ?? ""), item]));
    return (base as any[]).map((entry: any) => {
      if (copyIsFixed(String(entry?.[key] ?? ""))) return clone(entry);
      return mine.get(String(entry?.[key] ?? "")) || clone(entry);
    });
  }
  const plainish = base && value && typeof base === "object" && typeof value === "object" && !Array.isArray(base) && !Array.isArray(value);
  if (def?.kind === "object" && plainish) {
    /* The shipped section defines the shape: a key that only exists in an old
       save (a field the site has since dropped) is left behind rather than
       resurrected. */
    const out: any = clone(base);
    for (const key of Object.keys(value)) if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = clone(value[key]);
    return out;
  }
  return clone(value);
}

function merge(over: Snapshot): Snapshot {
  const out: Snapshot = clone(defaults);
  for (const id of Object.keys(over || {})) {
    if (over[id] === null || over[id] === undefined) continue;
    out[id] = mergeSection(id, defaults[id], over[id]);
  }
  return out;
}

/** Fill every section of a snapshot in from the defaults where it is missing. */
function normalizeDraft(snap: Snapshot): Snapshot {
  const out: Snapshot = clone(snap || {});
  for (const def of SECTION_DEFS) {
    out[def.id] = out[def.id] === undefined ? clone(defaults[def.id]) : mergeSection(def.id, defaults[def.id], out[def.id]);
  }
  return out;
}

export function applySnapshot(snap: Snapshot) {
  if (!snap || typeof snap !== "object") return;
  for (const def of SECTION_DEFS) {
    const value = (snap as any)[def.id];
    if (value === undefined) continue;
    try {
      def.bind(clone(value));
    } catch (err) {
      console.error(`cms: failed to apply section "${def.id}"`, err);
    }
  }
  refreshDerived();
  applied = clone(snap);
  version += 1;
  notify();
}

function applyOverrides(over: Snapshot, keepDraft = true) {
  /* Whatever was waiting to be previewed describes the old content. */
  dropLivePreview();
  overrides = clone(over || {});
  if (!keepDraft) draft = null;
  applySnapshot(merge(overrides));
  /* Live content can land under a draft; edited sections stay, the rest follow it. */
  if (keepDraft) rebaseDraft();
  /* On #/admin the pages show the draft, re-applied whenever live content lands (note 83). */
  if (keepDraft) showDraftIfEditing();
}

export function getApplied(): Snapshot {
  return clone(applied);
}
export function getDefaults(): Snapshot {
  return clone(defaults);
}
export function getOverrides(): Snapshot {
  return clone(overrides);
}

/** One section as published (defaults + overrides); "unsaved changes" compares to this. */
function publishedSection(id: string): any {
  const value = overrides[id];
  if (value === undefined || value === null) return defaults[id];
  return mergeSection(id, defaults[id], value);
}

/** The section ids the office has changed but not published yet. */
export function pendingSections(): string[] {
  if (!draft) return [];
  const out: string[] = [];
  for (const def of SECTION_DEFS) {
    if (JSON.stringify(publishedSection(def.id)) !== JSON.stringify(draft[def.id])) out.push(def.id);
  }
  return out;
}

/* ---------------------------------------- what has not been published yet ---- */

/** One pending change, named the way the office met it. */
export type PendingLine = { what: string; detail: string };

export type PendingEdit = {
  sectionId: string;
  label: string;
  group: string;
  icon: string;
  kind: "object" | "list";
  /** What differs, in the order the office meets it on the page. Capped. */
  lines: PendingLine[];
  /** How many things differ — may be more than `lines.length` (the cap). */
  count: number;
};

/** How many lines a section lists before it says “and N more”. */
export const PENDING_LINES_MAX = 6;

function sameJSON(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A value flattened small enough for the drawer's narrow column. */
function snip(value: any, max = 46): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "empty";
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function tally(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A stored picker value in the words the office's own picker shows. */
function optionName(field: Field, value: any): string {
  const raw = String(value ?? "");
  for (const opt of field.options || []) {
    const v = typeof opt === "string" ? opt : opt.value;
    if (v !== raw) continue;
    return field.optionLabels?.[raw] || (typeof opt === "string" ? raw : opt.label);
  }
  return field.optionLabels?.[raw] || raw || "empty";
}

/** How one list of values differs — a count, not every line of it. */
function countDetail(before: any, after: any, one: string, many: string): string {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  let reworded = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (!sameJSON(a[i], b[i])) reworded += 1;
  const parts: string[] = [];
  if (reworded) parts.push(`${tally(reworded, one, many)} changed`);
  if (a.length > b.length) parts.push(`${tally(a.length - b.length, one, many)} added`);
  if (b.length > a.length) parts.push(`${tally(b.length - a.length, one, many)} removed`);
  return parts.join(", ") || "changed";
}

/** How one field's value differs from the live site — "" when it does not. */
function fieldDetail(field: Field, before: any, after: any): string {
  if (sameJSON(before, after)) return "";
  switch (field.type) {
    case "boolean":
      return after ? "switched on" : "switched off";
    case "image":
    case "video": {
      const noun = field.type === "video" ? "video" : "photo";
      const was = !!String(before ?? "").trim();
      const is = !!String(after ?? "").trim();
      if (!was && is) return `a ${noun} was added`;
      if (was && !is) return `the ${noun} was removed`;
      return `a different ${noun}`;
    }
    case "select":
      return `${optionName(field, before)} → ${optionName(field, after)}`;
    case "strings":
      return countDetail(before, after, "line", "lines");
    case "list":
      return countDetail(before, after, "entry", "entries");
    default:
      return `${snip(before)} → ${snip(after)}`;
  }
}

/** The fields of two records of the same kind that differ, said in a line each. */
function fieldLines(fields: Field[], before: any, after: any): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.type === "static" || f.readonly) continue;
    const detail = fieldDetail(f, getPath(before, f.path), getPath(after, f.path));
    if (detail) out.push(`${f.label}: ${detail}`);
  }
  return out;
}

/** An entry the way the drawer names it on its own row. */
function entryName(def: SectionDef, item: any, index: number): string {
  const name = def.itemLabel ? def.itemLabel(item) : "";
  return String(name || `Entry ${index + 1}`).trim() || `Entry ${index + 1}`;
}

/** A section that is one record — the church profile, the live stream, a photo set. */
function objectPending(def: SectionDef, before: any, after: any): PendingLine[] {
  const out: PendingLine[] = [];
  for (const f of def.fields) {
    if (f.type === "static" || f.readonly) continue;
    /* Id-keyed nested rows name what left, like a top-level list. */
    if (f.type === "list") {
      const b = getPath(before, f.path);
      const a = getPath(after, f.path);
      const bl: any[] = Array.isArray(b) ? b : [];
      const al: any[] = Array.isArray(a) ? a : [];
      const rows = bl.concat(al);
      if (rows.length > 0 && rows.every((x) => x && String(x.id ?? "").trim())) {
        const label = f.itemLabel;
        const sub = { ...def, idKey: "id", fields: f.fields || [], itemLabel: typeof label === "function" ? label : ((item: any) => item?.[label as string]) } as SectionDef;
        for (const line of listPending(sub, bl, al)) {
          out.push({ what: `${f.label}: ${line.what}`, detail: line.detail });
        }
        continue;
      }
    }
    const detail = fieldDetail(f, getPath(before, f.path), getPath(after, f.path));
    if (detail) out.push({ what: f.label, detail });
  }
  return out;
}

/** A fixed list of page lines: each entry is one line of text the office rewrote. */
function copyPending(def: SectionDef, before: any, after: any): PendingLine[] {
  const out: PendingLine[] = [];
  const old = new Map<string, any>(((before as any[]) || []).map((entry) => [String(entry?.id ?? ""), entry]));
  ((after as any[]) || []).forEach((entry: any, i: number) => {
    const was = old.get(String(entry?.id ?? ""));
    const name = entryName(def, entry, i);
    if (!was) {
      out.push({ what: name, detail: "a line was added" });
      return;
    }
    if (!sameJSON(was.value, entry.value)) out.push({ what: name, detail: `${snip(was.value)} → ${snip(entry.value)}` });
  });
  const now = new Set(((after as any[]) || []).map((entry) => String(entry?.id ?? "")));
  ((before as any[]) || []).forEach((entry: any, i: number) => {
    if (!now.has(String(entry?.id ?? ""))) out.push({ what: entryName(def, entry, i), detail: "a line was removed" });
  });
  return out;
}

/** A list of entries the office can add to, delete from and reorder. */
function listPending(def: SectionDef, before: any, after: any): PendingLine[] {
  const out: PendingLine[] = [];
  const b: any[] = Array.isArray(before) ? before : [];
  const a: any[] = Array.isArray(after) ? after : [];
  const key = def.idKey || "";
  const idOf = (item: any) => (key && item && String(item[key] ?? "").trim() ? String(item[key]) : "");
  /* Matched by id when all have one (survives reorder); id-less rows walk by index (note 114). */
  const byId = !!key && b.concat(a).every((item) => !!idOf(item));

  if (byId) {
    const old = new Map<string, any>(b.map((item) => [idOf(item), item]));
    const now = new Set(a.map(idOf));
    a.forEach((item, i) => {
      const was = old.get(idOf(item));
      if (!was) {
        out.push({ what: entryName(def, item, i), detail: "a new entry" });
        return;
      }
      const changed = fieldLines(def.fields, was, item);
      if (changed.length) {
        out.push({
          what: entryName(def, item, i),
          detail: changed[0] + (changed.length > 1 ? ` (+${changed.length - 1} more)` : ""),
        });
      }
    });
    b.forEach((item, i) => {
      if (!now.has(idOf(item))) out.push({ what: entryName(def, item, i), detail: "removed" });
    });
    const keptBefore = b.map(idOf).filter((id) => now.has(id));
    const keptAfter = a.map(idOf).filter((id) => old.has(id));
    if (keptBefore.length > 1 && keptBefore.some((id, i) => id !== keptAfter[i])) {
      out.push({ what: "The order of the entries", detail: "moved on the page" });
    }
    return out;
  }

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= b.length) {
      out.push({ what: entryName(def, a[i], i), detail: "a new entry" });
      continue;
    }
    if (i >= a.length) {
      out.push({ what: entryName(def, b[i], i), detail: "removed" });
      continue;
    }
    const changed = fieldLines(def.fields, b[i], a[i]);
    if (changed.length) {
      out.push({
        what: entryName(def, a[i], i),
        detail: changed[0] + (changed.length > 1 ? ` (+${changed.length - 1} more)` : ""),
      });
    }
  }
  return out;
}

/** All unpublished changes by section, for the "N unsaved changes" list. */
export function pendingEdits(): PendingEdit[] {
  if (!draft) return [];
  const out: PendingEdit[] = [];
  for (const id of pendingSections()) {
    const def = sectionById(id);
    if (!def) continue;
    const before = publishedSection(id);
    const after = draft[id];
    const found =
      def.kind === "object"
        ? objectPending(def, before, after)
        : def.fixed
          ? copyPending(def, before, after)
          : listPending(def, before, after);
    /* A change with nothing to say about itself is still a change (a key the
       section carries no field for), and hiding it would make the list disagree
       with the count. */
    const lines = found.length ? found : [{ what: "This part of the site", detail: "changed" }];
    out.push({
      sectionId: id,
      label: def.label,
      group: def.group,
      icon: def.icon,
      kind: def.kind,
      count: lines.length,
      lines: lines.slice(0, PENDING_LINES_MAX),
    });
  }
  return out;
}

/** Drop one section's edits and follow published content again (undoable). */
export function revertSection(sectionId: string): { ok: boolean; label?: string } {
  const def = sectionById(sectionId);
  if (!def) return { ok: false };
  const d = getDraft();
  const back = clone(publishedSection(sectionId));
  if (sameJSON(d[sectionId], back)) return { ok: false, label: def.label };
  pushEditUndo(sectionId, clone(d[sectionId]));
  d[sectionId] = back;
  /* Not “dirty” any more: it says exactly what is live. */
  delete dirty[sectionId];
  persistDraft();
  if (autoPreview) {
    dropLivePreview();
    applyDraftLive();
  }
  notify();
  return { ok: true, label: def.label };
}

/** Keep only a list section's removals, so Delete publishes just what was taken off (undoable). */
export function dropAddedAndRevertedEdits(sectionId: string): {
  ok: boolean;
  added: number;
  reverted: number;
  removed: number;
} {
  const none = { ok: false, added: 0, reverted: 0, removed: 0 };
  const def = sectionById(sectionId);
  if (!def) return none;
  /* An object section can still hold a real add/remove list (the testimony
     wall names its items) — the surgery runs on that list alone. */
  const nested = def.kind === "object" ? def.deletableItems || "" : "";
  if (def.kind !== "list" && !nested) return none;
  if (def.kind === "list" && def.fixed) return none;
  const d = getDraft();
  const listOf = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (nested && v && typeof v === "object") return Array.isArray((v as any).items) ? (v as any).items : [];
    return [];
  };
  const before: any[] = listOf(publishedSection(sectionId));
  const after: any[] = listOf(d[sectionId]);
  const key = def.kind === "list" ? def.idKey || "" : "id";
  const idOf = (item: any) => (key && item && String(item[key] ?? "").trim() ? String(item[key]) : "");
  const byId = !!key && before.concat(after).every((item) => !!idOf(item));
  let added = 0;
  let reverted = 0;
  let removed = 0;
  /* Whatever survives is in published order: a reorder is unsaved work like
     any other, and Delete only keeps the removals. */
  const kept: any[] = [];
  if (byId) {
    const now = new Map<string, any>(after.map((item) => [idOf(item), item]));
    const wasIds = new Set<string>(before.map(idOf));
    for (const was of before) {
      const item = now.get(idOf(was));
      if (!item) {
        removed += 1;
        continue;
      }
      if (sameJSON(was, item)) kept.push(clone(item));
      else {
        reverted += 1;
        kept.push(clone(was));
      }
    }
    for (const item of after) if (!wasIds.has(idOf(item))) added += 1;
  } else {
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      if (i >= after.length) {
        removed += 1;
        continue;
      }
      if (i >= before.length) {
        added += 1;
        continue;
      }
      if (sameJSON(before[i], after[i])) kept.push(clone(after[i]));
      else {
        reverted += 1;
        kept.push(clone(before[i]));
      }
    }
  }
  if (!added && !reverted && !removed) return none;
  pushEditUndo(sectionId, clone(d[sectionId]));
  if (nested) {
    /* A bare-array save predates the merged wall shape — fold it the way the
       section's own migration does, keeping the published kinds. */
    if (Array.isArray(d[sectionId])) {
      const pub = publishedSection(sectionId);
      const prevCats =
        !Array.isArray(pub) && pub && Array.isArray((pub as any).categories)
          ? clone((pub as any).categories)
          : clone(TESTIMONY_CATEGORIES);
      d[sectionId] = { items: kept, categories: prevCats };
    } else {
      setPath(d[sectionId], nested, kept);
    }
  } else {
    d[sectionId] = kept;
  }
  if (sameJSON(nested ? d[sectionId] : kept, nested ? publishedSection(sectionId) : before)) delete dirty[sectionId];
  else dirty[sectionId] = true;
  persistDraft();
  if (autoPreview) {
    dropLivePreview();
    applyDraftLive();
  }
  notify();
  return { ok: true, added, reverted, removed };
}

/** Publish one section now; the rest stay as they are. Works offline (staged). */
export async function publishSection(sectionId: string, note: string): Promise<PublishResult> {
  const def = sectionById(sectionId);
  if (!def || !draft) return { ok: false, error: "nothing-to-do" };
  /* A lapsed entry never survives a publish — expired slides and notices leave
     the draft here, so the live site and the server both forget them in the
     same stroke, whichever section is being published. */
  dropLapsedSlides(true);
  migrateTestimonies();
  if (sectionId === "sermons" && Array.isArray(draft[sectionId])) stampSermonPublishTimes(draft[sectionId]);
  const value = clone(draft[sectionId]);
  if (sameJSON(value, publishedSection(sectionId))) {
    delete dirty[sectionId];
    persistDraft();
    notify();
    return { ok: true };
  }
  if (!socket || status !== "online") {
    rememberHistory();
    overrides = { ...overrides, [sectionId]: value };
    applyOverrides(overrides);
    writeCache();
    pending = { ...(pending || {}), [sectionId]: value };
    writeJSON(PENDING_KEY, pending);
    localOnly = true;
    delete dirty[sectionId];
    persistDraft();
    notify();
    return { ok: true, local: true };
  }
  if (!authed) {
    const saved = sessionPassword();
    const res = saved ? await login(saved, true) : { ok: false as const };
    if (!res.ok) {
      /* A changed/retired password ends the session here (note 297) but
         keeps every held word, queue entry and stamp — only an explicit
         office delete may clear last-published (note 300). */
      if ((res as any).error === "denied") clearSession();
      return { ok: false, error: "unauthorized" };
    }
  }
  rememberHistory();
  const payload = JSON.stringify(value);
  const result = await sendPatch({ [sectionId]: payload }, [sectionId], note.slice(0, 160));
  if (!result.ok) return { ok: false, error: result.error };
  rev = result.rev ?? rev + 1;
  updatedAt = Date.now();
  updatedBy = editorName();
  setPublishedNotes(BUILD_NOTES);
  overrides[sectionId] = JSON.parse(payload);
  log = [{ rev, at: updatedAt, by: editorName(), role: myRole === "sub" ? "sub" : "main", note: note.slice(0, 160), changed: [sectionId] }, ...log].slice(0, 30);
  delete dirty[sectionId];
  persistDraft();
  applyOverrides(overrides);
  writeCache();
  notify();
  return { ok: true };
}

function stampSermonPublishTimes(list: any[]): void {
  const now = Date.now();
  const cur = publishedSection("sermons");
  const live: any[] = Array.isArray(cur) ? cur : [];
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof item.publishedAt === "number") continue;
    const id = String(item.id ?? "").trim();
    if (id && live.some((p) => String(p?.id ?? "") === id)) continue;
    if (live.some((p) => sameJSON(p, item))) continue;
    let aside = false;
    for (const p of live) {
      if (!p || typeof p !== "object") continue;
      const a = { ...p };
      const b = { ...item };
      delete a.id;
      delete b.id;
      delete a.publishedAt;
      delete b.publishedAt;
      if (sameJSON(a, b)) {
        aside = true;
        break;
      }
    }
    if (!aside) item.publishedAt = now;
  }
}

/** True when an entry is live: by id, or by content ignoring the id (note 146). */
export function isPublishedEntry(sectionId: string, item: any): boolean {
  const def = sectionById(sectionId);
  const cur = publishedSection(sectionId);
  if (!def || def.kind !== "list" || !Array.isArray(cur) || !item || typeof item !== "object") return false;
  const key = def.idKey || "";
  const id = key ? String(item[key] ?? "").trim() : "";
  if (id && cur.some((p) => String(p?.[key] ?? "") === id)) return true;
  if (cur.some((p) => sameJSON(p, item))) return true;
  if (!key) return false;
  return cur.some((p) => {
    if (!p || typeof p !== "object") return false;
    const a = { ...p };
    const b = { ...item };
    delete a[key];
    delete b[key];
    return sameJSON(a, b);
  });
}

/** Show the unpublished draft on the live site (this browser only). */
export function setPreview(on: boolean) {
  if (on) {
    if (!draft) return;
    if (!previewBase) previewBase = clone(applied);
    applySnapshot(clone(draft));
    previewing = true;
  } else {
    if (previewBase) applySnapshot(previewBase);
    previewBase = null;
    previewing = false;
  }
  notify();
}

/* -------------------------------------------- editing in the drawer ---- */

/** On #/admin the pages show the draft. */
export function setAutoPreview(on: boolean) {
  if (autoPreview === on) return;
  autoPreview = on;
  if (on) {
    previewing = true;
    applySnapshot(clone(getDraft()));
  } else {
    previewing = false;
    applyOverrides(overrides);
  }
  notify();
}

/** Nothing is published until the office says so, so applying is always safe. */
function applyDraftLive() {
  if (autoPreview) applySnapshot(clone(getDraft()));
}

/* ------------------------------------------------------- live preview, paced */

/** Applying is paced: instant in the drawer, the page behind follows within a beat. */
const PREVIEW_MS = 160;
const PREVIEW_MAX_MS = 600;
let previewTimer = 0;
let previewWaiting = 0;

function applyDraftLiveSoon() {
  if (!autoPreview) return;
  const now = Date.now();
  if (!previewTimer) previewWaiting = now;
  const due = Math.min(now + PREVIEW_MS, previewWaiting + PREVIEW_MAX_MS);
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    previewTimer = 0;
    applyDraftLive();
  }, Math.max(0, due - now));
}

/** Apply a preview that is still waiting, now (before the draft changes meaning). */
export function flushLivePreview() {
  if (!previewTimer) return;
  window.clearTimeout(previewTimer);
  previewTimer = 0;
  applyDraftLive();
}

/** Throw a waiting preview away — the content it would show is no longer the draft. */
function dropLivePreview() {
  if (!previewTimer) return;
  window.clearTimeout(previewTimer);
  previewTimer = 0;
}

/** Put the draft back on the page (note 83). */
function showDraftIfEditing() {
  if (!autoPreview || !draft) return;
  applyDraftLive();
}

/** Reword one line of page text (the drawer's *Page text* field). */
export function setCopyValue(copyId: string, value: string) {
  /* Buttons, page titles and section titles cannot be reworded. */
  if (copyIsFixed(copyId)) return;
  const sectionId = copySectionOf(copyId);
  if (!sectionId) return;
  const list = getDraft()[sectionId];
  if (!Array.isArray(list)) return;
  setSectionValue(
    sectionId,
    list.map((entry: any) => (entry && entry.id === copyId ? { ...entry, value } : entry))
  );
}

/** Replace one of the site's photos (a row in the drawer's *Photos & covers*). */
export function setPhotoValue(slotKey: string, value: string) {
  const sectionId = photoSectionId(slotKey);
  if (!sectionId) return;
  const current = getDraft()[sectionId];
  if (!current || typeof current !== "object") return;
  setSectionValue(sectionId, { ...current, [slotKey]: value });
}

/* ------------------------------------------------------------------ socket */

function socketFactory(): (() => any) | null {
  /* Local runs: the dev/production server injects its own same-origin socket
     (scripts/local-shim.js) — sign-in, publishing, uploads, live updates. */
  const w = window as any;
  if (typeof w.createServerSocket === "function") return () => w.createServerSocket();
  /* A deployed copy pointed at the office server (baked in at deploy time or
     typed into the admin console): the same shared store, over plain HTTPS. */
  const remote = serverUrl();
  if (remote) return () => createRemoteSocket(remote);
  return null;
}

/* The baked snapshot, painted once — the instant words behind every first
   paint, and the standing words whenever no server can be reached. */
let seedApplied = false;
async function applySeedOnce() {
  if (seedApplied) return;
  seedApplied = true;
  try {
    const res = await fetch(siteFile("seed.json"), { cache: "no-store" });
    if (res.ok) {
      const seed = await res.json();
      /* The baked recent-services list paints even when the words are not
         newer — it is the office's channel read, not a publish. */
      applyBakedRecent(seed);
      if (seed && seed.sections && typeof seed.sections === "object" && Object.keys(seed.sections).length) {
        rev = typeof seed.rev === "number" ? seed.rev : 0;
        /* The baked seed paints words and reports its bake-time publish stamp
           as evidence (note 300) — raised, never lowered — but never blesses
           beyond what was truly published: only an explicit publish on this
           copy's own server, on the feed, or a local publish moves the stamp
           to the running update. A pushed stamp used to leak through the bake
           and open new code with no office review, which is how the
           maintenance notice kept going missing on updates. A bake stamped
           from the running update (or newer) therefore releases at once,
           while an older bake still means wait.
           The browser's own memory first (note 281): the hold stamp below
           persists itself, so immunity must be read before it lands. */
        /* Note 301: immunity is the browser's own memory BEFORE the bake lands. */
        const seenBefore = readJSON<number>(NOTES_KEY, 0);
        if (typeof (seed as any).notes === "number") setPublishedNotes((seed as any).notes);
        /* Maintenance hold (stamped by maintenance-hold.txt at build time): a
           visitor with no recorded publish is held one update back, so the
           notice shows until the office publishes — even when the baked stamp
           is empty. Once the baked stamp itself is caught up (published from this update), fresh visitors are NOT re-held, so a rebuild after publishing releases everyone. A recorded publish is never re-held,
           so publishing releases visitors with no rebuild; a newer stamp is
           never lowered, so the older-copy path stays intact.
           The hold is only manufactured when the running code is new (note
           300): proven by an older stored codegen, or unprovable either way
           (no record — a fresh browser meets every build as new). A browser
           that already ran THIS build never gets a manufactured stamp — with
           no new update its last-published stands until the server or the
           feed says otherwise. */
        if (seed.hold === true && publishedNotes < BUILD_NOTES) {
          if (!(typeof seenBefore === "number" && seenBefore >= BUILD_NOTES)) {
            let ranThisBuild = false;
            try {
              const cg = readJSON<number>(CODEGEN_KEY, 0);
              ranThisBuild = typeof cg === "number" && Math.floor(cg) === BUILD_NOTES;
            } catch {
              ranThisBuild = false;
            }
            if (!ranThisBuild) setPublishedNotes(BUILD_NOTES - 1);
          }
        }
        applyOverrides(seed.sections);
      }
    }
  } catch {
    /* no baked seed (the live site, local runs) — the defaults stand */
  }
}

/* Live feed: published words polled from the public repo for standalone copies. */
let feedSpec: FeedSpec | null | undefined;
let feedSyncing = false;
async function syncFromFeed() {
  if (feedSyncing) return;
  if (typeof socket !== "undefined" && socket && status === "online") return;
  feedSyncing = true;
  try {
    if (feedSpec === undefined) feedSpec = await bakedFeedSpec();
    if (!feedSpec) return;
    const seed = await peekSeed(feedSpec, 15000);
    if (!seed) return;
    /* The baked services paint on every feed read — even when the words are
       not newer, the list may be (a Sunday uploads with no publish). */
    applyBakedRecent(seed);
    if (!feedIsNewer(seed, rev)) return;
    const live = seed as FeedSeed;
    /* An empty feed must never clear published words either (note 289) — a
       wiped live box bakes an empty seed until the office heals it. */
    const liveSections = (live.sections || {}) as Snapshot;
    if (!Object.keys(liveSections).length && Object.keys(overrides).length) return;
    rev = live.rev;
    if (typeof live.notes === "number") setPublishedNotes(live.notes);
    applyOverrides(liveSections);
    writeCache();
  } catch {
    /* the feed stays a best effort */
  } finally {
    feedSyncing = false;
  }
}
let feedStarted = false;
function startFeed() {
  if (feedStarted) return;
  feedStarted = true;
  syncFromFeed().catch(() => {});
  window.setInterval(() => syncFromFeed().catch(() => {}), 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncFromFeed().catch(() => {});
  });
  window.addEventListener("online", () => syncFromFeed().catch(() => {}));
}

export async function startCms() {
  if (starting) return;
  starting = true;
  /* Which shared store, if any: the local backend, or the office
     server this copy was pointed at (deploy config or admin console). */
  await initServerUrl().catch(() => {});

  /* Read the stored draft first: applying the cache below writes a draft, which would bury it. */
  const storedDraft = readJSON<{ rev: number; content: Snapshot; dirty?: Record<string, true> } | null>(DRAFT_KEY, null);
  if (storedDraft?.content) {
    draft = normalizeDraft(storedDraft.content);
    draftFromRev = storedDraft.rev || 0;
    dirty = storedDraft.dirty || {};
  }
  draftLoaded = true;
  /* Lapsed slides do not survive a reload — they clear out of the stored draft
     before anything is applied or shown. */
  dropLapsedSlides(true);
  /* While the drawer sits open, a slide's last moment can pass underneath it —
     re-check on the half minute so the row clears by itself. Only notifies when
     something actually lapsed. */
  window.setInterval(() => dropLapsedSlides(true), 30000);
  // Paint instantly; edited sections stay as left; the server syncs over below.
  // …unless this is a new update's first boot (note 253): a fresh extract opens
  // on the new code's own words, never on an older copy's cached paint. The
  // stored draft — the office's own unsaved work — is still adopted above, and
  // anything published while offline still flushes; only the old instant-paint
  // is skipped, and the server sync fills the page in behind it.
  await applySeedOnce();
  const cached = readJSON<{ rev?: number; overrides?: Snapshot; notes?: number } | null>(CACHE_KEY, null);
  // Paint instantly; edited sections stay as left; the server syncs over below.
  // …on a PROVEN new update's first boot only (note 300: the stored codegen
  // exists and differs — note 253): a fresh extract opens on the new code's
  // own words, never on an older copy's cached paint. A missing or unreadable
  // codegen proves nothing — the cached paint (the last published) stays, so
  // the site can never look new and fresh without a new update. The stored
  // draft — the office's own unsaved work — is still adopted above, and
  // anything published while offline still flushes; only the old instant-paint
  // is skipped on a proven new update, and the server sync fills the page in
  // behind it.
  const freshEyes = storedCodegenProvesNewUpdate();
  if (cached?.overrides && !freshEyes) {
    rev = cached.rev || 0;
    applyOverrides(cached.overrides);
  }
  /* The cache remembers which update its words were published from (note 300):
     a returning copy's own evidence of last-published — raised like any other
     witness, so it stays live on that publish even before (or without) the
     first server answer. Older than the running code it still means wait. */
  if (cached && typeof cached.notes === "number") setPublishedNotes(cached.notes);
  try {
    if (readJSON<number>(CODEGEN_KEY, 0) !== BUILD_NOTES) writeJSON(CODEGEN_KEY, BUILD_NOTES);
  } catch {
    /* the codegen stamp is best-effort; the paint above already decided */
  }
  history = readJSON<any[]>(HISTORY_KEY, []) || [];
  try {
    const nn = readJSON<number>(NOTES_KEY, 0);
    /* Raise-only, never wipe (note 300): a transient storage failure keeps the
       in-memory stamp — only a proven new update or an explicit office delete
       may move last-published backwards, and neither does so here. */
    if (typeof nn === "number" && nn > publishedNotes) publishedNotes = Math.floor(nn);
  } catch {
    /* storage unreadable — the in-memory stamp stands */
  }
  /* No manufactured stamp (note 300 — the forced hold is gone): a copy that
     is behind already waits on its witnessed stamp, and a copy with no stamp
     waits as unreviewed until the server or the feed reports the publish.
     Writing BUILD_NOTES - 1 here used to drag every stamp-less copy — fresh
     desktop, wiped store, slow server — back into update-mode with no new
     update, and persist it. The gate now decides from evidence alone. */
  pending = readJSON<Snapshot | null>(PENDING_KEY, null);
  /* Boot numbers are final here (seed + stored stamp): bump once so the
     maintenance notice re-evaluates instead of sticking with first paint
     (note 278). One extra render, boot only. */
  version += 1;
  /* The drawer mounts first, so the stored draft arriving late is put on the page (note 83). */
  showDraftIfEditing();
  notify();

  if (!socketFactory()) {
    status = "local";
    localOnly = true;
    connNote = "no office address found for this copy";
    notify();
    /* No socket anywhere: the live feed keeps this copy fresh instead. */
    startFeed();
    /* A late-arriving server address is joined with no reload. */
    watchForServer();
    setBootReady();
    return;
  }
  /* A tab coming back re-reads the server (missed nudges); throttled, never mid-sync. */
  let lastFocusSync = 0;
  let focusSyncing = false;
  const refocus = () => {
    if (document.visibilityState === "hidden" || !socket || status !== "online") return;
    if (focusSyncing || Date.now() - lastFocusSync < 5000) return;
    focusSyncing = true;
    lastFocusSync = Date.now();
    syncFromServer()
      .catch(() => {})
      .finally(() => {
        focusSyncing = false;
      });
  };
  window.addEventListener("focus", refocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refocus();
  });
  /* Hold the first paint until the first sync attempt settles: after a publish
     the numbers already say live, so no maintenance flash; in the update window
     they say wait. Never holds longer than the open timeout. */
  initialSyncPending = true;
  initialSyncDone = new Promise<void>((res) => {
    initialSyncResolve = res;
  });
  connect();
  try {
    await Promise.race([
      initialSyncDone,
      new Promise<void>((res) => window.setTimeout(() => res(), REQUEST_TIMEOUT + 1000)),
    ]);
  } catch {
  } finally {
    setBootReady();
  }
}

/* Drop a dead socket so the next attempt starts fresh (a kept one blocks retries). */
function dropSocket() {
  const sock = socket;
  socket = null;
  try {
    (sock?.close as any)?.call(sock);
  } catch {}
}

/* A user-initiated join: fresh backoff, no waiting out the timer, no dead socket. */
export async function retryNow() {
  reconnectAttempt = 0;
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }
  if (socket && status !== "online") dropSocket();
  /* An address that arrived since boot (console override, deploy file, office started late). */
  if (!socketFactory()) {
    try {
      await refreshServerUrl();
    } catch {}
  }
  if (!socket && socketFactory()) connect();
  else notify();
}

/* An open that never settles must still end (the raw-socket path already has one). */
function openTimeout(ms: number): Promise<void> {
  return new Promise<void>((_, reject) => {
    window.setTimeout(() => reject(new Error("open timeout")), ms);
  });
}

function connect() {
  if (socket) {
    /* A live connection is kept; a dead one is dropped so this attempt is real. */
    if (status === "online") {
      settleInitialSync();
      return;
    }
    dropSocket();
  }
  /* No server anywhere: stand alone (and join one quietly if it appears later). */
  if (!socketFactory()) {
    status = "local";
    localOnly = true;
    connNote = "no office address found for this copy";
    notify();
    startFeed();
    watchForServer();
    settleInitialSync();
    return;
  }
  status = "connecting";
  notify();
  let sock: any;
  try {
    sock = socketFactory()!();
  } catch (err) {
    console.warn("cms: could not create socket", err);
    status = "offline";
    connNote = String((err as any)?.message || err || "could not open the server").slice(0, 120);
    notify();
    scheduleReconnect();
    settleInitialSync();
    return;
  }
  socket = sock;
  if ("binaryType" in sock) sock.binaryType = "arraybuffer";

  const opened = Promise.race([
    sock.opened instanceof Promise ? sock.opened : waitForOpen(sock),
    openTimeout(REQUEST_TIMEOUT),
  ]);

  opened
    .then(async () => {
      /* A dropped socket's late open changes nothing. */
      if (socket !== sock) {
        settleInitialSync();
        return;
      }
      reconnectAttempt = 0;
      status = "online";
      connNote = "";
      notify();
      sock.addEventListener?.("close", onClose);
      sock.addEventListener?.("message", onMessage);
      await syncFromServer();
      // Restore the admin session for this browser tab, if there is one.
      // Only an explicit denial ends it (note 296): a hiccup in the re-login
      // must never burn the saved session, or one bad minute logs the office
      // out for good. Anything else (offline, rate, transport error) keeps
      // the session for the next attempt.
      const saved = sessionPassword();
      if (saved) {
        try {
          const res = await login(saved, true);
          if (!res.ok && res.error === "denied") clearSession();
          else if (res.ok) await flushPending();
        } catch {}
      }
      // Converge in one pass: the heal above (or another editor) may have
      // moved the server while this tab was gone.
      try {
        await syncFromServer();
      } catch {}
      // If the editor saved the website for us mid-publish, finish that publish
      // now — this is the permanent server, so the content belongs here.
      await resumePlannedPublish();
      settleInitialSync();
    })
    .catch((err: any) => {
      /* A dropped attempt's late failure changes nothing. */
      if (socket !== sock) {
        settleInitialSync();
        return;
      }
      socket = null;
      status = "offline";
      connNote = String(err?.message || err || "unreachable").slice(0, 120);
      notify();
      scheduleReconnect();
      console.warn("cms: server unavailable", err?.message || err);
      settleInitialSync();
    });
}

/* A standalone copy joins a server that appears after boot, quietly. */

/* The server bumps this on every main-password change; older sessions sign out. */
const PWGEN_KEY = "wom.cms.pwgen";

/* Which account this browser's saved session belongs to ("main" or "sub"): a
   main-password change ends main sessions but leaves sub-admins signed in. */
const PWROLE_KEY = "wom.cms.pwrole";

function knownPwgen(): number | null {
  try {
    const raw = localStorage.getItem(PWGEN_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function savedPwRole(): string {
  try {
    return localStorage.getItem(PWROLE_KEY) || "";
  } catch {
    return "";
  }
}

/* This sign-in just proved itself against the server: remember which password
   generation (and which account) it belongs to. Never clears — proving beats
   guessing. */
function recordPwgen(pw: unknown, role: string) {
  if (typeof pw !== "number" || !Number.isFinite(pw)) return;
  try {
    localStorage.setItem(PWGEN_KEY, String(pw));
    if (role === "main" || role === "sub") localStorage.setItem(PWROLE_KEY, role);
  } catch {}
}

/* Returns false when this tab's session was just cleared. */
function noteServerPwgen(pw: unknown): boolean {
  if (typeof pw !== "number" || !Number.isFinite(pw)) return true;
  const known = knownPwgen();
  if (known === null || known === pw) {
    if (known === null) recordPwgen(pw, savedPwRole() || "main");
    return true;
  }
  const hasSession = authed || !!sessionPassword();
  if (hasSession && savedPwRole() !== "sub") {
    /* A number alone never signs this tab out (note 296): a restarted box
       reports generation 0 with the default password back, and burning the
       saved session on that would log the office out on every restart — the
       re-login below would never even be attempted. The saved session
       re-proves itself instead: only an explicit denial ends it. */
    recordPwgen(pw, savedPwRole() || "main");
    const saved = sessionPassword();
    if (saved) {
      notify();
      login(saved, true)
        .then((res) => {
          if (!res.ok && res.error === "denied") {
            clearSession();
          }
        })
        .catch(() => {});
      return true;
    }
    clearSession();
    return false;
  }
  recordPwgen(pw, savedPwRole() || "main");
  return true;
}

/* This browser's office-server address (typed on the sign-in card); "" when unset. */
export function officeServerOverride(): string {
  return serverOverride();
}
/* Point this copy at the office server ("" clears it); signing in joins it. */
export function setOfficeServerOverride(url: string) {
  setServerOverride(url);
}
/* Join the shared server on demand (bounded wait); a sign-in always tries live first. */
export async function ensureOnline(timeoutMs = 20000): Promise<boolean> {
  if (socket && status === "online") return true;
  await retryNow();
  if (!socket) return false;
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  while (Date.now() < deadline) {
    if (socket && status === "online") return true;
    /* No server anywhere: joining later is watchForServer's job, not this wait's. */
    if (status === "local" && !socketFactory()) return false;
    if (!socket && !reconnectTimer && socketFactory()) connect();
    await new Promise((r) => setTimeout(r, 250));
  }
  return !!(socket && status === "online");
}
let watchingForServer = false;
function watchForServer() {
  if (watchingForServer) return;
  watchingForServer = true;
  let checking = false;
  const check = async () => {
    if (!localOnly || socket || checking) return;
    checking = true;
    try {
      /* Fresh resolution every check (not the boot cache): this is what lets
         an open tab join a server that appeared later with no reload. */
      await refreshServerUrl().catch(() => {});
      if (!localOnly || socket) return;
      if (socketFactory()) {
        localOnly = false;
        notify();
        connect();
      }
    } finally {
      checking = false;
    }
  };
  window.setInterval(() => check().catch(() => {}), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check().catch(() => {});
  });
  window.addEventListener("online", () => check().catch(() => {}));
}

function waitForOpen(sock: any) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT);
    sock.addEventListener("open", () => {
      window.clearTimeout(timer);
      resolve();
    });
    sock.addEventListener("close", (e: any) => {
      window.clearTimeout(timer);
      reject(new Error("closed: " + (e?.code ?? "")));
    });
    sock.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("socket error"));
    });
  });
}

/** Another editor published: pull the new revision straight away. */
function onMessage(event: any) {
  const data = event?.data;
  if (typeof data !== "string" || data.indexOf("rev") === -1) return;
  syncFromServer().catch(() => {});
}

function onClose(event: any) {
  socket = null;
  /* The sign-in survives a dropped connection (note 296): sleep/wake cycles,
     server restarts and network blips all close the socket, and signing the
     office out on every one of them — then burning the saved session on a
     flaky re-login — is how tabs ended up logged out minutes after opening.
     The reconnect re-proves the saved session; only an explicit denial ends
     it. Offline work keeps queueing into pending either way. */
  if (event?.code === 4403) {
    // embedding blocked elsewhere is permanent: stay local.
    status = "local";
    localOnly = true;
    connNote = "this page is embedded where the server is blocked";
    notify();
    startFeed();
    return;
  }
  status = "offline";
  connNote = "connection lost — retrying";
  notify();
  startFeed();
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30000, 1400 * Math.pow(1.7, reconnectAttempt++)) + Math.random() * 600;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    connect();
  }, delay);
}

async function syncFromServer() {
  const raw = await socket.rpc.getContent("");
  const res = JSON.parse(raw);
  if (!res?.ok) return;
  /* A changed office password signs this tab's old session out by itself. */
  noteServerPwgen(res.pwgen);
  let server: Snapshot = {};
  try {
    server = res.sections ? JSON.parse(res.sections) : {};
  } catch (err) {
    console.warn("cms: could not read the server content", err);
    return;
  }
  const serverRev = typeof res.rev === "number" ? res.rev : 0;
  /* The server's ~15-minute undo window rides every content answer (note 291). */
  const undoLeft = typeof res.undoLeft === "number" ? Math.max(0, Math.floor(res.undoLeft)) : 0;
  undoUntilAt = undoLeft > 0 ? Date.now() + undoLeft * 1000 : 0;
  const differs = serverRev !== rev || JSON.stringify(server) !== JSON.stringify(overrides);
  /* Seeded fallback, older than what this tab holds (note 290): the server
     restarted without a disk and came back on its last deployed bake, while
     this tab still carries words published on live AFTER that deploy. Painting
     the older bake would clear those newer words by itself — so keep showing
     them, stash them for the server, and let an office tab put them back up
     (healEmptyServer moves the server forward, never backward). Fresh tabs
     (nothing held) and newer server answers fall through to the normal path.
     Deliberate restores are never marked seeded, so they still apply. */
  if ((res as any).seeded === true && Object.keys(overrides).length && serverRev < rev) {
    if (pending) pending = { ...clone(pending), ...clone(overrides) };
    else if (!plannedPublish()) pending = clone(overrides);
    if (pending) writeJSON(PENDING_KEY, pending);
    if (authed) {
      try {
        await healEmptyServer("Office words put back after the server fell back to its last deploy");
      } catch {}
    }
    notify();
    return;
  }
  /* Note 301: a blank answer can never bless and never clear — the empty
     guard runs BEFORE the publish stamp is adopted, so only a live answer
     moves maintenance. */
  if (!Object.keys(server).length && Object.keys(overrides).length) {
    if (pending) pending = { ...clone(pending), ...clone(overrides) };
    else if (!plannedPublish()) pending = clone(overrides);
    if (pending) writeJSON(PENDING_KEY, pending);
    if (authed) {
      try {
        await healEmptyServer();
      } catch {}
    }
    notify();
    return;
  }
  /* The publish stamp alone can flip the maintenance notice (note 278): it
     must re-render even when the content itself is unchanged. Reaching here
     means the answer is live (note 296) — the seeded + empty holds above
     already returned. */
  const notesBefore = publishedNotes;
  if (typeof res.notes === "number") setPublishedNotes(res.notes);
  const notesLifted = publishedNotes > notesBefore;
  rev = serverRev;
  updatedAt = res.at || 0;
  updatedBy = res.by || "";
  log = Array.isArray(res.log) ? res.log : [];
  if (differs) {
    /* An empty server answer must never clear published words (note 289):
       a restarted box with no disk, a fresh deploy — the server comes back
       with nothing while this tab still holds what the office published.
       Painting that emptiness would wipe the site, the cache and the draft
       on every tab at once. Published words clear only when the office
       deletes them or a new update lands — so keep showing them, stash them
       for the server, and put them straight back up from an office tab.
       (Handled above before the stamp: reaching here with an empty server
       means this tab holds nothing, so the defaults stand.) */
    if (!Object.keys(server).length && Object.keys(overrides).length) {
      if (pending) pending = { ...clone(pending), ...clone(overrides) };
      else if (!plannedPublish()) pending = clone(overrides);
      if (pending) writeJSON(PENDING_KEY, pending);
      if (authed) {
        try {
          await healEmptyServer();
        } catch {}
      }
      notify();
      return;
    }
    /* First contact with a fresh permanent server: carry over what was published. */
    if (!Object.keys(server).length && Object.keys(overrides).length && !pending && !plannedPublish()) {
      pending = clone(overrides);
      writeJSON(PENDING_KEY, pending);
    }
    applyOverrides(server);
    writeCache();
  } else if (notesLifted) {
    /* Content identical but the publish stamp moved (note 278): bump so the
       maintenance notice re-evaluates instead of sticking with first paint. */
    version += 1;
  }
  notify();
}

/** The server came back empty while this tab holds published words: put the
    whole live set straight back up (values only, never deletions), so one
    office tab heals the box with no publish click needed. Visitors' tabs
    simply keep showing their words until then. */
async function healEmptyServer(why = "Office words put back after the server came back empty"): Promise<boolean> {
  if (!pending || !socket || status !== "online" || !authed) return false;
  const ids = Object.keys(pending);
  if (!ids.length) return false;
  const sections: Record<string, string> = {};
  for (const id of ids) sections[id] = JSON.stringify((pending as Snapshot)[id]);
  /* Heal, never bless (note 293): the words come back, but waiting visitors
     stay waiting until the office publishes for real. */
  const res = await sendPatch(sections, ids, why, false);
  if (!res.ok) return false;
  rev = res.rev ?? rev;
  pending = null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  writeCache();
  notify();
  return true;
}

/** Another editor published while this admin has a draft: keep the sections
    this admin actually touched, adopt the new content everywhere else. */
function rebaseDraft() {
  if (!draft) return;
  for (const def of SECTION_DEFS) {
    if (!dirty[def.id]) draft[def.id] = clone(applied[def.id]);
  }
  persistDraft();
}

function sessionPassword(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}
function clearSession() {
  /* Sign-out ends the session only (note 297): the saved password goes, the
     admin flags drop, and the tab re-renders signed out. Held words, queued
     work and the publish stamp are untouched here — only an explicit office
     delete (resetLocalCopy) may clear them (note 300). */
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
  try {
    localStorage.removeItem(PWROLE_KEY);
  } catch {}
  authed = false;
  myRole = null;
  myName = "";
  notify();
}

/* ------------------------------------------------------------------- admin */

export async function login(
  password: string,
  silent = false,
  want?: "main" | "sub"
): Promise<{ ok: boolean; error?: string; role?: "main" | "sub" | "invite"; name?: string; needCode?: boolean; q?: string }> {
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };
  try {
    /* On a tie the sub box opens sub, the main box main; elsewhere either matching box opens. */
    const res = JSON.parse(await socket.rpc.login(JSON.stringify({ password, want: want === "sub" ? "sub" : "main" })));
    if (res?.ok) {
      /* A one-time invite code names its invitation but signs nobody in — the
         caller must set the sub-admin's password next (redeemInvite). */
      if (res.role === "invite") return { ok: true, role: "invite", name: typeof res.name === "string" ? res.name : "" };
      /* The main password with two-factor on earns only the second step. `q`
         is the security question, for signing in without the app. */
      if (res.needCode) return { ok: true, role: "main", name: "", needCode: true, q: typeof res.q === "string" ? res.q : "" };
      authed = true;
      myRole = res.role === "sub" ? "sub" : "main";
      myName = typeof res.name === "string" ? res.name : "";
      if (myRole === "sub" && myName && !editorName()) setEditorName(myName);
      try {
        sessionStorage.setItem(SESSION_KEY, password);
      } catch {}
      recordPwgen((res as any).pwgen, myRole);
      notify();
      await flushPending();
      return { ok: true, role: myRole, name: myName };
    }
    if (!silent) notify();
    return { ok: false, error: res?.err || "denied" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
}

export function logout() {
  clearSession();
}

/** Second step of a two-factor sign-in. `password` is only kept for the tab's
    session, so a reload can ask the server for step one again. */
export async function login2fa(code: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };
  try {
    const res = JSON.parse(await socket.rpc.login2fa(JSON.stringify({ code })));
    if (res?.ok) {
      authed = true;
      myRole = "main";
      myName = "";
      try {
        sessionStorage.setItem(SESSION_KEY, password);
      } catch {}
      recordPwgen((res as any).pwgen, "main");
      notify();
      await flushPending();
      return { ok: true };
    }
    return { ok: false, error: res?.err || "denied" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
}
export function isAuthed() {
  return authed;
}

/* ------------------------------------------------------------ sub-admins */

/* One-time invite codes: 12 characters from an unambiguous alphabet (about 60
   bits), shown grouped as XXXX-XXXX-XXXX. The browser generates the code with
   real randomness and the server only ever sees its SHA-256. */
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function genInviteCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => INVITE_ALPHABET[b % 32]).join("");
}
export function formatInviteCode(code: string): string {
  const clean = normalizeInviteCode(code);
  return clean.replace(/.{4}(?=.)/g, "$&-");
}
export function normalizeInviteCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase();
}
export async function sha256HexText(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function validSubName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9 .'\-]{0,39}$/.test(name);
}

async function adminRpc(method: string, payload?: any): Promise<any> {
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };
  try {
    return JSON.parse(await socket.rpc[method](payload === undefined ? "" : JSON.stringify(payload)));
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
}

export type AdminRoster = {
  subs: { name: string; at: number }[];
  invites: { name: string; at: number; expires: number }[];
};

/** Main admin only: everyone who can sign in, plus unused invite codes. */
export async function listAdmins(): Promise<{ ok: boolean; error?: string; subs?: AdminRoster["subs"]; invites?: AdminRoster["invites"] }> {
  const res = await adminRpc("listSubs");
  if (res?.ok) return { ok: true, subs: Array.isArray(res.subs) ? res.subs : [], invites: Array.isArray(res.invites) ? res.invites : [] };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: creates the invitation and returns the one-time code to
    pass on. The code itself is never stored anywhere — show it once. */
export async function createInvite(name: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (!validSubName(name)) return { ok: false, error: "bad-name" };
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };
  const code = genInviteCode();
  try {
    const codeHash = await sha256HexText(code);
    const res = JSON.parse(await socket.rpc.createInvite(JSON.stringify({ name, codeHash })));
    if (res?.ok) return { ok: true, code };
    return { ok: false, error: res?.err || "denied" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
}

/** Main admin only: take back an unused invite code. */
export async function revokeInvite(name: string): Promise<{ ok: boolean; error?: string }> {
  const res = await adminRpc("revokeInvite", { name });
  if (res?.ok) return { ok: true };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: remove a sub-admin (their live sessions drop at once). */
export async function deleteSub(name: string): Promise<{ ok: boolean; error?: string }> {
  const res = await adminRpc("deleteSub", { name });
  if (res?.ok) return { ok: true };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Any signed-in admin: does the main password still work? */
export async function mainState(): Promise<{ ok: boolean; off?: boolean; error?: string }> {
  const res = await adminRpc("mainState");
  if (res?.ok) return { ok: true, off: !!res.off };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Retire (off) or restore (on) the main password sign-in. Switching off takes
    the main admin while a sub-admin exists; switching back on takes any
    signed-in admin — so the office can never lock itself out. */
export async function setMainOff(off: boolean): Promise<{ ok: boolean; off?: boolean; error?: string }> {
  const res = await adminRpc("setMainOff", { off });
  if (res?.ok) return { ok: true, off: !!res.off };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: change the office password (two-factor on; only the hash leaves). */
export async function setMainPassword(password: string, proof: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 8 || password.length > 128) return { ok: false, error: "bad-password" };
  if (!proof || !proof.trim()) return { ok: false, error: "bad-proof" };
  try {
    const hash = await sha256HexText(password);
    const res = await adminRpc("setMainPassword", { hash, proof });
    if (res?.ok) {
      try {
        sessionStorage.setItem(SESSION_KEY, password);
        if (typeof res.pwgen === "number" && Number.isFinite(res.pwgen)) localStorage.setItem(PWGEN_KEY, String(res.pwgen));
        localStorage.setItem(PWROLE_KEY, "main");
      } catch {}
      return { ok: true };
    }
    return { ok: false, error: res?.err || res?.error || "denied" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
}

/** Spend a one-time invite code to set the sub-admin's own password. After
    this the code is dead and the password signs in like the main admin's,
    typed into the sub-admin sign-in whenever they visit. */
export async function redeemInvite(code: string, password: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };
  if (password.length < 8 || password.length > 128) return { ok: false, error: "bad-password" };
  try {
    const res = JSON.parse(await socket.rpc.setSubPassword(JSON.stringify({ code: normalizeInviteCode(code), password })));
    if (res?.ok) {
      authed = true;
      myRole = "sub";
      myName = typeof res.name === "string" ? res.name : "";
      if (myName && !editorName()) setEditorName(myName);
      try {
        sessionStorage.setItem(SESSION_KEY, password);
      } catch {}
      recordPwgen((res as any).pwgen, "sub");
      notify();
      await flushPending();
      return { ok: true, name: myName };
    }
    return { ok: false, error: res?.err || "denied" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
}

/* ------------------------------------------------- authenticator (totp) */

/* A fresh authenticator secret: 20 random bytes as 32 base32 characters, ready
   to scan into any authenticator app. Made here, where the randomness is real. */
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function genTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = acc * 256 + b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_ALPHABET[Math.floor(acc / 2 ** bits) % 32];
      acc = acc % 2 ** bits;
    }
  }
  return out;
}

/* The otpauth URL behind the setup QR code. */
export function totpUri(secret: string): string {
  const label = encodeURIComponent("World Overcomers:Main admin");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("World Overcomers")}&digits=6&period=30`;
}

/** Main admin only: is two-factor on, and is a security question set? */
export async function totpState(): Promise<{ ok: boolean; enabled?: boolean; hasQ?: boolean; q?: string; error?: string }> {
  const res = await adminRpc("totpStatus");
  if (res?.ok)
    return { ok: true, enabled: !!res.enabled, hasQ: !!res.hasQ, q: typeof res.q === "string" ? res.q : "" };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: store the secret plus the security question, after a live
    code proves the app reads it. */
export async function totpEnroll(secret: string, q: string, answer: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const res = await adminRpc("totpSetup", { secret, q, answer, code });
  if (res?.ok) {
    try {
      window.dispatchEvent(new CustomEvent("wom:totp-changed"));
    } catch {}
    return { ok: true };
  }
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: set or refresh the security question and answer. `proof`
    is a current app code or the current answer, proving it is really them. */
export async function setSecurityQA(q: string, answer: string, proof: string): Promise<{ ok: boolean; error?: string }> {
  const res = await adminRpc("setSecurityQA", { q, answer, proof });
  if (res?.ok) return { ok: true };
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: switch two-factor off with the security answer. */
export async function totpDisable(code: string): Promise<{ ok: boolean; error?: string }> {
  const res = await adminRpc("totpDisable", { code });
  if (res?.ok) {
    try {
      window.dispatchEvent(new CustomEvent("wom:totp-changed"));
    } catch {}
    return { ok: true };
  }
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/** Main admin only: switch two-factor off from the header toggle. */
export async function totpOffNow(): Promise<{ ok: boolean; error?: string }> {
  const res = await adminRpc("totpOffNow");
  if (res?.ok) {
    try {
      window.dispatchEvent(new CustomEvent("wom:totp-changed"));
    } catch {}
    return { ok: true };
  }
  return { ok: false, error: res?.err || res?.error || "denied" };
}

/* A small handle for debugging from the browser console (and for future
   sessions): window.__churchCms.socket() gives the raw server socket. */
(window as any).__churchCms = {
  state: () => stateObj,
  socket: () => socket,
  draft: () => draft,
  getDraft: () => getDraft(),
  applied: () => applied,
  overrides: () => overrides,
  sync: () => syncFromServer(),
  apply: (snap: Snapshot) => applySnapshot(snap),
  set: (id: string, value: any) => setSectionValue(id, value),
  unsaved: () => websiteIsUnsaved(),
  pending: () => pendingEdits(),
  revert: (id: string) => revertSection(id),
  planned: () => plannedPublish(),
  finishPlanned: () => finishPlannedPublish(),
};

/* ------------------------------------------------------------------- draft */

export function getDraft(): Snapshot {
  if (!draft) {
    draft = clone(applied);
    draftFromRev = rev;
  }
  dropLapsedSlides();
  migrateTestimonies();
  return draft;
}

/** Old wall-shaped saves are folded into the section on first touch. */
function migrateTestimonies() {
  if (!draft || !Array.isArray(draft.testimonies)) return;
  const items = draft.testimonies;
  const prev = applied.testimonies;
  const categories =
    prev && !Array.isArray(prev) && Array.isArray(prev.categories) ? prev.categories : clone(TESTIMONY_CATEGORIES);
  draft.testimonies = { items, categories };
  dirty.testimonies = true;
  persistDraft();
}

/** Lapsed slides and notices clear out of the draft (throttled; the site never shows them anyway). */
let lastSlidePurge = 0;
function dropLapsedSlides(force = false): boolean {
  const now = Date.now();
  if (!force && now - lastSlidePurge < 5000) return false;
  lastSlidePurge = now;
  if (!draft) return false;
  let dropped = false;
  if (Array.isArray(draft.slides)) {
    const kept = purgeExpiredSlides(draft.slides);
    if (kept.length !== draft.slides.length) {
      draft.slides = kept;
      /* Unpublished work, like any other deletion: without this the next
         server answer rebases the row straight back into the drawer. */
      dirty.slides = true;
      dropped = true;
    }
  }
  if (Array.isArray(draft.announcements)) {
    const kept = purgeExpiredAnnouncements(draft.announcements);
    if (kept.length !== draft.announcements.length) {
      draft.announcements = kept;
      /* Unpublished work, like any other deletion: without this the next
         server answer rebases the row straight back into the drawer. */
      dirty.announcements = true;
      dropped = true;
    }
  }
  if (!dropped) return false;
  persistDraft();
  /* Deferred: getDraft() runs during render, so never notify synchronously. */
  queueMicrotask(() => notify());
  return true;
}

export function setSectionValue(sectionId: string, value: any) {
  const d = getDraft();
  const prev = clone(d[sectionId]);
  if (JSON.stringify(prev) === JSON.stringify(value)) return;
  pushEditUndo(sectionId, prev);
  d[sectionId] = value;
  dirty[sectionId] = true;
  persistDraft();
  /* The drawer reads the draft, so its field updates on this notify; the page
     behind it is re-drawn on the paced preview (see applyDraftLiveSoon). */
  notify();
  applyDraftLiveSoon();
}

export function resetSection(sectionId: string) {
  const d = getDraft();
  const prev = clone(d[sectionId]);
  if (JSON.stringify(prev) === JSON.stringify(defaults[sectionId])) return;
  pushEditUndo(sectionId, prev);
  d[sectionId] = clone(defaults[sectionId]);
  dirty[sectionId] = true;
  persistDraft();
  notify();
  applyDraftLiveSoon();
}

/* --------------------------------------------------------------- undo edits */

function pushEditUndo(sectionId: string, prev: any) {
  const last = editUndos[editUndos.length - 1];
  const now = Date.now();
  /* Coalesce a burst of edits to the same section (typing a sentence) into one
     undo, keeping the value from before the burst. */
  if (last && last.sectionId === sectionId && now - last.at < EDIT_COALESCE_MS) {
    last.at = now;
    return;
  }
  editUndos.push({ sectionId, prev, at: now });
  if (editUndos.length > 60) editUndos.shift();
}

/** True while there is a change the office can take back. */
export function canUndoEdit(): boolean {
  return editUndos.length > 0;
}

/** Take back the last change to the draft. Returns the section it restored. */
export function undoEdit(): { ok: boolean; label?: string } {
  const entry = editUndos.pop();
  if (!entry) return { ok: false };
  const d = getDraft();
  d[entry.sectionId] = entry.prev;
  dirty[entry.sectionId] = true;
  persistDraft();
  /* A discrete step, not typing: show it now rather than on the paced preview. */
  if (autoPreview) {
    dropLivePreview();
    applyDraftLive();
  } else notify();
  const def = sectionById(entry.sectionId);
  return { ok: true, label: def ? def.label : entry.sectionId };
}

function persistDraft() {
  if (!draft || !draftLoaded) return;
  /* A section the site no longer offers (a renamed id from an older save) can
     never be published or cleared, so its flag must not linger forever. */
  for (const id of Object.keys(dirty)) if (!sectionById(id)) delete dirty[id];
  writeJSON(DRAFT_KEY, { rev: draftFromRev, content: draft, dirty });
}

export function discardDraft() {
  draft = null;
  dirty = {};
  editUndos = [];
  previewing = false;
  previewBase = null;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
  // Put the published content back on screen (the pages have been showing the
  // draft the whole time the office was here).
  applyOverrides(overrides);
  notify();
}

export function hasChanges(): boolean {
  return pendingSections().length > 0;
}

export function changedSections(a: Snapshot, b: Snapshot): string[] {
  const out: string[] = [];
  for (const def of SECTION_DEFS) {
    if (JSON.stringify(a?.[def.id]) !== JSON.stringify(b?.[def.id])) out.push(def.id);
  }
  return out;
}

export function exportSnapshot(): string {
  return JSON.stringify(
    { site: "world-overcomers", exportedAt: Date.now(), rev, content: draft || applied },
    null,
    2
  );
}

export function importSnapshot(text: string): { ok: boolean; error?: string } {  try {
    const parsed = JSON.parse(text);
    const content = parsed?.content && typeof parsed.content === "object" ? parsed.content : parsed;
    if (!content || typeof content !== "object") return { ok: false, error: "That file does not look like a content export." };
    const known = SECTION_DEFS.filter((d) => content[d.id] !== undefined).length;
    if (!known) return { ok: false, error: "No recognised sections in that file." };
    draft = normalizeDraft({ ...clone(defaults), ...content });
    dirty = {};
    editUndos = [];
    for (const def of SECTION_DEFS) if (content[def.id] !== undefined) dirty[def.id] = true;
    persistDraft();
    notify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Could not read that file." };
  }
}

/* --------------------------------------- backup file + restore (with images) */

type BackupFile = { name: string; type: string; data: string };

/** Every office-server upload the published content points at. Remote links
    (video pages, stills, pasted addresses, CDN photos) travel as words and
    need nothing — only /data/uploads/ files live on the office disk. */
function localUploadNames(content: Snapshot): string[] {
  const seen = new Set<string>();
  const re = /\/data\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;
  const text = JSON.stringify(content);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) seen.add(m[1]);
  return [...seen];
}

function guessUploadType(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return (
    ({
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
      mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v", ogv: "video/ogg",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", opus: "audio/opus", mid: "audio/midi", midi: "audio/midi",
    } as Record<string, string>)[ext] || "application/octet-stream"
  );
}
/** One file is never allowed to sink a whole backup: past this the tab would
    risk running out of memory while encoding, so it is named, not embedded. */
const BACKUP_FILE_MAX_BYTES = 200 * 1024 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** The latest PUBLISHED content as a downloadable backup — never draft edits.
    Every office-server photo/video the content uses rides inside the file, so
    a restore brings everything back exactly as stored. Uploads are never
    deleted server-side: they sit in data/uploads/ until the office removes
    them, and every backup carries copies regardless. */
export async function exportPublished(): Promise<string> {
  const content = merge(overrides);
  const base = serverUrl();
  const files: BackupFile[] = [];
  const missingFiles: string[] = [];
  for (const name of localUploadNames(content)) {
    try {
      const res = await fetch((base ? base : "") + "/data/uploads/" + name, { cache: "no-store" });
      if (!res.ok) throw 0;
      const blob = await res.blob();
      if (!blob.size) throw 0;
      if (blob.size > BACKUP_FILE_MAX_BYTES) {
        missingFiles.push(name + " (too large: " + Math.round(blob.size / 1048576) + " MB)");
        continue;
      }
      files.push({ name, type: blob.type || guessUploadType(name), data: await blobToBase64(blob) });
    } catch {
      missingFiles.push(name);
    }
  }
  return JSON.stringify(
    { site: "world-overcomers", kind: "content-backup", exportedAt: Date.now(), rev, content, files, missingFiles },
    null,
    2
  );
}

export type ImportResult = {
  ok: boolean;
  error?: string;
  restored?: string[];
  skipped?: string[];
  filesRestored?: number;
  filesFailed?: string[];
  filesMissing?: string[];
};

/**
 * Restore an uploaded backup into the draft — review, then Publish to put it
 * live. Only sections this update still carries come back: anything the update
 * cleared is left out (and named, so the office sees what stayed behind).
 * Dropped fields inside kept sections never resurrect either — the merge keeps
 * this update's shape and ignores stored keys it no longer knows.
 * Embedded uploads are written back under their exact stored names, so the
 * restored words point at working photos from the first Publish.
 */
export async function importBackup(text: string): Promise<ImportResult> {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
  const content = parsed?.content && typeof parsed.content === "object" && !Array.isArray(parsed.content) ? parsed.content : parsed;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { ok: false, error: "That file does not look like a content backup." };
  }
  if (parsed?.site && parsed.site !== "world-overcomers") {
    return { ok: false, error: "That backup belongs to a different site." };
  }
  const known = new Set(SECTION_DEFS.map((d) => d.id));
  const kept: Snapshot = {};
  const skipped: string[] = [];
  for (const key of Object.keys(content)) {
    if (known.has(key)) kept[key] = content[key];
    else skipped.push(key);
  }
  const restored = SECTION_DEFS.filter((d) => kept[d.id] !== undefined).map((d) => d.id);
  if (!restored.length) return { ok: false, error: "No recognised sections in that file." };
  draft = normalizeDraft({ ...clone(defaults), ...kept });
  draftFromRev = rev;
  dirty = {};
  editUndos = [];
  for (const id of restored) dirty[id] = true;
  persistDraft();
  notify();
  /* The photos ride home: each embedded upload is written back under its
     exact stored name. Old backups without embedded files still import —
     their words simply point at whatever the server still holds. */
  const incoming: BackupFile[] = Array.isArray(parsed?.files) ? parsed.files : [];
  const filesMissing: string[] = Array.isArray(parsed?.missingFiles)
    ? parsed.missingFiles.filter((n: any) => typeof n === "string")
    : [];
  const filesFailed: string[] = [];
  let filesRestored = 0;
  if (incoming.length) {
    const base = serverUrl();
    let reachable = !!base;
    if (!base) {
      try {
        const host = window.location?.hostname || "";
        reachable = host === "localhost" || host === "127.0.0.1" || host === "";
      } catch {
        reachable = false;
      }
    }
    if (!reachable) {
      for (const f of incoming) if (f && typeof f.name === "string") filesFailed.push(f.name);
    } else {
      for (const f of incoming) {
        try {
          const name = String(f?.name || "");
          if (!name || typeof f?.data !== "string" || !f.data) throw 0;
          const type = typeof f?.type === "string" && f.type ? f.type : guessUploadType(name);
          const res = await fetch(`${base}/__restore-file?name=${encodeURIComponent(name)}`, {
            method: "POST",
            headers: { "content-type": type },
            body: base64ToBlob(f.data, type),
          });
          if (!res.ok) throw 0;
          filesRestored++;
        } catch {
          if (f && typeof f.name === "string") filesFailed.push(f.name);
        }
      }
    }
  }
  return { ok: true, restored, skipped, filesRestored, filesFailed, filesMissing };
}

/* ----------------------------------------------------------------- publish */

export type PublishResult = { ok: boolean; error?: string; local?: boolean };

/** Only the sections that differ from what is live are sent. */
function buildPatch(target: Snapshot): { sections: Record<string, string | null>; changed: string[] } {
  const sections: Record<string, string | null> = {};
  const changed: string[] = [];
  for (const def of SECTION_DEFS) {
    const next = JSON.stringify(target[def.id]);
    if (next !== JSON.stringify(publishedSection(def.id))) {
      sections[def.id] = next;
      changed.push(def.id);
    }
  }
  return { sections, changed };
}

function rememberHistory() {
  history = [{ rev, at: updatedAt, by: updatedBy, overrides: clone(overrides) }, ...history].slice(0, 5);
  writeJSON(HISTORY_KEY, history);
}

const BATCH_CHARS = 20000;
const BATCH_SECTIONS = 4;

/** Send a patch in batches that stay well inside the server's CPU budget. */
async function sendPatch(
  sections: Record<string, string | null>,
  changed: string[],
  note: string,
  /* Bless the running update (note 293): true for a deliberate office action
     (publish, undo click, bless, offline flush) — the server's publish stamp
     moves to this code and waiting visitors are released. False for the
     automatic heal that puts words back on an emptied server: the words
     return but the notice stays until the office really publishes. */
  bless = true
): Promise<{ ok: boolean; error?: string; rev?: number; sent: string[]; failed?: string[] }> {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const id of changed) {
    const chars = sections[id] ? (sections[id] as string).length : 0;
    if (current.length && (size + chars > BATCH_CHARS || current.length >= BATCH_SECTIONS)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(id);
    size += chars;
  }
  if (current.length) batches.push(current);
  /* No content changes still syncs the update number, so a Publish click
     while visitors wait lifts maintenance (note 249). */
  if (!batches.length) batches.push([]);

  const sent: string[] = [];
  let lastRev: number | undefined;
  for (let b = 0; b < batches.length; b++) {
    const ids = batches[b];
    const part: Record<string, string | null> = {};
    ids.forEach((id) => (part[id] = sections[id]));
    const raw = JSON.stringify({
      sections: part,
      note: note.slice(0, 160),
      by: editorName(),
      changed: ids,
      notes: bless ? BUILD_NOTES : 0,
      /* Only the first batch snapshots the superseded publish for the
         server-side ~15-minute undo (note 291) — later batches must not
         re-snapshot mid-publish. */
      first: b === 0,
      /* Every batch stores its sections, but only the last one records the
         history entry — otherwise one Publish shows up as several rows. */
      quiet: b < batches.length - 1,
    });
    let res: any;
    try {
      res = JSON.parse(await socket.rpc.publish(raw));
    } catch (err: any) {
      return { ok: false, error: err?.message || "error", sent, failed: ids };
    }
    if (!res?.ok) {
      /* A changed/retired password ends the session here too (note 297) —
         the held words stay; only an explicit office delete may clear
         last-published (note 300). */
      if (res?.err === "unauthorized") clearSession();
      return { ok: false, error: res?.err || "failed", sent, failed: ids };
    }
    lastRev = res.rev;
    ids.forEach((id) => {
      sent.push(id);
      const value = sections[id];
      if (value === null) delete overrides[id];
      else overrides[id] = JSON.parse(value);
    });
  }
  return { ok: true, rev: lastRev, sent };
}

/** Put the draft live. `content` is only for the publish that waited on a save. */
export async function publish(note: string, content?: Snapshot): Promise<PublishResult> {
  if (!content && draft) {
    dropLapsedSlides(true);
    migrateTestimonies();
  }
  if (content && Array.isArray(content.slides)) content.slides = purgeExpiredSlides(content.slides);
  if (content && Array.isArray(content.announcements)) content.announcements = purgeExpiredAnnouncements(content.announcements);
  if (draft && Array.isArray(draft.sermons)) stampSermonPublishTimes(draft.sermons);
  if (content && Array.isArray(content.sermons)) stampSermonPublishTimes(content.sermons);
  const snapshot = content || draft || applied;
  const { sections, changed } = buildPatch(snapshot);

  if (!changed.length) {
    draft = null;
    if (publishedNotes >= BUILD_NOTES) {
      notify();
      return { ok: true };
    }
    /* Visitors are waiting and Publish was clicked with no content changes:
       bless the current update so maintenance lifts (note 250: even with no
       server reachable — a local Publish blesses this copy, the server sync
       carries it on when the connection returns). */
    if (!socket || status !== "online") {
      setPublishedNotes(BUILD_NOTES);
      notify();
      return { ok: true, local: true };
    }
    if (!authed) {
      const saved = sessionPassword();
      const res = saved ? await login(saved, true) : ({ ok: false as const });
      if (!res.ok) {
        /* A changed/retired password ends the session here (note 297) but
           keeps every held word, queue entry and stamp — only an explicit
           office delete may clear last-published (note 300). */
        if ((res as any).error === "denied") clearSession();
        return { ok: false, error: "unauthorized" };
      }
    }
    const bless = await sendPatch({}, [], note.slice(0, 160));
    if (!bless.ok) return { ok: false, error: bless.error };
    rev = bless.rev ?? rev + 1;
    setPublishedNotes(BUILD_NOTES);
    writeCache();
    notify();
    return { ok: true };
  }

  if (!socket || status !== "online") {
    // No server reachable: keep the site working locally and remember the
    // override set so it can be sent the moment the connection returns.
    // This still blesses the current update on this copy, so a local Publish
    // lifts maintenance here (note 250).
    rememberHistory();
    overrides = { ...overrides, ...pick(snapshot, changed) };
    applyOverrides(overrides);
    setPublishedNotes(BUILD_NOTES);
    writeCache();
    pending = clone(overrides);
    writeJSON(PENDING_KEY, pending);
    localOnly = true;
    draft = null;
    dirty = {};
    editUndos = [];
    previewBase = null;
    previewing = false;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    notify();
    return { ok: true, local: true };
  }

  const payloadNote = note.slice(0, 160);

  // If the socket reconnected but this connection has not been authenticated
  // yet, restore the tab's session first so a publish is not lost.
  if (!authed) {
    const saved = sessionPassword();
    const res = saved ? await login(saved, true) : { ok: false as const };
    if (!res.ok) {
      /* A changed/retired password ends the session here (note 297) but
         keeps every held word, queue entry and stamp — only an explicit
         office delete may clear last-published (note 300). */
      if ((res as any).error === "denied") clearSession();
      return { ok: false, error: "unauthorized" };
    }
  }

  rememberHistory();
  const result = await sendPatch(sections, changed, payloadNote);
  if (!result.ok) {
    if (result.sent.length) {
      // Part of the patch landed; keep the site consistent with what is stored.
      rev = result.rev ?? rev;
      applyOverrides(overrides, false);
      writeCache();
      notify();
    }
    return { ok: false, error: result.error };
  }

  rev = result.rev ?? rev + 1;
  updatedAt = Date.now();
  updatedBy = editorName();
  setPublishedNotes(BUILD_NOTES);
  applyOverrides(overrides, false);
  writeCache();
  log = [{ rev, at: updatedAt, by: editorName(), role: myRole === "sub" ? "sub" : "main", note: payloadNote, changed }, ...log].slice(0, 20);
  draft = null;
  dirty = {};
  editUndos = [];
  previewBase = null;
  previewing = false;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
  notify();
  return { ok: true };
}

export async function clearLog(): Promise<{ ok: boolean; error?: string }> {
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };
  try {
    const res = JSON.parse(await socket.rpc.clearLog(""));
    if (!res?.ok) return { ok: false, error: res?.err || "failed" };
  } catch (err: any) {
    return { ok: false, error: err?.message || "error" };
  }
  log = [];
  rev = 0;
  updatedAt = 0;
  updatedBy = "";
  writeCache();
  notify();
  return { ok: true };
}

function pick(snap: Snapshot, ids: string[]): Snapshot {
  const out: Snapshot = {};
  for (const id of ids) out[id] = clone(snap[id]);
  return out;
}

/* ------------------------------------------------- saving the website itself */

/** While unsaved, publishes go to a preview server; Publish also asks the editor to save. */
export function websiteIsUnsaved(): boolean {
  return (window as any).generatorIsUnsaved === true;
}

/** Ask the editor tab to save this generator. False when there is no editor. */
export function requestWebsiteSave(): boolean {
  try {
    if (window.parent === window) return false;
    window.parent.postMessage({ type: "saveKeyboardShortcut" }, "*");
    return true;
  } catch {
    return false;
  }
}

/** Hold a publish until the site is saved; the content travels with the plan. */
export function planPublishAfterSave(note: string) {
  writeJSON(AFTER_SAVE_KEY, {
    note: String(note || "").slice(0, 300),
    at: Date.now(),
    content: clone(draft || applied),
  });
}

export function plannedPublish(): { note: string; at: number; content?: Snapshot } | null {
  return readJSON<{ note: string; at: number; content?: Snapshot } | null>(AFTER_SAVE_KEY, null);
}

export function clearPlannedPublish() {
  try {
    localStorage.removeItem(AFTER_SAVE_KEY);
  } catch {}
}

/** Finish a publish that waited on a save; no-op unless a fresh plan exists. */
export async function finishPlannedPublish(): Promise<PublishResult | null> {
  const plan = plannedPublish();
  if (!plan) return null;
  if (Date.now() - (plan.at || 0) > AFTER_SAVE_MAX_AGE_MS) {
    clearPlannedPublish();
    return null;
  }
  /* Still unsaved (the save has not landed yet, or it was never allowed):
     keep the plan so the next reload can finish the job. */
  if (websiteIsUnsaved()) return null;
  clearPlannedPublish();
  if (!authed) return { ok: false, error: "unauthorized" };
  return await publish(plan.note || "", plan.content);
}

/** After the editor saved the website: send the content that was waiting. */
async function resumePlannedPublish() {
  if (!plannedPublish()) return;
  const res = await finishPlannedPublish().catch(() => null);
  if (!res) return;
  if (res.ok) {
    fireToast(
      res.local
        ? "The website is saved. The shared server was unreachable, so your changes are on this device until it is back."
        : "The website is saved, and your changes are live for everyone.",
      res.local ? "info" : "success"
    );
  } else if (res.error === "unauthorized") {
    fireToast("The website is saved. Sign in to the editor again, then press Publish.", "info");
  } else {
    fireToast(`The website is saved, but your changes did not go through (${res.error}). Press Publish again.`, "error");
  }
}

/** Send overrides that were published while the server was unreachable. */
export async function flushPending(): Promise<boolean> {
  if (!pending) return false;
  if (!socket || status !== "online" || !authed) return false;

  const ids: string[] = [];
  const sections: Record<string, string | null> = {};
  const seen: Record<string, true> = {};
  const consider = (id: string) => {
    if (seen[id]) return;
    seen[id] = true;
    const mine = pending ? pending[id] : undefined;
    if (JSON.stringify(mine) === JSON.stringify(overrides[id])) return;
    ids.push(id);
    sections[id] = mine === undefined ? null : JSON.stringify(mine);
  };
  Object.keys(pending).forEach(consider);
  Object.keys(overrides).forEach(consider);
  if (!ids.length) {
    pending = null;
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {}
    notify();
    return true;
  }

  const snapshot = pending;
  applyOverrides(snapshot);
  const res = await sendPatch(sections, ids, `Offline changes published (${ids.length} section${ids.length === 1 ? "" : "s"})`);
  if (!res.ok) return false;
  rev = res.rev ?? rev;
  /* An offline flush is a deliberate office publish (note 293): it blesses
     the running update like any other publish (note 300). */
  setPublishedNotes(BUILD_NOTES);
  pending = null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  writeCache();
  applyOverrides(overrides);
  log = [{ rev, at: Date.now(), by: editorName(), role: myRole === "sub" ? "sub" : "main", note: "Offline changes published", changed: ids }, ...log].slice(0, 30);
  notify();
  return true;
}

/** Roll the whole site back to the override set from the previous publish.
    The server keeps one previous publish for about 15 minutes (note 291), so
    an undo from any signed-in device takes back the same publish — the local
    per-browser entry is only the fallback while it is still fresh. */
export async function undoLastPublish(): Promise<PublishResult> {
  pruneHistory();
  if ((!socket || status !== "online") && !(await ensureOnline())) return { ok: false, error: "offline" };

  /* Server window first: exact, any device, and it consumes the window. */
  if (socket && status === "online" && authed && undoCountdownSec() > 0) {
    try {
      const res = JSON.parse(await socket.rpc.undoPublish(JSON.stringify({ by: editorName() })));
      /* A changed/retired password ends the session here too (note 297) —
         the held words stay; only an explicit office delete may clear
         last-published (note 300). */
      if (res?.err === "unauthorized") clearSession();
      if (res?.ok) {
        if (history.length) {
          history = history.slice(1);
          writeJSON(HISTORY_KEY, history);
        }
        rev = typeof res.rev === "number" ? res.rev : rev;
        undoUntilAt = 0;
        await syncFromServer().catch(() => {});
        return { ok: true };
      }
      if (res?.err !== "expired") return { ok: false, error: res?.err || "failed" };
      undoUntilAt = 0;
    } catch (err: any) {
      return { ok: false, error: err?.message || "error" };
    }
  }

  /* Fallback: this browser's own memory of the previous publish — only while
     that memory is still inside the same ~15-minute window. */
  const entry = history[0];
  if (!entry || Date.now() - entry.at > UNDO_MS) {
    if (entry) pruneHistory();
    return { ok: false, error: "nothing-to-undo" };
  }

  const ids: string[] = [];
  const seen: Record<string, true> = {};
  for (const id of Object.keys(overrides)) {
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  }
  for (const id of Object.keys(entry.overrides || {})) {
    if (!seen[id]) {
      seen[id] = true;
      ids.push(id);
    }
  }
  const sections: Record<string, string | null> = {};
  for (const id of ids) {
    const prev = entry.overrides ? entry.overrides[id] : undefined;
    sections[id] = prev === undefined ? null : JSON.stringify(prev);
  }
  if (!ids.length) return { ok: false, error: "nothing-to-undo" };

  const result = await sendPatch(sections, ids, "Rolled back to the previous revision");
  if (!result.ok) return { ok: false, error: result.error };

  history = history.slice(1);
  writeJSON(HISTORY_KEY, history);
  rev = result.rev ?? rev + 1;
  setPublishedNotes(BUILD_NOTES);
  overrides = clone(entry.overrides || {});
  applyOverrides(overrides, false);
  writeCache();
  await syncFromServer().catch(() => {});
  return { ok: true };
}

/** Drop every stored override, so the site shows exactly the shipped content. */
export async function clearAllOverrides(): Promise<PublishResult> {
  const ids = Object.keys(overrides);
  if (!ids.length) return { ok: true };
  if (!socket || status !== "online") {
    rememberHistory();
    overrides = {};
    applyOverrides({}, false);
    /* A local restore still moves the copy onto this update (note 250). */
    setPublishedNotes(BUILD_NOTES);
    writeCache();
    localOnly = true;
    notify();
    return { ok: true, local: true };
  }
  const sections: Record<string, string | null> = {};
  ids.forEach((id) => (sections[id] = null));
  rememberHistory();
  const result = await sendPatch(sections, ids, "Restored the shipped defaults");
  if (!result.ok) return { ok: false, error: result.error };
  rev = result.rev ?? rev + 1;
  setPublishedNotes(BUILD_NOTES);
  overrides = {};
  applyOverrides({}, false);
  writeCache();
  notify();
  return { ok: true };
}

/* ----------------------------------------------------------------- helpers */

export function timeAgo(ms: number): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 45000) return "just now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return fmtDate(ms);
}
