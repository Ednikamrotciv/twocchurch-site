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
    Channel-shaped input (a channel page, handle or /live tab — not a video)
    and other platforms' links are NOT video ids: "" rather than a mangled
    id no player could ever open (note 310). */
export function parseYoutubeId(input: string): string {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/youtube\.com\/(@|channel\/|c\/|user\/)/i.test(value)) return "";
  if (/facebook\.com\//i.test(value)) return "";
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

/** A channel's current broadcast, without knowing the video id (note 310):
    the player YouTube itself serves on the channel's /live page. Needs the UC
    id — handles cannot address it. */
export function youtubeChannelLiveEmbed(channelId: string, autoplay = true): string {
  const id = channelIdFrom(channelId);
  if (!id) return "";
  return `https://www.youtube.com/embed/live_stream?channel=${id}${autoplay ? "&autoplay=1" : ""}`;
}

export function youtubeWatch(id: string): string {
  const video = parseYoutubeId(id);
  return video ? `https://www.youtube.com/watch?v=${video}` : "";
}

export function youtubeThumb(id: string): string {
  const video = parseYoutubeId(id);
  return video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : "";
}

/** The UC id in whatever the office pasted (id, handle or link) — "" for
    handles and names, which cannot address an embed without resolving. */
export function channelIdFrom(input: string): string {
  return /(UC[\w-]{20,24})/.exec(String(input || ""))?.[1] || "";
}

/** The church's channel page, from whatever the office pasted (handle, id or link). */
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
  facebookUrl?: string;
  /** A video file the office uploaded from their phone or computer. */
  uploadUrl?: string;
  poster?: string;
  /** Fallback while a detected broadcast's own id is still unknown: the
      channel's UC id, played through its /live embed (note 310). */
  channelLiveId?: string;
};

/** Has this slot actually got the source its platform needs? */
export function hasVideo(source: VideoSource): boolean {
  if (!source) return false;
  if (source.platform === "facebook") return isFacebookVideoUrl(source.facebookUrl || "");
  if (source.platform === "upload") return isUploadVideoUrl(source.uploadUrl || "");
  return !!parseYoutubeId(source.youtubeId || "") || !!channelIdFrom(source.channelLiveId || "");
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
  const video = parseYoutubeId(source.youtubeId || "");
  if (video) return youtubeEmbed(video, autoplay);
  /* Detected live, id still unknown: the channel's own live embed (note 310). */
  if (source.channelLiveId) return youtubeChannelLiveEmbed(source.channelLiveId, autoplay);
  return "";
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
  const video = parseYoutubeId(source.youtubeId || "");
  if (video) return `https://www.youtube.com/watch?v=${video}`;
  /* Channel-live fallback: the channel's own /live page (note 310). */
  const channel = channelIdFrom(source.channelLiveId || "");
  if (channel) return `https://www.youtube.com/channel/${channel}/live`;
  return "";
}

export function platformLabel(platform?: VideoPlatform): string {
  if (platform === "facebook") return "Facebook";
  if (platform === "upload") return "Uploaded video";
  return "YouTube";
}
