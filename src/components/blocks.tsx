import React, { useEffect, useMemo, useState } from "react";
import { Link, navigate } from "../lib/router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLocalState, fireToast, useNow, useReveal } from "../lib/hooks";
import { useCmsVersion } from "../lib/cms";
import { liveAnnouncements, ANNOUNCEMENTS } from "../data/announcements";
import { ct } from "../data/copy";
import { tx } from "../lib/i18n";
import {
  EMBED_REFERRER_POLICY,
  embedSrc,
  fileSrc,
  isFacebookVideoUrl,
  isUploadVideoUrl,
  parseYoutubeId,
  platformDoorName,
  platformLabel,
  posterFor,
  watchUrl,
  youtubeChannelUrl,
  type VideoPlatform,
  type VideoSource,
} from "../lib/embed";
import { checkLiveStream, isStatusForTarget, liveTarget, guestTarget, isGuestTargetUrl, peekVerified, verifyYoutubeId, isDesignatedChannel, designatedChannelIdForTarget } from "../lib/livestatus";
import {
  KEYS,
  fmtDate,
  fmtTime,
  fmtDuration,
  parseDuration,
  to12h,
  DAY_NAMES,
  fmtMonthShort,
  addToCalendar,
  fmtMoney,
  moneyText,
  nextService,
  zonedParts,
  zonedTimeToUtc,
  zoneOr,
  churchTimezone,
  visitorPlace,
  clockAt,
  clockHere,
  countdownParts,
  compressImage,
  copyText,
  whatsappLink,
  mailto,
  haversineKm,
  fmtDistance,
  directionsUrl,
  mapEmbedUrl,
  uid,
  pickForDay,
  displayLive,
} from "../lib/store";
import { SITE, STATS, SERVICES, img, type Person } from "../data/site";
import { photoOr } from "../data/photos";
import { BRANCHES, DEFAULT_BRANCH_ID, HQ, branchFlag, branchZone, subBranchesOf, type Branch } from "../data/branches";
import { LIVE, type WatchOption } from "../data/live";
import type { RecentService } from "../lib/recentstreams";
import { type Sermon, sermonDate, sermonThumb, ytWatch } from "../data/sermons";
import { SCRIPTURES, TESTIMONY_CATEGORIES, type ChurchEvent } from "../data/content";
import { Badge, Btn, Card, Icon, IconBtn, Modal, Notice, Reveal, Stat, TagList, Eyebrow, Field, Input, Monogram, ShareRow } from "./ui";
import type { Testimony } from "../lib/store";

/* ------------------------------------------------------------------ dates for events */

/** An activity's clock time: instant on the church clock, time of day at the host branch (notes 84/85). */
export function eventZone(e: ChurchEvent): string {
  return zoneOr(BRANCHES.find((b) => b.id === e.branchId)?.timezone, churchTimezone());
}

export function eventDate(e: ChurchEvent, now = new Date()): Date {
  const [h, m] = e.time.split(":").map(Number);
  const today = zonedParts(now, churchTimezone());
  return zonedTimeToUtc(today.year, today.month, today.day + (e.offsetDays || 0), h, m, eventZone(e));
}

