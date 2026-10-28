/* Video sources: YouTube and Facebook. Pure string work for site, preview and share links. */

export type VideoPlatform = "youtube" | "facebook" | "upload";

export const VIDEO_PLATFORMS: VideoPlatform[] = ["youtube", "facebook", "upload"];

export const VIDEO_PLATFORM_LABELS: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  upload: "Uploaded video",
};

/* Platform sends no Referer, which YouTube answers with Error 153 — so every player iframe opts back in. */
export const EMBED_REFERRER_POLICY = "strict-origin-when-cross-origin";

/** The file extensions a browser will play straight from a URL. */
const VIDEO_FILE = /\.(mp4|m4v|webm|ogv|ogg|mov|m3u8)(\?|#|$)/i;

/** A video file the office uploaded (hosted by the upload service). */
export function isUploadVideoUrl(input: string): boolean {
  const value = String(input || "").trim();
  if (!value) return false;
  return VIDEO_FILE.test(value) || /^https?:\/\//.test(value) || /^src\//.test(value);
}

/** Accepts a bare id, a watch link, a share link, an embed link or a live link.
 *  Strict: only exact 11-character YouTube ids count. Channel pages, handles,
 *  sentences and pasted prose are NOT videos — inventing an id from them used
 *  to embed the black "video unavailable" frame. Anything unrecognized is "". */
export function parseYoutubeId(input: string): string {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^[\w-]{11}$/.test(value)) return value;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/watch\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = re.exec(value);
    if (m) return m[1];
  }
  return "";
}

export function youtubeEmbed(id: string, autoplay = true): string {
  const video = parseYoutubeId(id);
  if (!video) return "";
  /* Sound on (note 388): every live from a channel plays with its audio —
     anything the site plays, tapped or self-started, carries its sound, and
     the stream's audio opens by itself the moment the broadcast starts. */
  return `https://www.youtube.com/embed/${video}?rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;
}

/** A channel id (`UC…`): the only address the channel player takes. */
export function isYoutubeChannelId(input: unknown): boolean {
  return /^UC[\w-]{20,24}$/.test(String(input || "").trim());
}

/** A channel's running broadcast, played with no video id (note 331): the
    deployed server cannot read watch pages (they answer 502 from its network
    while the channel page reads 200), so when the channel page is on air but
    names no verifiable video, the player follows the channel instead of
    guessing a video — on live and on local alike. */
export function youtubeChannelEmbed(channelId: string, autoplay = true): string {
  if (!isYoutubeChannelId(channelId)) return "";
  const id = String(channelId).trim();
  return `https://www.youtube.com/embed/live_stream?channel=${id}&rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;
}

export function youtubeWatch(id: string): string {
  const video = parseYoutubeId(id);
  return video ? `https://www.youtube.com/watch?v=${video}` : "";
}

export function youtubeThumb(id: string): string {
  const video = parseYoutubeId(id);
  return video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : "";
}

/** Whatever the office pasted as the channel, cleaned (note 321): pasting the
    "@" twice ("@@handle") or with stray spaces used to silently point the
    whole site at nothing — now it collapses to the intended address. */
export function cleanChannelInput(input: unknown): string {
  return String(input || "")
    .trim()
    .replace(/@@+/g, "@")
    .replace(/\s+/g, "");
}

/** The church's channel page, from whatever the office pasted (handle, id or link). */
export function youtubeChannelUrl(input: string): string {
  const raw = cleanChannelInput(input);
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

/** The handle in a platform link (`@twocorg`), for the ways-to-watch cards (note 112). */
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
  /** The channel to follow when no video id verified (note 331). */
  youtubeChannelId?: string;
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
  return !!parseYoutubeId(source.youtubeId || "") || isYoutubeChannelId(source.youtubeChannelId);
}

/** True when this slot plays a file directly instead of an embedded player. */
export function isFileVideo(source: VideoSource): boolean {
  return source?.platform === "upload" && isUploadVideoUrl(source.uploadUrl || "");
}

/** The <iframe> address — empty for an uploaded file (it plays in a <video>).
    Sound on (note 388): no silent path remains — every address plays with
    its audio, tapped or self-started. */
export function embedSrc(source: VideoSource, autoplay = true): string {
  if (!source) return "";
  if (source.platform === "facebook") return facebookEmbed(source.facebookUrl || "", autoplay);
  if (source.platform === "upload") return "";
  return youtubeEmbed(source.youtubeId || "", autoplay) || youtubeChannelEmbed(source.youtubeChannelId || "", autoplay);
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
