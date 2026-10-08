/* #/admin renders the real pages with the office's panel on top (Edit jobs, Update all,
   Status). Nothing is public until Publish; links stay under #/admin. */

import React, { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { navigate, useRoute } from "../lib/router";
import { resolvePath } from "../lib/routes";
import { Header, Footer, ScrollTop, SkipLink } from "../components/layout";
import { Btn, Card, Icon, Input, Modal, Select, Toaster } from "../components/ui";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  ConfirmIcon,
  CurrentEventPanel,
  Dashboard,
  FieldControl,
  LiveControlPanel,
  LiveEndingPanel,
  RecentServicesPanel,
  LoginGate,
  PhotoUpload,
  PublishModal,
  StatusPill,
  ToolsPage,
  useCmsTick,
  uniqueId,
} from "../components/editor";
import * as cms from "../lib/cms";
import { todayKey } from "../lib/store";
import { sermonPublishTime, sermonRank } from "../data/sermons";
import { useAutoStopLive } from "../lib/autostop";
import { SECTION_DEFS, clone, getPath, photoSectionId, sectionById, sectionIsEverythingHidden, sectionIsHidden, setPath, type SectionDef } from "../lib/cmsSchema";
import { JOBS, HIT_GROUPS, searchEverything, type Hit, type Job } from "../lib/jobs";
import { COPY_ROLE_LABELS, copyDefault, copyIsEdited, copyIsLocked, copyIsParagraph, copyLineRows, copySegmentsOf, type CopyRole } from "../data/copy";
import { PHOTO_SLOTS, bundledPhoto, photoById, photoKeyOf, resolvePhoto } from "../data/photos";
import { fireToast, BUILD_NOTES } from "../lib/hooks";
import { useVisitorClock } from "../lib/visitor";
import {
  ADMIN_RETURN_MS,
  clearAdminReturn,
  isPanelMode,
  readAdminReturn,
  RETURN_KEY,
  type AdminReturn,
  type PanelMode,
  type PanelView,
} from "../lib/adminReturn";

/* ------------------------------------------------------------------- shell */

/* Drawer view state (tab, section, open rows); labels renamed in note 53. */

/* The drawer place is saved on exit (sessionStorage) and restored on return. */
/* The exact admin page the office was last on — a bare #/admin visit comes
   back here (while fresh) instead of the admin home. */
const LAST_PAGE_KEY = "wom.cms.lastAdminPage";

/* Open sections/rows survive unmounting; long-untouched drawers fall back to the list. */
const DRAWER_OPEN_KEY = "wom.cms.drawerOpenSections";
const DRAWER_ENTRY_KEY = "wom.cms.drawerOpenEntry";
const DRAWER_TOUCH_KEY = "wom.cms.drawerTouch";
/* The drawer's own view (tab, section/job, open or not), written on every
   change — so even a full reload lands back where the office was. */
const DRAWER_VIEW_KEY = "wom.cms.drawerView";

function isValidPanelView(v: any): v is PanelView {
  if (!v || typeof v.kind !== "string") return false;
  if (v.kind !== "home" && v.kind !== "unsaved" && v.kind !== "job" && v.kind !== "section") return false;
  return true;
}

