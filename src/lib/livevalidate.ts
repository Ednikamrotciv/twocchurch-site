/* livevalidate.ts — livestream pre-flight validation + recovery policy (note 441).
   Every broadcast the office configures passes through here before it can be
   marked READY: format, backend metadata (YouTube Data API v3 when a key is
   configured, oEmbed mirror otherwise — with honest limitations), thumbnail
   availability, and a real IFrame Player init that captures YouTube's own
   error codes. Metadata alone never declares a video playable.
   Also the shared recovery policy (bounded exponential backoff, no iframe
   churn, no infinite retries for dead/private/unembeddable videos) and the
   visitor player-error bus the admin panel reads. Pure + tiny DOM only. */

import { parseYoutubeId, youtubeThumb } from "./embed";

export const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** The ten admin dashboard states (spec §6). */
export type AdminLiveStatus =
  | "UNVERIFIED"
  | "CHECKING"
  | "READY"
  | "SCHEDULED"
  | "LIVE"
  | "CONNECTING"
  | "RECONNECTING"
  | "ENDED"
  | "UNAVAILABLE"
  | "FALLBACK_ACTIVE";

export type LiveBroadcastKind = "live" | "upcoming" | "ended" | "none" | null;

export type LiveValidation = {
  videoId: string;
  validFormat: boolean;
  exists: boolean | null;
  title: string;
  channelId: string;
  thumbnail: string;
  thumbnailOk: boolean | null;
  privacy: "public" | "unlisted" | "private" | null;
  liveBroadcast: LiveBroadcastKind;
  embeddable: boolean | null;
  source: "data-api" | "oembed-fallback" | "none";
  limitations: string[];
  diagnosis: string;
  playerError: number | null;
  playerReady: boolean | null;
  canMarkReady: boolean;
  checkedAt: number;
};

/** Empty result for blank input — never throws. */
export function emptyValidation(): LiveValidation {
  return {
    videoId: "",
    validFormat: false,
    exists: null,
    title: "",
    channelId: "",
    thumbnail: "",
    thumbnailOk: null,
    privacy: null,
    liveBroadcast: null,
    embeddable: null,
    source: "none",
    limitations: ["No video configured."],
    diagnosis: "Paste a YouTube link or 11-character video id first.",
    playerError: null,
    playerReady: null,
    canMarkReady: false,
    checkedAt: Date.now(),
  };
}

/** Format gate: strict 11-char id, pulled out of any YouTube link. */
export function validateVideoIdFormat(input: unknown): { videoId: string; validFormat: boolean; diagnosis: string } {
  const id = parseYoutubeId(String(input || ""));
  if (!id) {
    const raw = String(input || "").trim();
    if (!raw) return { videoId: "", validFormat: false, diagnosis: "No video configured — paste a YouTube link first." };
    return { videoId: "", validFormat: false, diagnosis: `“${raw.slice(0, 60)}” is not a YouTube video — paste the whole watch/share link, not a channel page or sentence.` };
  }
  if (!YT_ID_RE.test(id)) return { videoId: "", validFormat: false, diagnosis: `“${id}” is not a valid YouTube id (11 letters, numbers, - or _).` };
  return { videoId: id, validFormat: true, diagnosis: "" };
}

/* ------------------------------------------------ backend metadata door */

export type BackendMeta = {
  videoId: string;
  validFormat: boolean;
  exists: boolean | null;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  privacy: "public" | "unlisted" | "private" | null;
  liveBroadcast: LiveBroadcastKind;
  embeddable: boolean | null;
  source: "data-api" | "oembed-fallback";
  limitations: string[];
  checkedAt: number;
};

const META_TTL_MS = 5 * 60_000;
const metaCache = new Map<string, { at: number; meta: BackendMeta }>();

function backendMetaUrl(videoId: string): string {
  return `/__yt-validate?videoId=${encodeURIComponent(videoId)}`;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch {} }, ms) : 0;
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

/** Backend metadata (Data API v3 when the server has a key, oEmbed mirror
    otherwise). Cached 5 minutes so validation never hammers the API. */
