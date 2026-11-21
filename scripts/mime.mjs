/* Shared MIME map for the local servers (dev backend + office server). */
export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".ogv": "video/ogg",
  /* Fix: .ogg is a dual container (theora video / vorbis audio). Serve video
     so <video> playback of .ogg slide/message uploads works; <audio> plays
     video/ogg fine in every modern browser. */
  ".ogg": "video/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".avif": "image/avif",
  /* Fix: HLS playlists the slides/embed code recognises (.m3u8) need their
     real MIME or some hosts download instead of playing. */
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};
