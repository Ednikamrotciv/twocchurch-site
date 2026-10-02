/* ============================================================================
   cms.ts — the content store behind #/admin.

   How it works
   ------------
   * Every editable section (see cmsSchema.ts) starts life as a deep clone of
     the data modules in src/data — that is the "defaults" snapshot.
   * The church office edits a draft. Publishing sends ONLY the sections that
     changed to the server (index.html, server-plugin), which keeps one UTF-16
     blob per section. That keeps a publish inside the server's 50 ms CPU
     budget no matter how big the rest of the site's content is.
   * The rendered content is always { ...defaults, ...overrides }, and applying
     it mutates the data modules in place, then bumps a version counter. App
     re-mounts its tree off that counter, so the public site re-renders with the
     new content without a reload.
   * Everything degrades gracefully: no server -> cached overrides -> defaults.
   ========================================================================== */

import { useSyncExternalStore } from "react";
import { SECTION_DEFS, buildDefaults, clone, getPath, photoSectionId, refreshDerived, sectionById, setPath, type Field, type SectionDef } from "./cmsSchema";
import { copyIsFixed, copySectionOf } from "../data/copy";
import { TESTIMONY_CATEGORIES } from "../data/content";
import { purgeExpiredSlides } from "../data/slides";
import { purgeExpiredAnnouncements } from "../data/announcements";
import { fmtDate } from "./store";
import { fireToast } from "./hooks";

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

/* ------------------------------------------------------------------- state */

const defaults: Snapshot = buildDefaults();
let overrides: Snapshot = {};
let applied: Snapshot = clone(defaults);
let draft: Snapshot | null = null;
let draftFromRev = 0;
let dirty: Record<string, true> = {};
/**
 * The draft left in localStorage by the last visit has been read (`startCms`).
 * Until it has, nothing may be written back over `DRAFT_KEY`: the drawer mounts
 * before `startCms` runs and makes itself a draft from the shipped words on its
 * first render, and writing *that* out would silently throw the office's own
 * unsaved changes away on every reload — the bug this flag exists to stop
 * (SPEC note 112).
 */
let draftLoaded = false;
let history: { rev: number; at: number; by: string; overrides: Snapshot }[] = [];
/** Overrides published while the server was unreachable, waiting to be sent. */
let pending: Snapshot | null = null;

let status: CmsStatus = "connecting";
let rev = 0;
let updatedAt = 0;
let updatedBy = "";
let log: LogEntry[] = [];

/** Per-edit undo: the value a section had just before the office last touched
    it, so a single misplaced keystroke can be taken back without throwing the
    whole draft away. Consecutive edits to the same section within a moment are
    coalesced (typing a word is one undo). */
let editUndos: { sectionId: string; prev: any; at: number }[] = [];
const EDIT_COALESCE_MS = 1600;

let authed = false;
/* Who this tab signed in as: "main" for the office password, "sub" for a
   sub-admin's own password, null when signed out. The server is the authority
   (every privileged call re-checks there); this only decides what the drawer
   shows — sub-admins never see the admin-management card. */
let myRole: "main" | "sub" | null = null;
let myName = "";
let socket: any = null;
let reconnectTimer = 0;
let reconnectAttempt = 0;
let starting = false;
let localOnly = false;

let version = 0;
let previewing = false;
let previewBase: Snapshot | null = null;
/** True while #/admin is open: the pages show the draft, and edits land live. */
let autoPreview = false;
const listeners = new Set<() => void>();

