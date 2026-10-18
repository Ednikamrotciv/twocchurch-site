/* cms.ts — the content store behind #/admin: draft editing, changed-only
   publishes, live preview. Falls back: server, cached overrides, defaults. */

import { useSyncExternalStore } from "react";
import { SECTION_DEFS, buildDefaults, clone, getPath, photoSectionId, refreshDerived, sectionById, setPath, type Field, type SectionDef } from "./cmsSchema";
import { copyIsFixed, copySectionOf } from "../data/copy";
import { TESTIMONY_CATEGORIES } from "../data/content";
import { SLIDES, purgeExpiredSlides } from "../data/slides";
import { purgeExpiredAnnouncements } from "../data/announcements";
import { fmtDate } from "./store";
import { fireToast } from "./hooks";
import { createRemoteSocket, initServerUrl, refreshServerUrl, serverOverride, serverUrl, setServerOverride } from "./remoteserver";
import { applyBakedRecent, clearRecentCaches } from "./recentstreams";
import { bakedFeedSpec, feedIsNewer, peekSeed, siteFile, type FeedSeed, type FeedSpec } from "./livefeed";
import { BUILD_NOTES, CODE_ID } from "./hooks";
import { cleanChannelInput } from "./embed";
import { cacheUploadBlob, dataUrlToBlob, feedUrlsForUpload, getCachedDataUrl, uploadNameOf } from "./uploadCache";
import { setLiveReportSink } from "./livestatus";

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
/* Deploy lock (no numbers): every build stamps a fresh opaque deploy ID
   (meta wom-deploy, version.json, seed.json) — new code or old, each deploy
   looks new. Fresh visitors wait on the maintenance notice until a publish
   from THAT deploy lands: an explicit office action on this copy, or a
   witnessed publish carrying the same ID (server, feed, seed, cache). */
const DEPLOY_KEY = "wom.cms.deployPublished";
function readMetaDeployId(): string {
  try {
    if (typeof document === "undefined") return "";
    const m = document.querySelector('meta[name="wom-deploy"]');
    const c = m ? m.getAttribute("content") : "";
    if (typeof c === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(c)) return c;
  } catch {}
  return "";
}
/* A baked live feed (dist/feed.json) moves words after deploy, so a feed-backed
   copy has visitors to protect like a server-backed one (note 416): read
   synchronously like the deploy and server metas, so the very first paint
   already knows. Pure static copies (no server, no feed) still never wait —
   nothing could ever release them, since their words move only via rebuild. */
function feedFromMeta(): boolean {
  try {
    if (typeof document === "undefined") return false;
    return !!document.querySelector('meta[name="wom-feed"]');
  } catch { return false; }
}
let deployFromMeta = false;
let currentDeployId = "";
try {
  currentDeployId = readMetaDeployId();
  deployFromMeta = !!currentDeployId;
} catch {
  currentDeployId = "";
  deployFromMeta = false;
}
/* Dev-boot IDs (meta stamped per `npm run dev` boot, "dev-…") drive the
   deploy lock, the clean stage and the seen clock like any build — but they
   never name a served build. So for STAMPING (the durable publishDeploy on
   the office record and the relay to live) a dev copy stamps the live deploy
   like an unstamped copy: its own deploy would name a build live never
   served, and live visitors would keep waiting (the relay blesses live's own
   deploy, never ours). Hold, staging and seen below still use the dev ID. */
function ownDeployIsDevBoot(): boolean {
  try {
    return deployFromMeta && !!currentDeployId && currentDeployId.indexOf("dev-") === 0;
  } catch {
    return false;
  }
}
let publishedDeployId = "";
try {
  const raw = localStorage.getItem(DEPLOY_KEY);
  if (typeof raw === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(raw)) publishedDeployId = raw;
} catch {
  publishedDeployId = "";
}
/* Publish clock (one publish lifts every deploy): the wall-clock moment of the
   last witnessed publish stamped from the running update (notes>=BUILD_NOTES).
   Raise-only, persisted, shared across tabs via storage events. A deployed copy
   whose deploy was first seen BEFORE this moment was around for the publish, so
   its maintenance notice lifts even when the publish came from a different
   deploy id (stale tab, local copy) — while a deploy first seen AFTER the
   publish still holds until its own publish. This is what makes one Publish
   click work in all browsers instead of only the one that was clicked. */
const PUBLISH_AT_KEY = "wom.cms.publishAt";
/* Clock-skew tolerance: a server clock a few seconds behind the browser must
   not strand a publish that just landed. */
const PUBLISH_AT_SKEW_MS = 15000;
let lastPublishAt = 0;
try {
  const raw = localStorage.getItem(PUBLISH_AT_KEY);
  const n = raw === null ? 0 : Number(JSON.parse(raw));
  if (Number.isFinite(n) && (n as number) > 0) lastPublishAt = Math.floor(n as number);
} catch {
  /* storage may be blocked — startCms re-reads later */
}
function notePublishAt(at: unknown): boolean {
  try {
    const n = Math.floor(Number(at));
    if (!Number.isFinite(n) || n <= 0 || n <= lastPublishAt) return false;
    lastPublishAt = n;
    try {
      localStorage.setItem(PUBLISH_AT_KEY, JSON.stringify(lastPublishAt));
    } catch {}
    try {
      announcePublishCrossTab();
    } catch {}
    return true;
  } catch {
    return false;
  }
}
/** True when a publish from the running update landed after this deploy was first seen. */
function postDeployPublishWitnessed(): boolean {
  try {
    if (!(lastPublishAt > 0 && deployFirstSeenAt > 0)) return false;
    const held = typeof publishedNotes === "number" && Number.isFinite(publishedNotes) ? Math.floor(publishedNotes) : 0;
    if (!(held >= BUILD_NOTES)) return false;
    return lastPublishAt + PUBLISH_AT_SKEW_MS > deployFirstSeenAt;
  } catch {
    return false;
  }
}
/* The publishing tab reloads onto the new code right after its own publish
   (stale check): its new deploy is first seen AFTER its publish clock, so the
   time check above would wrongly keep it waiting until a second publish. This
   per-tab flag carries the click across that reload — a fresh deploy booting
   moments after its own tab published lifts without needing another click. */
const JUST_PUBLISHED_KEY = "wom.cms.justPublishedAt";
const JUST_PUBLISHED_MS = 10 * 60 * 1000;
function markJustPublished(): void {
  try {
    sessionStorage.setItem(JUST_PUBLISHED_KEY, JSON.stringify(Date.now()));
  } catch {}
  try {
    announcePublishCrossTab();
  } catch {}
}
function justPublishedRecently(): boolean {
  try {
    const raw = sessionStorage.getItem(JUST_PUBLISHED_KEY);
    if (!raw) return false;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) && n > 0 && Date.now() - n < JUST_PUBLISHED_MS;
  } catch {
    return false;
  }
}
function clearJustPublished(): void {
  try {
    sessionStorage.removeItem(JUST_PUBLISHED_KEY);
  } catch {}
}
/* Same-browser instant sync: the publishing tab already re-renders via notify();
   every OTHER tab of this browser learns through the storage event below plus
   this broadcast (storage events are async and miss the publishing tab itself
   by design — the broadcast covers both). */
const CROSS_TAB_CHANNEL = "wom.cms.publish";
function announcePublishCrossTab(): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CROSS_TAB_CHANNEL);
      try {
        ch.postMessage({ t: Date.now() });
      } finally {
        try {
          ch.close();
        } catch {}
      }
    }
  } catch {}
}
function rereadPublishStamps(): void {
  try {
    const nn = readJSON<number>(NOTES_KEY, 0);
    if (typeof nn === "number" && nn > publishedNotes) publishedNotes = Math.floor(nn);
  } catch {}
  try {
    const raw = localStorage.getItem(DEPLOY_KEY);
    if (typeof raw === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(raw)) publishedDeployId = raw;
  } catch {}
  try {
    const raw = localStorage.getItem(PUBLISH_AT_KEY);
    const n = raw === null ? 0 : Number(JSON.parse(raw));
    if (Number.isFinite(n) && (n as number) > lastPublishAt) lastPublishAt = Math.floor(n as number);
  } catch {}
}
let crossTabListening = false;
function startCrossTabSync(): void {
  if (crossTabListening) return;
  crossTabListening = true;
  try {
    window.addEventListener("storage", (e) => {
      try {
        if (!e || !e.key) return;
        if (e.key !== NOTES_KEY && e.key !== DEPLOY_KEY && e.key !== PUBLISH_AT_KEY && e.key !== CODE_BLESS_KEY && e.key !== CACHE_KEY) return;
        rereadPublishStamps();
        version += 1;
        notify();
      } catch {}
    });
  } catch {}
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CROSS_TAB_CHANNEL);
      ch.onmessage = () => {
        try {
          rereadPublishStamps();
          version += 1;
          notify();
        } catch {}
      };
    }
  } catch {}
}
/* Unnumbered code identity (the stale fix ships with no new number): the served
   document names its code in the wom-code meta (build-static stamps it from
   hooks.ts; the source file carries the same word for dev). Compared by
   equality only — a stale cache can never invert it. An explicit office Publish
   blesses it (see markDeployPublished); the local gates hold until then, so the
   fix arrives fresh on vscode even though the update number is unchanged. */
const CODE_BLESS_KEY = "wom.cms.codeBlessed";
function readMetaCode(): string {
  try {
    if (typeof document === "undefined") return "";
    const m = document.querySelector('meta[name="wom-code"]');
    const c = m ? m.getAttribute("content") : "";
    if (typeof c === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(c)) return c;
  } catch {}
  return "";
}
let runningCode = "";
try {
  runningCode = readMetaCode() || CODE_ID;
} catch {
  runningCode = CODE_ID;
}
/** True once an explicit office Publish from THIS code blessed it. */
function codeBlessedMatches(): boolean {
  try {
    if (!runningCode) return false;
    return localStorage.getItem(CODE_BLESS_KEY) === runningCode;
  } catch {
    return false;
  }
}
/* True when this browser blessed any earlier code or deploy: a returning
   browser on a new deploy stages clean; a fresh profile (never blessed)
   still adopts the live words normally, so a new device joining the live
   site is never clobbered. */
function hadPriorBlessing(): boolean {
  try {
    return !!localStorage.getItem(CODE_BLESS_KEY);
  } catch {
    return false;
  }
}
/* True only when this browser blessed OLDER code: a stored blessing exists
   AND names a different word. A missing stamp proves nothing (fresh profile
   is not a new code arrival), so it never triggers anything alone. */
function codeChangedSinceBless(): boolean {
  try {
    if (!runningCode) return false;
    const blessed = localStorage.getItem(CODE_BLESS_KEY);
    return !!blessed && blessed !== runningCode;
  } catch {
    return false;
  }
}
/* Clean-stage for a new code arrival (office request: a new deploy opens
   clean — welcome-home slide only — with no former publish staged, until
   Recover + Publish). While set, inbound words (server sync, live pull,
   seed) never stage into publishable content — the office disk still records
   them, so nothing is lost — and an explicit Publish sends the staged clean
   set (the fold's office-wins rule keeps staged clean apart from stored
   live words by itself). Cleared by Recover/restore staging a backup, or by
   an explicit office publish (markDeployPublished blesses the code there). */
let cleanStageForNewCode = false;
let cleanStageToastShown = false;
/** Bless the running code: explicit office publishes only — never witnesses,
    except a same-deploy witness, which IS this build's code by definition. */
function blessRunningCode(): void {
  try {
    if (runningCode) localStorage.setItem(CODE_BLESS_KEY, runningCode);
  } catch {}
}
/** An explicit office publish on this copy releases this deploy at once. */
function markDeployPublished(): boolean {
  /* Every explicit office publish on this copy also blesses the running code
     (unnumbered stale fix): local, live/admin, everywhere — even with no
     deploy stamped. A same-deploy witness below blesses too: the same deploy
     ID is the same build's code. Either way the code arrival is over, so a
     clean stage stages no longer. */
  blessRunningCode();
  cleanStageForNewCode = false;
  if (!currentDeployId || !deployFromMeta) return false;
  if (publishedDeployId === currentDeployId) return false;
  publishedDeployId = currentDeployId;
  try {
    localStorage.setItem(DEPLOY_KEY, currentDeployId);
  } catch {}
  return true;
}
/** A witnessed publish releases this deploy only when it names this deploy. */
function noteDeployWitness(v: unknown): boolean {
  try {
    if (typeof v === "string" && v && currentDeployId && deployFromMeta && v === currentDeployId) return markDeployPublished();
  } catch {}
  return false;
}
/** A same-code attestation lifts the number gate (office request: a Publish
    click clears the notice on live AND local): the joined backend names the
    code word it runs — a localhost backend serves its own files, so a word
    matching this bundle IS this code by construction, and a publish stamped
    from it is proven office review, not a leak. Equality only, like the word
    rule itself; a missing or different word proves nothing and changes
    nothing. This never stages (the clean stage still takes an explicit
    Publish, a Recover, or a same-deploy witness) — it only blesses, so the
    notice lifts on the witnessed publish. True when it blessed. */
function noteCodeWitness(code: unknown, notes: unknown): boolean {
  try {
    if (typeof code !== "string" || !code || code !== runningCode) return false;
    const n = Math.floor(Number(notes));
    if (!Number.isFinite(n) || n < BUILD_NOTES) return false;
    blessRunningCode();
    return true;
  } catch {
    return false;
  }
}
/* Fresh deploy starts unsaved-clean (office request: unsaved changes are clear
   and fresh for every new deploy). Every build stamps a fresh opaque deploy ID,
   so a changed deploy ID proves a new deploy even when the update number is
   unchanged. DEPLOY_SEEN remembers which deploy this browser already cleaned
   for; a different stamped deploy clears draft + pending + dirty once, then
   records itself. Maintenance hold is untouched here — Publish still lifts it. */
const DEPLOY_SEEN_KEY = "wom.cms.deploySeen";
/* When this browser first saw its current deploy (note 420): the clock a
   witnessed publish is measured against — a server publish newer than this
   moment is a publish FOR this deploy, whatever deploy id it names; anything
   older predates it and still holds. Stamped beside the seen deploy, same
   raise-only care as every other witness. */