export async function fetchBackendMeta(videoId: string): Promise<BackendMeta | null> {
  const id = parseYoutubeId(videoId);
  if (!id) return null;
  try {
    const hit = metaCache.get(id);
    if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta;
  } catch { /* cache unreadable — fetch anyway */ }
  const readMeta = async (url: string): Promise<BackendMeta | null> => {
    try {
      const res = await fetchWithTimeout(url, 9000);
      if (!res || !res.ok) return null;
      try {
        const ctype = String((res.headers && res.headers.get("content-type")) || "");
        if (ctype && !/application\/json/i.test(ctype)) return null;
      } catch { /* headers unreadable — parse anyway */ }
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") return null;
      const d = data as Partial<BackendMeta> & { videoId?: unknown };
      if (String((d as { videoId?: unknown }).videoId || "") !== id) return null;
      return {
        videoId: id,
        validFormat: true,
        exists: typeof d.exists === "boolean" ? d.exists : null,
        title: String((d as { title?: unknown }).title || ""),
        channelId: String((d as { channelId?: unknown }).channelId || ""),
        channelTitle: String((d as { channelTitle?: unknown }).channelTitle || ""),
        thumbnail: String((d as { thumbnail?: unknown }).thumbnail || "") || youtubeThumb(id),
        privacy: (d.privacy === "public" || d.privacy === "unlisted" || d.privacy === "private") ? d.privacy : null,
        liveBroadcast: (d.liveBroadcast === "live" || d.liveBroadcast === "upcoming" || d.liveBroadcast === "ended" || d.liveBroadcast === "none") ? d.liveBroadcast : null,
        embeddable: typeof d.embeddable === "boolean" ? d.embeddable : null,
        source: d.source === "data-api" ? "data-api" : "oembed-fallback",
        limitations: Array.isArray(d.limitations) ? (d.limitations as unknown[]).map(String).slice(0, 6) : [],
        checkedAt: Number((d as { checkedAt?: unknown }).checkedAt) || Date.now(),
      };
    } catch {
      return null;
    }
  };
  try {
    /* Same-origin first (office + deployed server), then the static door —
       static hosts answer /__yt-validate with the SPA fallback (index.html),
       which is rejected by the JSON content-type check above. */
    const same = await readMeta(backendMetaUrl(id));
    if (same) {
      try { metaCache.set(id, { at: Date.now(), meta: same }); } catch {}
      return same;
    }
    const statik = await readMeta(`/.netlify/functions/yt-validate?videoId=${encodeURIComponent(id)}`);
    if (statik) {
      try { metaCache.set(id, { at: Date.now(), meta: statik }); } catch {}
      return statik;
    }
    return null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------- thumbnail + player */

function checkImage(url: string, ms = 8000): Promise<boolean | null> {
  return new Promise((resolve) => {
    try {
      if (!url) { resolve(null); return; }
      const img = new Image();
      let done = false;
      const timer = window.setTimeout(() => { if (!done) { done = true; try { img.src = ""; } catch {} resolve(null); } }, ms);
      img.onload = () => { if (!done) { done = true; window.clearTimeout(timer); resolve(true); } };
      img.onerror = () => { if (!done) { done = true; window.clearTimeout(timer); resolve(false); } };
      img.src = url;
    } catch { resolve(null); }
  });
}

type YtPlayerCtor = new (...args: any[]) => { destroy?: () => void };
type YtApi = { Player: YtPlayerCtor } & Record<string, unknown>;

let ytApiPromise: Promise<YtApi | null> | null = null;

/** Load the official YouTube IFrame Player API once per page. */
export function ensureYtApi(): Promise<YtApi | null> {
  try {
    const w = window as unknown as { YT?: YtApi };
    if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise<YtApi | null>((resolve) => {
      try {
        const prev = (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady;
        (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
          try { if (typeof prev === "function") prev(); } catch {}
          try {
            const api = (window as unknown as { YT?: YtApi }).YT;
            resolve(api && api.Player ? api : null);
          } catch { resolve(null); }
        };
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
          const s = document.createElement("script");
          s.src = "https://www.youtube.com/iframe_api";
          s.async = true;
          document.head.appendChild(s);
        }
        window.setTimeout(() => {
          try {
            const api = (window as unknown as { YT?: YtApi }).YT;
            if (api && api.Player) resolve(api);
            else resolve(null);
          } catch { resolve(null); }
        }, 12000);
      } catch { resolve(null); }
    });
    return ytApiPromise;
  } catch { return Promise.resolve(null); }
}

export type PlayerTest = { ready: boolean; errorCode: number | null; playable: boolean | null };

/** Real player init test: mounts the official YT player on a hidden div and
    captures YouTube's own ready/error codes. Never autoplays with sound. */
export async function testPlayerInit(videoId: string, timeoutMs = 15000): Promise<PlayerTest> {
  const id = parseYoutubeId(videoId);
  if (!id) return { ready: false, errorCode: 2, playable: false };
  try {
    const api = await ensureYtApi();
    if (!api || !api.Player) return { ready: false, errorCode: null, playable: null };
    return await new Promise<PlayerTest>((resolve) => {
      let settled = false;
      const done = (t: PlayerTest) => { if (!settled) { settled = true; resolve(t); } };
      const timer = window.setTimeout(() => done({ ready: false, errorCode: null, playable: null }), Math.max(3000, timeoutMs));
      let host: HTMLDivElement | null = null;
      let player: { destroy?: () => void } | null = null;
      try {
        host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;";
        host.setAttribute("aria-hidden", "true");
        document.body.appendChild(host);
        const mount = document.createElement("div");
        host.appendChild(mount);
        let origin = "";
        try { origin = window.location && window.location.origin ? String(window.location.origin) : ""; } catch { origin = ""; }
        player = new api.Player(mount, {
          videoId: id,
          width: 320,
          height: 180,
          playerVars: { autoplay: 0, rel: 0, modestbranding: 1, playsinline: 1, ...(origin ? { origin } : {}) },
          events: {
            onReady: () => {
              window.clearTimeout(timer);
              try { if (player && player.destroy) player.destroy(); } catch {}
              try { if (host && host.parentNode) host.parentNode.removeChild(host); } catch {}
              done({ ready: true, errorCode: null, playable: true });
            },
            onError: (e: { data?: number }) => {
              window.clearTimeout(timer);
              const code = Number(e && (e as { data?: unknown }).data);
              const c = Number.isFinite(code) ? code : null;
              try { if (player && player.destroy) player.destroy(); } catch {}
              try { if (host && host.parentNode) host.parentNode.removeChild(host); } catch {}
              done({ ready: false, errorCode: c, playable: c === 100 || c === 101 || c === 105 || c === 150 ? false : null });
            },
          },
        } as Record<string, unknown>);
      } catch {
        window.clearTimeout(timer);
        try { if (host && host.parentNode) host.parentNode.removeChild(host); } catch {}
        done({ ready: false, errorCode: null, playable: null });
      }
    });
  } catch {
    return { ready: false, errorCode: null, playable: null };
  }
}

/* ------------------------------------------------------- full pre-flight */

const preflightCache = new Map<string, { at: number; result: LiveValidation }>();
const PREFLIGHT_TTL_MS = 5 * 60_000;

function diagnose(meta: BackendMeta | null, thumbOk: boolean | null, player: PlayerTest | null, id: string): string {
  if (player && player.errorCode === 100) return "YouTube reports this video is gone (deleted or private) — player error 100. Swap the video in YouTube Studio.";
  if (player && (player.errorCode === 101 || player.errorCode === 150)) return `YouTube refuses to embed this video (player error ${player.errorCode}) — enable embedding in YouTube Studio, or swap the video.`;
  if (player && player.errorCode === 105) return "YouTube reports this video is unavailable (player error 105) — swap the video.";
  if (meta && meta.exists === false) return "YouTube has no such video — check the link for a typo or a removed upload.";
  if (meta && meta.privacy === "private") return "This video is private — only the channel owner can watch it. Publish it as Public or Unlisted.";
  if (meta && meta.embeddable === false) return "Embedding is disabled for this video — enable embedding in YouTube Studio.";
  if (meta && meta.liveBroadcast === "upcoming") return "Scheduled — the broadcast exists but has not started. It can be marked READY; it plays when YouTube starts it.";
  if (meta && meta.liveBroadcast === "ended") return "This broadcast has ended — pick the live video or a recording instead.";
  if (meta && meta.liveBroadcast === "live") return "Live now and playable — ready to publish.";
  if (thumbOk === false) return "The thumbnail will not load — the video is likely gone. Check the link.";
  if (!meta && !player) return "YouTube could not be reached — the network or proxy is down. The existing player stays; validation retries.";
  return `“${id}” looks playable — verified${meta ? ` via ${meta.source === "data-api" ? "the YouTube Data API" : "the oEmbed mirror"}` : ""}${player && player.ready ? " and a real player init" : ""}.`;
}

/** Full pre-flight: format → backend meta → thumbnail → real player init.
    Never throws; unknown doors read as unknown (not dead). */
export async function fullPreflight(input: unknown, opts: { playerTest?: boolean } = {}): Promise<LiveValidation> {
  const fmt = validateVideoIdFormat(input);
  if (!fmt.validFormat) return { ...emptyValidation(), diagnosis: fmt.diagnosis, checkedAt: Date.now() };
  const id = fmt.videoId;
  try {
    const hit = preflightCache.get(id);
    if (hit && Date.now() - hit.at < PREFLIGHT_TTL_MS) return hit.result;
  } catch { /* cache unreadable — validate anyway */ }
  const checkedAt = Date.now();
  let meta: BackendMeta | null = null;
  try { meta = await fetchBackendMeta(id); } catch { meta = null; }
  let thumbOk: boolean | null = null;
  try { thumbOk = await checkImage(meta?.thumbnail || youtubeThumb(id)); } catch { thumbOk = null; }
  let player: PlayerTest | null = null;
  if (opts.playerTest !== false) {
    try { player = await testPlayerInit(id); } catch { player = null; }
  }
  const exists = meta ? meta.exists : player && player.errorCode === 100 ? false : null;
  const embeddable = meta ? meta.embeddable : player && (player.errorCode === 101 || player.errorCode === 150) ? false : null;
  const playerError = player ? player.errorCode : null;
  const deadByPlayer = playerError === 100 || playerError === 101 || playerError === 105 || playerError === 150;
  const deadByMeta = exists === false || embeddable === false || (meta && meta.privacy === "private");
  const canMarkReady =
    !!id &&
    !deadByPlayer &&
    !deadByMeta &&
    (exists === true || (player && player.ready === true)) &&
    thumbOk !== false;
  const limitations = [...(meta?.limitations || [])];
  if (meta && meta.source === "oembed-fallback") {
    if (!limitations.length) limitations.push("oEmbed mirror: existence + title only — scheduled/live/ended, privacy and embedding need the Data API key or the player test.");
  }
  if (player && !player.ready && player.errorCode === null) {
    limitations.push("Player init did not settle (network or API blocked) — metadata only, not a play guarantee.");
  }
  const diagnosis = diagnose(meta, thumbOk, player, id);
  const result: LiveValidation = {
    videoId: id,
    validFormat: true,
    exists,
    title: String(meta?.title || ""),
    channelId: String(meta?.channelId || ""),
    thumbnail: String(meta?.thumbnail || "") || youtubeThumb(id),
    thumbnailOk,
    privacy: meta?.privacy || null,
    liveBroadcast: meta?.liveBroadcast ?? null,
    embeddable,
    source: meta ? meta.source : "none",
    limitations,
    diagnosis,
    playerError,
    playerReady: player ? player.ready : null,
    canMarkReady,
    checkedAt,
  };
  try { preflightCache.set(id, { at: Date.now(), result }); } catch {}
  return result;
}

/** Forget one cached pre-flight (visitor retry + office Reload share it). */
export function forgetPreflight(videoId: string): void {
  try { preflightCache.delete(parseYoutubeId(videoId)); } catch {}
  try { metaCache.delete(parseYoutubeId(videoId)); } catch {}
}
export function forgetAllPreflights(): void {
  try { preflightCache.clear(); } catch {}
  try { metaCache.clear(); } catch {}
}

/* ---------------------------------------------------------- status maps */

/** Map a validation + liveness onto the ten admin states. Pure for verifier. */
export function adminStatusFor(opts: {
  validation: LiveValidation | null;
  liveNow: boolean;
  connecting: boolean;
  reconnecting: boolean;
  fallbackActive: boolean;
  checking: boolean;
}): AdminLiveStatus {
  if (opts.fallbackActive) return "FALLBACK_ACTIVE";
  if (opts.checking) return "CHECKING";
  const v = opts.validation;
  if (!v || !v.validFormat) return "UNVERIFIED";
  if (v.exists === false || v.playerError === 100 || v.playerError === 101 || v.playerError === 105 || v.playerError === 150 || v.embeddable === false) return "UNAVAILABLE";
  if (v.liveBroadcast === "ended") return "ENDED";
  if (opts.reconnecting) return "RECONNECTING";
  if (opts.connecting) return "CONNECTING";
  if (opts.liveNow || v.liveBroadcast === "live") return "LIVE";
  if (v.liveBroadcast === "upcoming") return "SCHEDULED";
  if (v.canMarkReady) return "READY";
  return "UNVERIFIED";
}

/* --------------------------------------------- recovery policy (bounded) */

export type FailureKind = "network" | "buffering" | "interrupted" | "init" | "temp-yt" | "startup" | "deleted" | "private" | "unembeddable" | "invalid";

export const MAX_RECOVERY_ATTEMPTS = 6;

/** True while this failure may heal by waiting (never for dead/private/banned). */
export function isRecoverablePlayerError(code: number | null | undefined): boolean {
  if (code === null || code === undefined) return true;
  if (code === 100 || code === 101 || code === 105 || code === 150) return false;
  if (code === 2) return false;
  return true;
}

/** True while this situation may heal by waiting. Pure for the verifier. */
export function isRecoverableKind(kind: FailureKind): boolean {
  if (kind === "deleted" || kind === "private" || kind === "unembeddable" || kind === "invalid") return false;
  return true;
}

/** Bounded exponential backoff: 2s, 4s, 8s, 16s, 24s, 30s + jitter. */
export function backoffDelayMs(attempt: number): number {
  const a = Math.max(0, Math.floor(attempt));
  const base = Math.min(30000, 2000 * Math.pow(2, a));
  let jitter = 0;
  try { jitter = Math.floor(Math.random() * 750); } catch { jitter = 0; }
  return base + jitter;
}

/* ------------------------------------------------------- player prefs */

export type PlayerPrefs = { muted: boolean; volume: number };

export function readPlayerPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem("wom.player.prefs");
    if (!raw) return { muted: false, volume: 100 };
    const p = JSON.parse(raw);
    return {
      muted: !!(p && (p as PlayerPrefs).muted),
      volume: Math.max(0, Math.min(100, Math.floor(Number((p as PlayerPrefs).volume)) || 100)),
    };
  } catch { return { muted: false, volume: 100 }; }
}