let stateObj = readState();
function readState() {
  return {
    version,
    status,
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
    canUndo: history.length > 0 && status === "online",
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

/**
 * A stored snapshot can predate a field a section has since gained (the office
 * saved before the site learned about, say, the sermon archive). Object
 * sections therefore take their missing keys from the shipped defaults, so the
 * console never shows a field as blank when it has a perfectly good default.
 */
function mergeSection(id: string, base: any, value: any) {
  const def = sectionById(id);
  /* Sections whose entries are fixed by the code (one per line of page text):
     a copy saved before the site gained a line must still show that line — in
     the shipped order, keeping every value the office has typed. Buttons and
     titles are fixed scenery, so a stored value for one of them is ignored. */
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
  /* What is live can change underneath a draft: the local cache landing (the
     admin shell mounts before startCms() restores it, so the editor opens with
     a draft of the shipped words), the server answering, or a re-publish after
     a reload emptied the preview server. Sections the office has actually
     edited are `dirty` and stay exactly as they are; every other section
     follows the content, so the drawer never reports a change nobody made — and
     publishing can never put the shipped words back over the office's own. */
  if (keepDraft) rebaseDraft();
  /* While the office is on #/admin the pages behind the drawer show the *draft*
     — that is what "edit and watch it happen" means. So the draft goes back on
     top of the content that has just landed. Without this, anything asynchronous
     that changes what is live (the local cache, the server answering a moment
     after the drawer opened, another editor publishing) left the office looking
     at the *published* words while the drawer showed their own edits — the edit
     was saved, and did nothing on the page. It is the shape of the *"my changes
     don't take effect"* report (SPEC note 83). A publish keeps its own rule: it
     is the one thing that makes the content itself the draft (`keepDraft`). */
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

/**
 * One section as the *published* site has it (shipped defaults plus whatever
 * has been published). While the office is on #/admin the rendered pages show
 * the draft, so this — not `applied` — is what "unsaved changes" compares to.
 */
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

/**
 * One thing the office has changed, said in their own words. `what` names it the
 * way they met it (“Mission”, “Sunday Service”, “Hero headline”) and `detail`
 * says how it differs from the live site (“10:00 → 11:00”, “a new entry”).
 */
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
    /* A nested list whose rows all carry ids (the testimony wall) says exactly
       what left, the way a top-level list does — "The scan came back clear —
       removed" instead of "7 entries changed". Anything less identifiable
       keeps the counted summary below. */
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
  /* Entries are matched by their id when every one of them has one — that is
     what survives a reorder. An entry added a moment ago has no id yet (SPEC
     note 114 keeps this honest: the office sees it matched by position, which is
     the only thing that names it), so those two lists are walked by index. */
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

/**
 * Everything the office has changed and not published, section by section, in
 * the drawer's own words — what the edit bar's “N unsaved changes” opens. The
 * count is `pendingSections()` itself, so the two can never disagree (the lines
 * only say *what*, they never decide *whether*).
 */
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

/**
 * Put one section back the way the *live* site has it — the office's change to
 * that part alone is dropped, and the section follows published content again
 * (another editor's next publish reaches it too). Everything else, typed and
 * unsaved, stays exactly where it is. A step Undo can take back.
 */
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

/**
 * Throw away everything in a list section except its removals — entries that
 * were added never go anywhere, entries that were edited go back to the
 * published version — so that what is left is exactly what *Delete* in the
 * unsaved list publishes: the entries the office took off the site. A step
 * Undo can take the cleanup back. Real add/remove lists qualify (a fixed list
 * of page lines has nothing that can be taken off), and so does an object
 * section that names its deletable nested list (the testimony wall) — the
 * surgery runs on that list and leaves the rest of the section alone.
 */
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

/**
 * Publish one section straight away — what *Delete* in the unsaved list uses
 * so a removal leaves the live site at once instead of waiting for Publish.
 * Every other unsaved section stays exactly as it is. Offline it stages the
 * section the way Publish does, to be sent when the connection returns.
 */
export async function publishSection(sectionId: string, note: string): Promise<PublishResult> {
  const def = sectionById(sectionId);
  if (!def || !draft) return { ok: false, error: "nothing-to-do" };
  /* A lapsed entry never survives a publish — expired slides and notices leave
     the draft here, so the live site and the server both forget them in the
     same stroke, whichever section is being published. */
  dropLapsedSlides(true);
  migrateTestimonies();
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
    writeJSON(CACHE_KEY, { rev, overrides });
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
    if (!res.ok) return { ok: false, error: "unauthorized" };
  }
  rememberHistory();
  const payload = JSON.stringify(value);
  const result = await sendPatch({ [sectionId]: payload }, [sectionId], note.slice(0, 160));
  if (!result.ok) return { ok: false, error: result.error };
  rev = result.rev ?? rev + 1;
  updatedAt = Date.now();
  updatedBy = editorName();
  overrides[sectionId] = JSON.parse(payload);
  log = [{ rev, at: updatedAt, by: editorName(), role: myRole === "sub" ? "sub" : "main", note: note.slice(0, 160), changed: [sectionId] }, ...log].slice(0, 30);
  delete dirty[sectionId];
  persistDraft();
  applyOverrides(overrides);
  writeJSON(CACHE_KEY, { rev, overrides });
  notify();
  return { ok: true };
}

/**
 * Whether a list entry is on the live site already — by its id, or, for an
 * entry that never had one (a sermon keeps a blank id until the page re-reads
 * it, so id alone would call a published upload new forever), by matching its
 * whole content. Used by the sermons list, which reads newest-first while
 * uploads still in progress wait at the foot (SPEC note 146).
 */
export function isPublishedEntry(sectionId: string, item: any): boolean {
  const def = sectionById(sectionId);
  const cur = publishedSection(sectionId);
  if (!def || def.kind !== "list" || !Array.isArray(cur) || !item || typeof item !== "object") return false;
  const key = def.idKey || "";
  const id = key ? String(item[key] ?? "").trim() : "";
  if (id && cur.some((p) => String(p?.[key] ?? "") === id)) return true;
  return cur.some((p) => sameJSON(p, item));
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

/**
 * While the office is on #/admin the pages show the *draft* — that is the whole
 * point of editing the site itself: type in the drawer, see the page change.
 */
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

/**
 * Every keystroke used to re-bind all 53 sections and re-draw the page behind
 * the drawer. On a real page that is 40–150ms of work per character — and it
 * grows as the paragraph grows — so a sentence typed at speed left the panel
 * frozen between letters: the office's *"it hangs while making changes"*.
 *
 * The drawer reads the **draft**, so its fields update on the spot; only the
 * page behind them needs the applied snapshot, and a page a fifth of a second
 * behind the cursor is still a live preview. So applying is paced: it waits for
 * a pause in the typing (`PREVIEW_MS`), and never lets the page fall further
 * behind than `PREVIEW_MAX_MS` while a long paragraph is being typed. Anything
 * that ends the burst — undo, discard, publishing, leaving #/admin, the content
 * changing underneath — drops or flushes what is still waiting (see
 * `applyOverrides`, `undoEdit`).
 */
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

/**
 * Put the office's draft back on the page. Called wherever the *draft* becomes
 * the thing the pages should be showing — the drawer opening, the stored draft
 * arriving from localStorage a moment after it, the content changing underneath
 * it (`applyOverrides`) — so that what the office is editing is always what they
 * are looking at, from the first frame of the session (SPEC note 83).
 */
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
  // Plugins imported in main.pjs live on the pjs root list, which is exposed as
  // `window.root` (the bare name only exists inside inline classic scripts).
  const w = window as any;
  const r = w.root;
  if (r && typeof r.createServerSocket === "function") return () => r.createServerSocket();
  if (typeof w.createServerSocket === "function") return () => w.createServerSocket();
  return null;
}

export async function startCms() {
  if (starting) return;
  starting = true;

  /* 1. A draft and an undo history left behind by the admin survive a reload.
     This comes FIRST, before anything is applied or persisted: the drawer has
     already mounted and made itself a draft of the shipped words, and applying
     the cache below rebases and *writes* a draft — which, done before this
     read, is exactly how the office's own unsaved changes used to be lost on
     every reload (SPEC note 112). */
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
  // 2. Instant paint from the local cache (or the shipped defaults). Any section
  //    the office has edited is `dirty` and is kept exactly as they left it.
  if (!socketFactory()) {
    try {
      const res = await fetch("seed.json", { cache: "no-store" });
      if (res.ok) {
        const seed = await res.json();
        if (seed && seed.sections && typeof seed.sections === "object" && Object.keys(seed.sections).length) {
          rev = typeof seed.rev === "number" ? seed.rev : 0;
          applyOverrides(seed.sections);
        }
      }
    } catch {
      /* no baked seed (the live site, local runs) — the defaults stand */
    }
  }
  const cached = readJSON<{ rev?: number; overrides?: Snapshot } | null>(CACHE_KEY, null);
  if (cached?.overrides) {
    rev = cached.rev || 0;
    applyOverrides(cached.overrides);
  }
  history = readJSON<any[]>(HISTORY_KEY, []) || [];
  pending = readJSON<Snapshot | null>(PENDING_KEY, null);
  /* The drawer mounts before this runs (see the cache above), so the office is
     already looking at the pages — with a draft of the shipped words, made from
     whatever was live at that instant. Their own stored draft has just arrived:
     put it on the page, or their edits sit in the drawer doing nothing until
     they touch a field (SPEC note 83). */
  showDraftIfEditing();
  notify();

  if (!socketFactory()) {
    status = "local";
    localOnly = true;
    notify();
    return;
  }
  /* A publish nudge (SSE) can be missed while a tab sleeps — so a tab that
     comes back re-reads the server. This is what makes an already-open
     visitor page pick up a publish without a reload. Throttled: at most one
     re-read per few seconds, and never while a sync is already running. */
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
  connect();
}

function connect() {
  if (socket) return;
  status = "connecting";
  notify();
  let sock: any;
  try {
    sock = socketFactory()!();
  } catch (err) {
    console.warn("cms: could not create socket", err);
    status = "offline";
    notify();
    scheduleReconnect();
    return;
  }
  socket = sock;
  if ("binaryType" in sock) sock.binaryType = "arraybuffer";

  const opened = sock.opened instanceof Promise ? sock.opened : waitForOpen(sock);

  opened
    .then(async () => {
      reconnectAttempt = 0;
      status = "online";
      notify();
      sock.addEventListener?.("close", onClose);
      sock.addEventListener?.("message", onMessage);
      await syncFromServer();
      // Restore the admin session for this browser tab, if there is one.
      const saved = sessionPassword();
      if (saved) {
        try {
          const res = await login(saved, true);
          if (!res.ok) clearSession();
          else await flushPending();
        } catch {}
      }
      // If the editor saved the website for us mid-publish, finish that publish
      // now — this is the permanent server, so the content belongs here.
      await resumePlannedPublish();
    })
    .catch((err: any) => {
      if (socket === sock) socket = null;
      status = "offline";
      notify();
      scheduleReconnect();
      console.warn("cms: server unavailable", err?.message || err);
    });
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
  authed = false;
  if (event?.code === 4403) {
    // perchance.org-only restriction: embedding elsewhere is permanent.
    status = "local";
    localOnly = true;
    notify();
    return;
  }
  status = "offline";
  notify();
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
  let server: Snapshot = {};
  try {
    server = res.sections ? JSON.parse(res.sections) : {};
  } catch (err) {
    console.warn("cms: could not read the server content", err);
    return;
  }
  const serverRev = typeof res.rev === "number" ? res.rev : 0;
  const differs = serverRev !== rev || JSON.stringify(server) !== JSON.stringify(overrides);
  rev = serverRev;
  updatedAt = res.at || 0;
  updatedBy = res.by || "";
  log = Array.isArray(res.log) ? res.log : [];
  if (differs) {
    /* The website has just been saved (this is the first time we are talking to
       its permanent server, which knows nothing yet): keep the content the
       office had already published and send it over, rather than letting the
       site quietly fall back to the shipped words. */
    if (!Object.keys(server).length && Object.keys(overrides).length && !pending && !plannedPublish()) {
      pending = clone(overrides);
      writeJSON(PENDING_KEY, pending);
    }
    applyOverrides(server);
    writeJSON(CACHE_KEY, { rev, overrides });
  }
  notify();
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
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
  authed = false;
}

/* ------------------------------------------------------------------- admin */

export async function login(
  password: string,
  silent = false,
  want?: "main" | "sub"
): Promise<{ ok: boolean; error?: string; role?: "main" | "sub" | "invite"; name?: string; needCode?: boolean; q?: string }> {
  if (!socket || status !== "online") return { ok: false, error: "offline" };
  try {
    /* The box pointed here travels along: on a tie (one text, two accounts)
       the sub-admin box opens the sub and the main box opens main — anywhere
       else each box opens whichever account matches. Older servers read the
       password raw and check main first, which the main box still does. */
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
  myRole = null;
  myName = "";
  notify();
}

/** Second step of a two-factor sign-in. `password` is only kept for the tab's
    session, so a reload can ask the server for step one again. */
export async function login2fa(code: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!socket || status !== "online") return { ok: false, error: "offline" };
  try {
    const res = JSON.parse(await socket.rpc.login2fa(JSON.stringify({ code })));
    if (res?.ok) {
      authed = true;
      myRole = "main";
      myName = "";
      try {
        sessionStorage.setItem(SESSION_KEY, password);
      } catch {}
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
  if (!socket || status !== "online") return { ok: false, error: "offline" };
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
  if (!socket || status !== "online") return { ok: false, error: "offline" };
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

/** Main admin only: change the office password. Only while two-factor is on —
    the signed-in session plus the security answer (or a current app code) are
    the proof. The new password is hashed here — only the hash leaves the
    browser — and this tab's saved session follows it, so a reload signs
    straight in. */
export async function setMainPassword(password: string, proof: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 8 || password.length > 128) return { ok: false, error: "bad-password" };
  if (!proof || !proof.trim()) return { ok: false, error: "bad-proof" };
  try {
    const hash = await sha256HexText(password);
    const res = await adminRpc("setMainPassword", { hash, proof });
    if (res?.ok) {
      try {
        sessionStorage.setItem(SESSION_KEY, password);
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
  if (!socket || status !== "online") return { ok: false, error: "offline" };
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

/** Main admin only: one-click switch-off from the header toggle. The session
    is the proof — same trust as a password change — and the cleared state is
    saved the same way: TOTP = null + writeMeta on the server, like
    MAIN_HASH + writeMeta for a new password. */
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

/**
 * The wall was briefly a bare list of its own; it now lives with its filters
 * in one section. An old save still shaped that way is folded into the new
 * shape on first touch — marked changed, so publishing carries it over.
 */
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

/**
 * Lapsed announcement slides and notices clear out of the office's draft — and
 * so out of the drawer and, on the next publish, off the live site for good.
 * Throttled: the drawer reads the draft on every keystroke. Applied content is
 * cleaned where it lands (each section `bind`), and the site itself never
 * shows a lapsed entry (`visibleSlides`, `liveAnnouncements`), so this is only
 * the drawer's own clearing.
 */
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
    { generator: (window as any).generatorName || "", exportedAt: Date.now(), rev, content: draft || applied },
    null,
    2
  );
}

export function importSnapshot(text: string): { ok: boolean; error?: string } {
  try {
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
  note: string
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
      if (res?.err === "unauthorized") authed = false;
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

/**
 * Put the draft on the live site. `content` is only passed by
 * `finishPlannedPublish` — the publish that was waiting for the website itself
 * to be saved, whose content had to travel across that save.
 */
export async function publish(note: string, content?: Snapshot): Promise<PublishResult> {
  if (!content && draft) {
    dropLapsedSlides(true);
    migrateTestimonies();
  }
  if (content && Array.isArray(content.slides)) content.slides = purgeExpiredSlides(content.slides);
  if (content && Array.isArray(content.announcements)) content.announcements = purgeExpiredAnnouncements(content.announcements);
  const snapshot = content || draft || applied;
  const { sections, changed } = buildPatch(snapshot);

  if (!changed.length) {
    draft = null;
    notify();
    return { ok: true };
  }

  if (!socket || status !== "online") {
    // No server reachable: keep the site working locally and remember the
    // override set so it can be sent the moment the connection returns.
    rememberHistory();
    overrides = { ...overrides, ...pick(snapshot, changed) };
    applyOverrides(overrides);
    writeJSON(CACHE_KEY, { rev, overrides });
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
    if (!res.ok) return { ok: false, error: "unauthorized" };
  }

  rememberHistory();
  const result = await sendPatch(sections, changed, payloadNote);
  if (!result.ok) {
    if (result.sent.length) {
      // Part of the patch landed; keep the site consistent with what is stored.
      rev = result.rev ?? rev;
      applyOverrides(overrides, false);
      writeJSON(CACHE_KEY, { rev, overrides });
      notify();
    }
    return { ok: false, error: result.error };
  }

  rev = result.rev ?? rev + 1;
  updatedAt = Date.now();
  updatedBy = editorName();
  applyOverrides(overrides, false);
  writeJSON(CACHE_KEY, { rev, overrides });
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
  if (!socket || status !== "online") return { ok: false, error: "offline" };
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
  writeJSON(CACHE_KEY, { rev, overrides });
  notify();
  return { ok: true };
}

function pick(snap: Snapshot, ids: string[]): Snapshot {
  const out: Snapshot = {};
  for (const id of ids) out[id] = clone(snap[id]);
  return out;
}

/* ------------------------------------------------- saving the website itself */

/**
 * While the generator itself is unsaved, it does not exist on its own address
 * yet and everything published from #/admin goes to a preview server that
 * forgets it on the next reload. So Publish does both jobs: it asks the editor
 * — the tab that hosts this preview — to save the website, and finishes the
 * publish as soon as the saved (permanent) server is the one we are talking to.
 *
 * The platform listens for exactly this message from the frame that hosts a
 * preview (`saveKeyboardShortcut`), runs its own "am I allowed to save this?"
 * check, and reloads the preview when it is done.
 */
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

/**
 * Remember the publish the office asked for, to finish it once the site is
 * saved. The content itself travels with the plan: the save swaps the preview
 * server for the site's permanent one, and this is the only copy of what the
 * office was looking at when they pressed Publish.
 */
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

/**
 * Finish a publish that was waiting for the editor to save the website. Safe to
 * call at any time: it does nothing unless there is a plan, the website has
 * been saved since, and the plan is still fresh.
 */
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
  pending = null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  writeJSON(CACHE_KEY, { rev, overrides });
  applyOverrides(overrides);
  log = [{ rev, at: Date.now(), by: editorName(), role: myRole === "sub" ? "sub" : "main", note: "Offline changes published", changed: ids }, ...log].slice(0, 30);
  notify();
  return true;
}

/** Roll the whole site back to the override set from the previous publish. */
export async function undoLastPublish(): Promise<PublishResult> {
  const entry = history[0];
  if (!entry) return { ok: false, error: "nothing-to-undo" };
  if (!socket || status !== "online") return { ok: false, error: "offline" };

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
  overrides = clone(entry.overrides || {});
  applyOverrides(overrides, false);
  writeJSON(CACHE_KEY, { rev, overrides });
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
    writeJSON(CACHE_KEY, { rev, overrides });
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
  overrides = {};
  applyOverrides({}, false);
  writeJSON(CACHE_KEY, { rev, overrides });
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
