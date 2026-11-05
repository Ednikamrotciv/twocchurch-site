/* Standalone live player — React port of watch-live-standalone (watch-live.html).
   Same behavior: verifies first (noembed -> oEmbed), autoplays muted, cover
   lifts only on PLAYING, dead ids land on thumbnail + repair, walled networks
   say so instead of spinning. CONFIG comes from the site's LIVE settings. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { parseYoutubeId } from "../lib/embed";
import {
  verifyYoutubeId,
  peekVerified,
  forgetVerified,
  forgetAllVerified,
  checkChannelLive,
  loadYtApi,
  thumbFor,
} from "../lib/standaloneLive";

export const STANDALONE_FALLBACK_THUMB = "https://i.ytimg.com/vi/dcCt75FMm6o/hqdefault.jpg";

type Phase = { ytId: string; playing: boolean; dead: boolean; walled: boolean; checking: boolean; checkingLive: boolean; confirmed: boolean; iframeKey: number; repairing: boolean };

export function StandaloneLivePlayer({
  channel,
  youtubeId,
  thumb,
  title,
  compact,
}: {
  channel: string;
  youtubeId: string;
  thumb?: string;
  title?: string;
  compact?: boolean;
}) {
  const builtIn = (thumb && thumb.trim()) || STANDALONE_FALLBACK_THUMB;
  const [state, setState] = useState<Phase>({
    ytId: "",
    playing: false,
    dead: false,
    walled: false,
    checking: false,
    checkingLive: false,
    confirmed: false,
    iframeKey: 0,
    repairing: false,
  });
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState("Starting…");
  const [live, setLive] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiPlayerRef = useRef<YT.Player | null>(null);
  const apiHostRef = useRef<HTMLDivElement | null>(null);
  const mountGen = useRef(0);
  const timers = useRef<number[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pushLog = useCallback((t: string) => {
    try {
      const ts = new Date().toLocaleTimeString() + " ";
      setLog((prev) => [...prev.slice(-29), ts + t]);
    } catch { /* log is best-effort */ }
  }, []);

  const stillFor = useCallback(() => {
    const id = stateRef.current.ytId;
    return (id && thumbFor(id)) || builtIn;
  }, [builtIn]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) {
      try { window.clearTimeout(t); } catch { /* noop */ }
      try { window.clearInterval(t); } catch { /* noop */ }
    }
    timers.current = [];
  }, []);

  const destroyPlayer = useCallback(() => {
    try {
      if (apiPlayerRef.current && typeof apiPlayerRef.current.destroy === "function") apiPlayerRef.current.destroy();
    } catch { /* noop */ }
    apiPlayerRef.current = null;
    apiHostRef.current = null;
  }, []);

  /* Mount the YT IFrame API frame for a verified id; cover lifts on PLAYING. */
  const mountApiFrame = useCallback((vid: string, coverEl: HTMLElement | null) => {
    const myGen = ++mountGen.current;
    const alive = () => myGen === mountGen.current;
    let settled = false;
    let readySeen = false;

    const fail = (why: string) => {
      if (settled || !alive()) return;
      settled = true;
      try {
        const d = apiPlayerRef.current ? (apiPlayerRef.current as unknown as { getVideoData?: () => { errorCode?: unknown; isPlayable?: boolean } }).getVideoData?.() : null;
        if (why === "no-playback" && d && (d as { isPlayable?: boolean }).isPlayable === true) {
          setState((s) => ({ ...s, walled: true, playing: false }));
          pushLog("verified but 0 bytes flowed → this network blocks YouTube streams");
          return;
        }
      } catch { /* fall through to dead */ }
      try { console.warn("player fallback", { videoId: vid, why }); } catch { /* noop */ }
      pushLog(`frame failed (${why}) → fallback + repair`);
      setState((s) => ({ ...s, dead: true, playing: false }));
    };

    const onPlaying = () => {
      if (settled || !alive()) return;
      settled = true;
      setState((s) => ({ ...s, confirmed: true }));
      if (coverEl) coverEl.style.display = "none";
      pushLog("PLAYING — cover lifted");
    };

    const armPlayWait = () => {
      let waited = 0;
      let nudges = 0;
      const tick = window.setInterval(() => {
        if (!alive() || settled) {
          window.clearInterval(tick);
          return;
        }
        waited += 1000;
        let st: number | null = null;
        try {
          st = apiPlayerRef.current && typeof apiPlayerRef.current.getPlayerState === "function" ? apiPlayerRef.current.getPlayerState() : null;
        } catch { st = null; }
        if (st === 1) {
          window.clearInterval(tick);
          onPlaying();
          return;
        }
        if (st === -1 || st === 2 || st === 5) {
          if (nudges < 8) {
            nudges++;
            try { apiPlayerRef.current?.mute(); } catch { /* noop */ }
            try { apiPlayerRef.current?.playVideo(); } catch { /* noop */ }
          }
          if (waited >= 3000) {
            window.clearInterval(tick);
            pushLog("autoplay held by browser — muted retries + tap picture for sound");
            const slow = window.setInterval(() => {
              if (!alive() || settled) {
                window.clearInterval(slow);
                return;
              }
              let s2: number | undefined;
              try { s2 = apiPlayerRef.current?.getPlayerState(); } catch { s2 = undefined; }
              if (s2 === 1) {
                window.clearInterval(slow);
                onPlaying();
                return;
              }
              try { apiPlayerRef.current?.mute(); } catch { /* noop */ }
              try { apiPlayerRef.current?.playVideo(); } catch { /* noop */ }
            }, 4000);
            timers.current.push(slow);
          }
        } else if (waited >= 25000) {
          let flowing = false;
          try {
            flowing = (apiPlayerRef.current!.getVideoLoadedFraction() > 0) || (apiPlayerRef.current!.getCurrentTime() > 0);
          } catch { /* treat as stalled */ }
          if (flowing) {
            waited = 0;
            pushLog("slow stream — bytes are arriving, giving it more time");
          } else {
            window.clearInterval(tick);
            fail("no-playback");
          }
        } else if (waited === 8000) {
          setStatus(`Still loading ${vid}… (if it never starts, this network may block YouTube video data — the video itself verified OK).`);
        }
      }, 1000);
      timers.current.push(tick);
    };

    const watchdog = window.setTimeout(() => {
      if (!readySeen) fail("watchdog");
    }, 12000);
    timers.current.push(watchdog);

    void loadYtApi().then((api) => {
      if (!alive() || !api || !api.Player || !apiHostRef.current) return;
      try {
        let origin = "";
        try { origin = window.location && window.location.origin ? String(window.location.origin) : ""; } catch { /* no origin */ }
        apiPlayerRef.current = new api.Player(apiHostRef.current, {
          videoId: vid,
          playerVars: { autoplay: 1, mute: 1, rel: 0, modestbranding: 1, playsinline: 1, origin: origin || undefined } as unknown as YT.PlayerVars,
          events: {
            onReady: (e) => {
              if (!alive()) return;
              readySeen = true;
              window.clearTimeout(watchdog);
              let st = -99;
              try { st = typeof e.target.getPlayerState === "function" ? e.target.getPlayerState() : -99; } catch { /* unknown */ }
              if (st === 1) {
                onPlaying();
                return;
              }
              try { e.target.mute(); } catch { /* noop */ }
              try { e.target.playVideo(); } catch { /* noop */ }
              armPlayWait();
            },
            onStateChange: (e) => {
              if (!alive()) return;
              try {
                if (Number(e && (e as unknown as { data: unknown }).data) === 1) onPlaying();
              } catch { /* noop */ }
            },
            onError: (e) => {
              const code = Number((e as unknown as { data: unknown }).data);
              window.clearTimeout(watchdog);
              if (code === 100 || code === 101 || code === 105 || code === 150) fail(`youtube-error-${code}`);
              else if (alive()) settled = true;
            },
          },
        });
        try { (window as unknown as { __womPlayer?: unknown }).__womPlayer = apiPlayerRef.current; } catch { /* noop */ }
      } catch {
        window.clearTimeout(watchdog);
        if (alive() && !readySeen) fail("mount-threw");
      }
    });
  }, [pushLog]);

  /* Open (or clear) an id: verify first, never mount blind. */
  const playId = useCallback((raw: string, why: string) => {
    const id = parseYoutubeId(raw);
    const cur = stateRef.current;
    setState((s) => ({ ...s, walled: false }));
    if (id && id === cur.ytId && cur.playing && !cur.dead && peekVerified(id) === true) {
      pushLog(`${id}: already playing (${why}) — left alone`);
      return;
    }
    if (!id) {
      setState((s) => ({ ...s, ytId: "", playing: false, dead: false, checking: false }));
      pushLog(`cleared (${why}) → waiting`);
      return;
    }
    pushLog(`verify ${id} (${why})…`);
    const peeked = peekVerified(id);
    if (peeked === false) {
      setState((s) => ({ ...s, ytId: id, dead: true, playing: false, checking: false }));
      pushLog(`${id}: known dead → fallback`);
      return;
    }
    if (peeked === true) {
      setState((s) => ({ ...s, ytId: id, dead: false, playing: true, checking: false, confirmed: false, iframeKey: s.iframeKey + 1 }));
      pushLog(`${id}: cached playable → playing`);
      return;
    }
    setState((s) => ({ ...s, ytId: id, checking: true, dead: false, playing: false, confirmed: false }));
    void verifyYoutubeId(id)
      .then((v) => {
        setState((s) => {
          if (v === false) {
            pushLog(`${id}: YouTube says gone → fallback + repair`);
            return { ...s, checking: false, dead: true, playing: false };
          }
          pushLog(`${id}: ${v === true ? "verified → playing" : "unknown (probe down) → playing anyway"}`);
          return { ...s, checking: false, dead: false, playing: true, confirmed: false, iframeKey: s.iframeKey + 1 };
        });
      })
      .catch(() => {
        setState((s) => ({ ...s, checking: false, playing: true, dead: false, confirmed: false }));
        pushLog(`${id}: probe error → playing anyway`);
      });
  }, [pushLog]);

  const repair = useCallback(() => {
    try { forgetAllVerified(); } catch { /* noop */ }
    const cur = stateRef.current;
    if (cur.ytId) {
      try { forgetVerified(cur.ytId); } catch { /* noop */ }
    }
    setState((s) => ({ ...s, dead: false, walled: false, checking: false, confirmed: false, iframeKey: s.iframeKey + 1, repairing: true }));
    pushLog("force repair: re-verifying…");
    const id = cur.ytId || parseYoutubeId(youtubeId);
    if (!id) {
      setState((s) => ({ ...s, repairing: false }));
      pushLog("repair: nothing to re-ask → waiting");
      return;
    }
    void verifyYoutubeId(id).then((v) => {
      setState((s) => ({ ...s, repairing: false, dead: v === false, playing: v !== false }));
      pushLog(`repair result: ${v === false ? "dead → fallback" : v === true ? "verified → playing" : "unknown → playing anyway"}`);
    }).catch(() => {
      setState((s) => ({ ...s, repairing: false, dead: false, playing: true }));
    });
    window.setTimeout(() => {
      setState((s) => (s.repairing ? { ...s, repairing: false } : s));
    }, 1500);
  }, [pushLog, youtubeId]);

  const checkLiveNow = useCallback(() => {
    const cur = stateRef.current;
    if (cur.checkingLive) return;
    setState((s) => ({ ...s, checkingLive: true, dead: false, checking: false, confirmed: false, walled: false }));
    pushLog(`live check: ${channel}`);
    void checkChannelLive(channel).then((found) => {
      setState((s) => ({ ...s, checkingLive: false }));
      if (found.kind === "live") {
        pushLog(`ON AIR via channel: ${found.videoId} → verifying`);
        playId(found.videoId, "live-check");
      } else if (found.kind === "off") {
        pushLog("channel is off — clean read, no live marker → waiting");
      } else {
        pushLog("all doors failed — walled/offline (unknown, never off). Use the explicit video id; it verifies directly.");
      }
    }).catch(() => {
      setState((s) => ({ ...s, checkingLive: false }));
      pushLog("live check crashed → waiting");
    });
  }, [channel, playId, pushLog]);

  /* Boot: explicit CONFIG id wins, otherwise channel waiting mode. */
  useEffect(() => {
    try {
      for (const href of ["https://www.youtube.com", "https://s.ytimg.com", "https://i.ytimg.com", "https://noembed.com"]) {
        if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
        const l = document.createElement("link");
        l.rel = "preconnect";
        l.href = href;
        l.crossOrigin = "anonymous";
        document.head.appendChild(l);
      }
    } catch { /* preconnect is best-effort */ }
    const bootId = parseYoutubeId(youtubeId);
    if (bootId) {
      pushLog(`configured youtubeId: ${bootId}`);
      playId(bootId, "CONFIG");
    } else {
      pushLog(`no youtubeId set → channel waiting mode (${channel})`);
      setStatus("Waiting. Paste the live video id/link + Verify, or press Check if live now.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* First real interaction anywhere unmutes (browsers need a gesture for sound). */
  useEffect(() => {
    const gestureSound = () => {
      try {
        const p = apiPlayerRef.current;
        if (p && typeof p.isMuted === "function" && p.isMuted()) {
          try { p.unMute(); } catch { /* noop */ }
          try { p.setVolume(100); } catch { /* noop */ }
          pushLog("sound on");
        }
        document.removeEventListener("pointerdown", gestureSound);
        document.removeEventListener("keydown", gestureSound);
      } catch { /* noop */ }
    };
    document.addEventListener("pointerdown", gestureSound);
    document.addEventListener("keydown", gestureSound);
    return () => {
      document.removeEventListener("pointerdown", gestureSound);
      document.removeEventListener("keydown", gestureSound);
    };
  }, [pushLog]);

  /* Keep the pill + status in step with the phase. */
  useEffect(() => {
    if (state.dead) {
      setLive(false);
      setStatus(state.ytId ? "That video is unavailable — thumbnail + repair, never a black frame." : "Nothing to play — thumbnail + repair.");
    } else if (state.walled) {
      setLive(false);
      setStatus("That video verified OK, but this network is blocking YouTube video data — nothing is wrong with the stream. Open it on YouTube, or retry.");
    } else if (state.playing) {
      setLive(true);
      setStatus(`Playing ${state.ytId} — cover lifts only on PLAYING.`);
    } else if (state.checking) {
      setLive(false);
      setStatus("Verifying… (noembed → oEmbed). Nothing mounts until it verifies.");
    } else if (state.checkingLive) {
      setLive(false);
      setStatus("Asking the channel… (the explicit id is the reliable switch).");
    } else {
      setLive(false);
      setStatus("Waiting. Paste the live video id/link + Verify, or press Check if live now.");
    }
  }, [state.dead, state.walled, state.playing, state.checking, state.checkingLive, state.ytId]);

  /* Frame lifecycle: rebuild the host when the phase moves; re-ask mid-play each minute. */
  useEffect(() => {
    destroyPlayer();
    clearTimers();
    if (!state.playing || state.dead || state.walled || !state.ytId) return;
    const host = apiHostRef.current;
    if (!host) return;
    const cover = host.parentElement?.querySelector(".slp-player__cover") as HTMLElement | null;
    mountApiFrame(state.ytId, cover);
    const recheck = window.setInterval(() => {
      try {
        if (document.visibilityState === "hidden") return;
      } catch { /* ask anyway */ }
      const vid = stateRef.current.ytId;
      if (!vid || !stateRef.current.playing || stateRef.current.dead) return;
      void verifyYoutubeId(vid).then((v) => {
        if (v === false) {
          pushLog("mid-play verify: gone → fallback");
          setState((s) => ({ ...s, dead: true, playing: false }));
        }
      }).catch(() => {});
    }, 60_000);
    timers.current.push(recheck);
    return () => {
      window.clearInterval(recheck);
    };
  }, [state.playing, state.dead, state.walled, state.ytId, state.iframeKey, mountApiFrame, destroyPlayer, clearTimers, pushLog]);

  /* Self-heal: a dead id is re-asked every 30 s and reopens by itself. */
  useEffect(() => {
    if (!state.dead || !state.ytId) return;
    const heal = window.setInterval(() => {
      const id = stateRef.current.ytId;
      if (!id) return;
      try { forgetVerified(id); } catch { /* noop */ }
      void verifyYoutubeId(id).then((v) => {
        if (v === true) {
          pushLog("self-heal: playable again → reopened");
          setState((s) => ({ ...s, dead: false, playing: true, confirmed: false, iframeKey: s.iframeKey + 1 }));
        }
      }).catch(() => {});
    }, 30_000);
    timers.current.push(heal);
    return () => {
      window.clearInterval(heal);
    };
  }, [state.dead, state.ytId, pushLog]);

  useEffect(() => () => {
    destroyPlayer();
    clearTimers();
  }, [destroyPlayer, clearTimers]);

  const still = stillFor();
  const watchHref = state.ytId ? `https://www.youtube.com/watch?v=${state.ytId}` : `https://www.youtube.com/${channel}`;

  return (
    <div className={"slp" + (compact ? " slp--compact" : "")}>
      <style>{`
.slp { display: grid; gap: 10px; }
.slp__top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.slp__pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: #0f7a3d; color: #fff; }
.slp__pill.off { background: #6b6252; }
.slp__dot { width: 8px; height: 8px; border-radius: 50%; background: #ff3b30; display: inline-block; animation: slpBlink 1.2s infinite; }
@keyframes slpBlink { 50% { opacity: .35; } }
.slp__status { color: #6b6252; font-size: 13px; }
.slp__player { position: relative; aspect-ratio: 16/9; background: #05050a; border-radius: 12px; overflow: hidden; }
.slp__player img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(.55); }
.slp__underlay { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.slp__frame-host { position: relative; z-index: 1; }
.slp__frame-host, .slp__frame-host iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.slp__cover { position: absolute; inset: 0; z-index: 2; display: block; background: #05050a; cursor: pointer; }
.slp__cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(.55); }
.slp__spin { position: absolute; inset: 0; margin: auto; width: 44px; height: 44px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: #e3b75c; animation: slpSpin .9s linear infinite; }
@keyframes slpSpin { to { transform: rotate(360deg); } }
.slp__scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(4,4,7,.2), rgba(4,4,7,.72)); }
.slp__reload { position: absolute; inset: 0; margin: auto; width: 84px; height: 84px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(227,183,92,.94); border: none; z-index: 3; cursor: pointer; }
.slp__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.slp__row input[type=text] { flex: 1 1 220px; padding: 8px 10px; border-radius: 10px; border: 1px solid #cbbf9f; }
.slp__row button { padding: 8px 14px; border-radius: 999px; border: 1px solid #8a774f; background: #e3b75c; color: #241a05; font-weight: 700; cursor: pointer; }
.slp__row button.ghost { background: transparent; color: inherit; }
.slp__log { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: #6b6252; }
.slp__log li { margin: 2px 0; }
      `}</style>
      <div className="slp__top">
        <span className={"slp__pill" + (live ? "" : " off")}>
          <span className="slp__dot" />
          {state.checking || state.checkingLive ? "checking…" : live ? "live" : state.dead ? "fallback" : "waiting"}
        </span>
        <span className="slp__status" role="status">{title ? `${title} — ` : ""}{status}</span>
      </div>
      <div className="slp__player" aria-live="polite" ref={hostRef}>
        {state.dead ? (
          <div style={{ position: "absolute", inset: 0 }}>
            <img className="bg" src={still} alt="" onError={(e) => {
              try {
                const el = e.currentTarget;
                if (el.getAttribute("data-fb") !== "1") {
                  el.setAttribute("data-fb", "1");
                  if (el.src !== builtIn) el.src = builtIn;
                  return;
                }
                el.style.display = "none";
              } catch { /* hide below */ }
            }} />
            <span className="slp__scrim" />
            <button className="slp__reload" type="button" title="Reload the livestream" aria-label="Reload the livestream" onClick={repair}
              style={state.repairing ? { animation: "slpSpin .9s linear infinite" } : undefined}>
              <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" /></svg>
            </button>
          </div>
        ) : state.walled ? (
          <div style={{ position: "absolute", inset: 0 }}>
            <img className="bg" src={still} alt="" onError={(e) => {
              try {
                if (e.currentTarget.src !== builtIn) e.currentTarget.src = builtIn;
                else e.currentTarget.style.display = "none";
              } catch { /* noop */ }
            }} />
            <span className="slp__scrim" />
            <span className="slp__pill" style={{ position: "absolute", left: 12, top: 12 }}>network blocked — video OK</span>
            <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
              <button type="button" onClick={repair} style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 700 }}>Retry</button>
              <a href={watchHref} target="_blank" rel="noreferrer" style={{ color: "#fff", background: "rgba(0,0,0,.55)", padding: "8px 14px", borderRadius: 999, textDecoration: "none", fontWeight: 700 }}>Watch on YouTube</a>
            </div>
          </div>
        ) : !state.playing ? (
          <div style={{ position: "absolute", inset: 0 }}>
            <img className="bg" src={still} alt="" onError={(e) => {
              try {
                if (e.currentTarget.src !== builtIn) e.currentTarget.src = builtIn;
                else e.currentTarget.style.display = "none";
              } catch { /* noop */ }
            }} />
            <span className="slp__scrim" />
            <span className="slp__pill" style={{ position: "absolute", left: 12, top: 12 }}>
              {state.checkingLive ? "checking live…" : state.checking ? "verifying…" : `waiting · ${channel}`}
            </span>
          </div>
        ) : (
          <>
            <img className="slp__underlay" src={still} alt="" aria-hidden="true" onError={(e) => {
              try {
                if (e.currentTarget.src !== builtIn) e.currentTarget.src = builtIn;
                else e.currentTarget.style.display = "none";
              } catch { /* noop */ }
            }} />
            <div className="slp__frame-host" key={state.iframeKey} ref={apiHostRef} />
            <span
              className="slp__cover"
              aria-hidden="true"
              style={state.confirmed ? { display: "none" } : undefined}
              onClick={() => {
                try {
                  const p = apiPlayerRef.current;
                  if (p) {
                    try { p.unMute(); } catch { /* noop */ }
                    try { p.setVolume(100); } catch { /* noop */ }
                    try { p.playVideo(); } catch { /* noop */ }
                  }
                } catch { /* noop */ }
                pushLog("picture tapped → sound on + play requested");
              }}
            >
              <img src={still} alt="" onError={(e) => {
                try {
                  if (e.currentTarget.src !== builtIn) e.currentTarget.src = builtIn;
                  else e.currentTarget.style.display = "none";
                } catch { /* noop */ }
              }} />
              <span className="slp__scrim" />
              <span className="slp__spin" />
            </span>
          </>
        )}
      </div>
      <div className="slp__row">
        <input type="text" placeholder="YouTube id or watch link (or set youtubeId in LIVE)" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") playId(input, "manual"); }} />
        <button type="button" onClick={() => playId(input, "manual")}>Verify + play</button>
        <button type="button" className="ghost" onClick={checkLiveNow}>Check if live now</button>
        <button type="button" className="ghost" onClick={repair}>Force repair</button>
        <a className="slp__status" href={watchHref} target="_blank" rel="noreferrer">
          {state.ytId ? `Watch ${state.ytId} on YouTube` : "Watch on YouTube"}
        </a>
      </div>
      <ol className="slp__log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
    </div>
  );
}