export function daysUntil(e: ChurchEvent) {
  const diff = eventDate(e).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

/* ------------------------------------------------------- announcements strip */

type NoticeSnooze = { id: string; until: number };

const SNOOZE_MS = 3 * 60 * 1000;

/** Notices posted from #/admin, shown under the header until they age out.
    Cancelling one only snoozes it for three minutes — then it resurfaces. */
export function AnnouncementBanner() {
  const [snoozed, setSnoozed] = useLocalState<NoticeSnooze[]>(KEYS.notices, []);
  /* A notice's own last moment can pass while the page sits open — re-read on
     the half minute, but only when some notice carries an expiry date. */
  const [tick, setTick] = useState(0);
  const timed = ANNOUNCEMENTS.some((a) => a && String(a.expiresDate || "").trim());
  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, [timed]);
  const titleKey = (a: any) => "title:" + String(a?.title || "").trim().toLowerCase();
  /* Only live { id, until } entries count — anything older builds stored
     (plain ids that never expire) is ignored, so past cancellations surface. */
  const liveEntries = (list: unknown): NoticeSnooze[] => {
    const now = Date.now();
    return (Array.isArray(list) ? list : []).filter(
      (s: any) => s && typeof s === "object" && typeof s.until === "number" && s.until > now
    );
  };
  /* Published office edits re-bind the notices in place — the cms version in
     the deps is what lets them show without a reload (SPEC note 185). */
  const version = useCmsVersion();
  const live = useMemo(() => {
    const snoozedSet = new Set(liveEntries(snoozed).map((s) => s.id));
    /* A published copy can share a headline with its seed (different ids, same
       words) — show each headline once, first one wins, so strips never double. */
    const seen = new Set<string>();
    /* A snooze names entry and headline, so an edited notice stays snoozed. */
    return liveAnnouncements()
      .filter((a) => !snoozedSet.has(a.id) && !snoozedSet.has(titleKey(a)))
      .filter((a) => {
        const key = titleKey(a) || `id:${a.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }, [snoozed, tick, version]);
  /* Wake up exactly when the nearest snooze runs out, so the cancelled notice
     resurfaces on time with the page just sitting open. */
  const nearestSnooze = useMemo(() => {
    let best: number | null = null;
    for (const s of liveEntries(snoozed)) {
      if (best === null || s.until < best) best = s.until;
    }
    return best;
  }, [snoozed, tick]);
  useEffect(() => {
    if (nearestSnooze === null) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), Math.max(0, nearestSnooze - Date.now()));
    return () => window.clearTimeout(id);
  }, [nearestSnooze]);
  const calm = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!live.length) return null;
  return (
    <div className="notices" role="region" aria-label={ct("auto.site.4142e18108640a58")}>
      <AnimatePresence initial={false}>
        {live.map((a, i) => {
          const open = openId === a.id;
          return (
          <motion.div
            key={a.id}
            className={"notice-strip notice-strip--" + (a.level || "notice") + (open ? " is-open" : "")}
            initial={calm ? false : { opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={calm ? { opacity: 0 } : { opacity: 0, y: -12, height: 0, paddingTop: 0, paddingBottom: 0 }}
            transition={{ duration: 0.45, delay: calm ? 0 : i * 0.08, ease: [0.22, 0.7, 0.3, 1] }}
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => setOpenId(open ? null : a.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenId(open ? null : a.id);
              }
            }}
          >
            <Icon name={a.level === "important" ? "alert" : a.level === "celebration" ? "sparkle" : "bell"} size={17} />
            <div className="notice-strip__body">
              <b>{tx(a.title)}</b>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    className="notice-strip__more"
                    initial={calm ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={calm ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 0.7, 0.3, 1] }}
                  >
                    {a.body && <span>{tx(a.body)}</span>}
                    {a.link && (
                      <Link to={a.link} className="notice-strip__link" onClick={(e) => e.stopPropagation()}>
                        {tx(a.linkLabel) || ct("auto.site.6e73bbe0078b8869")} <Icon name="arrowRight" size={13} />
                      </Link>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className="notice-strip__chev" aria-hidden="true">
              <Icon name="chevronDown" size={15} />
            </span>
            <motion.button
              type="button"
              className="notice-strip__close"
              aria-label={ct("auto.site.ef441b455cc029cc")}
              onClick={(e) => {
                e.stopPropagation();
                setOpenId((cur) => (cur === a.id ? null : cur));
                /* Cancelling snoozes the notice for three minutes, then it
                   resurfaces. Lapsed snoozes are pruned on the way through. */
                setSnoozed((list) => {
                  const until = Date.now() + SNOOZE_MS;
                  const keys = new Set([a.id, titleKey(a)]);
                  const kept = liveEntries(list).filter((s) => !keys.has(s.id));
                  return [...kept, { id: a.id, until }, { id: titleKey(a), until }];
                });
              }}
              whileTap={calm ? undefined : { scale: 0.85 }}
            >
              <Icon name="close" size={15} />
            </motion.button>
          </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ video player */

export function VideoPlayer({
  source,
  title,
  poster,
  onPlay,
  compact,
  live,
  autoPlay,
  hideEscape,
}: {
  source: VideoSource;
  title: string;
  poster?: string;
  onPlay?: () => void;
  compact?: boolean;
  live?: boolean;
  /** Start the player without a click — used when a live stream is detected. */
  autoPlay?: boolean;
  /** Hide the "Can't see the video?" escape link — the live screen drops it. */
  hideEscape?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  /* Dead-video net (note 333, hardened note 413): a removed or private video must never sit on
     the black "unavailable" frame — the player says so and offers the
     platform link instead. Channel follows and files cannot be asked, so
     only bare YouTube ids are verified. Autoplay never opens an unverified id. */
  const ytId = source?.platform === "facebook" || source?.platform === "upload" ? "" : parseYoutubeId(source?.youtubeId || "");
  const [playing, setPlaying] = useState(() => {
    if (!autoPlay) return false;
    /* Livestream screen: play the broadcast by itself WITH SOUND — a verified
       id, an unverified-but-not-dead id, or the live channel follow all open
       with no tap. Only a proven-dead id is held back (the fallback below
       still offers the platform link, never the black "unavailable" frame). */
    if (ytId && peekVerified(ytId) !== true) return false;
    return true;
  });
  /* A channel with no video id cannot be asked of oEmbed (note 342): tapping
     it used to open the channel embed blind — when no broadcast is live,
     YouTube answers "unavailable" inside the frame. The tap now asks the
     check first and plays the verified broadcast id instead. Only the live
     panel follows channels; every other sourceless tap plays as before. */
  const followId = live && source?.platform !== "facebook" && source?.platform !== "upload" ? String(source?.youtubeChannelId || "") : "";
  const [dead, setDead] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notLive, setNotLive] = useState(false);
  const [liveVideoId, setLiveVideoId] = useState("");
  /* Sound on (note 388): every opening plays with its audio — a tap, or a
     broadcast the site starts by itself the moment it goes live. Every live
     from a channel carries its sound. */
  const shown = tx(title);
  const sourceKey = embedSrc(source, true);
  const src = liveVideoId ? embedSrc({ platform: "youtube", youtubeId: liveVideoId }, true) : sourceKey;
  const file = fileSrc(source);
  const still = poster && !failed ? poster : posterFor(source);
  const platform: VideoPlatform = source?.platform === "facebook" ? "facebook" : source?.platform === "upload" ? "upload" : "youtube";
  const shell = "player" + (compact ? " player--compact" : "") + (playing ? " player--playing" : "");

  /* A new source starts unjudged. */
  useEffect(() => {
    setDead(false);
    setChecking(false);
    setNotLive(false);
    setLiveVideoId("");
  }, [sourceKey]);

  /* A click never opens a known-dead video: unknown ids are asked first
     (a beat of "checking"), dead ones go straight to the fallback below. */
  /* A channel tap asks first (note 342): a live broadcast plays by its own
     verified id; silence shows the waiting poster, never YouTube's
     "unavailable". Anything unclear plays the channel as before. */
  const checkChannelThenPlay = () => {
    setNotLive(false);
    setChecking(true);
    checkLiveStream()
      .then((st) => {
        /* Only the handle's answer opens the player (note 350): a tap that
           lands after the office moved the channel waits instead of playing
           the old address's video. The temporary guest's own answer opens it
           the same way while IT is live (note 380). */
        const guestWatchUrl = guestTarget()?.url || "";
        if (!isStatusForTarget(st, liveTarget()?.url || "") && !(guestWatchUrl && isStatusForTarget(st, guestWatchUrl))) {
          setChecking(false);
          setNotLive(true);
          return;
        }
        /* Only the designated channel opens the player (note 358): a live
           answer from another channel — or an unverified channel follow
           with no video — waits instead of playing. The guest's own stamped
           answer passes while IT is live (note 380). */
        const designatedId = designatedChannelIdForTarget(liveTarget()?.url || "");
        if (!isDesignatedChannel(st.channelId || "", designatedId) && !(guestWatchUrl && isGuestTargetUrl(st.target || "", guestWatchUrl))) {
          setChecking(false);
          setNotLive(true);
          return;
        }
        const vid = parseYoutubeId(st.videoId || "");
        if (st.state === "live" && vid) {
          verifyYoutubeId(vid)
            .then((v) => {
              setChecking(false);
              if (v === false) {
                setDead(true);
                return;
              }
              setLiveVideoId(vid);
              setPlaying(true);
              onPlay?.();
            })
            .catch(() => {
              setChecking(false);
              setLiveVideoId(vid);
              setPlaying(true);
              onPlay?.();
            });
        } else if (
          (st.state === "live" && st.channelId && (!designatedId || st.channelId === designatedId)) ||
          (guestWatchUrl && st.state === "live" && !!st.channelId && isGuestTargetUrl(st.target || "", guestWatchUrl))
        ) {
          setChecking(false);
          setPlaying(true);
          onPlay?.();
        } else {
          setChecking(false);
          setNotLive(true);
        }
      })
      .catch(() => {
        setChecking(false);
        setNotLive(true);
      });
  };
  const open = () => {
    if (!ytId && !followId) {
      setPlaying(true);
      onPlay?.();
      return;
    }
    if (!ytId) {
      checkChannelThenPlay();
      return;
    }
    const peek = peekVerified(ytId);
    if (peek === false) {
      setDead(true);
      return;
    }
    if (peek === true) {
      setPlaying(true);
      onPlay?.();
      return;
    }
    setChecking(true);
    verifyYoutubeId(ytId)
      .then((v) => {
        setChecking(false);
        if (v === false) setDead(true);
        else {
          setPlaying(true);
          onPlay?.();
        }
      })
      .catch(() => {
        setChecking(false);
        setPlaying(true);
        onPlay?.();
      });
  };

  /* The stream can start while the visitor is already sitting on the page, so
     the player has to be able to open by itself after the first render.
     Note 413: autoplay verifies first — an unverified id waits (poster +
     "Checking…") and a dead id falls to the fallback instead of the black frame. */
  useEffect(() => {
    if (!autoPlay || playing) return;
    if (!ytId) {
      /* Id-less autoplay (channel follow) verifies first: an offline channel
         must show the waiting poster, never the "unavailable" frame. */
      if (source?.platform === "facebook") {
        setPlaying(true);
        return;
      }
      if (followId) {
        checkChannelThenPlay();
        return;
      }
      setPlaying(true);
      return;
    }
    const peek = peekVerified(ytId);
    if (peek === true) {
      setPlaying(true);
      return;
    }
    if (peek === false) {
      setDead(true);
      return;
    }
    let alive = true;
    setChecking(true);
    verifyYoutubeId(ytId)
      .then((v) => {
        if (!alive) return;
        setChecking(false);
        if (v === false) setDead(true);
        else setPlaying(true);
      })
      .catch(() => {
        if (!alive) return;
        setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [autoPlay, ytId, sourceKey]);

  /* Autoplay verifies behind the player: a dead id swaps to the fallback
     instead of sitting on the black frame (unknown plays as before). */
  useEffect(() => {
    if (!playing || !ytId || dead) return;
    if (peekVerified(ytId) === false) {
      setDead(true);
      return;
    }
    if (peekVerified(ytId) === null) {
      let alive = true;
      verifyYoutubeId(ytId)
        .then((v) => {
          if (alive && v === false) setDead(true);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
  }, [playing, ytId, dead, src]);

  /* While a video plays, the verdict is re-asked every few minutes
     (note 344): a broadcast taken down mid-play swaps to the fallback
     instead of sitting on the black frame. Cached verdicts make each
     re-ask free; hidden tabs skip it. */
  useEffect(() => {
    if (!playing || !ytId || dead) return;
    const t = window.setInterval(() => {
      try {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      } catch {
        /* visibility unreadable — ask anyway */
      }
      verifyYoutubeId(ytId)
        .then((v) => {
          if (v === false) setDead(true);
        })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [playing, ytId, dead]);

  if (file) {
    /* A video the office uploaded plays in the browser itself. */
    return (
      <div className={shell + " player--file"}>
        <video
          className="player__video"
          src={file}
          poster={source?.poster || undefined}
          controls
          playsInline
          preload="metadata"
          onPlay={() => onPlay?.()}
          onError={() => setFailed(true)}
        />
        {live && (
          <span className="player__live">
            <span className="live-dot" /> {ct("live.player.badge")}
          </span>
        )}
      </div>
    );
  }

  if (!src) return <div className="player player--empty">{ct("site.videoEmpty")}</div>;
  /* A dead video never plays here: the poster stays, the visitor is told, and
     the platform link below is the way out (note 333). */
  if (dead) {
    const openHref = watchUrl(source);
    return (
      <div className={shell + " player--dead"}>
        {still ? (
          <img src={still} alt="" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span className={"player__still player__still--" + platform}>
            <Icon name={platform === "upload" ? "play" : platform} size={54} />
          </span>
        )}
        <span className="player__scrim" />
        <div className="player__deadbody">
          <p className="player__deadtitle">{shown}</p>
          <p className="player__deadtext">{tx("This video can't be played here.")}</p>
          {openHref && (
            <Btn size="sm" variant="gold" href={openHref} icon="youtube" iconRight="external">
              {tx("Watch on YouTube")}
            </Btn>
          )}
        </div>
        {live && (
          <span className="player__live">
            <span className="live-dot" /> {ct("live.player.badge")}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={shell}>
      {playing ? (
        <>
          <iframe
            className="player__frame"
            src={src}
            title={shown}
            referrerPolicy={EMBED_REFERRER_POLICY}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
          {/* The frame itself never reports a failure (note 344): a video
              YouTube refuses to embed, blocks in this country, or takes down
              mid-play would otherwise sit black with no way out. This link
              is the permanent way out — on YouTube itself it always plays
              or says why. */}
          {platform === "youtube" && (liveVideoId || ytId) && !hideEscape && (
            <a
              className="player__escape"
              href={watchUrl({ platform: "youtube", youtubeId: liveVideoId || ytId }) || ""}
              target="_blank"
              rel="noreferrer"
            >
              {tx("Can't see the video? Watch on YouTube")}
            </a>
          )}
        </>
      ) : (
        <button
          type="button"
          className="player__poster"
          onClick={open}
          disabled={checking}
          aria-label={ct("auto.site.c358a9fa66e1e8e3", { "title": shown })}
        >
          {still ? (
            <img src={still} alt="" loading="lazy" onError={() => setFailed(true)} />
          ) : (
            <span className={"player__still player__still--" + platform}>
              <Icon name={platform === "upload" ? "play" : platform} size={54} />
            </span>
          )}
          <span className="player__scrim" />
          <span className="player__play">
            <Icon name="play" size={26} />
          </span>
          <span className="player__label">{checking ? tx(followId ? "Checking the broadcast…" : "Checking the video…") : notLive ? tx("No broadcast right now — tap to check again.") : shown}</span>
          <span className={"player__source player__source--" + platform}>
            <Icon name={platform === "upload" ? "play" : platform} size={13} /> {platformLabel(platform)}
          </span>
          {live && (
            <span className="player__live">
              <span className="live-dot" /> {ct("live.player.badge")}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- watch a message */

/** Where a message can be watched, in the order the office set them up. */
export function sermonSources(sermon: Sermon): VideoSource[] {
  const list: VideoSource[] = [];
  if (parseYoutubeId(sermon.youtubeId)) list.push({ platform: "youtube", youtubeId: sermon.youtubeId, poster: sermon.poster });
  if (isFacebookVideoUrl(sermon.facebookUrl || "")) list.push({ platform: "facebook", facebookUrl: sermon.facebookUrl, poster: sermon.poster });
  if (isUploadVideoUrl(sermon.uploadUrl || "")) list.push({ platform: "upload", uploadUrl: sermon.uploadUrl, poster: sermon.poster });
  return list;
}

export function platformOptionLabel(platform?: VideoPlatform): string {
  if (platform === "facebook") return ct("live.card.facebook");
  if (platform === "upload") return ct("live.card.upload");
  return ct("live.card.youtube");
}

export function platformOpenLabel(platform?: VideoPlatform): string {
  if (platform === "facebook") return ct("live.card.openFacebook");
  if (platform === "upload") return ct("live.card.openFile");
  return ct("live.card.openYoutube");
}

/** A message the visitor can play without leaving the site. */
export function SermonWatch({ sermon, className = "" }: { sermon: Sermon; className?: string }) {
  /* Keyed on the values, not the object: the CMS mutates records in place. */
  const options = useMemo(
    () => sermonSources(sermon),
    [sermon.youtubeId, sermon.facebookUrl, sermon.uploadUrl, sermon.poster, sermon.platform]
  );
  const preferred = options.find((o) => o.platform === sermon.platform)?.platform || options[0]?.platform;
  const [chosen, setChosen] = useState<VideoPlatform | undefined>(preferred);
  /* The card follows the office's platform choice; a visitor's pick still stands. */
  useEffect(() => {
    setChosen(preferred);
  }, [preferred]);
  const source = options.find((o) => o.platform === chosen) || options[0];
  const href = source ? watchUrl(source) : "";
  return (
    <Card className={"vcard " + className} pad={false}>
      <div className="vcard__media">
        {source ? (
          <VideoPlayer source={source} title={sermon.title} poster={sermonThumb(sermon)} compact />
        ) : (
          <div className="player player--empty">{ct("site.videoEmpty")}</div>
        )}
      </div>
      <div className="vcard__body">
        <span className="vcard__meta">
          <Icon name="calendar" size={13} /> {fmtDate(sermonDate(sermon), "short")} · {tx(sermon.speaker)}
          {sermon.durationText ? ` · ${tx(sermon.durationText)}` : ""}
        </span>
        <h3 className="vcard__title">
          <Link to={`/sermons/${sermon.id}`}>{tx(sermon.title)}</Link>
        </h3>
        {options.length > 1 && (
          <div className="vcard__pick" role="group" aria-label={ct("live.card.pickLabel")}>
            {options.map((o) => (
              <button
                key={o.platform}
                type="button"
                className={"vcard__pickBtn" + (o.platform === source?.platform ? " is-active" : "")}
                onClick={() => setChosen(o.platform)}
              >
                <Icon name={o.platform === "facebook" ? "facebook" : o.platform === "upload" ? "play" : "youtube"} size={14} />
                {platformLabel(o.platform)}
              </button>
            ))}
          </div>
        )}
        <div className="vcard__foot">
          <Btn size="sm" variant="ghost" to={`/sermons/${sermon.id}`} icon="book">
            {ct("live.card.message")}
          </Btn>
          {href && (
            <Btn size="sm" variant="quiet" href={href} iconRight="external">
              {platformOpenLabel(source?.platform)}
            </Btn>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------ ways-to-watch cards */

/** Which platform this card is a door to, if any. */
function watchCardPlatform(w: WatchOption): VideoPlatform | "" {
  if (w.platform === "youtube" || w.platform === "facebook") return w.platform;
  return w.icon === "youtube" || w.icon === "facebook" ? (w.icon as VideoPlatform) : "";
}

/** Where "watch on the platform" links go: the stream, else the channel, else socials. */
export function platformWatchLinks(): Record<VideoPlatform, string> {
  const social = (icon: string) => SITE.socials.find((s) => s.icon === icon)?.url || "";
  return {
    youtube:
      watchUrl({ platform: "youtube", youtubeId: LIVE.youtubeId }) ||
      youtubeChannelUrl(LIVE.youtubeChannel) ||
      social("youtube"),
    facebook: LIVE.facebookUrl || social("facebook"),
    upload: "",
  };
}

/** The "Ways to watch" row, shared by Watch live and the sermon archive (note 110). */
export function WatchCards() {
  const links = platformWatchLinks();
  return (
    <div className="grid grid-4">
      {LIVE.watchOptions.map((w, i) => {
        const platform = watchCardPlatform(w);
        const href = platform ? links[platform] : "";
        /* A door card names the door it opens. */
        const named = platform
          ? platformDoorName(platform === "youtube" ? youtubeChannelUrl(LIVE.youtubeChannel) || href : href)
          : "";
        return (
          <Reveal key={w.label + i} delay={i * 50}>
            <Card className={"watch-card" + (platform ? " watch-card--platform" : "")}>
              <span className="watch-card__icon">
                <Icon name={w.icon} size={22} />
              </span>
              <h3>{tx(w.label)}</h3>
              <p>{named || tx(w.value)}</p>
              {platform && href && (
                <Btn size="sm" variant="ghost" href={href} iconRight="external">
                  {ct("auto.live.db942c55e9ec899c")}
                  {platformLabel(platform)}
                </Btn>
              )}
            </Card>
          </Reveal>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- recent streams card */

/** One card in "Recent services", playing right here on the card. */
export function RecentServiceCard({ item }: { item: RecentService }) {
  /* The feed's exact date when it reached this far, else YouTube's own words
     (translated with the visitor's language like everything else). */
  const when = item.at ? fmtDate(new Date(item.at), "long") : tx(item.ago);
  return (
    <Card className="recent-card" pad={false}>
      <VideoPlayer
        source={{ platform: "youtube", youtubeId: item.videoId }}
        title={item.title}
        poster={item.thumb}
        compact
      />
      <div className="recent-card__body">
        <h3>{tx(item.title)}</h3>
        {when && <em>{when}</em>}
        <a className="recent-card__open" href={ytWatch(item.videoId)} target="_blank" rel="noreferrer">
          {ct("live.recent.watch")} <Icon name="external" size={13} />
        </a>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ sermon card */

export function SermonCard({ sermon, layout = "grid" }: { sermon: Sermon; layout?: "grid" | "row" | "feature" }) {
  const fallbackStill = photoOr("", "worshipband");
  const [saved, setSaved] = useLocalState<string[]>(KEYS.saved, []);
  const [watched] = useLocalState<string[]>(KEYS.watched, []);
  const isSaved = saved.includes(sermon.id);
  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved((list) => (list.includes(sermon.id) ? list.filter((x) => x !== sermon.id) : [...list, sermon.id]));
    fireToast(isSaved ? ct("auto.site.7e6856043e4e5c2d") : ct("auto.site.9af2dd2cbac10215"), "success");
  };
  const date = sermonDate(sermon);
  return (
    <Card hover className={`sermon-card sermon-card--${layout}`} pad={false}>
      <Link to={`/sermons/${sermon.id}`} className="sermon-card__media">
        <img
          src={sermonThumb(sermon) || fallbackStill}
          alt=""
          loading="lazy"
          onError={(e) => ((e.target as HTMLImageElement).src = fallbackStill)}
        />
        <span className="sermon-card__shade" />
        <span className="sermon-card__play">
          <Icon name="play" size={var_play_size(layout)} />
        </span>
        {sermon.durationText && <span className="duration-pill">{tx(sermon.durationText)}</span>}
        {sermon.platform === "facebook" && (
          <span className="source-pill"><Icon name="facebook" size={11} /> {ct("auto.site.52ada120be326221")}</span>
        )}
        {sermon.fromLive && (
          <span className="broadcast-pill" title={ct("live.past.badge.hint")}>
            <Icon name="live" size={11} /> {ct("live.past.badge")}
          </span>
        )}
        {watched.includes(sermon.id) && <span className="watched-pill"><Icon name="check" size={12} /> {ct("auto.site.98a0c5eec4d1080f")}</span>}
      </Link>
      <div className="sermon-card__body">
        <div className="sermon-card__meta">
          {sermon.scripture && <Badge accent="gold">{tx(sermon.scripture)}</Badge>}
          <span className="sermon-card__date">{fmtDate(date, "short")}</span>
        </div>
        <h3 className="sermon-card__title">
          <Link to={`/sermons/${sermon.id}`}>{tx(sermon.title)}</Link>
        </h3>
        <p className="sermon-card__sub">
          {tx(sermon.speaker)}
        </p>
        {layout !== "row" && <p className="sermon-card__summary">{tx(sermon.summary)}</p>}
        <div className="sermon-card__foot">
          <Btn to={`/sermons/${sermon.id}`} size="sm" variant="ghost" icon="play">
            {ct("auto.site.ba151917648414f6")}</Btn>
          <IconBtn name={isSaved ? "bookmark" : "bookmark"} label={isSaved ? ct("auto.site.ad9feb8917657ba0") : ct("auto.site.ddb670bba50b67ea")} onClick={toggleSave} className={isSaved ? "icon-btn--active" : ""} />
        </div>
      </div>
    </Card>
  );
}

function var_play_size(layout: string) {
  return layout === "feature" ? 34 : layout === "row" ? 20 : 26;
}

/* ------------------------------------------------------------- branch map popup */

/** The popup behind every *Get directions* button. */
export function BranchMapPopup({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const now = useNow(30000);
  const zone = branchZone(branch);
  const info = nextService(SERVICES, now, churchTimezone());
  const next = info ? clockHere(info.slot.time, info.slot.day, zone) : null;
  const title = ct("auto.site.768a0f302ac49781", { "name": branch.name });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        <>
          <Btn href={directionsUrl({ lat: branch.lat, lng: branch.lng })} icon="compass">
            {ct("auto.site.1a6beb25889b9c5c")}</Btn>
          <Btn
            variant="ghost"
            icon="copy"
            onClick={() => copyText(branch.address, ct("auto.site.8767f57484dee665"))}
          >
            {ct("auto.site.e2e08e5902c4d3e0")}
          </Btn>
        </>
      }
    >
      <div className="map-popup">
        <iframe
          className="map-popup__frame"
          title={title}
          src={mapEmbedUrl({ lat: branch.lat, lng: branch.lng, zoom: 15 })}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <ul className="map-popup__facts">
          <li>
            <Icon name="pin" size={15} />
            <span>{branch.address}</span>
          </li>
          <li>
            <Icon name="clock" size={15} />
            <span>
              {next
                ? `${tx(DAY_NAMES[next.day])} ${to12h(next.time)} · ${tx(info!.slot.name)}`
                : branch.schedule
                    .map((s) => {
                      const c = clockHere(s.time, s.day, zone);
                      return `${tx(DAY_NAMES[c.day]).slice(0, 3)} ${to12h(c.time)}`;
                    })
                    .join(" · ")}
            </span>
          </li>
          <li>
            <Icon name="phone" size={15} />
            <a href={`tel:${branch.phone.replace(/[^\d+]/g, "")}`}>{branch.phone}</a>
          </li>
        </ul>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------- a branch's sub-branches */

/** The gatherings under one branch, in a popup of their own (note 86). */
export function SubBranchesPopup({
  branch,
  onOpenBranch,
  onClose,
}: {
  /** The branch whose sub-branches are being checked. */
  branch: Branch;
  /** Show this sub-branch on the page. */
  onOpenBranch?: (branch: Branch) => void;
  onClose: () => void;
}) {
  const now = useNow(30000);
  const subs = subBranchesOf(branch);
  /* The popup locks the body, so wait until it is gone before scrolling. */
  const openBranch = (b: Branch) => {
    onClose();
    if (onOpenBranch) window.setTimeout(() => onOpenBranch(b), 60);
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <>
          <span>{ct("auto.site.a8527719df5a9170")}</span> · {branch.city}
        </>
      }
    >
      {subs.length === 0 ? (
        <Notice icon="pin" tone="gold">{ct("auto.site.3014276958fb4df0")}</Notice>
      ) : (
        <>
          <div className="subbranch-pop">
            {subs.map((s) => {
              const zone = branchZone(s);
              const info = nextService(SERVICES, now, churchTimezone());
              const next = info ? clockHere(info.slot.time, info.slot.day, zone) : null;
              return (
                <div className="subbranch-pop__row" key={s.id}>
                  <div className="subbranch-pop__head">
                    <h4>{s.city}</h4>
                    <p>{s.name}</p>
                  </div>
                  <ul className="subbranch-pop__facts">
                    <li>
                      <Icon name="pin" size={14} />
                      <span>{s.address}</span>
                    </li>
                    <li>
                      <Icon name="clock" size={14} />
                      <span>
                        {next
                          ? `${tx(DAY_NAMES[next.day])} ${to12h(next.time)} · ${tx(info!.slot.name)}`
                          : s.schedule
                              .map((slot) => {
                                const c = clockHere(slot.time, slot.day, zone);
                                return `${tx(DAY_NAMES[c.day]).slice(0, 3)} ${to12h(c.time)}`;
                              })
                              .join(" · ")}
                      </span>
                    </li>
                    <li>
                      <Icon name="phone" size={14} />
                      <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>
                    </li>
                  </ul>
                  <div className="subbranch-pop__foot">
                    <Btn size="sm" icon="map" onClick={() => openBranch(s)}>{ct("auto.site.282585a33057bf1a")}</Btn>
                    <Btn size="sm" variant="ghost" icon="compass" href={directionsUrl({ lat: s.lat, lng: s.lng })}>
                      {ct("auto.site.c0e60f7cb5d423cd")}
                    </Btn>
                    <IconBtn name="copy" label={ct("auto.site.7806943b572907c2")} onClick={() => copyText(s.address, ct("auto.site.8767f57484dee665"))} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ branch card */

export function BranchCard({
  branch,
  distanceKm,
  active,
  onSelect,
}: {
  branch: Branch;
  distanceKm?: number | null;
  active?: boolean;
  /** Show this branch on the page (the card hands its own row a sub-branch). */
  onSelect?: (branch: Branch) => void;
}) {
  const [branchId, setBranchId] = useLocalState<string>(KEYS.branch, DEFAULT_BRANCH_ID);
  const [mapOpen, setMapOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const isMine = branchId === branch.id;
  const zone = branchZone(branch);
  const subs = subBranchesOf(branch);
  return (
    <Card className={"branch-card" + (active ? " branch-card--active" : "")} pad={false}>
      <div className="branch-card__media">
        <img src={photoOr(branch.image, "building2")} alt="" loading="lazy" />
        <span className="branch-card__flag">{branchFlag(branch)} {branch.country}</span>
        {branch.isHq && <span className="hq-tag">{ct("auto.site.dfdd25368f930047")}</span>}
        {typeof distanceKm === "number" && <span className="distance-tag"><Icon name="pin" size={12} /> {fmtDistance(distanceKm)}</span>}
      </div>
      <div className="branch-card__body">
        <h3>{branch.city}</h3>
        <p className="branch-card__name">{branch.name}</p>
        <ul className="branch-card__facts">
          <li>
            <Icon name="user" size={14} />
            <span>{branch.pastor}<em>{tx(branch.pastorRole)}</em></span>
          </li>
          <li>
            <Icon name="pin" size={14} />
            <span>{branch.address}</span>
          </li>
        </ul>
        <div className="branch-card__times">
          {branch.schedule.slice(0, 4).map((s, i) => {
            const c = clockHere(s.time, s.day, zone);
            return (
              <span key={i} className="time-row">
                <b>{tx(DAY_NAMES[c.day]).slice(0, 3)}</b> {to12h(c.time)} <em>{tx(s.name)}</em>
              </span>
            );
          })}
        </div>
        <button
          type="button"
          className="branch-card__subs"
          onClick={() => setSubsOpen(true)}
          aria-haspopup="dialog"
        >
          <Icon name="people" size={14} />
          <span className="branch-card__subs-btn">{ct("auto.site.a8527719df5a9170")}</span>
          {subs.length > 0 && <em className="branch-card__subs-count">{subs.length}</em>}
          <Icon name="chevronRight" size={14} className="branch-card__subs-chev" />
        </button>
        <div className="branch-card__actions">
          <Btn onClick={() => setMapOpen(true)} variant="gold" size="sm" icon="compass">
            {ct("auto.site.c0e60f7cb5d423cd")}</Btn>
          <Btn onClick={() => onSelect?.(branch)} variant="ghost" size="sm" icon="map">
            {ct("auto.site.a8dc752ffadde7a6")}</Btn>
          <IconBtn name="phone" label={ct("auto.site.b62a601c1c18c155")} href={`tel:${branch.phone.replace(/[^\d+]/g, "")}`} />
          <IconBtn name="copy" label={ct("auto.site.7806943b572907c2")} onClick={() => copyText(branch.address, ct("auto.site.8767f57484dee665"))} />
          <IconBtn
            name="star"
            label={isMine ? ct("auto.site.0b6994dfb59aed0e") : ct("auto.site.f10e38722f2c80cb")}
            onClick={() => {
              setBranchId(branch.id);
              fireToast(isMine ? ct("auto.site.59055eb0d6b6c9b1") : ct("auto.site.8854591abe57f15b", { "city": branch.city }), "success");
            }}
            className={isMine ? "icon-btn--active" : ""}
          />
        </div>
      </div>
      {mapOpen && <BranchMapPopup branch={branch} onClose={() => setMapOpen(false)} />}
      {subsOpen && <SubBranchesPopup branch={branch} onOpenBranch={onSelect} onClose={() => setSubsOpen(false)} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ event card */

export function EventCard({ event, layout = "grid" }: { event: ChurchEvent; layout?: "grid" | "row" }) {
  const date = eventDate(event);
  /* The instant is the event's; the day and the clock time the card prints are
     the reader's own (SPEC note 85). */
  const when = clockAt(date);
  const day = zonedParts(date);
  const days = daysUntil(event);
  const branch = BRANCHES.find((b) => b.id === event.branchId);
  return (
    <Card hover className={`event-card event-card--${layout}`} pad={false}>
      <div className="event-card__media">
        <img src={photoOr(event.image, "welcome")} alt="" loading="lazy" />
        <span className="event-card__date">
          <b>{day.day}</b>
          <em>{fmtMonthShort(day.month).toUpperCase()}</em>
        </span>
        <span className="event-card__cat">{tx(event.category)}</span>
      </div>
      <div className="event-card__body">
        <span className="event-card__when">
          <Icon name="clock" size={14} /> {to12h(when.time)} · {days === 0 ? ct("auto.site.5416b8171f3bb8fe") : days === 1 ? ct("auto.site.35381cc514496da4") : ct("auto.site.5b3575374d6ff54e", { "days": days })}
        </span>
        <h3>{tx(event.title)}</h3>
        <p className="muted">{tx(event.description)}</p>
        <ul className="event-card__facts">
          <li><Icon name="pin" size={14} /> {event.location}</li>
          {branch && <li><Icon name="map" size={14} /> {branch.city}, {branch.country}</li>}
          <li><Icon name="ticket" size={14} /> {tx(moneyText(event.cost))}</li>
        </ul>
        <div className="event-card__actions">
          <Btn
            size="sm"
            variant="ghost"
            icon="calendar"
            onClick={() =>
              addToCalendar({ title: event.title, description: event.description, location: event.location, start: date, minutes: event.durationMin })
            }
          >
            {ct("auto.site.e4cc0ab81e3e4029")}</Btn>
          {event.register && (
            <Btn size="sm" variant="quiet" icon="send" href={mailto(SITE.email, ct("auto.site.ab184e83216d4dd2", { "title": event.title }), `Hello,\n\nI would like to register for ${event.title} (${fmtDate(date, "long")}).\n\nNumber attending:\nNames:\n\nThank you.`)}>
              {ct("auto.site.10a2ff5588fdf514")}</Btn>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ testimony card */

export function TestimonyCard({ testimony, onOpen, onAmen }: { testimony: Testimony; onOpen?: () => void; onAmen: () => void }) {
  const cat = testimony.category;
  return (
    <Card hover className="testimony-card">
      <span className="testimony-card__quote"><Icon name="quote" size={22} /></span>
      <Badge accent={catAccent(cat)}>{categoryLabel(cat)}</Badge>
      <h3>{tx(testimony.title)}</h3>
      <p className="testimony-card__body">{tx(testimony.body.length > 210 && !onOpen ? testimony.body.slice(0, 205) + "…" : testimony.body)}</p>
      <div className="testimony-card__foot">
        <div className="testimony-card__who">
          {testimony.photo ? <img src={testimony.photo} alt="" className="testimony-card__photo" /> : <Monogram name={testimony.name} letters={testimony.monogram} size={38} />}
          <span>
            <b>{testimony.name === "Anonymous" ? ct("auto.testimonies.7baab97d05cbcf14") : testimony.name}</b>
            <em>
              {testimony.city} · {fmtDate(testimony.createdAt, "short")}
            </em>
          </span>
        </div>
        <button type="button" className={"amen-btn" + (testimony.iAmened ? " amen-btn--on" : "")} onClick={onAmen} aria-pressed={testimony.iAmened}>
          <Icon name="prayer" size={15} /> {ct("auto.site.0f20acf7f2af9456")}<b>{testimony.amens + (testimony.iAmened ? 0 : 0)}</b>
        </button>
      </div>
    </Card>
  );
}

export function catAccent(cat: string) {
  const custom = TESTIMONY_CATEGORIES.find((c) => c.id === cat)?.accent;
  if (custom) return custom;
  const map: Record<string, string> = { salvation: "gold", healing: "sky", provision: "emerald", family: "crimson", deliverance: "violet", missions: "gold", other: "sky" };
  return map[cat] || "gold";
}

export function categoryLabel(id: string) {
  const custom = TESTIMONY_CATEGORIES.find((c) => c.id === id)?.label;
  if (custom) return tx(custom);
  const map: Record<string, string> = {
    salvation: ct("auto.site.ca6cefd92ca5bc80"),
    healing: ct("auto.site.1f13967e561170d7"),
    provision: ct("auto.site.70241431786bf440"),
    family: ct("auto.site.11e446d88abbc129"),
    deliverance: ct("auto.site.82ee92ea1e045a73"),
    missions: ct("auto.site.077f51e127d53eb0"),
    other: ct("auto.site.9fc0adb0d96938e9"),
    finances: ct("auto.site.e22615012ef573b8"),
    grief: ct("auto.site.5a4911fdadd5934c"),
    purpose: ct("auto.site.b846faba879b2d73"),
    thanksgiving: ct("auto.site.39436e45edf52264"),
  };
  return map[id] || id;
}

/* ------------------------------------------------------------------ ministries & people */

export function MinistryCard({ ministry, onJoin }: { ministry: { id: string; name: string; image: string; description: string; meets: string; leader: string; for: string }; onJoin: () => void }) {
  return (
    <Card hover pad={false} className="ministry-card">
      <div className="ministry-card__media">
        <img src={photoOr(ministry.image, "youth")} alt="" loading="lazy" />
        <span className="ministry-card__for">{tx(ministry.for)}</span>
      </div>
      <div className="ministry-card__body">
        <h3>{tx(ministry.name)}</h3>
        <p className="muted">{tx(ministry.description)}</p>
        <ul className="ministry-card__facts">
          <li><Icon name="clock" size={14} /> {tx(ministry.meets)}</li>
          <li><Icon name="user" size={14} /> {tx(ministry.leader)}</li>
        </ul>
        <Btn size="sm" variant="ghost" icon="send" onClick={onJoin}>
          {ct("auto.site.f99c90b3d7715592")}</Btn>
      </div>
    </Card>
  );
}

export function PersonCard({ person }: { person: Person }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="person-card" pad={false}>
      <div className="person-card__photo">
        {person.image ? <img src={person.image} alt={person.name} loading="lazy" /> : <span className="person-card__mono"><Monogram name={person.name} size={92} /></span>}
      </div>
      <div className="person-card__body">
        <h3>{person.name}</h3>
        <p className="person-card__role">{tx(person.role)}</p>
        <p className="person-card__bio">{tx(open ? person.bio : person.bio.slice(0, 96) + (person.bio.length > 96 ? "…" : ""))}</p>
        {person.verse && open && <blockquote className="person-card__verse">{tx(person.verse)}</blockquote>}
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
          {open ? ct("auto.site.c6dd472a2e89a04b") : ct("auto.site.edd3c68a0387a69b")} <Icon name={open ? "chevronDown" : "arrowRight"} size={14} />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ verse of the day */

export function VerseOfDay({ compact }: { compact?: boolean }) {
  const verse = pickForDay(SCRIPTURES, "votd");
  const [revealed, setRevealed] = useState(!compact);
  const vtext = tx(verse.text);
  return (
    <div className={"verse-card" + (compact ? " verse-card--compact" : "")}>
      <span className="verse-card__glow" aria-hidden="true" />
      <Eyebrow>{ct("auto.site.2bebce4ffef0d96e")}</Eyebrow>
      <blockquote className="verse-card__text">“{vtext}”</blockquote>
      <cite className="verse-card__ref">{verse.ref}</cite>
      <div className="verse-card__actions">
        <button type="button" className="share-btn" onClick={() => copyText(`"${vtext}" — ${verse.ref}`, ct("auto.site.7b7f38e9bc760510"))}>
          <Icon name="copy" size={15} /> {ct("auto.site.ae507baef9c5bfbf")}</button>
        <a className="share-btn" href={whatsappLink(`"${vtext}" — ${verse.ref}`)} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size={15} /> {ct("auto.site.1f815e5e7fd8b267")}</a>
        <Link className="share-btn" to="/devotional">
          <Icon name="book" size={15} /> {ct("auto.site.623e42b3e55ab622")}</Link>
      </div>
      {compact && !revealed && (
        <button type="button" className="verse-card__reveal" onClick={() => setRevealed(true)}>
          {ct("auto.site.d16b723a58bd463b")}</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ newsletter */

export function NewsletterForm({ tone = "gold" }: { tone?: string }) {
  const [email, setEmail] = useState("");
  const [subs, setSubs] = useLocalState<{ email: string; at: number }[]>(KEYS.newsletter, []);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setError(ct("auto.site.bf5a4f0727149bfe"));
      return;
    }
    setError("");
    setSubs((list) => (list.some((s) => s.email === email) ? list : [...list, { email, at: Date.now() }]));
    setDone(true);
    setEmail("");
    fireToast(ct("auto.site.ae48f42414d79fdd"), "success");
  };

  if (done) {
    return (
      <div className={"newsletter newsletter--done newsletter--" + tone}>
        <Icon name="check" size={20} />
        <div>
          <b>{ct("auto.site.e8a7a67ff841777e")}</b>
          <p className="muted">{ct("auto.site.b27e50bcfb0f0a4d")}</p>
        </div>
      </div>
    );
  }

  return (
    <form className={"newsletter newsletter--" + tone} onSubmit={submit} noValidate>
      <div className="newsletter__text">
        <b>{ct("auto.site.f8a72162ae2e3193")}</b>
        <p className="muted">{ct("auto.site.b3135040f80291c1")}</p>
      </div>
      <div className="newsletter__row">
        <Field error={error}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ct("auto.site.7367cbe03aaaa0d9")} aria-label={ct("auto.site.0de6ce10db7874d9")} invalid={!!error} />
        </Field>
        <Btn type="submit" variant="gold" icon="send">
          {ct("auto.site.94457a122d9cab53")}</Btn>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- branch panel */

/* The branch detail: who and where the branch is, how to reach it and what
   happens there, with the rest of the family beside it. There is no map here —
   the big embedded map left in SPEC note 79; a visitor who wants one presses
   *Get directions*, which opens the map popup with the route. */
export function BranchPanel({
  branch,
  others,
  onSelect,
}: {
  /** The branch this panel is about. */
  branch: Branch;
  /** The rest of the family — this branch's country first, distances when known. */
  others?: { branch: Branch; km?: number | null }[];
  /** Switch the panel to another branch (the rows are buttons). */
  onSelect?: (branch: Branch) => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const withDistance = !!others?.some((o) => typeof o.km === "number");
  const sameCountry = !!others?.some((o) => o.branch.country === branch.country);
  const zone = branchZone(branch);
  const subs = subBranchesOf(branch);
  return (
    <div className="branch-panel">
      <div className="branch-panel__main">
        <h3>{branch.city}</h3>
        <p className="muted">{branch.name}</p>
        <ul className="branch-panel__facts">
          <li><Icon name="pin" size={15} /> {branch.address}</li>
          <li><Icon name="clock" size={15} /> {branch.schedule.map((s) => { const c = clockHere(s.time, s.day, zone); return `${tx(DAY_NAMES[c.day]).slice(0, 3)} ${to12h(c.time)}`; }).join(" · ")}</li>
          <li><Icon name="phone" size={15} /> <a href={`tel:${branch.phone.replace(/[^\d+]/g, "")}`}>{branch.phone}</a></li>
          <li><Icon name="mail" size={15} /> <a href={`mailto:${branch.email}`}>{branch.email}</a></li>
          <li><Icon name="globe" size={15} /> {branch.languages.map((l) => tx(l)).join(", ")}</li>
        </ul>
        <div className="branch-panel__actions">
          <Btn onClick={() => setMapOpen(true)} icon="compass" size="sm">
            {ct("auto.site.c1e6110f59709a36")}</Btn>
          <Btn onClick={() => setSubsOpen(true)} variant="quiet" size="sm" icon="people">
            <span className="branch-panel__subs-btn">{ct("auto.site.a8527719df5a9170")}</span>
            {subs.length > 0 && <em className="branch-panel__subs-count">{subs.length}</em>}
          </Btn>
          <Btn onClick={() => copyText(branch.address, ct("auto.site.8767f57484dee665"))} variant="ghost" size="sm" icon="copy">
            {ct("auto.site.e2e08e5902c4d3e0")}</Btn>
          <Btn href={`https://www.openstreetmap.org/?mlat=${branch.lat}&mlon=${branch.lng}#map=15/${branch.lat}/${branch.lng}`} variant="quiet" size="sm" icon="external">
            {ct("auto.site.c46beaa5ac508824")}</Btn>
        </div>
      </div>
      {others && others.length > 0 && (
        <div className="branch-panel__side">
          <h4>
            {withDistance ? ct("auto.site.98dcbc0075b397e9") : sameCountry ? <>{ct("auto.site.8401f4e754b56bce")}{branch.country}</> : ct("auto.site.511e8faecd3a0bd7")}
          </h4>
          <div className="branch-panel__list">
            {others.slice(0, 4).map((o) => {
              const tag =
                typeof o.km === "number"
                  ? fmtDistance(o.km)
                  : o.branch.country !== branch.country
                    ? o.branch.country
                    : "";
              return (
                <button type="button" key={o.branch.id} className="nearby-row nearby-row--link" onClick={() => onSelect?.(o.branch)}>
                  <Icon name="pin" size={13} />
                  <span>{o.branch.city}</span>
                  {tag && <em>{tag}</em>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {mapOpen && <BranchMapPopup branch={branch} onClose={() => setMapOpen(false)} />}
      {subsOpen && <SubBranchesPopup branch={branch} onOpenBranch={onSelect} onClose={() => setSubsOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ countdown */

export function Countdown({ target, label }: { target: number; label?: string }) {
  const now = useNow(1000);
  const parts = countdownParts(Math.max(0, target - now.getTime()));
  /* The units follow the visitor's own language too (the 1d 6h 34m reads
     French the moment the address does). */
  const units = [
    { v: parts.days, l: tx("days") },
    { v: parts.hours, l: tx("hrs") },
    { v: parts.minutes, l: tx("min") },
    { v: parts.seconds, l: tx("sec") },
  ];
  return (
    <div className="countdown" aria-label={label}>
      {units.map((u) => (
        <span className="countdown__unit" key={u.l}>
          <b>{String(u.v).padStart(2, "0")}</b>
          <em>{u.l}</em>
        </span>
      ))}
    </div>
  );
}

export function NextServiceCard() {
  const now = useNow(1000);
  /* The office's Weekly services card, read on the church's own clock — the
     same answer every live badge and countdown on the site gives. */
  const zone = churchTimezone();
  const info = nextService(SERVICES, now, zone);
  if (!info) return null;
  /* The gathering's name is the church's; the day and time under it are read on
     the visitor's own clock (SPEC note 85), and the city follows their own IP
     city too — Lagos reads as London the moment the address moves. */
  const when = clockHere(info.slot.time, info.slot.day, zone);
  const city = visitorPlace() || HQ.city;
  /* The office's switch or the stream itself — whichever says we are on air wins (note 386). */
  const live = displayLive(info);
  return (
    <div className={"next-service" + (live ? " next-service--live" : "")}>
      <Eyebrow>{live ? ct("auto.site.06bfee249b41bda5") : ct("auto.site.19d68ad8b3328ba1")}</Eyebrow>
      <h3>{tx(info.slot.name)}</h3>
      <p className="muted">
        {tx(DAY_NAMES[when.day])}{ct("auto.site.ecb64ceed77c7057")}{to12h(when.time)} · {city}
      </p>
      {live ? (
        <div className="live-now">
          <span className="live-dot" />{" "}
          {info.isLive ? (
            <>
              {ct("auto.site.a7ef4229ab5be458")}
              {fmtTime(info.endsAt)}
            </>
          ) : (
            ct("auto.site.af04bc17aac8d156")
          )}
        </div>
      ) : (
        <Countdown target={info.at.getTime()} />
      )}
      <div className="next-service__actions">
        <Btn to="/watch-live" size="sm" variant={live ? "crimson" : "gold"} icon="live">
          {live ? ct("auto.site.95971afd9cf648d4") : ct("auto.site.735c3c7e94d55ab7")}
        </Btn>
        <Btn to="/visit" size="sm" variant="ghost" icon="ticket">
          {ct("auto.site.029a6f17974ef14e")}</Btn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stats & shared blocks */

export function StatStrip() {
  return (
    <div className="stat-strip">
      {STATS.map((s) => (
        <Stat key={s.label} value={s.value} label={s.label} suffix={s.suffix} />
      ))}
    </div>
  );
}

export function GivingCTA() {
  return (
    <section className="giving-cta">
      <div className="giving-cta__inner">
        <div>
          <Eyebrow>{ct("auto.site.9c844867268c997e")}</Eyebrow>
          <h2>{ct("auto.site.93facdd53c31ca74")}</h2>
          <p className="lede">
            {ct("auto.site.d532efa97334e150")}{SITE.name} {ct("auto.site.8c34a4de6e2e3fef")}{""}
            {ct("auto.site.3a88baf4a2dfa4c5")}{""}
            <b>28%</b> {ct("auto.site.6d3e7a6edb27bf2f")}</p>
          <div className="giving-cta__actions">
            <Btn to="/giving" query={{ tab: "other" }} variant="gold" icon="gift">
              {ct("auto.site.b17847913539ca88")}</Btn>
            <Btn to="/giving" query={{ tab: "funds" }} variant="ghost" icon="book">
              {ct("auto.site.a24fced90de84620")}</Btn>
          </div>
        </div>
        <div className="giving-cta__verse">
          <Icon name="quote" size={22} />
          <p>{ct("auto.site.87c4b926efa53887")}</p>
          <cite>{ct("auto.site.0ba64be41fd0ff8d")}</cite>
        </div>
      </div>
    </section>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      role="search"
    >
      <Icon name="search" size={17} />
      <input className="search__input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || ct("auto.site.5b3e67042058955d")} aria-label={placeholder || ct("auto.site.5b3e67042058955d")} />
      {value && <IconBtn name="close" label={ct("auto.site.3926ba0db13189dc")} onClick={() => onChange("")} />}
    </form>
  );
}

export function ServiceTimesList({ branch, compact }: { branch: Branch; compact?: boolean }) {
  const zone = branchZone(branch);
  return (
    <ul className={"times-list" + (compact ? " times-list--compact" : "")}>
      {branch.schedule.map((s, i) => {
        const c = clockHere(s.time, s.day, zone);
        return (
          <li key={i}>
            <b>{tx(DAY_NAMES[c.day])}</b>
            <span>{to12h(c.time)}</span>
            <em>{tx(s.name)}</em>
            <span className="muted">{fmtDuration(s.minutes)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export { uid, compressImage, fmtDuration, parseDuration, haversineKm, ytWatch };