function readOpenSections(): string[] {
  try {
    const r = JSON.parse(sessionStorage.getItem(DRAWER_OPEN_KEY) || "null");
    return Array.isArray(r) ? r.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readOpenEntries(): Record<string, string> {
  try {
    const r = JSON.parse(sessionStorage.getItem(DRAWER_ENTRY_KEY) || "null");
    if (!r || typeof r !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function clearDrawerPlace() {
  try {
    sessionStorage.removeItem(DRAWER_OPEN_KEY);
    sessionStorage.removeItem(DRAWER_ENTRY_KEY);
    sessionStorage.removeItem(DRAWER_VIEW_KEY);
  } catch {}
}

export function touchDrawerActivity() {
  try {
    sessionStorage.setItem(DRAWER_TOUCH_KEY, String(Date.now()));
  } catch {}
}

function drawerActivityAt(): number {
  try {
    return Number(sessionStorage.getItem(DRAWER_TOUCH_KEY) || 0);
  } catch {
    return 0;
  }
}

export function Admin() {
  const route = useRoute();
  useCmsTick();
  const state = cms.useCms();
  const resolved = resolvePath(route.path);

  /* The address is settled on its one canonical form. "…/admin/live" is the watch
     page, and "…/ministries/admin" means the same as "#/admin/ministries", so the
     page, the address bar and every link followed from here agree. */
  useEffect(() => {
    if (resolved.to !== route.path || route.movedAdmin) navigate(resolved.to);
  }, [route.path, route.movedAdmin, resolved.to]);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const [returnRec] = useState<AdminReturn | null>(() => {
    const r = readAdminReturn();
    /* An old note means the office was away longer than the wait — start fresh
       on the options list instead of a section from another day. */
    if (r && Date.now() - r.at > ADMIN_RETURN_MS + 60_000) {
      clearAdminReturn();
      return null;
    }
    return r;
  });
  const restoredView = useRef(!!returnRec);
  /* Without an exit note (a reload, a fresh tab visit), the continuously
     written drawer view is the memory — fresh only. */
  const [viewRec] = useState<{ mode: PanelMode; view: PanelView; open: boolean } | null>(() => {
    if (returnRec) return null;
    try {
      const r = JSON.parse(sessionStorage.getItem(DRAWER_VIEW_KEY) || "null");
      if (!r || !isPanelMode(r.mode)) return null;
      if (typeof r.open !== "boolean" || !isValidPanelView(r.view)) return null;
      /* Freshness is the drawer's last touch (keystrokes count), not this
         note's own stamp — a long edit without switching views is still active. */
      if (Date.now() - drawerActivityAt() > ADMIN_RETURN_MS + 60_000) {
        clearDrawerPlace();
        return null;
      }
      restoredView.current = true;
      return { mode: r.mode, view: r.view as PanelView, open: r.open };
    } catch {
      return null;
    }
  });
  const [panelOpen, setPanelOpen] = useState(returnRec?.open ?? viewRec?.open ?? false);
  const [panelMode, setPanelMode] = useState<PanelMode>(returnRec?.mode ?? viewRec?.mode ?? "list");
  const [panelView, setPanelView] = useState<PanelView>(returnRec?.view ?? viewRec?.view ?? { kind: "home" });
  const [signInOpen, setSignInOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  /* A search hit for another page navigates first; the route effect must then
     leave the drawer where the office asked for it. */
  const keepView = useRef(false);

  /* Editing takes an online sign-in — there is no offline back door. */
  const canEdit = state.authed;
  const changedIds = cms.pendingSections();
  /* While visitors wait (note 249), the office sees it here and can lift it. */
  const maintenance = cms.useMaintenance();
  /* An old extract opened by mistake (note 252): say so out loud. */
  const olderCopy = cms.useOlderCopy();

  /* Auto-stop watcher lives here so it runs whatever drawer card is open (note 111). */
  useAutoStopLive(canEdit);

  /* The pages show the draft while the office is here — that is the point. */
  useLayoutEffect(() => {
    cms.setAutoPreview(true);
    document.documentElement.dataset.editing = "";
    return () => {
      cms.setAutoPreview(false);
      delete document.documentElement.dataset.editing;
    };
  }, []);

  /* The drawer reopens where it was. */
  useEffect(() => {
    touchDrawerActivity();
    try {
      sessionStorage.setItem(DRAWER_VIEW_KEY, JSON.stringify({ mode: panelMode, view: panelView, open: panelOpen, at: Date.now() }));
    } catch {}
  }, [panelOpen, panelMode, panelView]);
  useEffect(() => {
    const touch = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".epanel")) touchDrawerActivity();
    };
    document.addEventListener("input", touch, true);
    document.addEventListener("change", touch, true);
    return () => {
      document.removeEventListener("input", touch, true);
      document.removeEventListener("change", touch, true);
    };
  }, []);
  const drawerStale = () => Date.now() - drawerActivityAt() > ADMIN_RETURN_MS;

  /* A bare visit returns to the last page while the memory is fresh. */
  useEffect(() => {
    if (route.path !== "/") return;
    try {
      const raw = sessionStorage.getItem(LAST_PAGE_KEY);
      if (!raw) return;
      const r = JSON.parse(raw);
      if (!r || typeof r.path !== "string" || !r.path.startsWith("/") || r.path === "/") return;
      if (Date.now() - (typeof r.at === "number" ? r.at : 0) > ADMIN_RETURN_MS + 60_000) return;
      navigate(r.path, undefined, { replace: true });
    } catch {}
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.dataset.route = route.path.replace(/\//g, "-").replace(/^-/, "") || "home";
    try {
      sessionStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ path: route.path, at: Date.now() }));
    } catch {}
    if (keepView.current) keepView.current = false;
    /* Coming back from the live site restores the drawer above — the mount
       must not wipe it back to the landing. */
    else if (restoredView.current) restoredView.current = false;
    else if (!drawerStale()) {
      /* Stay where they were. */
    } else {
      setPanelView({ kind: "home" });
      clearDrawerPlace();
    }
  }, [route.path]);

  /* The note left on the way out has been read (the drawer above was seeded
     from it) — clear it so a later visit starts fresh, and say welcome back. */
  useEffect(() => {
    if (!returnRec) return;
    clearAdminReturn();
    fireToast("Welcome back — everything is just as you left it.", "info");
  }, []);

  const exitToSite = () => {
    try {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: route.path, mode: panelMode, view: panelView, open: panelOpen, at: Date.now() }));
    } catch {}
    /* The visitor's website, in a new tab like the icon says. If the popup
       is blocked, fall back to going there in this tab. */
    const url = window.location.origin + "/";
    let opened: Window | null = null;
    try {
      opened = window.open(url, "_blank", "noopener");
    } catch {}
    if (!opened) navigate("/", undefined, { plain: true });
  };

  const openSection = (sectionId: string, entryKey?: string) => {
    setPanelOpen(true);
    setPanelMode("list");
    setPanelView({ kind: "section", sectionId, entryKey, title: sectionById(sectionId)?.label || sectionId });
  };

  /* A job card opens its sections where the office stands (notes 56, 59). */
  const openJob = (jobId: string) => {
    setPanelOpen(true);
    setPanelMode("edit");
    setPanelView({ kind: "job", jobId });
  };

  const openHit = (hit: Hit) => {
    if (hit.route && hit.route !== route.path) {
      keepView.current = true;
      navigate(hit.route);
    }
    setPanelOpen(true);
    /* A search hit opened from the *Edit* tab stays in it — the same reason as
       the job cards above. From the *Update* tab it stays in the raw list. */
    setPanelMode((m) => (m === "edit" ? "edit" : "list"));
    setPanelView({
      kind: "section",
      sectionId: hit.sectionId,
      entryKey: hit.entryKey,
      title: sectionById(hit.sectionId)?.label || hit.title,
    });
  };

  /* "N unsaved changes" opens their list, keeping the current tab (except Status/Tools). */
  const openUnsaved = () => {
    setPanelOpen(true);
    setPanelMode((m) => (m === "status" || m === "tools" ? "list" : m));
    setPanelView({ kind: "unsaved" });
  };

  const undoEdit = () => {
    const res = cms.undoEdit();
    if (res.ok) fireToast(`Took back your change to ${res.label}.`, "info");
    else fireToast("There is nothing to take back.", "info");
  };

  const askWhatToChange = () => {
    /* Reopening the drawer lands where they were — only a long-untouched
       drawer falls back to the options list. */
    if (drawerStale()) {
      setPanelView({ kind: "home" });
      setPanelMode("edit");
      clearDrawerPlace();
    }
    setPanelOpen(true);
  };

  /* The page behind re-renders on applied changes only, never remounts (note 61); office clock too (note 85). */
  const visitorClock = useVisitorClock();
  const pageNode = useMemo(
    () => <ErrorBoundary>{cloneElement(resolved.element as ReactElement)}</ErrorBoundary>,
    [resolved.to, state.version, visitorClock?.tz]
  );

  return (
    <div className="admin eshell">
      <SkipLink />
      <Header />
      {olderCopy && (
        <div className="admin__maint" role="alert">
          <span>
            This is an old copy (update {BUILD_NOTES} — this browser has already seen update {cms.publishedNotesVersion()}).
            Close it, open the newest extract, and delete the old folder.
          </span>
        </div>
      )}
      {maintenance && (
        <div className="admin__maint admin__maint--buttons" role="status">
          <span className="admin__maint-btns">
            <button
              type="button"
              className="admin__maint-go"
              onClick={() => {
                setPanelOpen(true);
                setPanelMode("tools");
              }}
            >
              Restore a backup
            </button>
            <button type="button" className="admin__maint-go" onClick={() => setPublishOpen(true)}>
              Review and publish
            </button>
          </span>
        </div>
      )}
      <div className="epage" ref={pageRef}>
        <main id="main">{pageNode}</main>
      </div>
      <Footer />
      <ScrollTop />
      <Toaster />

      <EditBar
        state={state}
        changed={changedIds.length}
        panelOpen={panelOpen}
        canEdit={canEdit}
        onAsk={askWhatToChange}
        onUnsaved={openUnsaved}
        onUndo={undoEdit}
        onPublish={() => setPublishOpen(true)}
        onTools={() => {
          setPanelOpen(true);
          setPanelMode("tools");
        }}
        onSignIn={() => setSignInOpen(true)}
        onExit={exitToSite}
      />

      {panelOpen && (
        <PagePanel
          mode={panelMode}
          onMode={setPanelMode}
          view={panelView}
          onView={setPanelView}
          changedIds={changedIds}
          canEdit={canEdit}
          onClose={() => setPanelOpen(false)}
          onOpenSection={openSection}
          onOpenJob={openJob}
          onHit={openHit}
          onHelp={() => setHelpOpen(true)}
          onSignIn={() => setSignInOpen(true)}
        />
      )}

      <Modal open={signInOpen} onClose={() => setSignInOpen(false)}>
        <LoginGate
          onExit={exitToSite}
          onDone={() => setSignInOpen(false)}
        />
      </Modal>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} state={state} />
    </div>
  );
}

/* ----------------------------------------------------------------- edit bar */