const DEPLOY_SEEN_AT_KEY = "wom.cms.deploySeenAt";
let deployFirstSeenAt = 0;
try {
  const raw = localStorage.getItem(DEPLOY_SEEN_AT_KEY);
  const n = raw === null ? 0 : Number(JSON.parse(raw));
  if (Number.isFinite(n) && (n as number) > 0) deployFirstSeenAt = Math.floor(n as number);
} catch {
  /* storage may be blocked — startCms re-reads later */
}
function deployProvesFreshDeploy(): boolean {
  try {
    /* Built deploy: the stamped ID proves it — a different ID is a new deploy. */
    if (deployFromMeta && currentDeployId) {
      let seen = "";
      try {
        seen = localStorage.getItem(DEPLOY_SEEN_KEY) || "";
      } catch {
        return false;
      }
      if (!seen) return true;
      return seen !== currentDeployId;
    }
    /* Local dev (no stamped deploy): the update number PLUS the code word is
       the deploy token, so each update — numbered or not — clears unsaved
       draft + pending once: the local copy opens fresh and clean instead of
       carrying the last copy's unsaved list. Same-code rebuilds keep the
       token, so routine rebuilds never wipe unsaved work. */
    try {
      const wantLocal = "n" + BUILD_NOTES + "c" + (runningCode || "");
      const seenLocal = localStorage.getItem(DEPLOY_SEEN_KEY) || "";
      if (!seenLocal) return true;
      return seenLocal !== wantLocal;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
function markDeploySeen(): void {
  try {
    const want = deployFromMeta && currentDeployId ? currentDeployId : "n" + BUILD_NOTES + "c" + (runningCode || "");
    let prev = "";
    try {
      prev = localStorage.getItem(DEPLOY_SEEN_KEY) || "";
    } catch {}
    /* A changed deploy restarts the clock (note 420): the first-seen moment
       below is what proves a later server publish belongs to this deploy. */
    if (prev !== want || !(deployFirstSeenAt > 0)) {
      deployFirstSeenAt = Date.now();
      try {
        localStorage.setItem(DEPLOY_SEEN_AT_KEY, JSON.stringify(deployFirstSeenAt));
      } catch {}
    }
    localStorage.setItem(DEPLOY_SEEN_KEY, want);
  } catch {}
}

/* Why the maintenance notice is or isn't showing (note 278): call from the
   console as window.__maintState() on the deployed copy. */
if (typeof window !== "undefined") {
  (window as unknown as { __maintState?: () => object }).__maintState = () => ({
    publishedNotes,
    deployId: currentDeployId,
    publishedDeploy: publishedDeployId,
    publishAt: lastPublishAt,
    postDeployWitness: postDeployPublishWitnessed(),
    justPublished: justPublishedRecently(),
    deployFirstSeenAt,
    deployLocked: deployFromMeta,
    buildNotes: BUILD_NOTES,
    code: runningCode,
    liveSiteNotes,
    liveSiteBase,
    liveBakeNotes,
    liveBakeSections,
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
  writeJSON(CACHE_KEY, { rev, overrides, notes: publishedNotes, publishedDeploy: publishedDeployId });
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
        sessionStorage.setItem(PREVIEW_NOTES_KEY, currentDeployId && deployFromMeta ? currentDeployId : "n" + BUILD_NOTES);
      } catch {}
      return true;
    }
    if (sessionStorage.getItem(PREVIEW_KEY) !== "1") return false;
    /* A remembered grant only counts for the update that granted it. */
    try {
      const stamped = sessionStorage.getItem(PREVIEW_NOTES_KEY);
      if (stamped !== null) {
        const want = currentDeployId && deployFromMeta ? currentDeployId : "n" + BUILD_NOTES;
        if (stamped !== want) return false;
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
/* Local maintenance preview (office request: notice page missing in local):
   `?maintenance=1` (or `?showMaintenance=1`) forces the notice on any copy,
   including server-less local dev which otherwise never waits (no visitors).
   Visitors on deploys still wait via the deploy lock; this only adds a local
   way to see the page. Never blesses, never publishes. */
function maintenanceForced(): boolean {
  try {
    const q = new URLSearchParams(window.location.search || "");
    if (q.get("maintenance") === "1" || q.get("showMaintenance") === "1") return true;
    /* Hash-routed copies carry the pass after the # (e.g. /#/?maintenance=1). */
    const h = String(window.location.hash || "");
    const qi = h.indexOf("?");
    if (qi !== -1) {
      const hq = new URLSearchParams(h.slice(qi + 1));
      if (hq.get("maintenance") === "1" || hq.get("showMaintenance") === "1") return true;
    }
    return false;
  } catch {
    return false;
  }
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
    waits). A local copy with no stamped deploy waits on the number gate below
    until the office publishes. A publish lifts. */
export function maintenanceShouldWait(): boolean {
  /* Local preview: ?maintenance=1 shows the notice even on server-less local. */
  try {
    if (maintenanceForced()) return true;
  } catch {}
  /* Deploy lock (no numbers): a built copy waits until a publish from its
     own deploy lands — or a publish from the running update landed after this
     deploy was first seen (one click lifts every deploy, even a stale tab's
     or a local copy's). Server-less copies never wait (no visitors). */
  if (deployFromMeta && currentDeployId) {
    if (publishedDeployId === currentDeployId) return false;
    /* Post-deploy publish witness: this copy was around for a publish from
       the running update, so visitors are released even though the publish
       came from a different deploy id. A deploy first seen AFTER the publish
       still holds until its own publish — except on the tab that published
       (it reloads onto the new code right after its click). */
    try {
      if (postDeployPublishWitnessed()) return false;
    } catch {}
    try {
      if (justPublishedRecently()) return false;
    } catch {}
    /* Deploy lock: any copy whose words can move after deploy waits — server
       behind it, or a baked feed (note 416). Pure static never waits. */
    if (!serverInvolved() && !feedFromMeta()) return false;
    return true;
  }
  /* No stamped deploy (local dev): the number gate locks every new fix until
     the office publishes — a local Publish blesses the copy even with no
     server reachable (note 250), so this lock always has a release. Note 301:
     a corrupt stamp is unreviewed, never published — it waits too. */
  const held = typeof publishedNotes === "number" && Number.isFinite(publishedNotes) ? Math.floor(publishedNotes) : 0;
  if (held >= BUILD_NOTES && codeBlessedMatches()) return false;
  return true;
}
/* True while visitors must wait: new code is ahead of the last publish.
   Server-backed copies with no witnessed publish yet wait too (note 300: a
   zero stamp is "nothing proven", not "behind" — but an unreviewed copy all
   the same), so mobile and desktop agree — and a local copy with no stamped
   deploy waits on the number gate below until the office publishes (a local
   Publish always releases, note 250). Never on the office's preview pass,
   and never in the office console (#/admin) — which renders around this
   (note 250).
   This also subscribes to connection state, so the first-paint answer cannot
   stick on one device while the server address lands a moment later. */
export function useMaintenance(): boolean {
  useCmsVersion();
  /* Re-render when status/socket changes (notify without a version bump). */
  useSyncExternalStore(subscribe, () => stateObj);
  /* Local preview: ?maintenance=1 shows the notice even on server-less local. */
  try {
    if (maintenanceForced()) return true;
  } catch {}
  /* Note 302: a known newer update waits even on this (older) bundle — a
     stale tab never paints live from cached code while the host has moved on.
     Server-less copies still never wait (note 250): with no backend there is
     no publish step to wait for — they just reload onto the new bundle. */
  if (staleNewerNotes > BUILD_NOTES && serverInvolved()) {
    try {
      if (maintenancePreview()) return false;
    } catch {}
    return true;
  }
  /* Deploy lock (no numbers — same rule as maintenanceShouldWait). */
  if (deployFromMeta && currentDeployId) {
    if (publishedDeployId === currentDeployId) return false;
    /* Post-deploy publish witness: one click lifts every deploy that was
       around for it, even when the click came from a stale tab or local. */
    try {
      if (postDeployPublishWitnessed()) return false;
    } catch {}
    try {
      if (justPublishedRecently()) return false;
    } catch {}
    /* Deploy lock: any copy whose words can move after deploy waits — server
       behind it, or a baked feed (note 416). Pure static never waits. */
    if (!serverInvolved() && !feedFromMeta()) return false;
    try {
      if (maintenancePreview()) return false;
    } catch {}
    return true;
  }
  /* No stamped deploy (local dev): same lock as maintenanceShouldWait — every
     new fix waits until the office publishes (note 250: a local Publish always
     releases). The office preview pass still bypasses.
     Note 301: a corrupt stamp is unreviewed, never published. */
  const held = typeof publishedNotes === "number" && Number.isFinite(publishedNotes) ? Math.floor(publishedNotes) : 0;
  if (held >= BUILD_NOTES && codeBlessedMatches()) return false;
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
/* A deployed host can serve a newer bundle than this tab runs (desktop cached
   the old JS while the phone fetched the new one): the two modes then decide
   maintenance from different BUILD_NOTES and disagree. When version.json names
   a newer update, reload onto it so both modes run the same code — with a
   NORMAL reload, never a hard refresh (note 302). The old one-shot session
   guard is gone on purpose: it trapped tabs on the old bundle when the first
   reload still served cached files, which is exactly how the notice looked
   "vanished" until Ctrl+Shift+R. Reloads are now retryable (a few attempts
   inside a few minutes), cache-busted, and while a newer update is known this
   copy waits on maintenance instead of painting live. */
const STALE_RELOAD_KEY = "wom.cms.staleReload";
const STALE_MAX_TRIES = 5;
const STALE_WINDOW_MS = 10 * 60 * 1000;
/* The newest update version.json has named (0 = none known yet). */
let staleNewerNotes = 0;
/* Unnumbered code drift (no new number): version.json names its code without a
   number — a different code is a different build by definition (mixed-asset
   serve, hand-copied dist). While known, this copy waits like any stale one. */
let staleCodeMismatch = false;
let staleCheckSettled = false;
let staleCheckRunning: Promise<void> | null = null;
function readStaleAttempts(): { notes: number; at: number; tries: number } | null {
  try {
    const raw = sessionStorage.getItem(STALE_RELOAD_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.notes !== "number" || typeof p.at !== "number" || typeof p.tries !== "number") return null;
    return p;
  } catch {
    return null;
  }
}
/** True while version.json names a newer update than this bundle (note 302):
    visitors wait on maintenance until the reload lands them on the new code. */
export function isStaleWaiting(): boolean {
  return staleNewerNotes > BUILD_NOTES || staleCodeMismatch;
}
/** True once the first version.json check has settled (found newer or not). */
export function isStaleCheckSettled(): boolean {
  return staleCheckSettled;
}
/** Re-render hook for the stale-build gate (settled + waiting). */
export function useStaleBuild(): { settled: boolean; waiting: boolean } {
  useCmsVersion();
  useSyncExternalStore(subscribe, () => stateObj);
  return { settled: staleCheckSettled, waiting: isStaleWaiting() };
}
export function checkStaleBuild(): Promise<void> {
  if (staleCheckRunning) return staleCheckRunning;
  staleCheckRunning = (async () => {
    try {
      /* Cache-buster + no-store headers: an intermediate cache must never
         answer this with the previous update's number. */
      const sep = siteFile("version.json").includes("?") ? "&" : "?";
      const res = await fetch(siteFile("version.json") + sep + "t=" + Date.now(), {
        cache: "no-store",
        headers: { pragma: "no-cache", "cache-control": "no-cache" },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const n = Number(data && (data as any).notes);
      const vDeploy = data && (data as any).deployId;
      /* Deploy lock: a different stamped deploy is newer by definition — new
         or old code always looks new, so this copy waits and reloads onto it. */
      const deployIsNew =
        typeof vDeploy === "string" &&
        !!vDeploy &&
        deployFromMeta &&
        !!currentDeployId &&
        vDeploy !== currentDeployId;
      /* Unnumbered code drift: a version.json code that names a different code
         than this bundle is a different build even when the numbers tie —
         wait and reload onto it like any newer update. Absent code (older
         bakes) proves nothing and falls back to the numbers. */
      const vCode = data && typeof (data as any).code === "string" ? (data as any).code : "";
      const codeIsNew = !!vCode && !!runningCode && vCode !== runningCode;
      if (!deployIsNew && !codeIsNew && (!Number.isFinite(n) || n <= BUILD_NOTES)) {
        if (staleNewerNotes || staleCodeMismatch) {
          staleNewerNotes = 0;
          staleCodeMismatch = false;
          version += 1;
          notify();
        }
        return;
      }
      staleNewerNotes = deployIsNew ? BUILD_NOTES + 1 : Math.floor(n);
      if (codeIsNew && !deployIsNew) staleCodeMismatch = true;
      /* Bump so the maintenance notice re-evaluates at once instead of
         sticking with first paint — the old bundle waits, it never plays live. */
      version += 1;
      notify();
      
      /* Retryable guard: a few attempts inside a few minutes, then stop
         reloading but KEEP waiting (maintenance stays, no live flash, no
         infinite loop). A reload that still serves the old bundle retries. */
      try {
        const now = Date.now();
        const prev = readStaleAttempts();
        if (prev && prev.notes === staleNewerNotes && now - prev.at < STALE_WINDOW_MS && prev.tries >= STALE_MAX_TRIES) return;
        const tries = prev && prev.notes === staleNewerNotes && now - prev.at < STALE_WINDOW_MS ? prev.tries + 1 : 1;
        const at = prev && prev.notes === staleNewerNotes && now - prev.at < STALE_WINDOW_MS ? prev.at : now;
        try {
          sessionStorage.setItem(STALE_RELOAD_KEY, JSON.stringify({ notes: staleNewerNotes, at, tries }));
        } catch {}
      } catch {}
      /* Warm the entry document past the HTTP cache, then reload onto it. */
      try {
        await fetch(window.location.href, { cache: "reload" } as RequestInit);
      } catch {}
      window.location.reload();
    } catch {
      /* dev runs and hosts without version.json simply skip */
    } finally {
      if (!staleCheckSettled) {
        staleCheckSettled = true;
        notify();
      }
    }
  })().finally(() => {
    staleCheckRunning = null;
  });
  return staleCheckRunning;
}

/* Forget everything this browser kept from older copies (note 252): cached
    words, drafts, history, waiting publishes and the publish stamp — then
    reload onto the shipped words. The server's published words are untouched.
   Anything published ONLY on this device while offline is lost with it, so
   the button carrying this says so before it arms. This is the explicit
   office delete (note 300) — the ONLY path that clears last-published. */
export function resetLocalCopy(): void {
  const keys = [CACHE_KEY, DRAFT_KEY, HISTORY_KEY, PENDING_KEY, NOTES_KEY, AFTER_SAVE_KEY, DEPLOY_KEY, DEPLOY_SEEN_KEY, CODE_BLESS_KEY, PUBLISH_AT_KEY, "wom.cms.slidesReset"];
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
  try {
    sessionStorage.removeItem(JUST_PUBLISHED_KEY);
  } catch {}
  publishedNotes = 0;
  publishedDeployId = "";
  lastPublishAt = 0;
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
  /* The live section binds in place (LIVE mutates, no event of its own): tell
     the on-air poller the target may have moved — a retyped channel (draft
     preview while the office types, published words on sync) is re-checked at
     once instead of waiting out the timer (note 306). The poller itself
     decides whether the address actually changed. */
  try {
    window.dispatchEvent(new Event("wom:live-target"));
  } catch {
    /* a browser that refuses events keeps the standing timer */
  }
}

function applyOverrides(over: Snapshot, keepDraft = true) {
  /* Whatever was waiting to be previewed describes the old content. */
  dropLivePreview();
  overrides = clone(over || {});
  /* An empty slides list is the blank-black box, never content worth keeping
     (a stale browser cache, an empty-era bake, a store the lock has not healed
     yet): drop the key so the shipped welcome card underneath shows instead
     of nothing. Non-empty slides always pass through untouched. */
  if (Array.isArray((overrides as any).slides) && (overrides as any).slides.length === 0) {
    delete (overrides as any).slides;
  }
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
    if (!sameJSON(publishedSection(def.id), draft[def.id])) out.push(def.id);
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

/** Stable compare for unsaved checks (note 413): key order must never fake a change. */
function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => stableStringify(v)).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as any)[k])).join(",") + "}";
}
function sameJSON(a: any, b: any): boolean {
  return stableStringify(a) === stableStringify(b);
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
  /* Live transport keys have no drawer field but still dirty the section (note 413):
     name them so Delete/Put back never sit on a generic "changed" that will not clear. */
  if (def.id === "live" && before && after && typeof before === "object" && typeof after === "object") {
    const liveKeys: { key: string; label: string }[] = [
      { key: "isLive", label: "On-air switch" },
      { key: "liveSince", label: "Session start" },
      { key: "liveCut", label: "Session end" },
      { key: "liveCommandAt", label: "Play/pause/stop press" },
      { key: "liveEndedBy", label: "Ended by" },
      { key: "guestIsLive", label: "Guest on-air switch" },
      { key: "guestCommandAt", label: "Guest press" },
      { key: "hiddenReplays", label: "Taken-off services" },
      { key: "youtubeId", label: "Stream link" },
      { key: "externalYoutubeChannel", label: "Guest channel" },
    ];
    const fieldPaths = new Set((def.fields || []).map((f: any) => String(f.path || "").split(".")[0]));
    for (const { key, label } of liveKeys) {
      if (fieldPaths.has(key)) continue;
      if (!sameJSON((before as any)[key], (after as any)[key])) {
        const b = (before as any)[key];
        const a = (after as any)[key];
        let detail = "";
        if (key === "isLive" || key === "guestIsLive") detail = a ? "switched on" : "switched off";
        else if (key === "hiddenReplays") {
          const bl = Array.isArray(b) ? b.length : 0;
          const al = Array.isArray(a) ? a.length : 0;
          detail = al > bl ? al - bl + " taken off" : bl > al ? bl - al + " put back" : "changed";
        } else if (typeof a === "number" && typeof b === "number") detail = a > b ? "newer press" : "changed";
        else detail = snip(b) + " \u2192 " + snip(a);
        out.push({ what: label, detail });
      }
    }
    /* Any other non-field key (future transport) still names itself. */
    const known = new Set([...(def.fields || []).map((f: any) => String(f.path || "").split(".")[0]), ...liveKeys.map((k) => k.key)]);
    for (const key of Object.keys({ ...(before as any), ...(after as any) })) {
      if (known.has(key)) continue;
      if (!sameJSON((before as any)[key], (after as any)[key])) out.push({ what: key, detail: "changed" });
    }
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

/** Drop one section's edits and follow published content again (undoable, note 413). */
export function forceClearSection(sectionId: string): { ok: boolean; label?: string } {
  const def = sectionById(sectionId);
  if (!def || !draft) return { ok: false };
  pushEditUndo(sectionId, clone((draft as any)[sectionId]));
  (draft as any)[sectionId] = clone(publishedSection(sectionId));
  delete dirty[sectionId];
  persistDraft();
  if (autoPreview) {
    dropLivePreview();
    applyDraftLive();
  }
  notify();
  return { ok: true, label: def.label };
}
/** Drop one section's edits and follow published content again (undoable). */
export function revertSection(sectionId: string): { ok: boolean; label?: string } {
  const def = sectionById(sectionId);
  if (!def) return { ok: false };
  const d = getDraft();
  const back = clone(publishedSection(sectionId));
  if (sameJSON(d[sectionId], back)) {
    /* Phantom dirty (order-only or healed) must still clear so Delete never looks dead (note 413). */
    if ((dirty as any)[sectionId]) {
      pushEditUndo(sectionId, clone(d[sectionId]));
      delete (dirty as any)[sectionId];
      persistDraft();
      notify();
      return { ok: true, label: def.label };
    }
    return { ok: false, label: def.label };
  }
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

/** Whether Delete on the unsaved list can publish removals (note 402), pure
    for the verifier: list sections — and object sections carrying a deletable
    list — keep the two-tap confirm that publishes just what was taken off.
    Every other section's Delete only ever drops the draft edit (see
    `dropAddedAndRevertedEdits` bailing out above), so it answers on the first
    tap like Put back instead of looking dead. */
export function sectionHasPublishableRemovals(sectionId: string): boolean {
  const def = sectionById(sectionId);
  if (!def) return false;
  if (def.kind === "list") return !def.fixed;
  return !!def.deletableItems;
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
/* ------------------------------------------- the livestream transport gate */

/** Publish sends the livestream's on-air state only when play, pause or stop
    stamped a newer command than what is published (notes 390, 392, 394) — pure
    for the verifier. Every transport click stamps `liveCommandAt` with the click
    time (the guest row stamps its own `guestCommandAt` instead, note 404 —
    one row never arms the other); the stream's own ending and hand edits never
    stamp either one (note 394: a natural end needs no publish — the screen
    follows the check back to the previous services by itself), so an unclicked
    Publish keeps the published on-air state whatever the draft says, while
    every other field of the section still travels. */
export function gateLiveCommand(live: any, publishedLive: any): any {
  if (!live || typeof live !== "object") return live;
  const at = Number((live as any).liveCommandAt) || 0;
  const pub = Number((publishedLive as any)?.liveCommandAt) || 0;
  const gat = Number((live as any).guestCommandAt) || 0;
  const gpub = Number((publishedLive as any)?.guestCommandAt) || 0;
  if (at > pub && gat > gpub) return live;
  const out = { ...(live as any) };
  if (publishedLive && typeof publishedLive === "object") {
    if (!(at > pub)) {
      for (const k of ["isLive", "liveSince", "liveCut", "liveCommandAt", "liveEndedBy"]) out[k] = (publishedLive as any)[k];
    }
    if (!(gat > gpub)) {
      out.guestIsLive = (publishedLive as any).guestIsLive;
      out.guestCommandAt = (publishedLive as any).guestCommandAt;
    }
  }
  return out;
}

/** The publish snapshot with an unclicked on-air state held back (note 390):
    never mutates — the held-back section is a copy, everything else shared. */
function gateLiveSnapshot(snap: Snapshot): Snapshot {
  const lv = (snap as any)?.live;
  if (!lv || typeof lv !== "object") return snap;
  const gated = gateLiveCommand(lv, publishedSection("live"));
  if (gated === lv) return snap;
  return { ...(snap as any), live: gated };
}

/* One click publishes to visitors: the offline publish below waits a few
   seconds for the join first (sleep wake, reconnect backoff, slow mobile
   network), instead of stranding as device-only when the server is right
   there. Copies with no server anywhere (pure static, nothing configured)
   skip the wait — there is nothing to join. True when the server can be
   reached (or already is). Never throws. */
const JOIN_BEFORE_PUBLISH_MS = 8000;
async function joinBeforePublish(): Promise<boolean> {
  try {
    if (socket && status === "online") return true;
    try {
      if (!socketFactory()) return false;
    } catch {
      return false;
    }
    return await ensureOnline(JOIN_BEFORE_PUBLISH_MS);
  } catch {
    return false;
  }
}

export async function publishSection(sectionId: string, note: string): Promise<PublishResult> {
  const def = sectionById(sectionId);
  if (!def || !draft) return { ok: false, error: "nothing-to-do" };
  /* A lapsed entry never survives a publish — expired slides and notices leave
     the draft here, so the live site and the server both forget them in the
     same stroke, whichever section is being published. */
  dropLapsedSlides(true);
  migrateTestimonies();
  if (sectionId === "sermons" && Array.isArray(draft[sectionId])) stampSermonPublishTimes(draft[sectionId]);
  /* Publish folds live's newer words in first (note 309) — an office edit to
     this section still wins over live. */
  /* Durable deploy stamp (sleep-wake survival): unstamped copies name the live
     deploy, so the office record carries the build visitors run. Fetched
     alongside the fold; "" when stamped or unreachable. */
  const sectionStampP: Promise<string> = deployStampForOfficePublish().catch(() => "");
  await foldLiveInto(draft, sectionId);
  let value = clone(draft[sectionId]);
  /* The transport arms the send (notes 390, 392, 394): without a clicked play,
     pause or stop newer than what is published, the on-air state stays out of
     the patch — a natural end stamps nothing and needs no publish. */
  if (sectionId === "live") value = gateLiveCommand(value, publishedSection("live"));
  const sectionStamp = await sectionStampP.catch(() => "");
  if (sameJSON(value, publishedSection(sectionId))) {
    delete dirty[sectionId];
    persistDraft();
    /* A no-change section Publish still blesses everywhere (office request:
       the click must apply to the visitors website — live and local): the
       words match, so releasing visitors is safe, but stopping here would
       leave a wiped server and the live box's own deploy unblessed while
       the office sees success. The bless-only send below carries the same
       server stamp, converge and live relay as every other publish. */
    if (!(await joinBeforePublish())) {
      markDeployPublished();
      try {
        notePublishAt(Date.now());
      } catch {}
      try {
        markJustPublished();
      } catch {}
      try {
        scheduleRelayRetry({}, [], note.slice(0, 160), sectionStamp);
      } catch {}
      try {
        checkStaleBuild().catch(() => {});
      } catch {}
      notify();
      return { ok: true, local: true };
    }
    if (!authed) {
      const saved = sessionPassword();
      const res = saved ? await login(saved, true) : { ok: false as const };
      if (!res.ok) {
        if ((res as any).error === "denied") clearSession();
        return { ok: false, error: "unauthorized" };
      }
    }
    /* No words move, so no undo entry: the bless only lifts the notice. */
    const blessOnly = await sendPatch({}, [], note.slice(0, 160), true, true, sectionStamp);
    if (!blessOnly.ok) return { ok: false, error: blessOnly.error };
    rev = blessOnly.rev ?? rev + 1;
    setPublishedNotes(BUILD_NOTES);
    writeCache();
    notify();
    return { ok: true, live: blessOnly.relay !== "missed" };
  }
  /* One click publishes to visitors (office request): a tap while the tab is
     momentarily offline (sleep wake, reconnect backoff, slow mobile network)
     waits a few seconds for the join first, instead of stranding as
     device-only when the server is right there. */
  if (!(await joinBeforePublish())) {
    rememberHistory();
    overrides = { ...overrides, [sectionId]: value };
    applyOverrides(overrides);
    /* An offline click still moves last-published on this copy (note 306):
       the words, the stamp and the queue are all in this browser, the flush
       carries them to the server when the connection returns, and a host
       sleep in between changes nothing. */
    setPublishedNotes(BUILD_NOTES);
    writeCache();
    pending = { ...(pending || {}), [sectionId]: value };
    markDeployPublished();
    try {
      notePublishAt(Date.now());
    } catch {}
    try {
      markJustPublished();
    } catch {}
    try {
      scheduleRelayRetry({ [sectionId]: JSON.stringify(value) }, [sectionId], note.slice(0, 160), sectionStamp);
    } catch {}
    try {
      checkStaleBuild().catch(() => {});
    } catch {}
    writeJSON(PENDING_KEY, pending);
    localOnly = true;
    delete dirty[sectionId];
    /* Publishing the live section clears its unsaved change too (note 414):
       the draft follows what Publish just sent, so no live row lingers. */
    if (sectionId === "live" && draft) (draft as any)[sectionId] = clone(publishedSection(sectionId));
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
  const result = await sendPatch({ [sectionId]: payload }, [sectionId], note.slice(0, 160), true, true, sectionStamp);
  if (!result.ok) return { ok: false, error: result.error };
  rev = result.rev ?? rev + 1;
  updatedAt = Date.now();
  updatedBy = editorName();
  setPublishedNotes(BUILD_NOTES);
  overrides[sectionId] = JSON.parse(payload);
  log = [{ rev, at: updatedAt, by: editorName(), role: myRole === "sub" ? "sub" : "main", note: note.slice(0, 160), changed: [sectionId] }, ...log].slice(0, 30);
  delete dirty[sectionId];
  /* Publishing the live section clears its unsaved change too (note 414):
     the draft follows what Publish just sent, so no live row lingers. */
  if (sectionId === "live" && draft) (draft as any)[sectionId] = clone(publishedSection(sectionId));
  persistDraft();
  applyOverrides(overrides);
  writeCache();
  notify();
  return { ok: true, live: result.relay !== "missed" };
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
        /* Publish clock from the bake: same-update only, never across updates. */
        try {
          const at = (seed as any).at;
          if (typeof (seed as any).notes === "number" && Math.floor((seed as any).notes) === BUILD_NOTES && typeof at === "number" && at > 0) {
            notePublishAt(at);
          }
        } catch {}
        /* Deploy lock (stamped at build time, locked): the baked hold always
           stands for a fresh deploy — old or new code looks new, so the notice
           shows until the office publishes. A baked publish from THIS deploy
           releases at once; anything else waits. No numbers. */
        noteDeployWitness((seed as any).publishedDeploy);
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
    /* A clean deploy never resurfaces the last publish (office request): while
       this copy stages clean (fresh deploy, welcome-home only until Recover +
       Publish), a feed seed is adopted ONLY as this deploy's own first publish
       (same-deploy witness on the running update) — retired feeds stay on the
       empty bake. Fresh profiles (never blessed, no clean stage) still adopt
       live words normally, so a new device joining the live site is never
       clobbered. */
    if (cleanStageForNewCode) {
      const cand = seed as FeedSeed;
      const seedDeploy = typeof (cand as any).publishedDeploy === "string" ? (cand as any).publishedDeploy : "";
      const ownFirst = !!deployFromMeta && !!currentDeployId && seedDeploy === currentDeployId &&
        typeof cand.notes === "number" && Math.floor(cand.notes) === BUILD_NOTES && (cand.rev || 0) > 0;
      if (!ownFirst) return;
    }
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
    noteDeployWitness((live as any).publishedDeploy);
    /* Publish clock over the feed: a mirrored same-update publish newer than
       this deploy's first sighting releases it, even across deploy ids. */
    try {
      const at = (live as any).at;
      if (typeof live.notes === "number" && Math.floor(live.notes) === BUILD_NOTES && typeof at === "number" && at > 0) {
        notePublishAt(at);
      }
    } catch {}
    try {
      const at = (live as any).at;
      if (
        !deployFromMeta &&
        typeof live.notes === "number" && Math.floor(live.notes) === BUILD_NOTES && typeof at === "number" && at > 0
      ) {
        blessRunningCode();
      }
    } catch {}
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
  /* Publish-at-once: server-less copies read the mirror every minute, so a
     publish rides out without a rebuild and without a tap. */
  window.setInterval(() => syncFromFeed().catch(() => {}), 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncFromFeed().catch(() => {});
  });
  window.addEventListener("online", () => syncFromFeed().catch(() => {}));
}

/* ------------------------- two-way sync with live (notes 308–309): live → local.
   Local → live already rides the auto-deploy (bake → commit → push → rebuild,
   a few minutes). This is the other half, so nothing published in either place
   is ever lost: anything published on live is saved on the office copy by
   itself, anything published on local reaches live through the deploy.
   - AUTOMATIC: while an office tab is open and signed in, a live publish newer
     than this copy's is published straight onto the office backend (same
     bless, history and log as a hand publish) with its uploads fetched home.
     Conservative by design: never across a newer update (apply the zip
     first), never over unsaved draft work, never from a fallback bake (only
     a fresh copy may be restored from the bake, and only by hand), and ties
     go to the durable path (rev counters are per-store, so the wall clock
     arbitrates — live wins only when its publish is strictly newer).
   - ON PUBLISH (note 309): pressing Publish first folds live's newer words
     into what goes out — sections the office did not touch take live's words
     (uploads fetched home), sections the office edited keep the office's. The
     toast names what came home. There is no pull button anymore. */

let livePullStarted = false;
let livePullRunning = false;
let lastLivePullAt = 0;
let lastLivePullMsg = "";

/* Where "live" is for this copy: the office backend's own answer, else the
   site's own live address (note 344). Empty only on the live box itself —
   it IS live, so its tabs never pull. */
export const DEFAULT_LIVE_ORIGIN = "https://twocchurch-site.onrender.com";
async function liveBaseUrl(): Promise<string> {
  let backend = "";
  try {
    const res = await fetch("/__live-url", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const u = String((data && data.url) || "").trim().replace(/\/+$/, "");
      if (/^https?:\/\/[^/\s]+$/i.test(u)) backend = u;
    }
  } catch {
    /* unreachable backend — fall through to the default below */
  }
  const u = backend || DEFAULT_LIVE_ORIGIN;
  try {
    if (typeof window !== "undefined" && u === window.location.origin) return "";
  } catch {
    /* compare failed — trust the address (the live box answers empty) */
  }
  return u;
}

export function livePullStatus(): { at: number; msg: string } {
  return { at: lastLivePullAt, msg: lastLivePullMsg };
}

/* Which update the live site runs (note 335): the number its version.json
   names, asked through the same live address the pull uses — kept for the
   minute-tick watchdog and window.__maintState(), so a behind live site
   still names itself in the console instead of needing version.json
   spelunking. Null while unknown (never asked, unreachable). The live box
   itself answers its own update: there is no other copy to lag. Never
   throws, never toasts. */
let liveSiteNotes: number | null = null;
let liveSiteBase = "";
let liveSiteCheckedAt = 0;
export function liveSiteNotesVersion(): number | null {
  return liveSiteNotes;
}
export function liveSiteBaseUrl(): string {
  return liveSiteBase;
}
export async function refreshLiveSiteNotes(): Promise<number | null> {
  try {
    if (Date.now() - liveSiteCheckedAt < 60 * 1000) return liveSiteNotes;
    const base = await liveBaseUrl();
    liveSiteBase = base;
    if (!base) {
      if (liveSiteNotes !== BUILD_NOTES) {
        liveSiteNotes = BUILD_NOTES;
        notify();
      }
      liveSiteCheckedAt = Date.now();
      return liveSiteNotes;
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : 0;
    try {
      const res = await fetch(base + "/version.json?t=" + Date.now(), {
        cache: "no-store",
        headers: { pragma: "no-cache", "cache-control": "no-cache" },
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const n = Math.floor(Number(data && (data as any).notes));
        if (Number.isFinite(n) && n > 0 && n !== liveSiteNotes) {
          liveSiteNotes = n;
          notify();
        }
      }
    } finally {
      if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
    liveSiteCheckedAt = Date.now();
    return liveSiteNotes;
  } catch {
    return liveSiteNotes;
  }
}

/* Whether the live site's bake carries words (note 342): the deployed copy
   is only the office's words when the push landed — code without the bake
   is an empty shell (maintenance, no channel, no recents). Asked beside
   the update number above, on the same cadence. Null while unknown, 0
   while the bake is empty. Never throws, never toasts. */
let liveBakeNotes: number | null = null;
let liveBakeSections = 0;
let liveBakeCheckedAt = 0;
export function liveBakeNotesVersion(): number | null {
  return liveBakeNotes;
}
export function liveBakeSectionCount(): number {
  return liveBakeSections;
}
export async function refreshLiveBake(): Promise<void> {
  try {
    if (Date.now() - liveBakeCheckedAt < 60 * 1000) return;
    liveBakeCheckedAt = Date.now();
    const base = liveSiteBase || (await liveBaseUrl());
    if (!base) return;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : 0;
    try {
      const res = await fetch(base + "/seed.json?t=" + Date.now(), {
        cache: "no-store",
        headers: { pragma: "no-cache", "cache-control": "no-cache" },
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const raw = Math.floor(Number(data && (data as any).notes));
      const secs = data && (data as any).sections && typeof (data as any).sections === "object" ? Object.keys((data as any).sections).length : 0;
      const n = Number.isFinite(raw) && raw > 0 ? raw : 0;
      if (n !== (liveBakeNotes === null ? -1 : liveBakeNotes) || secs !== liveBakeSections) {
        liveBakeNotes = n;
        liveBakeSections = secs;
        notify();
      }
    } finally {
      if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
  } catch {
    /* unknown until the next tick */
  }
}

type LivePullResult = { ok: boolean; error?: string; pulled?: string[]; filesRestored?: number; filesFailed?: string[] };

async function fetchLiveContent(base: string): Promise<any | null> {
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : 0;
    try {
      const res = await fetch(base + "/__cms/getContent?conn=livepull-" + Math.random().toString(36).slice(2), {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: "",
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) return null;
      return await res.json().catch(() => null);
    } finally {
      if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
  } catch {
    return null;
  }
}

/* Live's newer words, section by section (values only, never null: sections
   are fixed — exactly like an office publish). */
function diffAgainstLive(liveSections: Snapshot): { ids: string[]; patch: Record<string, string> } {
  const ids: string[] = [];
  const patch: Record<string, string> = {};
  for (const def of SECTION_DEFS) {
    const theirs = liveSections[def.id];
    if (theirs === undefined || theirs === null) continue;
    if (JSON.stringify(overrides[def.id]) !== JSON.stringify(theirs)) {
      ids.push(def.id);
      patch[def.id] = JSON.stringify(clone(theirs));
    }
  }
  return { ids, patch };
}

/* Upload files the adopted words point at but this disk lacks, fetched from
   the backend that served them (mirrors the backup-restore file loop).
   `content` is what is being adopted — the office overrides for the automatic
   save, the about-to-publish draft for the publish-time fold. */
async function backfillUploadsFrom(fromBase: string, content: Snapshot = overrides): Promise<{ restored: number; failed: string[] }> {
  let restored = 0;
  const failed: string[] = [];
  for (const name of localUploadNames(content)) {
    let here = false;
    try {
      const res = await fetch("/data/uploads/" + name, { cache: "no-store" });
      here = res.ok;
    } catch {
      here = false;
    }
    if (here) continue;
    try {
      const res = await fetch(fromBase + "/data/uploads/" + name, { cache: "no-store" });
      if (!res.ok) throw 0;
      const blob = await res.blob();
      if (!blob.size || blob.size > BACKUP_FILE_MAX_BYTES) throw 0;
      const put = await fetch("/__restore-file?name=" + encodeURIComponent(name), {
        method: "POST",
        headers: { "content-type": blob.type || guessUploadType(name) },
        body: blob,
      });
      if (!put.ok) throw 0;
      restored++;
    } catch {
      failed.push(name);
    }
  }
  return { restored, failed };
}

/* Sleep-free uploads (note 413): a free-host sleep wipes data/uploads/, which used
   to blank every box slide until the office re-uploaded. Missing files the office
   already cached in this browser are restored to the server at once, and the
   bytes are kept cached for instant paint — coming back online or running local
   immediately shows the last uploads, blank-free. Wiped files also answer 200
   html (the app fallback), so html answers count as missing like a 404. */
let uploadHealRunning = false;
async function uploadNameMissing(name: string): Promise<boolean> {
  /* Active both online and offline: offline the fetch throws — that proves
     nothing about the server file (the browser is offline), so answer "not
     missing" and let the cached copy paint; the next online heal restores. */
  try {
    if (typeof navigator !== "undefined" && (navigator as any).onLine === false) return false;
    const res = await fetch("/data/uploads/" + name, { cache: "no-store" });
    if (!res.ok) return true;
    const type = String(res.headers.get("content-type") || "").toLowerCase();
    if (type.includes("text/html")) return true;
    return false;
  } catch {
    return false;
  }
}
export async function healMissingUploads(): Promise<{ restored: number; checked: number }> {
  if (uploadHealRunning) return { restored: 0, checked: 0 };
  uploadHealRunning = true;
  try {
    const seen = new Set<string>();
    try {
      for (const n of localUploadNames(merge(overrides))) seen.add(n);
    } catch {}
    try {
      if (draft) for (const n of localUploadNames(draft)) seen.add(n);
    } catch {}
    let restored = 0;
    let checked = 0;
    for (const name of [...seen]) {
      checked++;
      let missing = false;
      try {
        missing = await uploadNameMissing(name);
      } catch {
        continue;
      }
      if (!missing) continue;
      try {
        const dataUrl = await getCachedDataUrl(name);
        let blob = dataUrlToBlob(dataUrl || "");
        /* Wipe durability (feed): when this browser never cached the file,
           anything the office pushed is fetchable off the public repo — so
           ANY open copy heals the server, not just the uploader's browser.
           The fetched bytes are kept in this browser's cache too. */
        if (!blob || !(blob as any).size) {
          for (const u of await feedUrlsForUpload(name)) {
            try {
              const r = await fetch(u, { cache: "no-store" });
              if (!r.ok) continue;
              const b = await r.blob();
              if (!b || !(b as any).size) continue;
              if (String((b as any).type || "").toLowerCase().includes("text/html")) continue;
              blob = b;
              try { await cacheUploadBlob(name, b); } catch {}
              break;
            } catch {}
          }
        }
        if (!blob || !(blob as any).size) continue;
        const put = await fetch("/__restore-file?name=" + encodeURIComponent(name), {
          method: "POST",
          headers: { "content-type": (blob as any).type || guessUploadType(name) },
          body: blob,
        });
        if (put.ok) restored++;
      } catch {}
    }
    return { restored, checked };
  } finally {
    uploadHealRunning = false;
  }
}
function scheduleUploadHeal(delayMs = 2500): void {
  try {
    window.setTimeout(() => {
      healMissingUploads().catch(() => {});
    }, delayMs);
  } catch {}
}

/* Read live's publish without adopting anything: the shared front door for the
   automatic save and the publish-time fold. Null when there is nothing usable
   (no live address, live silent or empty) — never toasts, never throws. */
async function readLivePublish(): Promise<{ base: string; sections: Snapshot; notes: number; at: number; seeded: boolean; publishDeploy: string } | null> {
  if (livePullRunning) return null;
  const base = await liveBaseUrl();
  if (!base) return null;
  const live = await fetchLiveContent(base);
  if (!live || live.ok !== true) return null;
  let liveSections: Snapshot = {};
  try {
    liveSections = live.sections ? JSON.parse(live.sections) : {};
  } catch {
    return null;
  }
  if (!liveSections || typeof liveSections !== "object" || !Object.keys(liveSections).length) return null;
  return {
    base,
    sections: liveSections,
    notes: typeof live.notes === "number" ? Math.floor(live.notes) : 0,
    at: typeof live.at === "number" ? live.at : 0,
    seeded: (live as any).seeded === true,
    /* Which deploy the live box's publish was stamped from: carried into the
       office record on pull so the durable seed (bake, origin push, rebuild)
       names the live deploy — wakes then serve its release, not just words. */
    publishDeploy: typeof live.publishDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(live.publishDeploy) ? live.publishDeploy : "",
  };
}

/* Whether live holds a strictly newer publish than this copy. Same guards as
   the pull (note 308): never across a newer update, never from a fallback bake
   on a used copy — and rev counters are per-store, so the wall clock
   arbitrates: live wins only when its publish is strictly newer. */
function liveNewerThanHere(liveNotes: number, liveAt: number, seeded: boolean): "newer" | "newer-update" | "stale" {
  /* Never adopt across a newer update: apply the new zip on local first —
     the live publish stamp outruns this copy. */
  if (liveNotes > BUILD_NOTES) return "newer-update";
  /* A fallback bake is last-resort evidence, not a publish: it must never
     regress office words — only a fresh copy may be restored from it, and
     only by hand (the update window stays exactly as the office left it). */
  if (seeded && (rev !== 0 || publishedNotes > 0)) return "stale";
  /* Ties and older go to the durable path (local publish → auto-deploy). */
  if (liveAt <= updatedAt && updatedAt > 0) return "stale";
  return "newer";
}

export async function pullFromLive(): Promise<LivePullResult> {
  if ((!socket || status !== "online") && !(await ensureOnline())) {
    return { ok: false, error: "offline" };
  }
  if (!authed) {
    const saved = sessionPassword();
    const res = saved ? await login(saved, true) : ({ ok: false as const });
    if (!res.ok) {
      if ((res as any).error === "denied") clearSession();
      return { ok: false, error: "unauthorized" };
    }
  }
  const read = await readLivePublish();
  if (!read) {
    return { ok: false, error: "unreachable" };
  }
  const verdict = liveNewerThanHere(read.notes, read.at, read.seeded);
  if (verdict === "newer-update") {
    const msg = `Live is on update ${read.notes} — apply the new update on this copy first.`;
    lastLivePullAt = Date.now();
    lastLivePullMsg = msg;
    return { ok: false, error: "newer-update" };
  }
  if (verdict === "stale") {
    return { ok: true, pulled: [] };
  }
  if (livePullRunning) return { ok: false, error: "busy" };
  livePullRunning = true;
  try {
    const { ids, patch } = diffAgainstLive(read.sections);
    if (!ids.length) {
      lastLivePullAt = Date.now();
      lastLivePullMsg = "Live matches this copy — nothing to pull.";
      /* No words to carry, but the stamp still counts (note 420): live holds
         a same-update publish with real words and this copy already speaks
         them — yet without adopting the stamp this copy keeps waiting until
         somebody taps Publish here too. So adopt it: raise the stamp and
         bless the running code, exactly like a pull that carried words. Only
         outside a clean stage (a new code arrival still takes its explicit
         Publish or Recover), only with no unsaved work of its own pending,
         only a publish NEWER than this copy's first sighting (a stale live
         publish must not clear the notice by itself — same rule as the sync
         twin), and never across updates — nothing here stages, moves or
         loses words. */
      if (!cleanStageForNewCode && pendingSections().length === 0 && read.notes === BUILD_NOTES && read.sections && Object.keys(read.sections).length > 0 && read.at > 0 && deployFirstSeenAt > 0 && read.at > deployFirstSeenAt) {
        setPublishedNotes(BUILD_NOTES);
        blessRunningCode();
        writeCache();
        version += 1;
        notify();
      }
      return { ok: true, pulled: [] };
    }
    /* Live/admin is the general control (office request): its publish takes
       effect on the office copy even when this copy never published on the
       running code — the words record on the office disk either way. Staging
       follows only outside a clean stage (a new code arrival stages nothing
       inbound until Recover or an explicit Publish); mid-edit desks still
       wait, so unsaved work is never adopted under. Nothing here blesses
       code, deploy or number gates — those still take an explicit Publish. */
    const stageInbound = !cleanStageForNewCode;
    if (pendingSections().length > 0 && stageInbound) {
      return { ok: false, error: "deferred" };
    }
    rememberHistory();
    /* Durable stamp: the office record names the live deploy these words were
       published from, so the seed, origin push and rebuild bake carry the
       build live visitors run — sleep-wakes serve its release. */
    const res = await sendPatch(patch, ids, `Pulled from live (${ids.length} ${ids.length === 1 ? "section" : "sections"})`, true, false, read.publishDeploy);
    if (!res.ok) return { ok: false, error: res.error };
    rev = res.rev ?? rev + 1;
    updatedAt = Date.now();
    updatedBy = editorName();
    setPublishedNotes(BUILD_NOTES);
    if (stageInbound) {
      applyOverrides(overrides, false);
      writeCache();
    }
    log = [{ rev, at: updatedAt, by: updatedBy, role: myRole === "sub" ? "sub" : "main", note: "Pulled from live", changed: ids }, ...log].slice(0, 30);
    if (stageInbound) {
      draft = null;
      dirty = {};
      editUndos = [];
      previewBase = null;
      previewing = false;
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
    const files = await backfillUploadsFrom(read.base);
    lastLivePullAt = Date.now();
    const imgBit = files.restored ? ` and ${files.restored} uploaded ${files.restored === 1 ? "file" : "files"} came home` : "";
    const missBit = files.failed.length ? ` (${files.failed.length} uploaded ${files.failed.length === 1 ? "file is" : "files are"} missing on live: ${files.failed.slice(0, 3).join(", ")}${files.failed.length > 3 ? "…" : ""})` : "";
    lastLivePullMsg = stageInbound
      ? `Live publish saved here — ${ids.length} ${ids.length === 1 ? "section" : "sections"}${imgBit}${missBit}`
      : `Live publish recorded in the office — ${ids.length} ${ids.length === 1 ? "section" : "sections"}${imgBit}${missBit} (staged clean until Recover)`;
    fireToast(lastLivePullMsg + ".", "success");
    notify();
    return { ok: true, pulled: ids, filesRestored: files.restored, filesFailed: files.failed };
  } finally {
    livePullRunning = false;
  }
}

/* Publish-time live fold (note 309): pressing Publish first folds live's newer
   words into what goes out. Sections the office did not touch take live's
   words; sections the office edited keep the office's. `target` is what is
   about to be published (the draft, or a planned publish's content) — null
   when there is none, in which case a draft is started from the published
   words only if live has something to contribute. `onlyId` restricts the fold
   to one section (the per-section publish). Never fails: anything unclear
   skips the fold and the publish goes ahead exactly as before. */
async function foldLiveInto(target: Snapshot | null, onlyId?: string): Promise<{ snapshot: Snapshot | null; folded: string[] }> {
  const read = await readLivePublish();
  if (!read) return { snapshot: target, folded: [] };
  if (liveNewerThanHere(read.notes, read.at, read.seeded) !== "newer") return { snapshot: target, folded: [] };
  if (!socket || status !== "online") return { snapshot: target, folded: [] };
  if (!authed) {
    const saved = sessionPassword();
    const res = saved ? await login(saved, true) : ({ ok: false as const });
    if (!res.ok) {
      if ((res as any).error === "denied") clearSession();
      return { snapshot: target, folded: [] };
    }
  }
  let snap = target;
  if (!snap) snap = normalizeDraft(clone(applied));
  const folded: string[] = [];
  for (const def of SECTION_DEFS) {
    if (onlyId && def.id !== onlyId) continue;
    const theirs = read.sections[def.id];
    if (theirs === undefined || theirs === null) continue;
    /* The office's own edits always win — only untouched sections follow live. */
    if (JSON.stringify(snap[def.id]) !== JSON.stringify(publishedSection(def.id))) continue;
    if (JSON.stringify(publishedSection(def.id)) === JSON.stringify(theirs)) continue;
    snap[def.id] = mergeSection(def.id, defaults[def.id], clone(theirs));
    folded.push(def.id);
  }
  if (!folded.length) return { snapshot: target, folded: [] };
  if (target === draft) {
    for (const id of folded) dirty[id] = true;
    persistDraft();
    notify();
  } else if (!target) {
    draft = snap;
    draftFromRev = rev;
    dirty = {};
    editUndos = [];
    for (const id of folded) dirty[id] = true;
    persistDraft();
    notify();
  }
  const files = await backfillUploadsFrom(read.base, snap);
  lastLivePullAt = Date.now();
  const names = folded.map((id) => sectionById(id)?.label || id);
  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "");
  const imgBit = files.restored ? ` ${files.restored} uploaded ${files.restored === 1 ? "file" : "files"} came home too.` : "";
  const missBit = files.failed.length
    ? ` ${files.failed.length} uploaded ${files.failed.length === 1 ? "file is" : "files are"} missing on live (${files.failed.slice(0, 3).join(", ")}${files.failed.length > 3 ? "…" : ""}).`
    : "";
  lastLivePullMsg = `Live had newer ${tally(folded.length, "section", "sections")} — folded into this publish (${shown}).${imgBit}${missBit}`;
  fireToast(lastLivePullMsg, "success");
  return { snapshot: snap, folded };
}

/* Freshness watch (note 384): the server shouts every publish down the socket,
   but a tab that missed the shout sits stale — desktop tabs especially, which
   stay visible for hours and never refocus (mobiles heal through
   background/foreground refocus syncs). So every connected tab also asks the
   server's tiny rev stamp on the short cadence and pulls when it moved: local,
   mobile and desktop, deployed and office alike land the same publish within
   the same half minute. No session needed — the stamp is a public read, and
   the pull below is the same guarded path the shout itself takes. */
let contentWatchStarted = false;
let contentWatchRunning = false;
function startContentWatch() {
  if (contentWatchStarted) return;
  contentWatchStarted = true;
  const tick = async () => {
    try {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!socket || status !== "online" || contentWatchRunning) return;
      contentWatchRunning = true;
      try {
        const raw = await socket.rpc.contentRev("");
        const r = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (r && r.ok && typeof r.rev === "number" && r.rev !== rev) await syncFromServer().catch(() => {});
        else if (r && r.ok && deployFromMeta && currentDeployId && typeof r.publishDeploy === "string" && r.publishDeploy === currentDeployId && publishedDeployId !== currentDeployId) await syncFromServer().catch(() => {});
        /* A publish the rev stamp cannot see (note 420): the feed-follow
           adoption writes words with no rev bump, so a live publish carried
           that lane leaves `rev` standing while the stamp moves. A newer
           publish clock on the running update — or a publish stamp this copy
           has not witnessed — pulls the same guarded sync the shout takes. */
        else if (r && r.ok && typeof r.at === "number" && r.at > 0 && deployFirstSeenAt > 0 && r.at > deployFirstSeenAt && typeof r.notes === "number" && Math.floor(r.notes) === BUILD_NOTES && publishedDeployId !== currentDeployId) await syncFromServer().catch(() => {});
        else if (r && r.ok && typeof r.notes === "number" && r.notes > publishedNotes) await syncFromServer().catch(() => {});
      } finally {
        contentWatchRunning = false;
      }
    } catch {
      contentWatchRunning = false;
    }
  };
  window.setInterval(() => {
    tick().catch(() => {});
  }, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick().catch(() => {});
  });
  window.addEventListener("online", () => {
    tick().catch(() => {});
  });
}

/* The automatic half runs in any signed-in office tab: right after boot, every
   minute, and whenever the tab comes back or the network returns. Visitors'
   tabs never poll (no session, no sign-in) — and copies with no live address
   (the live box itself, standalone copies) return at the first fetch. */
function startLivePull() {
  if (livePullStarted) return;
  livePullStarted = true;
  const tick = () => {
    if (livePullRunning) return;
    try {
      if (!authed && !sessionPassword()) return;
    } catch {
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    pullFromLive().catch(() => {});
    refreshLiveSiteNotes().catch(() => {});
    refreshLiveBake().catch(() => {});
  };
  try {
    initialSyncDone.then(() => {
      window.setTimeout(() => tick(), 15000);
    }).catch(() => {});
  } catch {
    window.setTimeout(() => tick(), 15000);
  }
  window.setInterval(() => tick(), 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  window.addEventListener("online", () => tick());
}

export async function startCms() {
  if (starting) return;
  starting = true;
  /* Same-browser instant sync: one Publish click re-renders every other tab of
     this browser (visitor + admin, desktop + mobile emulation) without a reload. */
  try {
    startCrossTabSync();
  } catch {}
  /* Re-read raise-only stamps (another tab may have published while this one
     was closed): never manufactured, only witnessed. */
  try {
    rereadPublishStamps();
  } catch {}
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
  /* A proven new update overrides the last one (note 362): the browser's old
     recent-services + resolved-channel caches are dropped once — the shipped bake
     and the next feed read fill the card back in. A missing codegen proves
     nothing (fresh profile has no cache anyway), so nothing else is touched. */
  if (freshEyes) clearRecentCaches();
  /* ...and the draft's guest slot with them (note 408): carried-over guest
     words — the field and both guest keys — go once per update, dirty or
     not, so no unsaved guest row rides into the new update. */
  if (freshEyes) clearDraftGuestSlot();
  /* Every new deploy starts unsaved-clean (office request): draft + pending
     clear once per deploy ID, so the unsaved list opens fresh. Deploy IDs are
     fresh every build, so this runs on every deploy even when the update
     number is unchanged. Maintenance hold is untouched — Publish still lifts. */
  let freshDeploy = false;
  try {
    freshDeploy = deployProvesFreshDeploy();
  } catch {
    freshDeploy = false;
  }
  if (freshDeploy) {
    try {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {}
      try {
        localStorage.removeItem(AFTER_SAVE_KEY);
      } catch {}
     draft = null;
     draftFromRev = 0;
     dirty = {};
     pending = null;
      /* Unsaved-clean means every unsaved trace: the undo of the last publish,
         the one-step edit undos, and any waiting live preview are from the old
         deploy, so they go with the draft — the new deploy's unsaved list
         opens empty ("Everything is published"). The publish stamp, the deploy
         blessing and the cached words are untouched here: only unsaved work is
         cleared, and Publish still lifts maintenance. */
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {}
      history = [];
      editUndos = [];
      previewBase = null;
      previewing = false;
      try {
        clearRecentCaches();
      } catch {}
      try {
        clearDraftGuestSlot();
      } catch {}
      /* Fresh, clean and new admin on every new deploy: the drawer place
         (tab, section, open rows, last page) is per-visit memory — a new
         deploy starts on the admin home, not where the last deploy left off. */
      try {
        sessionStorage.removeItem("wom.cms.drawerView");
      } catch {}
      try {
        sessionStorage.removeItem("wom.cms.drawerOpenSections");
      } catch {}
      try {
        sessionStorage.removeItem("wom.cms.drawerOpenEntry");
      } catch {}
      try {
        sessionStorage.removeItem("wom.cms.drawerTouch");
      } catch {}
      try {
        sessionStorage.removeItem("wom.cms.lastAdminPage");
      } catch {}
    } catch {}
  }
  try {
    markDeploySeen();
  } catch {}
  /* The click across the reload: this tab published, then the stale check
     reloaded it onto the new code. Its new deploy is first seen after its own
     publish clock, so the time witness alone would keep it waiting until a
     second click — carry it instead. Only on this tab (session flag), only
     for the running update, and never for a deploys-ahead copy that never
     published. Staging still follows the clean-stage rules below; only the
     notice lifts. */
  try {
    const held = typeof publishedNotes === "number" && Number.isFinite(publishedNotes) ? Math.floor(publishedNotes) : 0;
    if (justPublishedRecently() && held >= BUILD_NOTES && deployFromMeta && currentDeployId && publishedDeployId !== currentDeployId) {
      markDeployPublished();
      /* Consumed: a later deploy inside the same window must hold again until
         its own publish — one click carries exactly one reload. */
      clearJustPublished();
    }
  } catch {}
  /* Every new deploy stages clean (office request: every new deploy is
     fresh, clean and new — welcome-home slide only, no former publish
     staged, until Recover + Publish). Returning browsers only: a stored
     blessing proves this browser saw an earlier deploy, while a fresh
     profile (never blessed) still adopts the live words normally, so a new
     device joining the live site is never clobbered. Inbound words still
     record on the office disk; only the staged publishable set starts from
     defaults. */
  try {
    if (codeChangedSinceBless() || (freshDeploy && hadPriorBlessing())) {
      cleanStageForNewCode = true;
      overrides = {};
      applied = clone(defaults);
      if (!cleanStageToastShown) {
        cleanStageToastShown = true;
        try { fireToast("New deploy — staged clean until Recover.", "info"); } catch {}
      }
    }
  } catch { /* staging falls back to the normal path */ }
  if (cached?.overrides && !freshEyes && !freshDeploy && !cleanStageForNewCode) {
    rev = cached.rev || 0;
    applyOverrides(cached.overrides);
  }
  /* The cache remembers which update its words were published from (note 300):
     a returning copy's own evidence of last-published — raised like any other
     witness, so it stays live on that publish even before (or without) the
     first server answer. Older than the running code it still means wait. */
  if (cached && typeof cached.notes === "number") setPublishedNotes(cached.notes);
  if (cached && typeof (cached as any).publishedDeploy === "string") noteDeployWitness((cached as any).publishedDeploy);
  try {
    if (readJSON<number>(CODEGEN_KEY, 0) !== BUILD_NOTES) writeJSON(CODEGEN_KEY, BUILD_NOTES);
  } catch {
    /* the codegen stamp is best-effort; the paint above already decided */
  }
  history = readJSON<any[]>(HISTORY_KEY, []) || [];
  /* Fresh-deploy enforcement (office request: unsaved opens empty): the reads
     above run after the clearing, so on a new deploy they must stay empty even
     if the store was written again between the two — history reloads here, so
     it is forced back to empty on a fresh deploy. */
  if (freshDeploy) {
    if (history.length) {
      history = [];
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {}
    }
    editUndos = [];
    previewBase = null;
    previewing = false;
  }
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
  /* The pending read above runs after the clearing: on a fresh deploy it stays
     cleared — an offline queue from the old deploy never rides in as unsaved. */
  if (freshDeploy && pending) {
    pending = null;
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {}
  }
  /* Boot numbers are final here (seed + stored stamp): bump once so the
     maintenance notice re-evaluates instead of sticking with first paint
     (note 278). One extra render, boot only. */
  version += 1;
  /* The drawer mounts first, so the stored draft arriving late is put on the page (note 83). */
  showDraftIfEditing();
  notify();
  /* Sleep-free (note 413): heal wiped uploads shortly after boot, on return,
     online AND offline, and every few minutes while open — blank-free without
     an office click. Offline the heal proves nothing and skips the restore,
     but the cached copy keeps painting, so slides stay live with or without
     network; coming back online restores at once. */
  scheduleUploadHeal(2500);
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleUploadHeal(800);
    });
    window.addEventListener("online", () => scheduleUploadHeal(800));
    window.addEventListener("offline", () => scheduleUploadHeal(800));
    window.setInterval(() => {
      healMissingUploads().catch(() => {});
    }, 5 * 60 * 1000);
  } catch {}

  if (!socketFactory()) {
    status = "local";
    localOnly = true;
    connNote = "no office address found for this copy";
    notify();
    /* No socket anywhere: the live feed keeps this copy fresh instead. */
    startFeed();
    /* A late-arriving server address is joined with no reload. */
    watchForServer();
    /* Live publishes pull themselves home while an office tab is open. */
    startLivePull();
    /* ...and every connected tab re-asks the rev stamp, so a missed shout
       still lands the publish within the half minute. */
    startContentWatch();
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
  /* Live publishes pull themselves home while an office tab is open. */
  startLivePull();
  /* ...and every connected tab re-asks the rev stamp, so a missed shout
     still lands the publish within the half minute. */
  startContentWatch();
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
  const deployLifted = noteDeployWitness((res as any).publishDeploy);
  /* Publish clock: any live answer stamped from the running update records
     its clock, so the post-deploy witness in the gates releases this deploy
     even when the publish came from a different deploy id. Seeded/empty
     answers already returned above; cross-update answers (notes beyond this
     bundle) never record — the stale path owns those. */
  try {
    if (typeof res.notes === "number" && Math.floor(res.notes) === BUILD_NOTES && typeof res.at === "number" && res.at > 0) {
      notePublishAt(res.at);
    }
  } catch {}
  /* Local copies (npm run dev / standalone preview) lift on a witnessed
     same-update publish that is NEWER than this copy's first sighting (office
     request: an unsaved change showing means no Publish was clicked — a stale
     publish the backend already had must never clear the local notice by
     itself). Same strict rule as the deploy twin below: a real new click
     stamps a newer clock and lifts; anything older predates this copy and
     still holds until its own click. */
  let serverPublishIsNew = false;
  try {
    serverPublishIsNew = typeof res.at === "number" && res.at > 0 && deployFirstSeenAt > 0 && res.at > deployFirstSeenAt;
  } catch {
    serverPublishIsNew = false;
  }
  try {
    if (!deployFromMeta && typeof res.notes === "number" && Math.floor(res.notes) === BUILD_NOTES && serverPublishIsNew) {
      blessRunningCode();
    }
  } catch {}
  /* Same-code attestation rides the same answer: a backend running this code
     with this code published lifts the number gate headless — a live publish
     clears the local notice with no tab open and no click needed. Gated on
     the same newness: an old publish attesting forever must not lift a copy
     that never saw it happen (the deploy twin below re-checks the same
     clock, so stamping it twice changes nothing there). */
  const codeWitnessed = serverPublishIsNew && noteCodeWitness((res as any).code, res.notes);
  /* A publish newer than this deploy releases it (note 420): the same-ID
     witness above only matches a publish stamped from this exact deploy, so
     one Publish on live/admin used to leave every other deploy — a stale
     phone, a rebuild, any copy whose id differs — waiting until somebody
     tapped Publish there too. A server publish stamped from the running
     update, carrying real words and attested to this code, whose clock is
     NEWER than this deploy first went live, IS a publish for this deploy —
     while anything older predates it and still holds. Never in a clean stage
     (a new code arrival stages nothing inbound until Recover or an explicit
     Publish), never on seeded or empty answers (those returned above), never
     across updates, and never on a copy with no stamped deploy (local dev
     keeps its number gate). Strictly newer — no tolerance: on skewed clocks
     the publish that missed just needs one more click, which always lands. */
  const serverAt = typeof res.at === "number" ? res.at : 0;
  if (
    !cleanStageForNewCode &&
    deployFromMeta && currentDeployId &&
    publishedDeployId !== currentDeployId &&
    codeWitnessed &&
    typeof res.notes === "number" && Math.floor(res.notes) === BUILD_NOTES &&
    Object.keys(server).length > 0 &&
    serverAt > 0 && deployFirstSeenAt > 0 && serverAt > deployFirstSeenAt
  ) {
    markDeployPublished();
  }
  /* Skew-tolerant twin of the block above: the publish clock recorded a moment
     ago already encodes "a same-update publish landed after this deploy was
     first seen", so release here too — even for bless-only publishes (empty
     section sets), code drift, or a clean-staged office copy. Staging is
     untouched (only the notice lifts); words still stage per the rules above.
     Seeded/empty answers already returned, and cross-update notes never
     recorded, so this cannot release across updates. */
  try {
    if (
      deployFromMeta && currentDeployId &&
      publishedDeployId !== currentDeployId &&
      typeof res.notes === "number" && Math.floor(res.notes) === BUILD_NOTES &&
      postDeployPublishWitnessed()
    ) {
      markDeployPublished();
    }
  } catch {}
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
    /* Clean-stage for a new code arrival stages nothing inbound (office
       request): the server's retained words stay on the disk, but the staged
       publishable set stays defaults until Recover or an explicit Publish.
       Revision/stamp witnesses above still moved, so Publish bases correctly. */
    if (!cleanStageForNewCode) {
      applyOverrides(server);
      writeCache();
    }
  } else if (notesLifted || deployLifted || codeWitnessed) {
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

/* Office-reported on-air answer (note 319): this copy's definitive YouTube
   answers ride the joined server's authed socket to every other copy. Only a
   signed-in office tab reports — visitors and signed-out tabs only read —
   and only while joined (standalone copies keep the answer to themselves).
   The sink is fire-and-forget: the next poll reports again. */
setLiveReportSink((rep) => {
  try {
    if (!authed || !socket || status !== "online") return;
    socket.rpc.liveReport(JSON.stringify(rep))?.catch?.(() => {});
  } catch {
    /* the next poll reports again */
  }
});

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
  /* Stale flags first, so no healer below trips over a flag left by an older
     save instead of by the office (see clearPhantomDirty). */
  clearPhantomDirty();
  healDraftChannel();
  healDraftRecents();
  healDraftSlides();
  healDraftStreamLink();
  healDraftGuest();
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

/** A flag left over from an older save must never fake an unsaved change: any
    section whose draft already says exactly what is published is not dirty,
    whatever its flag claims — the flag goes the way a revert takes it. Runs
    on read (first, before the healers below), persists only when a flag
    actually cleared, never notifies. */
function clearPhantomDirty() {
  try {
    if (!draft) return;
    let cleared = false;
    for (const def of SECTION_DEFS) {
      if (!(dirty as any)[def.id]) continue;
      let same = false;
      try {
        same = sameJSON((draft as any)[def.id], publishedSection(def.id));
      } catch {
        same = false;
      }
      if (same) {
        delete (dirty as any)[def.id];
        cleared = true;
      }
    }
    if (cleared) persistDraft();
  } catch {
    /* never break the drawer */
  }
}

/** The update itself moves stored words to @twocorg (note 352) — a draft the
    office saved before that still names the old handle. An untouched live
    section follows the published words here; the office's own edits always
    win (dirty.live returns early), so the channel stays editable. Runs on
    read, persists only when something actually moved, never notifies. */
function healDraftChannel() {
  try {
    if (!draft || dirty.live) return;
    const pubLive = (applied as any)?.live;
    const pubCh = String(pubLive?.youtubeChannel || "").trim();
    if (!pubCh) return;
    const dLive = (draft as any).live;
    if (!dLive || typeof dLive !== "object" || Array.isArray(dLive)) return;
    if (String(dLive.youtubeChannel || "") === pubCh) return;
    (draft as any).live = { ...dLive, youtubeChannel: pubCh };
    persistDraft();
  } catch {
    /* never break the drawer */
  }
}

/** The update itself clears stored take-offs (note 360) — a draft the office
    saved before that still hides videos. An untouched live section follows
    the published words here (cleared stays cleared); the office's own edits
    always win (dirty.live returns early). Runs on read, persists only when
    something actually moved, never notifies. */
function healDraftRecents() {
  try {
    if (!draft || dirty.live) return;
    const pubHidden = (applied as any)?.live?.hiddenReplays;
    if (Array.isArray(pubHidden) && pubHidden.length) return;
    const dLive = (draft as any).live;
    if (!dLive || typeof dLive !== "object" || Array.isArray(dLive)) return;
    if (!Array.isArray(dLive.hiddenReplays) || !dLive.hiddenReplays.length) return;
    (draft as any).live = { ...dLive, hiddenReplays: [] };
    persistDraft();
  } catch {
    /* never break the drawer */
  }
}

/** Every fix arrives fresh, new and clean (note 386): the update itself clears
    the temporary guest channel (see the override stamp in
    scripts/cms-server.js) — a draft the office saved before that still names
    one follows the published words here (cleared stays cleared); the office's
    own edits always win (dirty.live returns early). Runs on read, persists
    only when something actually moved, never notifies. */
/** A proven new update empties the guest slot in the draft too (note 408),
    even a dirty one: the office retypes a guest per event, so a carried-over
    guest is never work worth keeping — while every other draft edit is left
    exactly as the office left it. Runs once per update (freshEyes below),
    persists only when something actually moved, never notifies. */
function clearDraftGuestSlot() {
  try {
    const dLive = (draft as any)?.live;
    if (!dLive || typeof dLive !== "object" || Array.isArray(dLive)) return;
    if (!String(dLive.externalYoutubeChannel || "") && !(dLive as any).guestIsLive && !(dLive as any).guestCommandAt) return;
    (draft as any).live = { ...dLive, externalYoutubeChannel: "", guestIsLive: false, guestCommandAt: 0 };
    persistDraft();
  } catch {
    /* never break boot */
  }
}
function healDraftGuest() {
  try {
    if (!draft || dirty.live) return;
    const pubGuest = String((applied as any)?.live?.externalYoutubeChannel || "");
    if (pubGuest) return;
    const dLive = (draft as any).live;
    if (!dLive || typeof dLive !== "object" || Array.isArray(dLive)) return;
    /* A draft guest with nowhere published follows the published words home
       (cleared stays cleared); a leftover guest override with no guest
       anywhere is off too (note 404). */
    const dGuest = String(dLive.externalYoutubeChannel || "");
    const dOn = !!(dLive as any).guestIsLive;
    if (!dGuest && !dOn) return;
    if (dGuest) {
      (draft as any).live = { ...dLive, externalYoutubeChannel: "" };
    }
    if (dOn) {
      const cur = (draft as any).live;
      if (!String((cur as any).externalYoutubeChannel || "")) (draft as any).live = { ...cur, guestIsLive: false };
    }
    persistDraft();
  } catch {
    /* never break the drawer */
  }
}

/** This update overrides the last one (note 362): a stray stream link the
    office saved before the clear follows the published words here (cleared stays
    cleared while the channel space names the handle); the office's own edits
    always win (dirty.live returns early). Runs on read, persists only when
    something actually moved, never notifies. */
function healDraftStreamLink() {
  try {
    if (!draft || dirty.live) return;
    const pubId = String((applied as any)?.live?.youtubeId || "");
    if (pubId) return;
    const dLive = (draft as any).live;
    if (!dLive || typeof dLive !== "object" || Array.isArray(dLive)) return;
    if (!String(dLive.youtubeId || "")) return;
    (draft as any).live = { ...dLive, youtubeId: "" };
    persistDraft();
  } catch {
    /* never break the drawer */
  }
}

/** The update itself replants the lone welcome card (note 360) — a draft the
    office saved before that still carries the old uploads. An untouched
    slides section follows the published words here; the office's own edits
    always win (dirty.slides returns early). Runs on read, persists only when
    something actually moved, never notifies. */
function healDraftSlides() {
  try {
    if (!draft) return;
    const pubSlides = (applied as any)?.slides;
    const loneWelcome =
      Array.isArray(pubSlides) && pubSlides.length === 1 && String((pubSlides[0] as any)?.id || "") === "welcome-home";
    const dSlides = (draft as any).slides;
    /* An empty box is the blank-black bug, never an office edit worth keeping:
       when the published words are the lone welcome card, a stored empty
       slides list heals even past a stale flag (the flag goes with it). */
    if (loneWelcome && Array.isArray(dSlides) && dSlides.length === 0) {
      (draft as any).slides = JSON.parse(JSON.stringify(pubSlides));
      delete (dirty as any).slides;
      persistDraft();
      return;
    }
    if ((dirty as any).slides) return;
    if (!loneWelcome) return;
    if (Array.isArray(dSlides) && dSlides.length === 1 && String((dSlides[0] as any)?.id || "") === "welcome-home") return;
    (draft as any).slides = JSON.parse(JSON.stringify(pubSlides));
    persistDraft();
  } catch {
    /* never break the drawer */
  }
}
/* Deploy lock, slides edition: every new deploy the announcement slides in
   the admin start over as only the welcome card — old uploads never ride
   into the new deploy's drawer. Once per deploy per browser, office only
   (called from the admin console mount — visitors never run it). Staged clean,
   never unsaved: the welcome card lands in the staged set with no draft edit,
   so the unsaved list opens empty ("Everything is published") — Publish still
   carries it live and lifts maintenance; the reset itself blesses nothing, so
   the notice stays until Publish. */
const SLIDES_RESET_KEY = "wom.cms.slidesReset";
export function resetSlidesForNewDeploy(): boolean {
  try {
    /* Per-deploy token (office request: every new deploy is fresh, clean and
       new): stamped builds reset once per deploy ID, so old slides never
       ride a rebuild — while the boot clean-stage (no dirty) means the
       drawer usually already holds welcome-only and this is a quiet no-op,
       so rebuilds never re-mark slides as unsaved. Local dev keeps the
       code token (no stamped deploy there). */
    const token = deployFromMeta && currentDeployId ? "d" + currentDeployId : runningCode ? "c" + runningCode : "n" + BUILD_NOTES;
    let done = "";
    try {
      done = localStorage.getItem(SLIDES_RESET_KEY) || "";
    } catch {}
    if (done === token) return false;
    const mark = () => {
      try {
        localStorage.setItem(SLIDES_RESET_KEY, token);
      } catch {}
    };
    /* Every new deploy starts from the welcome-home photo slide only — on
       every browser, fresh or returning. The boot clean-stage already holds
       welcome-only, so this is usually a quiet no-op; old uploads never ride
       into the new deploy's drawer. */
    const welcome = SLIDES.find((x) => x.id === "welcome-home") || SLIDES[0];
    /* No welcome card shipped would be a blank box — but one always ships, so
       reaching here without one means a bad build: hold the draft untouched. */
    if (!welcome) {
      mark();
      return false;
    }
    const only = [clone(welcome)];
    /* Read without creating: a fresh deploy cleared the draft, and creating one
       here would persist a clean clone and end the clean stage early. */
    const stagedSlides = (overrides as any)?.slides !== undefined ? (overrides as any).slides : (applied as any)?.slides;
    const draftSlides = draft ? (draft as any).slides : undefined;
    if (sameJSON(stagedSlides !== undefined ? stagedSlides : (defaults as any)?.slides, only) && (draft === null || sameJSON(draftSlides, only))) {
      mark();
      return false;
    }
    /* Stage the welcome card as clean content — not as an office edit: no undo
       entry, no dirty flag, no draft creation, and no persistDraft (which would
       end the clean stage). The unsaved list stays empty; Publish carries the
       staged set live like any clean deploy. */
    try {
      (overrides as any).slides = clone(only);
    } catch {}
    try {
      applySnapshot(merge(overrides));
    } catch {}
    /* A carried-over draft follows the staged card home without becoming
       unsaved: aligned clean, never flagged dirty. No draft means no write. */
    if (draft) {
      try {
        (draft as any).slides = clone(only);
      } catch {}
      try {
        delete (dirty as any).slides;
      } catch {}
      try {
        writeJSON(DRAFT_KEY, { rev: draftFromRev, content: draft, dirty });
      } catch {}
    }
    mark();
    fireToast("New deploy — announcement slides start over with the welcome card only.", "info");
    notify();
    return true;
  } catch {
    return false;
  }
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
  /* The channel the office pasted is cleaned on the way in (note 321): a
     doubled "@" or stray spaces can never reach the published words again. */
  if (sectionId === "live" && value && typeof value === "object" && typeof value.youtubeChannel === "string") {
    const clean = cleanChannelInput(value.youtubeChannel);
    if (clean !== value.youtubeChannel) value = { ...value, youtubeChannel: clean };
  }
  /* The temporary guest pastes clean too (note 380): a doubled "@" or stray
     spaces can never point the guest slot at nothing either. */
  if (sectionId === "live" && value && typeof value === "object" && typeof value.externalYoutubeChannel === "string") {
    const cleanGuest = cleanChannelInput(value.externalYoutubeChannel);
    if (cleanGuest !== value.externalYoutubeChannel) value = { ...value, externalYoutubeChannel: cleanGuest };
  }
  const prev = clone(d[sectionId]);
  if (sameJSON(prev, value)) return;
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
  /* Staging anything ends a clean stage (office request): the moment an edit,
     a fold or a Recover holds staged words, inbound words stage normally
     again — clean-until-staged, never clean-forever. */
  cleanStageForNewCode = false;
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
    if (!sameJSON(a?.[def.id], b?.[def.id])) out.push(def.id);
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
/** Every upload the backup must carry (note 346): the published words' files
    plus anything the current draft points at — a backup taken before
    publishing used to skip unsaved uploads, and the restore then showed
    blank photos/videos on the new copy. */
function allBackupNames(content: Snapshot): string[] {
  const seen = new Set<string>(localUploadNames(content));
  try {
    if (draft) for (const name of localUploadNames(draft)) seen.add(name);
  } catch {
    /* the published set alone still backs up */
  }
  return [...seen];
}
export async function exportPublished(): Promise<string> {
  const content = merge(overrides);
  const base = serverUrl();
  const files: BackupFile[] = [];
  const missingFiles: string[] = [];
  for (const name of allBackupNames(content)) {
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
  channelMoved?: string;
  guestCleared?: string;
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
  /* @twocorg arrives ready, restore half (note 354): a backup saved before
     the move still names the old handle — restoring it must not re-put the
     debugging channel (the boot move only runs on stored words, never on a
     draft). A restored non-@twocorg channel becomes @twocorg here, kept
     dirty so Review shows it and Publish carries it; the result names the
     move, and the field stays editable afterwards. */
  let channelMoved = "";
  /* Every fix arrives fresh (note 386): a backup saved while a guest event
     was set must not re-put it — the guest slot clears on every update, so a
     restored guest is dropped here, kept dirty so Review shows it and Publish
     carries it; the result names the clear, and the field stays editable
     afterwards for the next one-off. */
  let guestCleared = "";
  try {
    const rl = (draft as any)?.live;
    if (rl && typeof rl === "object" && !Array.isArray(rl)) {
      const rc = String(rl.youtubeChannel || "").trim().replace(/@@+/g, "@").replace(/\s+/g, "");
      if (rc && rc.toLowerCase() !== "@twocorg") {
        channelMoved = String(rl.youtubeChannel || "");
        (draft as any).live = { ...rl, youtubeChannel: "@twocorg" };
      }
      const rg = String((draft as any)?.live?.externalYoutubeChannel || "");
      if (rg) {
        guestCleared = rg;
        (draft as any).live = { ...(draft as any).live, externalYoutubeChannel: "" };
      }
    }
  } catch {
    /* a failed clean keeps the backup's words as-is */
  }
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
    /* Same-origin counts (restore+publish must reach every copy): on a
       server-backed tab with no office address — live/admin talking to its
       own backend — the files belong to THIS backend. Refusing them published
       words that pointed at photos only the restoring tab could paint, so a
       restore+publish "worked" on one tab and nowhere else. An office
       address still wins when one is set; localhost keeps its old pass. */
    let reachable = !!base;
    if (!reachable) {
      try {
        reachable = !!(socket && status === "online");
      } catch {
        reachable = false;
      }
    }
    if (!reachable) {
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
          const blob = base64ToBlob(f.data, type);
          if (!blob.size) throw 0;
          const res = await fetch(`${base}/__restore-file?name=${encodeURIComponent(name)}`, {
            method: "POST",
            headers: { "content-type": type },
            body: blob,
          });
          if (!res.ok) throw 0;
          /* Read it back (note 346): a 200 that never became a file used to
             count as restored and left blank photos/videos. Only a file the
             server actually serves counts. */
          let verified = false;
          try {
            const check = await fetch(`${base}/data/uploads/${name}`, { cache: "no-store" });
            verified = !!check.ok;
          } catch {
            verified = false;
          }
          if (!verified) throw 0;
          filesRestored++;
          /* This browser keeps what it restored: the tab paints instantly
             and can heal other copies, instead of depending on one disk. */
          try {
            await cacheUploadBlob(name, blob);
          } catch {
            /* the server copy above is what matters */
          }
        } catch {
          if (f && typeof f.name === "string") filesFailed.push(f.name);
        }
      }
    }
  }
  return { ok: true, restored, skipped, filesRestored, filesFailed, filesMissing, channelMoved: channelMoved || undefined, guestCleared: guestCleared || undefined };
}

/* ----------------------------------------------------------------- publish */

export type PublishResult = { ok: boolean; error?: string; local?: boolean; live?: boolean };

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

/* Publish-at-once convergence, run after every deliberate publish: pull live's
   concurrent words, the feed mirror and the Tools numbers right away instead
   of waiting for each lane's next tick. Same guarded paths the loops take;
   best-effort, never throws. */
function convergeNow(): void {
  try {
    pullFromLive().catch(() => {});
  } catch {}
  try {
    syncFromFeed().catch(() => {});
  } catch {}
  try {
    refreshLiveSiteNotes().catch(() => {});
  } catch {}
  try {
    refreshLiveBake().catch(() => {});
  } catch {}
}

/* Every publish reflects everywhere (office request: a Publish click saves to
   the visitors website from live/admin AND local/admin, and clears the
   notice on live AND local): the office copy's backend reaches the live box
   on its own (minute follow + instant push), but the live box cannot reach a
   localhost office — so without a public mirror an office publish only
   reached live after the rebuild, minutes later. The publishing tab itself
   can reach BOTH (it reads live for the fold already), so after every
   deliberate office publish it relays the same words straight to the live
   backend with this tab's own session — live visitors and live/admin land it
   in seconds via the live backend's own shout, with no feed and no rebuild.
   Best-effort: a denied login (live password differs), 2FA on live, or an
   unreachable live box simply leaves the minute loops, the feed and the
   rebuild to carry the publish as before — and the click now SAYS so instead
   of claiming every visitor is updated. */
/** Where live is for a relay: "" on the live box itself (it IS live — the
    backend loop owns that direction, nothing to reach). */
async function relayLiveBase(): Promise<string> {
  try {
    const base = await liveBaseUrl().catch(() => "");
    if (!base || !/^https?:\/\/[^/\s]+$/i.test(base)) return "";
    return base;
  } catch {
    return "";
  }
}
/* One relay fetch with its own deadline, so awaiting the relay can never
   hold a Publish click hostage on a stalled network. */
async function relayFetch(url: string, body: string, ms = 8000): Promise<Response> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => ctrl.abort(), ms) : 0;
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body,
      signal: ctrl ? ctrl.signal : undefined,
    });
  } finally {
    if (timer) window.clearTimeout(timer as ReturnType<typeof setTimeout>);
  }
}
/* The relay's word leg, awaited by explicit Publish clicks and bounded end to
   end: "landed" (live took the words — its visitors and its notice follow at
   once), "unneeded" (this IS live, or no session to knock with — the loops
   own it), or "missed" (denied, 2FA, unreachable, timed out — the minute
   loops, the feed and the rebuild carry it). Never throws. */
/* Live's own deploy id, best-effort with its own deadline: names the build the
   live box actually serves, so a publish from an unstamped copy (local/dev)
   can still stamp the durable record with the deploy visitors run. Never
   throws; "" when unknown (words still ride without the witness). */
async function fetchLiveDeployId(base: string, ms = 6000): Promise<string> {
  try {
    if (!base || !/^https?:\/\/[^/\s]+$/i.test(base)) return "";
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? window.setTimeout(() => ctrl.abort(), ms) : 0;
    try {
      const res = await fetch(base + "/version.json?t=" + Date.now(), {
        cache: "no-store",
        headers: { pragma: "no-cache", "cache-control": "no-cache" },
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) return "";
      const data = await res.json().catch(() => null);
      const d = String((data && (data as any).deployId) || "");
      return /^[A-Za-z0-9_-]{1,80}$/.test(d) ? d : "";
    } finally {
      if (timer) window.clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
  } catch {
    return "";
  }
}
/* Durable deploy stamp for an office publish from an unstamped copy: local/dev
   runs carry no deploy id of their own, so the office record (store, seed,
   origin push, rebuild bake) would name no deploy and wakes could never match
   it. Stamping the live deploy the relay blesses makes the durable record name
   the build visitors run — sleep-wakes then serve its release, not just words.
   Stamped copies (live/admin, deployed office) always use their own id. */
async function deployStampForOfficePublish(): Promise<string> {
  try {
    /* Stamped real builds carry their own id (their own deploy wins in
       sendPatch); dev-boot IDs and unstamped copies fetch live's instead, so
       the office record and the relay both name the build visitors run. */
    if (currentDeployId && deployFromMeta && !ownDeployIsDevBoot()) return "";
    const base = await relayLiveBase().catch(() => "");
    if (!base) return "";
    return await fetchLiveDeployId(base, 6000);
  } catch {
    return "";
  }
}
async function relayPublishWordsToLive(
  sections: Record<string, string | null>,
  changed: string[],
  note: string,
  knownDeploy?: string
): Promise<"landed" | "missed" | "unneeded"> {
  const run = async (): Promise<"landed" | "missed" | "unneeded"> => {
    const base = await relayLiveBase();
    if (!base) return "unneeded";
    let pw = "";
    try {
      pw = sessionPassword();
    } catch {
      pw = "";
    }
    if (!pw) return "unneeded";
    const conn = "relay-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      const login = await relayFetch(base + "/__cms/login?conn=" + encodeURIComponent(conn), JSON.stringify({ password: pw, want: "main" }));
      if (!login.ok) return "missed";
      const data = await login.json().catch(() => null);
      if (!data || data.ok !== true || (data as any).needCode) return "missed";
    } catch {
      return "missed";
    }
    /* The relay blesses LIVE's own deploy, never ours: our deploy id would
       name a build the live box never served, and its visitors would keep
       waiting. Unknown deploy still rides the words (old-deploys see them);
       the witness just waits for the rebuild. A pre-fetched deploy (stamped
       on the office record too) is reused so both records name the same
       build. */
    let liveDeploy = typeof knownDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(knownDeploy) ? knownDeploy : "";
    if (!liveDeploy) {
      liveDeploy = await fetchLiveDeployId(base, 8000);
    }
    const ids = (Array.isArray(changed) ? changed : []).filter((id) => /^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(id));
    const batches: string[][] = [];
    let cur: string[] = [];
    let size = 0;
    for (const id of ids) {
      const chars = sections[id] ? (sections[id] as string).length : 0;
      if (cur.length && (size + chars > BATCH_CHARS || cur.length >= BATCH_SECTIONS)) {
        batches.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(id);
      size += chars;
    }
    if (cur.length) batches.push(cur);
    if (!batches.length) batches.push([]);
    for (let b = 0; b < batches.length; b++) {
      const part: Record<string, string | null> = {};
      batches[b].forEach((id) => (part[id] = sections[id]));
      try {
        const res = await relayFetch(
          base + "/__cms/publish?conn=" + encodeURIComponent(conn),
          JSON.stringify({
            sections: part,
            note: String(note || "").slice(0, 160),
            by: editorName(),
            changed: batches[b],
            notes: BUILD_NOTES,
            deploy: liveDeploy,
            first: b === 0,
            quiet: b < batches.length - 1,
          })
        );
        if (!res.ok) return "missed";
        const data = await res.json().catch(() => null);
        if (!data || data.ok !== true) return "missed";
      } catch {
        return "missed";
      }
    }
    return "landed";
  };
  try {
    /* Bounded end to end: the words usually land in a couple of seconds; past
       the bound the loops are already carrying them, so report missed. */
    return await Promise.race([
      run(),
      new Promise<"missed">((res) => window.setTimeout(() => res("missed"), 25000)),
    ]);
  } catch {
    return "missed";
  }
}
/* The relay's photo leg: every upload the relayed sections point at is read
   off this copy's own disk and written straight to the live disk under its
   exact name, so the relayed words point at working photos at once instead
   of waiting out the mirror push. Always background (photos can be big) —
   oversize files stay where published (the backfill/mirror log names them);
   failures leave the minute loops to carry them. Kicked off once the words
   land; never throws, never awaits. */
function relayUploadsToLive(sections: Record<string, string | null>): void {
  (async () => {
    const base = await relayLiveBase();
    if (!base) return;
    try {
      const names = localUploadNames(sections).slice(0, 30);
      for (const name of names) {
        try {
          const got = await fetch("/data/uploads/" + name, { cache: "no-store" });
          if (!got.ok) continue;
          const blob = await got.blob();
          if (!blob || !blob.size || blob.size > 90 * 1024 * 1024) continue;
          await fetch(base + "/__restore-file?name=" + encodeURIComponent(name), {
            method: "POST",
            headers: { "content-type": (blob as any).type || guessUploadType(name) },
            body: blob,
          }).catch(() => null);
        } catch {
          /* next file — the loops backstop */
        }
      }
    } catch {
      /* words already landed above */
    }
  })().catch(() => {});
}
/* The background chain for automatic sends (live pull, offline flush): words
   ride when they can, photos chase them, and nothing ever waits. */
function relayInBackground(sections: Record<string, string | null>, changed: string[], note: string, knownDeploy?: string): void {
  try {
    relayPublishWordsToLive(sections, changed, note, knownDeploy)
      .then((outcome) => {
        if (outcome === "landed") {
          try {
            relayUploadsToLive(sections);
          } catch {}
        }
      })
      .catch(() => {});
  } catch {
    /* the loops carry the publish */
  }
}
/* A missed live relay must not strand live visitors on maintenance until the
   next rebuild: keep carrying this publish to the live box in the background
   (sleep wake, Render nap, slow mobile) until it lands or a newer publish
   supersedes it. Explicit clicks only — background sends already ride the
   minute loops. Never throws. */
let relayRetryTimer = 0;
let relayRetryPayload: { sections: Record<string, string | null>; changed: string[]; note: string; rev: number; deploy: string } | null = null;
function scheduleRelayRetry(sections: Record<string, string | null>, changed: string[], note: string, knownDeploy?: string): void {
  try {
    relayRetryPayload = {
      sections: clone(sections),
      changed: [...changed],
      note: String(note || "").slice(0, 160),
      rev,
      deploy: typeof knownDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(knownDeploy) ? knownDeploy : "",
    };
  } catch {
    return;
  }
  if (relayRetryTimer) return;
  const attempt = async () => {
    const payload = relayRetryPayload;
    if (!payload) {
      return true;
    }
    /* Superseded: a newer publish took over — stop retrying the old one. */
    try {
      if (payload.rev !== rev) {
        relayRetryPayload = null;
        return true;
      }
    } catch {}
    let outcome: string = "missed";
    try {
      outcome = await relayPublishWordsToLive(payload.sections, payload.changed, payload.note, payload.deploy);
    } catch {
      outcome = "missed";
    }
    if (outcome === "landed") {
      try {
        relayUploadsToLive(payload.sections);
      } catch {}
      relayRetryPayload = null;
      return true;
    }
    return false;
  };
  const tick = () => {
    attempt()
      .then((done) => {
        if (done) {
          if (relayRetryTimer) {
            window.clearInterval(relayRetryTimer);
            relayRetryTimer = 0;
          }
          return;
        }
      })
      .catch(() => {});
  };
  try {
    relayRetryTimer = window.setInterval(tick, 30_000);
  } catch {
    return;
  }
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  } catch {}
  try {
    window.addEventListener("online", () => tick());
  } catch {}
}
/* Local-only publishes have a snapshot + changed ids (not the wire sections):
   encode them for the live-relay retry. Never throws. */
function buildRelaySections(snapshot: Snapshot | null, changed: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  try {
    const snap = snapshot || {};
    for (const id of changed) {
      if (!/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(id)) continue;
      const v = (snap as any)[id];
      out[id] = v === undefined || v === null ? null : JSON.stringify(v);
    }
  } catch {}
  return out;
}

/** Send a patch in batches that stay well inside the server's CPU budget.
    `awaitRelay` is for explicit Publish clicks only: the click waits
    (bounded) for the live relay's word leg and reports whether live visitors
    got it — background sends (live pull, offline flush) never wait. */
async function sendPatch(
  sections: Record<string, string | null>,
  changed: string[],
  note: string,
  /* Bless the running update (note 293): true for a deliberate office action
     (publish, undo click, bless, offline flush) — the server's publish stamp
     moves to this code and waiting visitors are released. False for the
     automatic heal that puts words back on an emptied server: the words
     return but the notice stays until the office really publishes. */
  bless = true,
  awaitRelay = false,
  /* Durable deploy stamp override: an unstamped copy (local/dev) stamps the
     live deploy its relay blesses, so the office record — store, seed, origin
     push, rebuild bake — names the build visitors run. Sleep-wakes then serve
     its release, not just its words. Stamped copies ignore this (their own id
     always wins). */
  deployStamp?: string
): Promise<{ ok: boolean; error?: string; rev?: number; sent: string[]; failed?: string[]; relay?: "landed" | "missed" | "unneeded" }> {
  /* The durable stamp for this send: our own deploy when stamped, else the
     live deploy the relay blesses (wake durability), else unstamped. Dev-boot
     IDs never count as our own here (see ownDeployIsDevBoot) — the live relay
     below blesses live's own deploy, never ours. */
  let durableDeploy = "";
  try {
    if (bless) {
      if (currentDeployId && deployFromMeta && !ownDeployIsDevBoot()) durableDeploy = currentDeployId;
      else if (typeof deployStamp === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(deployStamp)) durableDeploy = deployStamp;
    }
  } catch {
    durableDeploy = "";
  }
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
      deploy: bless ? durableDeploy : "",
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
  if (bless) {
    markDeployPublished();
    /* One click lifts every deploy (not just this tab): stamp the publish
       clock so copies on other deploy ids release via the post-deploy witness
       instead of waiting for their own click — and carry the click across this
       tab's own stale reload. */
    try {
      notePublishAt(Date.now());
    } catch {}
    try {
      markJustPublished();
    } catch {}
  }
  /* Publish-at-once convergence: this copy just published, so pull every
     other lane at once instead of waiting for its next tick — live's
     concurrent words, the feed mirror, the Tools numbers. Same guarded paths
     the minute loops take; best-effort, never throws. */
  if (bless) convergeNow();
  /* Every publish reflects everywhere: relay these same words straight to the
     live backend (office -> live in seconds, no feed or rebuild wait). The
     office publish above already succeeded. Explicit clicks await the word
     leg (bounded) and report it, so the toast can say whether live visitors
     got it or the loops are carrying it; background sends never wait. */
  let relay: "landed" | "missed" | "unneeded" = "unneeded";
  if (bless) {
    if (awaitRelay) {
      try {
        relay = await relayPublishWordsToLive(sections, changed, note, durableDeploy);
      } catch {
        relay = "missed";
      }
      if (relay === "landed") {
        try {
          relayUploadsToLive(sections);
        } catch {}
      } else if (relay === "missed") {
        /* Live was unreachable (asleep, slow mobile): keep carrying these exact
           words there in the background so live visitors leave maintenance
           without needing another click. */
        try {
          scheduleRelayRetry(sections, changed, note, durableDeploy);
        } catch {}
      }
    } else {
      try {
        relayInBackground(sections, changed, note, durableDeploy);
      } catch {
        /* the loops carry the publish */
      }
    }
  }
  /* An explicit publish may have landed from a stale bundle: re-check the
     version at once so this tab reloads onto the new code promptly instead of
     sitting on maintenance until the next 30s poll. The just-published flag
     carries the click across that reload. */
  if (bless && awaitRelay) {
    try {
      checkStaleBuild().catch(() => {});
    } catch {}
  }
  return { ok: true, rev: lastRev, sent, relay };
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
  /* Publish folds live's newer words in first (note 309): sections the office
     did not touch take live's words, the office's own edits win. Never fails —
     anything unclear publishes exactly as before. */
  /* Durable deploy stamp (sleep-wake survival): an unstamped copy (local/dev)
     names the live deploy it relays to, so the office record — store, seed,
     origin push, rebuild bake — carries the build visitors run. Fetched
     alongside the fold so the click waits for no extra round trip; "" when
     stamped or unreachable (words still ride without the witness). */
  const officeStampP: Promise<string> = deployStampForOfficePublish().catch(() => "");
  const fold = await foldLiveInto(content || draft);
  /* The transport arms the send (notes 390, 392, 394): without a clicked play,
     pause or stop newer than what is published, the on-air state stays out of
     the patch — a natural end stamps nothing and needs no publish. */
  const snapshot = gateLiveSnapshot(fold.snapshot || applied);
  const { sections, changed } = buildPatch(snapshot);
  const officeStamp = await officeStampP.catch(() => "");

  if (!changed.length) {
    draft = null;
    /* A Publish click always counts everywhere (office request: the click
       must apply to the visitors website — live and local): even when this
       copy already holds the stamp, the server and the live box may not — a
       restart wiped the server's stamp, the live box blesses its own deploy
       — so a no-change Publish still blesses THIS deploy through the same
       bless-only sendPatch every other publish rides (server stamp,
       converge, live relay), instead of stopping at this browser with a
       success toast while visitors elsewhere keep waiting. Copies with no
       server anywhere keep the local bless below. */
    /* One click publishes to visitors: the join gets a few seconds first
       (see joinBeforePublish) before this copy settles for device-only. */
    if (!(await joinBeforePublish())) {
      setPublishedNotes(BUILD_NOTES);
      blessRunningCode();
      /* An offline bless ends the clean stage on this copy too — the office
         published, so inbound words may stage again like any other publish.
         The stamp is cached with the words (note 306), so a host sleep
         afterwards changes nothing. */
      markDeployPublished();
      /* Device-only click still lifts every tab of this browser at once, and
         keeps carrying the words to live in the background. */
      try {
        notePublishAt(Date.now());
      } catch {}
      try {
        markJustPublished();
      } catch {}
      try {
        scheduleRelayRetry({}, [], note.slice(0, 160), officeStamp);
      } catch {}
      try {
        checkStaleBuild().catch(() => {});
      } catch {}
      writeCache();
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
    const bless = await sendPatch({}, [], note.slice(0, 160), true, true, officeStamp);
    if (!bless.ok) return { ok: false, error: bless.error };
    rev = bless.rev ?? rev + 1;
    setPublishedNotes(BUILD_NOTES);
    writeCache();
    notify();
    return { ok: true, live: bless.relay !== "missed" };
  }

  /* One click publishes to visitors: the join gets a few seconds first
     (see joinBeforePublish) before this copy settles for device-only. */
  if (!(await joinBeforePublish())) {
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
    markDeployPublished();
    /* Device-only click still lifts every tab of this browser at once; the
       queued words flush to the office server on reconnect, and the live box
       is retried in the background meanwhile. */
    try {
      notePublishAt(Date.now());
    } catch {}
    try {
      markJustPublished();
    } catch {}
    try {
      scheduleRelayRetry(buildRelaySections(snapshot, changed), changed, note.slice(0, 160), officeStamp);
    } catch {}
    try {
      checkStaleBuild().catch(() => {});
    } catch {}
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
  const result = await sendPatch(sections, changed, payloadNote, true, true, officeStamp);
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
  return { ok: true, live: result.relay !== "missed" };
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
  /* Durable stamp like any office publish: unstamped copies name the live
     deploy so the seed and rebuild bake carry the build visitors run. */
  const flushStamp = await deployStampForOfficePublish().catch(() => "");
  const res = await sendPatch(sections, ids, `Offline changes published (${ids.length} section${ids.length === 1 ? "" : "s"})`, true, false, flushStamp);
  if (!res.ok) return false;
  rev = res.rev ?? rev;
  /* An offline flush is a deliberate office publish (note 293): it blesses
     the running update like any other publish (note 300). */
  setPublishedNotes(BUILD_NOTES);
  blessRunningCode();
  pending = null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  writeCache();
  applyOverrides(overrides);
  log = [{ rev, at: Date.now(), by: editorName(), role: myRole === "sub" ? "sub" : "main", note: "Offline changes published", changed: ids }, ...log].slice(0, 30);
  /* One click publishes to visitors: a device-only publish that finally lands
     says so out loud — otherwise the office never knows the visitors caught
     up. Only on a real send (the empty-queue clear above stays quiet). */
  fireToast("Connection is back — your queued changes are now live for every visitor.", "success");
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
      const res = JSON.parse(await socket.rpc.undoPublish(JSON.stringify({ by: editorName(), deploy: currentDeployId || "" })));
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
        /* An undo is a publish the other way: live learns it at once through
           the same relay, so its visitors and its notice follow right away
           instead of waiting out the loops. */
        let live = true;
        try {
          const snap = getOverrides();
          const secs: Record<string, string | null> = {};
          const ids = Object.keys(snap);
          ids.forEach((id) => (secs[id] = JSON.stringify((snap as Snapshot)[id])));
          const outcome = await relayPublishWordsToLive(secs, ids, "Undid the last publish");
          if (outcome === "landed") {
            try {
              relayUploadsToLive(secs);
            } catch {}
          }
          live = outcome !== "missed";
        } catch {
          live = false;
        }
        return { ok: true, live };
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

  const result = await sendPatch(sections, ids, "Rolled back to the previous revision", true, true);
  if (!result.ok) return { ok: false, error: result.error };

  history = history.slice(1);
  writeJSON(HISTORY_KEY, history);
  rev = result.rev ?? rev + 1;
  setPublishedNotes(BUILD_NOTES);
  overrides = clone(entry.overrides || {});
  applyOverrides(overrides, false);
  writeCache();
  await syncFromServer().catch(() => {});
  return { ok: true, live: result.relay !== "missed" };
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
    markDeployPublished();
    writeCache();
    localOnly = true;
    notify();
    return { ok: true, local: true };
  }
  const sections: Record<string, string | null> = {};
  ids.forEach((id) => (sections[id] = null));
  rememberHistory();
  const result = await sendPatch(sections, ids, "Restored the shipped defaults", true, true);
  if (!result.ok) return { ok: false, error: result.error };
  rev = result.rev ?? rev + 1;
  setPublishedNotes(BUILD_NOTES);
  overrides = {};
  applyOverrides({}, false);
  writeCache();
  notify();
  return { ok: true, live: result.relay !== "missed" };
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
