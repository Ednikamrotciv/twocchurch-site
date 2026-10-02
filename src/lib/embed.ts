/* ============================================================================
   Video sources: YouTube and Facebook.

   The church streams on both, so any video slot in the site (the live panel,
   a sermon) can point at either one. Everything here is pure string work so
   the same helpers serve the site, the CMS preview and the share links.
   ========================================================================== */

export type VideoPlatform = "youtube" | "facebook" | "upload";

export const VIDEO_PLATFORMS: VideoPlatform[] = ["youtube", "facebook", "upload"];

export const VIDEO_PLATFORM_LABELS: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  upload: "Uploaded video",
};

/* Perchance pages run with <meta name="referrer" content="no-referrer">, so no
   Referer header is sent at all. YouTube answers an embed request without a
   referrer with "Error 153" and never boots the player, so every <iframe> we
   create for a player has to opt back in to sending one. */
export const EMBED_REFERRER_POLICY = "strict-origin-when-cross-origin";

/** The file extensions a browser will play straight from a URL. */
const VIDEO_FILE = /\.(mp4|m4v|webm|ogv|ogg|mov|m3u8)(\?|#|$)/i;

/** A video file the office uploaded (hosted by the upload service). */
export function isUploadVideoUrl(input: string): boolean {
  const value = String(input || "").trim();
  if (!value) return false;
  return VIDEO_FILE.test(value) || /^https?:\/\//.test(value) || /^src\//.test(value);
}

/** Accepts a bare id, a watch link, a share link, an embed link or a live link. */
export function parseYoutubeId(input: string): string {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^[\w-]{6,20}$/.test(value)) return value;
  const patterns = [
    /[?&]v=([\w-]{6,20})/,
    /youtu\.be\/([\w-]{6,20})/,
    /youtube\.com\/live\/([\w-]{6,20})/,
    /youtube\.com\/embed\/([\w-]{6,20})/,
    /youtube\.com\/shorts\/([\w-]{6,20})/,
    /youtube\.com\/watch\/([\w-]{6,20})/,
  ];
  for (const re of patterns) {
    const m = re.exec(value);
    if (m) return m[1];
  }
  return value.replace(/[^\w-]/g, "").slice(0, 20);
}

export function youtubeEmbed(id: string, autoplay = true): string {
  const video = parseYoutubeId(id);
  if (!video) return "";
  return `https://www.youtube.com/embed/${video}?rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;
}

export function youtubeWatch(id: string): string {
  const video = parseYoutubeId(id);
  return video ? `https://www.youtube.com/watch?v=${video}` : "";
}

export function youtubeThumb(id: string): string {
  const video = parseYoutubeId(id);
  return video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : "";
}

/**
 * The church's *channel* page, from whatever the office pasted into "YouTube
 * channel to watch for live" — a handle, a channel id, or any channel link.
 * (`liveTarget` in `src/lib/livestatus.ts` does the same parsing for the
 * channel's `/live` address, which is what the live check asks.) Empty when
 * there is nothing usable to point at.
 */
export function youtubeChannelUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/live\/*$/i, "");
  const id = /(UC[\w-]{20,24})/.exec(raw);
  if (id) return `https://www.youtube.com/channel/${id[1]}`;
  const at = /youtube\.com\/@([\w.-]+)/i.exec(raw) || /^@([\w.-]+)$/.exec(raw);
  if (at) return `https://www.youtube.com/@${at[1]}`;
  const legacy = /youtube\.com\/(?:c|user)\/([\w.-]+)/i.exec(raw);
  if (legacy) return `https://www.youtube.com/${/\/user\//i.test(raw) ? "user" : "c"}/${legacy[1]}`;
  if (/^[\w.-]+$/.test(raw)) return `https://www.youtube.com/@${raw}`;
  return "";
}

/**
 * What to *call* the address a platform door opens — the handle in the link,
 * when the link has one: `https://www.youtube.com/@twocorg` → `@twocorg`,
 * `https://www.facebook.com/worldovercomers` → `/worldovercomers`.
 *
 * A ways-to-watch card that is a door to a platform should name the door it
 * opens, and the address the card links to is the office's own setting (the
 * channel, the stream link, or the socials entry — see `platformWatchLinks`),
 * so the two can never drift apart: the day the office points the site at a
 * different channel, the card renames itself with it (SPEC note 112). Empty
 * when the address is a video, a search, or anything else with no handle in
 * it — the card then keeps the words it stores, which is what a list the
 * office can no longer edit has to fall back on.
 */