export function writePlayerPrefs(prefs: PlayerPrefs): void {
  try { localStorage.setItem("wom.player.prefs", JSON.stringify({ muted: !!prefs.muted, volume: Math.max(0, Math.min(100, Math.floor(prefs.volume) || 0)) })); } catch {}
}

/* ---------------------------------------------------- player-error bus */

export type PlayerErrorReport = { code: number | null; videoId: string; context: string; at: number };
let lastPlayerError: PlayerErrorReport | null = null;
const errorListeners = new Set<() => void>();

export function reportPlayerError(code: number | null, videoId: string, context = ""): void {
  lastPlayerError = { code, videoId: parseYoutubeId(videoId) || String(videoId || ""), context: String(context || ""), at: Date.now() };
  errorListeners.forEach((fn) => { try { fn(); } catch {} });
}

export function getLastPlayerError(): PlayerErrorReport | null {
  return lastPlayerError;
}

export function subscribePlayerErrors(fn: () => void): () => void {
  errorListeners.add(fn);
  return () => { errorListeners.delete(fn); };
}

/* ------------------------------------------------------------- backup */

export type BackupConfig = { recordingId: string; streamUrl: string; message: string };

/** Read the office's backup configuration (pure for the verifier). */
export function backupConfigOf(live: {
  liveBackupVideo?: unknown;
  liveBackupStream?: unknown;
  liveOfflineMessage?: unknown;
  backupVideo?: unknown;
}): BackupConfig {
  const rawVideo = String(live.liveBackupVideo ?? (live as { backupVideo?: unknown }).backupVideo ?? "");
  const recordingId = parseYoutubeId(rawVideo);
  return {
    recordingId,
    streamUrl: String(live.liveBackupStream || "").trim(),
    message: String(live.liveOfflineMessage || "").trim(),
  };
}

/** True while the backup recording (not the live) is what the visitor sees. */
export function isFallbackActive(primaryDead: boolean, backupRecordingId: string): boolean {
  return !!primaryDead && !!parseYoutubeId(backupRecordingId);
}
