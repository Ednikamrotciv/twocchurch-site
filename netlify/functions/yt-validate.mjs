// Livestream pre-flight metadata for static deploys (note 441).
// Same contract as scripts/serve.mjs /__yt-validate: strict 11-char id only
// (SSRF-safe by construction). Data API v3 when YT_API_KEY is configured,
// else the oEmbed/noembed mirror with honest limitations. No deps.
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function handler(event) {
  const send = (statusCode, obj) => ({
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
    body: JSON.stringify(obj),
  });
  try {
    const videoId = String((event.queryStringParameters && event.queryStringParameters.videoId) || "").trim();
    if (!ID_RE.test(videoId)) {
      return send(400, { videoId: "", validFormat: false, exists: null, title: "", channelId: "", channelTitle: "", thumbnail: "", privacy: null, liveBroadcast: null, embeddable: null, source: "oembed-fallback", limitations: ["Invalid YouTube video id (11 letters, numbers, - or _)."], checkedAt: Date.now() });
    }
    const apiKey = String(process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY || "");
    const answer = { videoId, validFormat: true, exists: null, title: "", channelId: "", channelTitle: "", thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, privacy: null, liveBroadcast: null, embeddable: null, source: "oembed-fallback", limitations: [], checkedAt: Date.now() };
    let dataApiOk = false;
    if (apiKey) {
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
        try {
          const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=status%2Csnippet%2CliveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
          const upstream = await fetch(apiUrl, { headers: { accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined });
          if (upstream && upstream.ok) {
            const data = await upstream.json().catch(() => null);
            const item = data && Array.isArray(data.items) ? data.items[0] : null;
            if (!item) {
              answer.exists = false;
              answer.limitations.push("YouTube Data API: no such video.");
              dataApiOk = true;
            } else {
              const status = item.status || {};
              const snippet = item.snippet || {};
              const live = item.liveStreamingDetails || {};
              const priv = String(status.privacyStatus || "");
              answer.exists = true;
              answer.title = String(snippet.title || "");
              answer.channelId = String(snippet.channelId || "");
              answer.channelTitle = String(snippet.channelTitle || "");
              answer.privacy = priv === "public" || priv === "unlisted" || priv === "private" ? priv : null;
              answer.embeddable = typeof status.embeddable === "boolean" ? status.embeddable : null;
              const thumbs = (snippet && snippet.thumbnails) || {};
              const best = (thumbs.maxres && thumbs.maxres.url) || (thumbs.standard && thumbs.standard.url) || (thumbs.high && thumbs.high.url) || (thumbs.medium && thumbs.medium.url) || (thumbs.default && thumbs.default.url) || answer.thumbnail;
              if (best) answer.thumbnail = String(best);
              const lbc = String(snippet.liveBroadcastContent || "");
              if (lbc === "live") answer.liveBroadcast = "live";
              else if (lbc === "upcoming") answer.liveBroadcast = "upcoming";
              else if (live.actualEndTime) answer.liveBroadcast = "ended";
              else answer.liveBroadcast = "none";
              answer.source = "data-api";
              dataApiOk = true;
            }
          } else {
            answer.limitations.push("YouTube Data API did not answer — oEmbed mirror used instead.");
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch {
        answer.limitations.push("YouTube Data API unreachable — oEmbed mirror used instead.");
      }
    }
    if (!dataApiOk) {
      try {
        const watch = `https://www.youtube.com/watch?v=${videoId}`;
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
        try {
          const doors = await Promise.all([
            fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { headers: { "user-agent": "Mozilla/5.0" }, signal: ctrl ? ctrl.signal : undefined }).then((r) => r).catch(() => null),
            fetch(`https://noembed.com/embed?url=${encodeURIComponent(watch)}`, { headers: { "user-agent": "Mozilla/5.0" }, signal: ctrl ? ctrl.signal : undefined }).then((r) => r).catch(() => null),
          ]);
          let foundTitle = "";
          let foundDead = false;
          for (const r of doors) {
            if (!r) continue;
            if (r.ok) {
              try {
                const j = await r.json();
                const t = String((j && (j.title || j.html)) || "");
                if (t) { foundTitle = String(j.title || t).slice(0, 200); break; }
              } catch {}
            } else if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404 || r.status === 410) {
              foundDead = true;
            }
          }
          if (foundTitle) { answer.exists = true; answer.title = foundTitle; }
          else if (foundDead) { answer.exists = false; answer.limitations.push("oEmbed mirror: YouTube has no such video (or it is private/deleted)."); }
          else { answer.limitations.push("oEmbed mirror unreachable — existence unknown, not dead."); }
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch {
        answer.limitations.push("oEmbed mirror unreachable — existence unknown, not dead.");
      }
      if (!answer.limitations.length) answer.limitations.push("oEmbed mirror: existence + title only — scheduled/live/ended, privacy and embedding need the Data API key or the player test.");
    }
    answer.checkedAt = Date.now();
    return send(200, answer);
  } catch {
    return send(502, { videoId: "", validFormat: false, exists: null, title: "", channelId: "", channelTitle: "", thumbnail: "", privacy: null, liveBroadcast: null, embeddable: null, source: "oembed-fallback", limitations: ["Validation proxy unreachable — try again."], checkedAt: Date.now() });
  }
}