export function platformDoorName(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const at = /youtube\.com\/@([\w.-]+)/i.exec(raw);
  if (at) return `@${at[1]}`;
  const page = /facebook\.com\/([A-Za-z0-9.\-_]+)\/?$/i.exec(raw);
  if (page && !/^(?:watch|video|videos|reel|reels|share|permalink|live|events|groups|pages|marketplace)$/i.test(page[1])) {
    return `/${page[1]}`;
  }
  return "";
}

/** A public Facebook video, reel or live-video link (not a profile). */
export function isFacebookVideoUrl(input: string): boolean {
  return /^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/.+/.test(String(input || "").trim());
}

export function facebookEmbed(url: string, autoplay = true): string {
  const href = String(url || "").trim();
  if (!isFacebookVideoUrl(href)) return "";
  const params = new URLSearchParams({
    href,
    show_text: "false",
    autoplay: autoplay ? "true" : "false",
    allowfullscreen: "true",
    width: "1280",
  });
  return `https://www.facebook.com/plugins/video.php?${params.toString()}`;
}

export type VideoSource = {
  platform?: VideoPlatform;
  youtubeId?: string;
  facebookUrl?: string;
  /** A video file the office uploaded from their phone or computer. */
  uploadUrl?: string;
  poster?: string;
};

/** Has this slot actually got the source its platform needs? */
export function hasVideo(source: VideoSource): boolean {
  if (!source) return false;
  if (source.platform === "facebook") return isFacebookVideoUrl(source.facebookUrl || "");
  if (source.platform === "upload") return isUploadVideoUrl(source.uploadUrl || "");
  return !!parseYoutubeId(source.youtubeId || "");
}

/** True when this slot plays a file directly instead of an embedded player. */
export function isFileVideo(source: VideoSource): boolean {
  return source?.platform === "upload" && isUploadVideoUrl(source.uploadUrl || "");
}

/** The <iframe> address — empty for an uploaded file (it plays in a <video>). */
export function embedSrc(source: VideoSource, autoplay = true): string {
  if (!source) return "";
  if (source.platform === "facebook") return facebookEmbed(source.facebookUrl || "", autoplay);
  if (source.platform === "upload") return "";
  return youtubeEmbed(source.youtubeId || "", autoplay);
}

/** The file address for an uploaded video. */
export function fileSrc(source: VideoSource): string {
  if (!source || source.platform !== "upload") return "";
  const value = String(source.uploadUrl || "").trim();
  return isUploadVideoUrl(value) ? value : "";
}

/** A still to show before the visitor presses play. */
export function posterFor(source: VideoSource, fallback = ""): string {
  if (source && source.poster) return source.poster;
  if (source && source.platform === "facebook") return fallback;
  if (source && source.platform === "upload") return fallback;
  return youtubeThumb(source?.youtubeId || "") || fallback;
}

/** Where "open it on the platform" links should go. */
export function watchUrl(source: VideoSource): string {
  if (!source) return "";
  if (source.platform === "facebook") return String(source.facebookUrl || "");
  if (source.platform === "upload") return String(source.uploadUrl || "");
  return youtubeWatch(source.youtubeId || "");
}

export function platformLabel(platform?: VideoPlatform): string {
  if (platform === "facebook") return "Facebook";
  if (platform === "upload") return "Uploaded video";
  return "YouTube";
}