function EditBar({
  state,
  changed,
  panelOpen,
  canEdit,
  onAsk,
  onUnsaved,
  onUndo,
  onPublish,
  onTools,
  onSignIn,
  onExit,
}: {
  state: ReturnType<typeof cms.useCms>;
  changed: number;
  panelOpen: boolean;
  canEdit: boolean;
  onAsk: () => void;
  onUnsaved: () => void;
  onUndo: () => void;
  onPublish: () => void;
  onTools: () => void;
  onSignIn: () => void;
  onExit: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const bar = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmDiscard) return;
    const id = window.setTimeout(() => setConfirmDiscard(false), 5000);
    return () => window.clearTimeout(id);
  }, [confirmDiscard]);

  /* Keep the page's bottom padding and the drawer in step with the bar — it
     wraps to two rows on a phone. */
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const sync = () => document.documentElement.style.setProperty("--editbar-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    sync();
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--editbar-h");
    };
  }, []);

  return (
    <div className="editbar" data-ed-ui ref={bar}>
      <div className="editbar__inner">
        <span className="editbar__tag">
          <i /> Editing
        </span>
        {changed > 0 && (
          <button
            type="button"
            className="editbar__dirty"
            onClick={onUnsaved}
            title="See everything you have changed but not published"
          >
            {changed} unsaved change{changed === 1 ? "" : "s"}
          </button>
        )}

        {/* The way in. Drawn only while the tools are closed: with the panel
            open it read "Close the tools", which the office asked to be rid of
            (SPEC note 63) — the drawer's own ✕ closes it. */}
        {!panelOpen && (
          <Btn size="sm" icon="pencil" className="editbar__ask" onClick={onAsk} title="Everything you can change on the site">
            What do you want to change?
          </Btn>
        )}

        <span className="editbar__spacer" />

        {canEdit && (
          <Btn
            size="sm"
            variant="quiet"
            icon="undo"
            className="editbar__icononly"
            onClick={onUndo}
            disabled={!state.canUndoEdit}
            title="Take back my last change"
            ariaLabel="Take back my last change"
          >
            Undo
          </Btn>
        )}

        {canEdit && changed > 0 && (
          <Btn
            size="sm"
            variant="quiet"
            icon="trash"
            className="editbar__icononly"
            onClick={() => {
              if (!confirmDiscard) {
                setConfirmDiscard(true);
                return;
              }
              cms.discardDraft();
              setConfirmDiscard(false);
              fireToast("Draft thrown away — the live site is untouched.", "info");
            }}
            title="Throw away every unsaved change"
          >
            {confirmDiscard ? "Really discard?" : "Discard"}
          </Btn>
        )}

        {canEdit ? (
          <Btn size="sm" icon="check" onClick={onPublish} title="Put your changes on the live site for everyone">
            Publish
          </Btn>
        ) : (
          <Btn size="sm" icon="lock" onClick={onSignIn}>
            Sign in to edit
          </Btn>
        )}

        <span className="editbar__status">
          <StatusPill state={state} />
        </span>

        <span className="editbar__utils">
          <Btn size="sm" variant="quiet" icon="clipboard" className="editbar__icononly" onClick={onTools} title="Tools" ariaLabel="Tools" />
          <Btn size="sm" variant="quiet" icon="external" className="editbar__icononly" onClick={onExit} title="Open the live site" ariaLabel="Open the live site" />
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the panel */

function PagePanel({
  mode,
  onMode,
  view,
  onView,
  changedIds,
  canEdit,
  onClose,
  onOpenSection,
  onOpenJob,
  onHit,
  onHelp,
  onSignIn,
}: {
  mode: PanelMode;
  onMode: (m: PanelMode) => void;
  view: PanelView;
  onView: (v: PanelView) => void;
  changedIds: string[];
  canEdit: boolean;
  onClose: () => void;
  onOpenSection: (id: string, entryKey?: string) => void;
  onOpenJob: (id: string) => void;
  onHit: (hit: Hit) => void;
  onHelp: () => void;
  onSignIn: () => void;
}) {
  useCmsTick();
  const state = cms.useCms();
  const [open, setOpen] = useState<string[]>(() => readOpenSections().slice(0, 1));
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const draft = cms.getDraft();

  /* Open sections survive the drawer unmounting (and count as touching it),
     so the office comes back to the exact section they had open — and only
     that one: entries of sections that are no longer open are pruned. */
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAWER_OPEN_KEY, JSON.stringify(open));
      const all = readOpenEntries();
      let pruned = false;
      for (const key of Object.keys(all)) {
        if (!open.includes(key)) {
          delete all[key];
          pruned = true;
        }
      }
      if (pruned) sessionStorage.setItem(DRAWER_ENTRY_KEY, JSON.stringify(all));
    } catch {}
    touchDrawerActivity();
  }, [open]);

  /* Jumping to a section opens it straight away, and clears any search that
     took the office there. */
  useEffect(() => {
    if (view.kind !== "section") return;
    setOpen([view.sectionId]);
    setQuery("");
  }, [view]);

  useEffect(() => {
    setQuery("");
    bodyRef.current?.scrollTo({ top: 0 });
  }, [mode, view]);

  /* The full list (*Update* tab): every section the drawer offers except the
     ones the church had taken out of the editor, and the photo sections, which
     the *Photos & banners* card carries (SPEC note 62). */
  const groups = useMemo(() => {
    const map = new Map<string, SectionDef[]>();
    for (const def of SECTION_DEFS) {
      if (sectionIsEverythingHidden(def.id)) continue;
      const list = map.get(def.group) || [];
      list.push(def);
      map.set(def.group, list);
    }
    return [...map.entries()];
  }, []);

  const defsById = (ids: string[]) =>
    ids.map((id) => sectionById(id)).filter((def): def is SectionDef => !!def && !sectionIsHidden(def.id));

  const searching = query.trim().length > 0;
  const hits = useMemo(
    () => (searching ? searchEverything(query, draft) : []),
    [query, searching, draft, state.version]
  );

  const job = view.kind === "job" ? JOBS.find((j) => j.id === view.jobId) : undefined;
  const sectionView = view.kind === "section" ? sectionById(view.sectionId) : undefined;

  /* Only the last opened section stays open — opening one closes the previous
     (and its snapshot entry with it, so a reload cannot resurrect old rows). */
  const toggle = (id: string) => setOpen((cur) => (cur.includes(id) ? [] : [id]));

  /* The prayer points and their categories share one card (PrayerPairBlock
     below), wherever sections are listed — the job card, the Update list, or
     a search hit opening either of them. */
  const pairReady = ["prayerFocus", "prayerCategories"].every((id) => {
    const def = sectionById(id);
    return !!def && !sectionIsHidden(def.id);
  });
  const pairOpen = open.includes("prayerFocus") || open.includes("prayerCategories");
  const togglePair = () => setOpen((cur) => (pairOpen ? [] : ["prayerFocus", "prayerCategories"]));
  const pairBlock = (focusEntry?: string) => (
    <PrayerPairBlock
      key="prayer-pair"
      draft={draft}
      dirty={changedIds.includes("prayerFocus") || changedIds.includes("prayerCategories")}
      open={pairOpen}
      focusEntry={focusEntry}
      onToggle={togglePair}
    />
  );
  const isPairMember = (id: string) => pairReady && (id === "prayerFocus" || id === "prayerCategories");
  const blocksFor = (defs: SectionDef[], focusEntry?: string) => {
    const out: React.ReactNode[] = [];
    let paired = false;
    for (const def of defs) {
      if (def.id === "prayerFocus" || def.id === "prayerCategories") {
        if (!pairReady) {
          out.push(block(def, focusEntry));
        } else if (!paired) {
          paired = true;
          out.push(pairBlock(focusEntry));
        }
      } else {
        out.push(block(def, focusEntry));
      }
    }
    return out;
  };

  const block = (def: SectionDef, focusEntry?: string) => (
    <SectionBlock
      key={def.id}
      def={def}
      draft={draft}
      dirty={changedIds.includes(def.id)}
      open={open.includes(def.id)}
      focusEntry={focusEntry}
      onToggle={() => toggle(def.id)}
      onOpenSection={onOpenSection}
    />
  );

  const searchBox = (
    <div className="esearch">
      <Icon name="search" size={15} />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the words, items and photos…"
        aria-label="Search everything you can change"
      />
      {query && (
        <button type="button" className="esearch__clear" onClick={() => setQuery("")} aria-label="Clear the search">
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );

  return (
    <aside className="epanel" data-ed-ui>
      <header className="epanel__head">
        <span className="epanel__mark">
          <Icon name="pencil" size={15} />
        </span>
        <div className="epanel__brand">
          <b>Admin Access</b>
        </div>
        <button type="button" className="epanel__help" onClick={onHelp} aria-label="How to update the website" title="How to update the website">
          <Icon name="info" size={16} />
        </button>
        <button type="button" className="epanel__close" onClick={onClose} aria-label="Close the tools">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="epanel__tabs">
        {([["edit", "Edit"], ["list", "Update"], ["status", "Status"], ["tools", "Tools"]] as [PanelMode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={"epanel__tab" + (mode === m ? " is-active" : "")}
            onClick={() => {
              /* A tab click becomes the last state too: the landing replaces
                 any open section, so the remembered drawer matches the click. */
              setOpen([]);
              onMode(m);
              onView({ kind: "home" });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="epanel__body" ref={bodyRef}>
        {!canEdit ? (
          <div className="epanel__gate">
            <span className="epanel__gateIcon">
              <Icon name="lock" size={20} />
            </span>
            <b>Sign in to change the website</b>
            <Btn icon="lock" onClick={onSignIn}>
              Sign in
            </Btn>
            <button type="button" className="epanel__gateHelp" onClick={onHelp}>
              How does this work?
            </button>
          </div>
        ) : mode === "status" ? (
          <Dashboard state={state} onOpen={onOpenSection} />
        ) : mode === "tools" ? (
          <ToolsPage />
        ) : (
          <>
            {searchBox}

            {/* A single-section or single-job view (a job card, a search hit, a
                Status-tab chip, or the live archive's "open the sermons") takes
                precedence over the full list wherever the office is, and its
                back link returns to the list. Before SPEC note 53 the list
                branch was checked first, so those views were built and then
                never drawn. */}
            {searching ? (
              <SearchResults query={query} hits={hits} onHit={onHit} />
            ) : view.kind === "unsaved" ? (
              <UnsavedView onBack={() => onView({ kind: "home" })} onOpen={onOpenSection} version={state.version} signature={changedIds.join("|")} />
            ) : view.kind === "section" ? (
              <>
                <button type="button" className="epanel__back" onClick={() => onView({ kind: "home" })}>
                  <Icon name="arrowLeft" size={15} /> All the things you can change
                </button>
                <p className="epanel__viewTitle">{view.title}</p>
                {view.entryKey && <p className="epanel__lede">We found this for you — it is highlighted below.</p>}
                {sectionView ? (sectionView.id === "prayerFocus" || sectionView.id === "prayerCategories") && pairReady ? pairBlock(view.entryKey) : block(sectionView, view.entryKey) : <p className="epanel__empty">That part of the site could not be found.</p>}
              </>
            ) : job ? (
              <>
                <button type="button" className="epanel__back" onClick={() => onView({ kind: "home" })}>
                  <Icon name="arrowLeft" size={15} /> All the things you can change
                </button>
                <div className="epanel__viewHead">
                  <span className="epanel__viewIcon">
                    <Icon name={job.icon} size={18} />
                  </span>
                  <div>
                    <b>{job.title}</b>
                    <em>{job.blurb}</em>
                  </div>
                </div>
                {blocksFor(defsById(job.sections))}
              </>
            ) : mode === "list" ? (
              <>
                {groups.map(([group, list]) => (
                  <div className="epanel__group" key={group}>
                    <p className="epanel__group-title">{group}</p>
                    {blocksFor(list)}
                  </div>
                ))}
              </>
            ) : (
              <EditHome
                jobs={JOBS}
                onOpenJob={onOpenJob}
              />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/* --------------------------------------------------------------- the landing */

function EditHome({
  jobs,
  onOpenJob,
}: {
  jobs: Job[];
  onOpenJob: (id: string) => void;
}) {
  const jobCard = (job: Job, wide = false) => (
    <button key={job.id} type="button" className={"ejob" + (wide ? " ejob--wide" : "")} onClick={() => onOpenJob(job.id)}>
      <span className="ejob__icon">
        <Icon name={job.icon} size={wide ? 19 : 17} />
      </span>
      <span className="ejob__text">
        <b>{job.title}</b>
        <em>{job.blurb}</em>
      </span>
      <Icon name="chevronRight" size={16} className="ejob__chev" />
    </button>
  );

  return (
    <>
      <p className="epanel__group-title">EDITOR'S OPTION</p>
      <div className="ejobs">{jobs.map((job) => jobCard(job))}</div>

      <p className="epanel__foot">Not sure where something lives? Use the search box above.</p>
    </>
  );
}

/* ------------------------------------------------------------- search results */

function SearchResults({ query, hits, onHit }: { query: string; hits: Hit[]; onHit: (hit: Hit) => void }) {
  if (query.trim().length < 2) {
    return <p className="epanel__empty">Keep typing — the search starts once you have a couple of letters.</p>;
  }
  if (!hits.length) {
    return (
      <p className="epanel__empty">
        Nothing matches “{query.trim()}”. Try fewer words, or the <b>Update</b> tab to browse.
      </p>
    );
  }
  return (
    <div className="eres">
      {HIT_GROUPS.map((group) => {
        const list = hits.filter((h) => h.kind === group.kind);
        if (!list.length) return null;
        return (
          <div className="eres__group" key={group.kind}>
            <p className="epanel__group-title">{group.label}</p>
            {list.map((hit) => (
              <button key={hit.key} type="button" className="eres__item" onClick={() => onHit(hit)}>
                <span className="eres__text">
                  <b>{hit.title}</b>
                  <em>{hit.detail}</em>
                </span>
                <Icon name="chevronRight" size={15} className="ejob__chev" />
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------- what is not published */

/** The unsaved-changes list, in the office's own words (note 114). */
function UnsavedView({
  onBack,
  onOpen,
  version,
  signature,
}: {
  onBack: () => void;
  onOpen: (id: string, entryKey?: string) => void;
  /** React redraws the list when the draft lands on the page (`state.version`). */
  version: number;
  /** …and the moment the set of changed sections changes, before that lands. */
  signature: string;
}) {
  const edits = useMemo(() => cms.pendingEdits(), [version, signature]);

  /* Delete takes it off the site for real; Put back only drops the unsaved edit. */
  const putBack = (edit: cms.PendingEdit) => {
    const res = cms.revertSection(edit.sectionId);
    if (res.ok) fireToast(`Put back — ${edit.label} is the way the live site has it.`, "info");
  };

  /* Delete removes it for real: additions that never went live are dropped,
     edits go back, and whatever was taken off is published straight away, so
     it leaves the live site at once instead of coming back. */
  const erase = async (edit: cms.PendingEdit) => {
    const surgery = cms.dropAddedAndRevertedEdits(edit.sectionId);
    if (!surgery.ok) {
      const res = cms.revertSection(edit.sectionId);
      if (res.ok) fireToast(`Deleted — ${edit.label} is the way the live site has it.`, "info");
      return;
    }
    if (!surgery.removed) {
      cms.revertSection(edit.sectionId);
      fireToast("Deleted — it never went live, so the site is exactly as it was.", "info");
      return;
    }
    const pub = await cms.publishSection(edit.sectionId, `Deleted from ${edit.label}`);
    if (pub.ok) {
      fireToast(
        pub.local
          ? "Deleted on this device — it leaves the site everywhere once the connection returns."
          : "Deleted — gone from the site everywhere.",
        pub.local ? "info" : "success"
      );
    } else {
      fireToast(
        `Delete did not go through (${pub.error === "unauthorized" ? "sign in first" : pub.error}) — nothing left the site, and Undo takes back the cleanup.`,
        "error"
      );
    }
  };

  return (
    <>
      <button type="button" className="epanel__back" onClick={onBack}>
        <Icon name="arrowLeft" size={15} /> All the things you can change
      </button>

      {edits.length === 0 ? (
        <div className="epanel__gate">
          <span className="epanel__gateIcon">
            <Icon name="check" size={20} />
          </span>
          <b>Everything is published</b>
          <p>
            Nothing is waiting. When you change something it appears here, with what you changed, until you press Publish on the bar
            below.
          </p>
        </div>
      ) : (
        <>
          <div className="epanel__viewHead">
            <span className="epanel__viewIcon">
              <Icon name="clipboard" size={18} />
            </span>
            <div>
              <b>
                {edits.length} change{edits.length === 1 ? "" : "s"} not on the site yet
              </b>
              <em>
                Only you can see these so far. Open one to carry on with it, press Publish to put them all live,
                Delete to take one off the site now, or Put back to change your mind about it.
              </em>
            </div>
          </div>

          <div className="unsaved">
            {edits.map((edit) => (
              <div className="unsaved__item" key={edit.sectionId}>
                <button type="button" className="unsaved__open" onClick={() => onOpen(edit.sectionId)}>
                  <span className="unsaved__icon">
                    <Icon name={edit.icon} size={16} />
                  </span>
                  <span className="unsaved__text">
                    <b>{edit.label}</b>
                    {edit.lines.map((line, i) => (
                      <em key={i}>
                        <span className="unsaved__what">{line.what}</span>
                        <span className="unsaved__detail">{line.detail}</span>
                      </em>
                    ))}
                    {edit.count > edit.lines.length && (
                      <em className="unsaved__more">and {edit.count - edit.lines.length} more in this part</em>
                    )}
                  </span>
                  <Icon name="chevronRight" size={16} className="ejob__chev" />
                </button>
                <span className="unsaved__btns">
                  <ConfirmIcon
                    className="unsaved__delete"
                    onConfirm={() => erase(edit)}
                    title={`Delete from the live site now — what was taken off leaves everywhere at once, and it does not come back`}
                    label="Delete"
                  />
                  <button
                    type="button"
                    className="unsaved__revert"
                    onClick={() => putBack(edit)}
                    title={`Put it back — ${edit.label} goes back the way the live site has it`}
                  >
                    <Icon name="undo" size={13} />
                    <span>Put back</span>
                  </button>
                </span>
              </div>
            ))}
          </div>

          <p className="epanel__foot">
            Nothing here is on the site until you press <b>Publish</b> — except what <b>Delete</b> takes off,
            which leaves the live site at once. <b>Put back</b> drops that one change and leaves everything
            else exactly as it is.
          </p>
        </>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- help */

function HelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How to update the website"
      size="lg"
      footer={
        <Btn icon="check" onClick={onClose}>
          Got it
        </Btn>
      }
    >
      <p className="muted">
        Every segment of every page is changed from this panel. Nothing you do is public until you press <b>Publish</b>.
      </p>
      <ol className="ehelp">
        <li>
          <span className="ehelp__n">1</span>
          <div>
            <b className="ehelp__title">Open the page you want to change</b>
            <p>
              Open the panel with <b>What do you want to change?</b> in the bar at the bottom, then pick the job that sounds closest —
              the service times, the sermons, the giving, the church details. Between them the jobs hold every word, item and photo on
              the site, so whatever you need to change is behind one of them. The box at the top searches every word, photo and
              detail, so typing “Sunday” or “Pastor” takes you straight to it.
            </p>
          </div>
        </li>
        <li>
          <span className="ehelp__n">2</span>
          <div>
            <b className="ehelp__title">Work line by line</b>
            <p>
              Every line of a page sits in one place, in the order a visitor reads it — reword any line, swap a picture, change a
              time or an address.
            </p>
          </div>
        </li>
        <li>
          <span className="ehelp__n">3</span>
          <div>
            <b className="ehelp__title">Put it live</b>
            <p>
              Press <b>Publish</b>. Every visitor sees the change straight away. Before that, only you can see it.
            </p>
          </div>
        </li>
        <li>
          <span className="ehelp__n">4</span>
          <div>
            <b className="ehelp__title">Changed your mind?</b>
            <p>
              <b>Undo</b> takes back your last change. <b>Discard</b> throws away everything you have not published yet — it never touches
              the live site.
            </p>
          </div>
        </li>
      </ol>
    </Modal>
  );
}

/* --------------------------------------------------------------- one block */

/** A fixed line, shown the way a visitor reads it (no *markup* characters). */
function fixedText(value: string): string {
  const text = String(value || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .trim();
  return text || "—";
}

/* Prayer points + categories share one card; the sections underneath are untouched. */
function PrayerPairBlock({
  draft,
  dirty,
  open,
  focusEntry,
  onToggle,
}: {
  draft: cms.Snapshot;
  dirty: boolean;
  open: boolean;
  focusEntry?: string;
  onToggle: () => void;
}) {
  const sub = (id: string) => {
    const def = sectionById(id);
    if (!def) return null;
    const value = draft[def.id];
    const commit = (next: any) => cms.setSectionValue(def.id, next);
    const patch = (mutate: (v: any) => void) => {
      const latest = cms.getDraft();
      const next = clone(latest && latest[def.id] !== undefined ? latest[def.id] : value);
      mutate(next);
      commit(next);
    };
    return (
      <div key={def.id}>
        <h4 className="pblock__sub">{def.label}</h4>
        {def.blurb ? <p className="pblock__blurb">{def.blurb}</p> : null}
        <ListBlock def={def} list={Array.isArray(value) ? value : []} draft={draft} patch={patch} focusKey={focusEntry} />
        <div className="pblock__foot">
          <button
            type="button"
            className="pblock__reset"
            onClick={() => {
              cms.resetSection(def.id);
              fireToast(`${def.label} is back to the original content (in your draft).`, "info");
            }}
          >
            Put this back to the original
          </button>
        </div>
      </div>
    );
  };
  return (
    <Card className={"pblock" + (open ? " is-open" : "")} pad={false}>
      <button type="button" className="pblock__head" onClick={onToggle} aria-expanded={open}>
        <span className="pblock__icon">
          <Icon name="fire" size={16} />
        </span>
        <span className="pblock__title">
          <b>Prayer points & categories</b>
          <em>Prayer & testimonies</em>
        </span>
        {dirty && <i className="pblock__dot" title="Changed since the last publish" />}
        <Icon name="chevronDown" size={16} className={"pblock__chev" + (open ? " is-open" : "")} />
      </button>
      {open && (
        <div className="pblock__body">
          {sub("prayerFocus")}
          <hr className="pblock__div" />
          {sub("prayerCategories")}
        </div>
      )}
    </Card>
  );
}

function SectionBlock({
  def,
  draft,
  dirty,
  open,
  focusEntry,
  onToggle,
  onOpenSection,
}: {
  def: SectionDef;
  draft: cms.Snapshot;
  dirty: boolean;
  open: boolean;
  focusEntry?: string;
  onToggle: () => void;
  /** Jump to a section — optionally opening and highlighting one of its entries. */
  onOpenSection: (id: string, entryKey?: string) => void;
}) {
  const value = draft[def.id];
  const commit = (next: any) => cms.setSectionValue(def.id, next);
  /* Patch the newest draft: async edits can land twice between renders. */
  const patch = (mutate: (v: any) => void) => {
    const latest = cms.getDraft();
    const next = clone(latest && latest[def.id] !== undefined ? latest[def.id] : value);
    mutate(next);
    commit(next);
  };

  /* Drawn at the section foot; Sermons-side, not stream-side (see LiveEndingPanel). */
  const pastField = def.id === "live" ? def.fields.find((f) => f.path === "pastLimit") : undefined;
  const formFields = pastField ? def.fields.filter((f) => f !== pastField) : def.fields;

  const field = (f: SectionDef["fields"][number], get: () => any, set: (v: any) => void) => (
    <FieldControl
      key={f.path}
      def={f}
      value={get()}
      onChange={set}
      draft={draft}
      label={f.label}
    />
  );

  return (
    <Card className={"pblock" + (open ? " is-open" : "")} pad={false}>
      <button type="button" className="pblock__head" onClick={onToggle} aria-expanded={open}>
        <span className="pblock__icon">
          <Icon name={def.icon} size={16} />
        </span>
        <span className="pblock__title">
          <b>{def.label}</b>
          <em>{def.group}</em>
        </span>
        {dirty && <i className="pblock__dot" title="Changed since the last publish" />}
        <Icon name="chevronDown" size={16} className={"pblock__chev" + (open ? " is-open" : "")} />
      </button>

      {open && (
        <div className="pblock__body">
          {def.blurb ? <p className="pblock__blurb">{def.blurb}</p> : null}

          {def.id === "live" && <LiveControlPanel />}

          {def.kind === "object" ? (
            <div className="admin__form">
              {formFields.map((f) =>
                field(f, () => getPath(value, f.path), (v) => {
                  patch((next) => setPath(next, f.path, v));
                })
              )}
            </div>
          ) : (
            <ListBlock def={def} list={Array.isArray(value) ? value : []} draft={draft} patch={patch} focusKey={focusEntry} />
          )}

          {def.id === "live" && <RecentServicesPanel />}
          {def.id === "live" && (
            <LiveEndingPanel onOpen={onOpenSection}>
              {pastField && (
                <div className="admin__form">
                  {field(pastField, () => getPath(value, pastField.path), (v) => {
                    patch((next) => setPath(next, pastField.path, v));
                  })}
                </div>
              )}
            </LiveEndingPanel>
          )}
          {def.id === "events" && <CurrentEventPanel onOpen={onOpenSection} />}

          <div className="pblock__foot">
            <button
              type="button"
              className="pblock__reset"
              onClick={() => {
                cms.resetSection(def.id);
                fireToast(`${def.label} is back to the original content (in your draft).`, "info");
              }}
            >
              Put this back to the original
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- list body */

function ListBlock({
  def,
  list,
  draft,
  patch,
  focusKey,
}: {
  def: SectionDef;
  list: any[];
  draft: cms.Snapshot;
  patch: (mutate: (v: any) => void) => void;
  /** A search result can ask for one entry to be opened and highlighted. */
  focusKey?: string;
}) {
  const keyOf = (item: any, index: number) => String(item?.id || index);
  const focusIndex = focusKey ? list.findIndex((item, i) => keyOf(item, i) === focusKey) : -1;
  /* The open row survives the drawer unmounting: seeded from the search hit
     first, then from the row left open last time (e.g. a branch name being
     edited when the office stepped out to the live site). */
  const [openItem, setOpenItem] = useState<number | null>(() => {
    if (focusIndex >= 0) return focusIndex;
    if (def.fixed) return null;
    const saved = readOpenEntries()[def.id];
    if (!saved) return null;
    const at = list.findIndex((item, i) => keyOf(item, i) === saved);
    return at >= 0 ? at : null;
  });
  /* The two little forms at the foot of a list that can grow sideways: naming a
     new country, and choosing which branch a new sub-branch hangs from. */
  const [addForm, setAddForm] = useState<null | "country" | "sub">(null);
  const [newCountry, setNewCountry] = useState("");
  const [subParent, setSubParent] = useState(-1);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const fields = def.fixed ? def.fields.filter((f) => f.type !== "static") : def.fields;

  /* Bring the found entry into view once, so the office does not have to hunt.
     Aligned to the top rather than the middle: the entry can be a long form, and
     its title is the part that says "this is the one you clicked". */
  useEffect(() => {
    if (!focusKey || focusIndex < 0) return;
    const id = window.setTimeout(() => focusRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 90);
    return () => window.clearTimeout(id);
  }, [focusKey, focusIndex]);

  /* A search hit opens the entry, not just scrolls to it (note 106). */
  useEffect(() => {
    if (focusIndex >= 0) setOpenItem(focusIndex);
  }, [focusKey, focusIndex]);

  /* Remember the open row (and count opening one as touching the drawer), so
     stepping out to the live site and back lands on the exact row. */
  useEffect(() => {
    if (def.fixed) return;
    try {
      const all = readOpenEntries();
      if (openItem === null || openItem === undefined) delete all[def.id];
      else all[def.id] = keyOf(list[openItem], openItem);
      sessionStorage.setItem(DRAWER_ENTRY_KEY, JSON.stringify(all));
    } catch {}
    touchDrawerActivity();
  }, [openItem]);

  const isFocus = (i: number) => !!focusKey && keyOf(list[i], i) === focusKey;
  const itemRef = (i: number) => (isFocus(i) ? focusRef : undefined);
  const itemClass = (i: number, base: string) => base + (isFocus(i) ? " is-focus" : "");

  /* A Duplicate gets its own id; new entries stay id-less until applied (`applyToList`). */
  const withId = (item: any, list: any[], force = false) => {
    if (!def.idKey || !item) return item;
    if (!force && String(item[def.idKey] ?? "").trim()) return item;
    const seed = { title: item.title || "", name: item.name || item.city || def.label };
    return { ...item, [def.idKey]: uniqueId(list, def.idKey, seed) };
  };

  const addItem = () => {
    const item = def.makeNewFor ? def.makeNewFor(list) : def.makeNew ? def.makeNew() : {};
    patch((next) => next.push(item));
    setOpenItem(list.length);
    fireToast("Added — fill in the details, then publish.", "success");
  };

  /* *Add a country* makes that country's first branch (note 81). */
  const createCountry = () => {
    const spec = def.tree;
    if (!spec?.makeCountry) return;
    const name = newCountry.trim();
    if (!name) {
      fireToast("Type the country's name first.", "error");
      return;
    }
    patch((next) => next.push(spec.makeCountry!(name)));
    setOpenItem(list.length);
    setNewCountry("");
    setAddForm(null);
    fireToast(spec.countryToast || "Added — fill in the details, then publish.", "success");
  };

  /* Deleting a branch deletes everything gathered under it, so nothing orphans. */
  const descOf = (index: number): number[] => {
    const key = def.tree?.parentKey;
    if (!key || !def.idKey) return [];
    const selfId = String(list[index]?.[def.idKey] ?? "");
    if (!selfId) return [];
    const ids = new Set([selfId]);
    const found = new Set<number>();
    let grew = true;
    while (grew) {
      grew = false;
      list.forEach((item, k) => {
        if (k === index || found.has(k)) return;
        if (ids.has(String(item?.[key] ?? ""))) {
          found.add(k);
          const kid = String(item?.[def.idKey!] ?? "");
          if (kid && !ids.has(kid)) {
            ids.add(kid);
            grew = true;
          }
        }
      });
    }
    return [...found];
  };

  const remove = (index: number) => {
    const extra = descOf(index);
    patch((next) => {
      [index, ...extra]
        .sort((a, b) => b - a)
        .forEach((k) => next.splice(k, 1));
    });
    setOpenItem(null);
    fireToast(
      extra.length
        ? `Removed, with its ${extra.length} sub-branch${extra.length === 1 ? "" : "es"} — publish to make it live.`
        : "Removed — publish to make it live.",
      "info"
    );
  };

  const duplicate = (index: number) => {
    const copy = clone(list[index]);
    if (copy.title) copy.title += " (copy)";
    if (copy.name) copy.name += " (copy)";
    if (copy.q) copy.q += " (copy)";
    /* A copied message is a new upload, so it carries today's date, not the
       original's (SPEC note 141). It sits beside the original until Publish —
       the live site orders by date, so it takes the top there (SPEC note 143). */
    if (def.id === "sermons") copy.date = todayKey();
    patch((next) => next.splice(index + 1, 0, withId(copy, next, true)));
    setOpenItem(index + 1);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    patch((next) => {
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
    });
    setOpenItem(target);
  };

  /* Branches nest by `tree` (note 78); the drawer indents children. */
  const tree = def.tree;
  const parentKey = tree?.parentKey || "";

  /** How deep an entry sits under its parents (a sub-branch of a sub-branch is 2). */
  const depthOf = (item: any) => {
    if (!tree) return 0;
    let depth = 0;
    let cur = item;
    const seen = new Set<string>();
    while (cur && depth < 3) {
      const pid = String(cur[parentKey] ?? "");
      if (!pid || seen.has(pid)) break;
      seen.add(pid);
      const parent = list.find((x) => String(x?.id ?? "") === pid);
      if (!parent) break;
      depth += 1;
      cur = parent;
    }
    return depth;
  };
  const parentRow = (item: any) => {
    if (!tree) return undefined;
    const pid = String(item?.[parentKey] ?? "");
    if (!pid) return undefined;
    return list.find((x) => String(x?.id ?? "") === pid);
  };

  /** Where a child goes: straight under its parent, after the children it already has. */
  const childIndex = (index: number) => {
    const pid = String(list[index]?.id ?? "");
    if (!pid) return index + 1;
    let at = index + 1;
    while (at < list.length && String(list[at]?.[parentKey] ?? "") === pid) at += 1;
    return at;
  };

  const addChild = (index: number) => {
    if (!tree) return;
    const at = childIndex(index);
    patch((next) => {
      const parent = next[index];
      /* A child hangs from its parent's id, so a branch that has never been
         given one is given one as it gains its first sub-branch. */
      if (!parent.id) parent.id = uniqueId(next, "id", { name: parent.name || parent.city || def.label });
      const child = tree.makeChild(parent);
      child[parentKey] = parent.id;
      next.splice(at, 0, child);
    });
    setOpenItem(at);
    fireToast(tree.childToast, "success");
  };

  const addSibling = (index: number) => {
    if (!tree) return;
    const sibling = tree.makeSibling(clone(list[index]));
    patch((next) => next.splice(index + 1, 0, sibling));
    setOpenItem(index + 1);
    fireToast(tree.siblingToast, "success");
  };

  /* Fixed page-text lines group by page segment, in page order; locked lines hide. */
  if (def.fixed) {
    const pageId = def.id.replace(/^copy-/, "");
    const segments = copySegmentsOf(pageId)
      .map((segment) => ({ ...segment, entries: segment.entries.filter((entry) => !copyIsLocked(entry.id)) }))
      .filter((segment) => segment.entries.length > 0);
    const valueField = { ...def.fields[def.fields.length - 1], hint: undefined as string | undefined };
    /* Only a paragraph gets a paragraph's box. A headline, a label or a caption
       is one line of text, so it is one line in the drawer too. */
    const fieldFor = (entryId: string) =>
      copyIsParagraph(entryId)
        ? { ...valueField, type: "textarea" as const, rows: copyLineRows(entryId) }
        : { ...valueField, type: "text" as const, rows: undefined };
    const indexOf = (entryId: string) => list.findIndex((item: any) => String(item?.id ?? "") === entryId);

    /* Paragraph lines first, in visitor order; buttons and small words wait below. */
    const isProse = (entry: any) =>
      !entry.role && (copyIsEdited(entry.id) || (!entry.id.startsWith("auto.") && copyIsParagraph(entry.id)));

    const renderEntry = (entry: any) => {
      const role = entry.role;
      const i = indexOf(entry.id);
      const value = i >= 0 ? String(list[i]?.value ?? "") : entry.value;
      if (role) {
        return (
          <div className={itemClass(i, "pitem pitem--fixed")} key={entry.id} ref={itemRef(i)}>
            <div className="pitem__head pitem__head--static">
              <b>{entry.label}</b>
              <span className="pitem__lock" title="Buttons, page titles and section titles stay as they are">
                <Icon name="lock" size={11} /> {COPY_ROLE_LABELS[role as CopyRole]}
              </span>
            </div>
            <p className="pitem__fixedvalue">{fixedText(value)}</p>
          </div>
        );
      }
      return (
        <div className={itemClass(i, "pitem pitem--open")} key={entry.id} ref={itemRef(i)}>
          <div className="pitem__head pitem__head--static">
            <b>{entry.label}</b>
            {value !== copyDefault(entry.id) && <i className="pblock__dot" />}
          </div>
          <div className="pitem__fields">
            <FieldControl
              def={fieldFor(entry.id)}
              value={value}
              onChange={(v) => i >= 0 && patch((next) => setPath(next[i], "value", v))}
              draft={draft}
              label={undefined}
            />
          </div>
        </div>
      );
    };

    const rest = segments.flatMap((segment) => segment.entries.filter((entry) => !isProse(entry)));
    return (
      <div className="plist plist--copy">
        {segments.flatMap((segment) => segment.entries.filter(isProse)).map(renderEntry)}
        {rest.length > 0 && (
          <details className="pcopygroup pcopygroup--rest">
            <summary className="pcopygroup__title">
              <Icon name="grid" size={12} /> The small words, buttons &amp; titles ({rest.length})
            </summary>
            <div className="pcopygroup__rest">{rest.map(renderEntry)}</div>
          </details>
        )}
      </div>
    );
  }

  /* A grouped list (the branches, by country) gets a heading wherever the
     group changes, so the office reads it the way a visitor reads the page. */
  const groupOf = (item: any) => (def.groupBy ? String(getPath(item, def.groupBy) ?? "") : "");
  const startsGroup = (i: number) => !!def.groupBy && (i === 0 || groupOf(list[i]) !== groupOf(list[i - 1]));

  /* Drawer sermon order: published by publish time on top, unfinished at the foot. Display only. */
  const order = (() => {
    const idx = list.map((_, k) => k);
    if (def.id !== "sermons") return idx;
    const pub = idx.filter((k) => cms.isPublishedEntry("sermons", list[k]));
    const unpub = idx.filter((k) => !cms.isPublishedEntry("sermons", list[k]));
    pub.sort((a, b) => sermonRank(list[a]) - sermonRank(list[b]) || sermonPublishTime(list[b]) - sermonPublishTime(list[a]));
    return [...pub, ...unpub];
  })();

  return (
    <div className={"plist" + (tree ? " plist--tree" : "")}>
      {order.map((si) => {
        const item = list[si];
        const i = si;
        return (
        <React.Fragment key={String(item?.id || i)}>
        {startsGroup(i) && <p className="plist__group">{groupOf(item)}</p>}
        <div className={itemClass(i, "pitem" + (openItem === i ? " pitem--open" : "") + (depthOf(item) > 0 ? " pitem--child" : ""))} ref={itemRef(i)}>
          <div className="pitem__top">
            <button type="button" className="pitem__head" onClick={() => setOpenItem(openItem === i ? null : i)}>
              <b>{def.itemLabel ? def.itemLabel(item) : `Entry ${i + 1}`}</b>
              <em>{def.itemMeta ? def.itemMeta(item, list) : ""}</em>
              {(() => {
                const parent = parentRow(item);
                if (!parent) return null;
                const name = String(parent.city || def.itemLabel?.(parent) || "");
                return name ? (
                  <span className="pitem__parent" title={`Sits under ${def.itemLabel?.(parent) || name}`}>
                    ↳ {name}
                  </span>
                ) : null;
              })()}
              <Icon name="chevronDown" size={15} className={"pblock__chev" + (openItem === i ? " is-open" : "")} />
            </button>
            {tree && (
              <button
                type="button"
                className="pitem__quick"
                title={`${tree.childLabel} — under “${def.itemLabel ? def.itemLabel(item) : `Entry ${i + 1}`}”`}
                aria-label={tree.childLabel}
                onClick={() => addChild(i)}
              >
                <Icon name="plus" size={14} />
                <span className="pitem__quick-label">{tree.childShort}</span>
              </button>
            )}
          </div>
          {openItem === i && (
            <>
              <div className="pitem__fields">
                {fields.map((f) =>
                  <FieldControl
                    key={f.path}
                    def={f}
                    value={getPath(list[i], f.path)}
                    onChange={(v) => patch((next) => setPath(next[i], f.path, v))}
                    draft={draft}
                    label={f.label}
                  />
                )}
              </div>
              {tree && (
                <div className="pitem__subadd">
                  <Btn size="sm" variant="quiet" icon="plus" onClick={() => addChild(i)}>
                    {tree.childLabel}
                  </Btn>
                  <Btn size="sm" variant="quiet" icon="plus" onClick={() => addSibling(i)}>
                    {tree.siblingLabel}
                  </Btn>
                </div>
              )}
              <div className="pitem__actions">
                {def.id !== "sermons" && (
                  <>
                    <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <Icon name="arrowUp" size={15} />
                    </button>
                    <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                      <Icon name="arrowUp" size={15} className="admin__rot180" />
                    </button>
                  </>
                )}
                <button type="button" title="Duplicate" onClick={() => duplicate(i)}>
                  <Icon name="copy" size={15} />
                </button>
                <ConfirmIcon
                  onConfirm={() => remove(i)}
                  title={(() => {
                    const n = descOf(i).length;
                    return n
                      ? `Delete this branch and its ${n} sub-branch${n === 1 ? "" : "es"} — they leave the site together`
                      : "Delete this entry";
                  })()}
                  label="Delete"
                />
              </div>
            </>
          )}
        </div>
        </React.Fragment>
        );
      })}
      <div className="plist__add">
        {addForm === null && (
          <>
            <Btn size="sm" icon="plus" onClick={addItem}>
              {def.addLabel || (def.makeNew ? "Add another" : "Add")}
            </Btn>
            {tree?.countryKey && tree.makeCountry && (
              <Btn
                size="sm"
                variant="quiet"
                icon="plus"
                onClick={() => {
                  setNewCountry("");
                  setAddForm("country");
                }}
              >
                {tree.countryLabel || "Add a country"}
              </Btn>
            )}
            {tree && list.length > 0 && (
              <Btn
                size="sm"
                variant="quiet"
                icon="plus"
                onClick={() => {
                  setSubParent(openItem != null && openItem < list.length ? openItem : list.length - 1);
                  setAddForm("sub");
                }}
              >
                {tree.childLabel}
              </Btn>
            )}
          </>
        )}
        {addForm === "country" && (
          <div className="plist__form">
            <Input
              autoFocus
              value={newCountry}
              placeholder={tree?.countryPlaceholder || "Country name"}
              onChange={(e) => setNewCountry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createCountry();
                if (e.key === "Escape") setAddForm(null);
              }}
            />
            <Btn size="sm" icon="plus" onClick={createCountry}>
              Create
            </Btn>
            <Btn size="sm" variant="quiet" onClick={() => setAddForm(null)}>
              Cancel
            </Btn>
          </div>
        )}
        {addForm === "sub" && (
          <div className="plist__form">
            <Select
              autoFocus
              value={String(subParent)}
              onChange={(e) => setSubParent(Number(e.target.value))}
              options={list.map((entry, i) => ({
                value: String(i),
                label: "— ".repeat(depthOf(entry)) + (def.itemLabel ? def.itemLabel(entry) : `Entry ${i + 1}`),
              }))}
            />
            <Btn
              size="sm"
              icon="plus"
              onClick={() => {
                if (subParent >= 0 && subParent < list.length) addChild(subParent);
                setAddForm(null);
              }}
            >
              Create
            </Btn>
            <Btn size="sm" variant="quiet" onClick={() => setAddForm(null)}>
              Cancel
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
