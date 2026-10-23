import React, { useEffect, useMemo, useRef, useState } from "react";
import { tx } from "../lib/i18n";
import { Link } from "../lib/router";
import { SITE, SERVICES, img } from "../data/site";
import { LIVE, hiddenReplays, numberWord, pastLimit, recentLimit, sermonTurnaroundHours } from "../data/live";
import { ct } from "../data/copy";
import { BRANCHES, DEFAULT_BRANCH_ID, HQ } from "../data/branches";
import { sermonsNewestFirst, sermonSource, sermonThumb } from "../data/sermons";
import { useLocalState, useNow, fireToast } from "../lib/hooks";
import { KEYS, nextService, onAir, displayLive, to12h, DAY_NAMES, countdownParts, addToCalendar, mailto, clockHere, tidyCount, churchTimezone, visitorPlace, fmtDate, downloadText, serviceNoteKey, type NextServiceInfo } from "../lib/store";
import { isFacebookVideoUrl, parseYoutubeId, platformLabel, watchUrl, youtubeThumb, type VideoPlatform, type VideoSource } from "../lib/embed";
import { useLiveStream, liveTarget, guestTarget, isGuestTargetUrl, facebookTarget, useYoutubeVerdict, isStatusForTarget, designatedChannelIdForTarget, isDesignatedChannel, nextScreenShut, officeStopActive, type ScreenShut } from "../lib/livestatus";
import { useLibrary } from "../lib/collections";
import { useRecentServices, designatedFallback } from "../lib/recentstreams";
import { Badge, Btn, Icon, IconBtn, Modal, Notice, Reveal, Rich, Section, SectionHeading, Textarea } from "../components/ui";
import { PageHead } from "../components/layout";
import { LiveWaiting } from "../components/liveclock";
import { Countdown, RecentServiceCard, SermonWatch, VideoPlayer, WatchCards, platformWatchLinks } from "../components/blocks";

export function WatchLive() {
  const [branchId] = useLocalState<string>(KEYS.branch, DEFAULT_BRANCH_ID);
  const branch = BRANCHES.find((b) => b.id === branchId) || BRANCHES[0];
  const [reminders, setReminders] = useLocalState<Record<string, boolean>>("wom.reminders", {});
  const now = useNow(1000);
  /* The office's Weekly services card, read on the church's own clock. */
  const info = nextService(SERVICES, now, churchTimezone());
  /* When the next gathering happens — read on the visitor's own clock (SPEC note 85). */
  const when = info ? clockHere(info.slot.time, info.slot.day, churchTimezone()) : null;
  const replays = sermonsNewestFirst();
  /* The message playing above everything else. */
  const latest = replays[0];

  /* Is the church on air? Asked of YouTube regularly (livestatus.ts); shared with the header.
     The Watch page always asks on the short cadence and checks at once on open
     (note 310): a visitor who opened this page came to see the stream, schedule
     or no — so a YouTube start shows in seconds and the waiting clock vanishes
     with it, on live and on local alike. */
  const air = useLiveStream(true, false, true);
  const justNow = !!info && (onAir(info) || info.msUntil < 45 * 60 * 1000);
  /* Only the handle's own answer ever reaches the screen (note 350): an
     answer stamped for another address (the office moved the channel since
     the check) reads as unknown until the fresh check lands — it never
     plays, never covers, and never filters the lists. And a stray stream
     link is ignored while the channel space names a channel — the handle
     wins everywhere below. */
  const targetUrl = liveTarget()?.url || "";
  const hasChannel = liveTarget()?.kind === "channel";
  /* A temporary guest channel (note 380): a one-off livestream from another
     address. Its answer is gated on its own stamp like the main one below —
     while IT is live the screen plays it; the moment it ends the screen
     closes onto the main still (note 388) — never another channel's
     livestream — with the still and recents main-owned as ever. */
  const guestUrl = guestTarget()?.url || "";
  const guestAir = guestUrl && isStatusForTarget(air, guestUrl)
    ? air
    : { ...air, state: "unknown" as const, videoId: "", title: "", channelId: "" };
  const guestLive = guestAir.state === "live";
  /* Only the designated channel ever reaches the screen (note 358): the
     livestream must not play until @twocorg itself is live — a named video
     from another channel, or an unverified channel follow for one, reads as
     waiting until the fresh check proves the handle is on air. */
  const designatedId = designatedChannelIdForTarget(targetUrl);
  const airForTarget = isStatusForTarget(air, targetUrl)
    ? air
    : { ...air, state: "unknown" as const, videoId: "", title: "", channelId: "" };
  /* What the screen plays (note 380): the guest while IT is live, else the
     main answer above. The still, the ended video and the lists below stay
     main-owned — a guest ending returns every one of them untouched. */
  const screenAir = guestLive ? guestAir : airForTarget;
  /* Shut the moment a live ends (notes 386, 388): when the screen's broadcast
     reads off — the guest ending, the main ending, or the office stopping it —
     the screen closes at once onto the main channel's last ended thumbnail
     instead of playing on or handing another channel's livestream over. A mere
     unknown (probe down, offline) never closes anything. The latch lifts only
     on a new live edge, so a livestream that starts still opens by itself,
     with sound. The transition is pure (`nextScreenShut`); the previous screen
     address lives in a ref, the latch in state, computed on the render so the
     player never flashes open for a single frame. */
  const shutPrevRef = useRef("");
  const [shut, setShut] = useState<ScreenShut>(null);
  const nowLiveTarget = screenAir.state === "live" ? String(screenAir.target || "") : "";
  const shutNext = nextScreenShut(shut, shutPrevRef.current, guestUrl, screenAir.state === "live", nowLiveTarget, screenAir.state === "off");
  useEffect(() => {
    shutPrevRef.current = nowLiveTarget;
    if (shutNext !== shut) setShut(shutNext);
  });
  const shutNow = shutNext;
  /* Straight stop rule (note 414): the office pressed Stop and published it —
     the live is off, so the screen never sits on the ticking clock. It shows
     the main channel's previous livestream thumbnail instead (the cover chain
     below is main-owned as ever). A pause holds rather than ends, and a fresh
     copy ships no cut, so neither ever lands here. */
  const officeStopped = officeStopActive(LIVE);
  /* A Facebook live is not a YouTube id (note 398): its numeric video id must
     never enter the YouTube path — it would open as a broken YouTube embed
     instead of the Facebook broadcast. */
  const fbLive = screenAir.state === "live" && screenAir.platform === "facebook" && isFacebookVideoUrl(LIVE.facebookUrl);
  const detectedId = screenAir.state === "live" && screenAir.platform !== "facebook" ? screenAir.videoId : "";
  /* Walled but on air (note 331): live with no verified video — the player
     follows the channel instead of showing the ended screen. Strict (note
     358): only the designated channel is followed, and only one tap, never
     autoplay — anything else waits. A live guest's own channel follows the
     same way (note 380): one tap, never autoplay. */
  const detectedChannel = screenAir.state === "live" && !screenAir.videoId && !!screenAir.channelId && (guestLive ? isGuestTargetUrl(screenAir.target, guestUrl) : (!designatedId || screenAir.channelId === designatedId)) ? screenAir.channelId : "";
  /* Dead-video gate (note 333): a named id that YouTube says is gone never
     autoplays into the black "unavailable" frame — and the unverified channel
     follow below is always one tap, never autoplay. Unknown (offline, probe
     down) plays exactly as before. */
  const idVerdict = useYoutubeVerdict(detectedId);
  const fallbackId = !hasChannel ? parseYoutubeId(LIVE.youtubeId) : "";
  const fallbackVerdict = useYoutubeVerdict(fallbackId);
  /* Strict (note 358): a named video from another channel never autoplays —
     video answers carry no channel id, so those pass; a stamped foreign one
     does not. The guest's own stamped video plays while IT is live (note
     380) — everything else about it already says the guest address.
     Unknown plays (note 420): a verdict that never settles (offline, probe
     down, still checking) used to sit the screen on the ticking clock for a
     broadcast that was already on air — so `true` OR `null` opens the player,
     which verifies behind the frame itself. Only a proven-dead id is held
     back, and it still reaches the player below for its fallback. */
  const idOk = idVerdict === true || idVerdict === null;
  const playableId = detectedId && idOk && (isDesignatedChannel(airForTarget.channelId, designatedId) || (guestLive && isGuestTargetUrl(screenAir.target, guestUrl))) ? detectedId : "";
  const verifiedFallbackId = fallbackId && (fallbackVerdict === true || fallbackVerdict === null) ? fallbackId : "";
  /* A named id YouTube says is gone still reaches the player (note 420): the
     player's own dead fallback names it and offers the platform link — never
     the black "unavailable" frame, and never the ticking clock for a live
     that is already on air. */
  const deadLiveId = detectedId && idVerdict === false && (isDesignatedChannel(airForTarget.channelId, designatedId) || (guestLive && isGuestTargetUrl(screenAir.target, guestUrl))) ? detectedId : "";
  const watchable = !!playableId || !!deadLiveId || !!detectedChannel || fbLive || !!verifiedFallbackId;
  /* Dead-video gate (note 413, opened note 420): a named id reaches the
     player while its verdict is still unknown — offline, probe down, still
     checking — and the player verifies behind the frame, swapping to its
     fallback when the id proves dead. A proven-dead id goes straight to that
     fallback below. Dead never plays blind into the black frame. */
  const checkingLiveId = !!detectedId && idVerdict === null;
  const checkingFallbackId = !!fallbackId && !playableId && !detectedChannel && !fbLive && fallbackVerdict === null;
  /* Play means play for the guest, patience for the main (notes 404, 410):
     the office pressed Play for a slot and published it, yet the read cannot
     confirm a broadcast (bot wall) — so the commanded GUEST channel opens by
     itself instead of sitting on the waiting clock, while a pressed MAIN with
     no detected broadcast waits on the clock below (autoplay only works once
     the main livestream has started live on the channel). Only while the read
     says unknown (a verified off stays on the clock), only the commanded
     slot, only with a known channel id — and a detected broadcast still wins
     first. */
  const overrideMain = !!LIVE.isLive && hasChannel && !guestLive && screenAir.state !== "live" && airForTarget.state === "unknown" && !shutNow;
  const overrideGuest = !!(LIVE as any).guestIsLive && !!guestUrl && !guestLive && screenAir.state !== "live" && guestAir.state === "unknown" && !shutNow;
  const overrideId = overrideMain ? designatedChannelIdForTarget(targetUrl) : overrideGuest ? designatedChannelIdForTarget(guestUrl) : "";
  /* Anywhere for the check to look — channel, stream link or Facebook page. */
  const configured = !!liveTarget() || !!facebookTarget();
  /* The shared on-air answer (notes 83, 133); `streaming` is the narrower screen question. Declared
     here, before `liveSource` (note 412): the initializer below reads it, and reading a later
     declaration crashed the page (`Cannot access 'streaming' before initialization`). */
  /* The main channel plays by itself (note 400): a detected @twocorg live
     autoplays with no Play press — the channel setting is the office's
     intent, like the guest and Facebook (configuring them is the intent).
     Play stays a manual override (it opens the channel while the read is
     walled, and it releases a Stop); a published Stop still holds the main
     until Play. Press alone never autoplays — autoplay only works once the
     main livestream has started live on the channel. */
  const mainDetected = screenAir.state === "live" && !guestLive && !fbLive;
  const streaming = screenAir.state === "live" && !shutNow && (guestLive || fbLive || (mainDetected && !officeStopped));

  /* The two lists under the screen: recent services (read off the channel) and previous sermons (the office's write-ups). */
  const limit = recentLimit();
  const past = pastLimit();
  const recentStreams = useRecentServices({ soon: justNow, liveNow: airForTarget.state === "live" });
  const onScreenId = screenAir.state === "live" ? detectedId : "";
  /* A service the office has already uploaded as a message *is* that message —
     it should not also sit in the list as a raw stream. */
  const curatedIds = new Set(replays.map((s) => parseYoutubeId(s.youtubeId || "")).filter(Boolean));
  /* A service the office took off the site (Live stream → *Recent services*)
     never appears again, whichever list it would have landed in — the video
     itself stays on the church's channel. */
  const takenOff = hiddenReplays();
  const recentItems = recentStreams.items
    .filter((it) => it.videoId !== onScreenId && !curatedIds.has(it.videoId) && !takenOff.has(it.videoId))
    .slice(0, limit);
  /* Note 413: the ended screen no longer repeats Recent services — the only
     list lives in #recent-services below, so the screen keeps its still and
     buttons with no duplicate cards. */
  /* Nothing to read (no channel set yet, or the read failed): keep the section
     useful with the newest messages the site already holds. */
  const recentFallback = recentItems.length
    ? []
    : replays.filter((s) => s.id !== latest?.id && !takenOff.has(parseYoutubeId(s.youtubeId || ""))).slice(0, limit);
  const fallbackIds = new Set(recentFallback.map((s) => s.id));
  /* The office's write-ups: the newest *past* of them, oldest dropping off the
     band as a new message is published (the archive itself keeps everything). */
  const pastCards = replays.filter((s) => s.id !== latest?.id && !fallbackIds.has(s.id)).slice(0, past);
  const platformLinks = platformWatchLinks();

  /* The still behind the waiting and ended screens (note 133): the ended
     broadcast's frame, else the newest recent service's own thumbnail, else
     the designated channel's last previous service standing in by itself
     (note 372 — @twocorg's latest thumbnail even before any read settles),
     else a sermon still, else the hero. */
  const cover =
    (airForTarget.endedAt && airForTarget.videoId && airForTarget.platform !== "facebook" ? youtubeThumb(airForTarget.videoId) : "") ||
    recentStreams.items[0]?.thumb ||
    designatedFallback().items[0]?.thumb ||
    (latest && sermonThumb(latest)) ||
    img("watch-live");

  /* which platforms the office has actually configured (the stream that is on
     air right now counts as YouTube being available, even if all the office
     gave us was the channel to watch) */
  const available = useMemo(() => {
    const list: VideoPlatform[] = [];
    if (detectedId || detectedChannel || overrideId || (!hasChannel && parseYoutubeId(LIVE.youtubeId))) list.push("youtube");
    if (isFacebookVideoUrl(LIVE.facebookUrl)) list.push("facebook");
    return list;
  }, [detectedId, detectedChannel, hasChannel, LIVE.youtubeId, LIVE.facebookUrl, fbLive]);
  const preferred: VideoPlatform = fbLive ? "facebook" : detectedId || detectedChannel || overrideId ? "youtube" : LIVE.provider === "facebook" ? "facebook" : "youtube";
  const [chosen, setChosen] = useState<VideoPlatform>(preferred);
  /* The service notepad behind the *Service notes* arrow (note 223). */
  const [notesOpen, setNotesOpen] = useState(false);
  const platform: VideoPlatform | null = available.includes(chosen) ? chosen : available[0] || null;
  const liveSource: VideoSource =
    fbLive
      ? { platform: "facebook", facebookUrl: LIVE.facebookUrl }
      : platform === "facebook"
      ? { platform: "facebook", facebookUrl: LIVE.facebookUrl }
      : { platform: "youtube", youtubeId: playableId || deadLiveId || verifiedFallbackId, youtubeChannelId: detectedChannel || (!streaming && overrideId) || undefined };
  const youtubeLink =
    watchUrl({ platform: "youtube", youtubeId: playableId }) ||
    (guestLive && guestUrl ? guestUrl : hasChannel ? targetUrl : watchUrl({ platform: "youtube", youtubeId: LIVE.youtubeId }) || targetUrl);

  /* The `streaming` answer lives above, beside `overrideId` (note 412). */
  /* Live but not yet playable: the main address reads live while its id still
     verifies (or the screen sits behind a press-free detection) — the screen
     waits on the ticking clock (never the ended screen: something IS live),
     naming the gathering. The shut latch still closes first. */
  const waitingForClick = !shutNow && !officeStopped && !LIVE.isLive && !guestLive && !fbLive && airForTarget.state === "live";
  /* What the badges show (note 386): the stream itself, or the office's
     switch — never the bare service clock — and never another channel's
     livestream while the screen sits shut after an end. */
  const onAirNow = displayLive(info) && !shutNow;
  /* What the panel calls the broadcast while on air (notes 133, 406): the
     detected stream's own title; else the gathering the clock has on — or the
     next one, so a Play press for a coming broadcast names it instead of the
     office's standing headline; a forced guest with no detected title keeps
     the headline, since the church schedule never names a guest event. */
  const guestForcedOnly = (guestLive || !!(LIVE as any).guestIsLive) && !LIVE.isLive && airForTarget.state !== "live";
  const liveName = tx(air.title || (guestForcedOnly ? LIVE.liveTitle : info?.slot.name || LIVE.liveTitle) || "");
  const streamCountdown = info ? countdownParts(info.msUntil) : null;


  const sideList: { icon: string; title: string; text: string; action: React.ReactNode }[] = [
    {
      icon: "gift",
      title: ct("live.side.1.title"),
      text: ct("live.side.1.text"),
      action: (
        <Link className="icon-btn" to="/giving" aria-label={ct("auto.live.4cf253c215e1f583")}>
          <Icon name="arrowRight" size={18} />
        </Link>
      ),
    },
    {
      icon: "book",
      title: ct("live.side.2.title"),
      text: ct("live.side.2.text"),
      /* The arrow opens the service notepad — the same pad as a sermon's,
         with its own save button (note 223). */
      action: (
        <button type="button" className="icon-btn" aria-label={ct("live.side.2.title")} onClick={() => setNotesOpen(true)}>
          <Icon name="arrowRight" size={18} />
        </button>
      ),
    },
    {
      icon: "send",
      title: ct("live.side.3.title"),
      text: ct("live.side.3.text"),
      action: (
        <IconBtn
          name="mail"
          label={ct("auto.live.1cf1d3f324cc7572")}
          href={mailto(SITE.email, ct("auto.live.88aaa698409beda1"), ct("auto.live.899e27b9b2d1e948"))}
        />
      ),
    },
    {
      icon: "heart",
      title: ct("live.side.4.title"),
      text: ct("live.side.4.text"),
      action: (
        <Link className="icon-btn" to="/visit" aria-label={ct("auto.live.3e9b1e2273d720ab")}>
          <Icon name="arrowRight" size={18} />
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={ct("live.head.eyebrow")}
        title={<Rich text={ct("live.head.title")} />}
        lede={ct("live.head.lede")}
        image={img("watch-live")}
        crumbs={[{ label: ct("auto.live.cdd19baece0575cf"), to: "/" }, { label: ct("auto.live.549cf77285281f7b") }]}
      />

      {/* ---- the screen: the service plays right here on the site ---------- */}
      <Section>
        <div className={"live-panel" + (onAirNow ? " live-panel--on" : "")}>
          <div className="live-panel__stage">
            <span className="live-panel__glow" aria-hidden="true" />
            {onAirNow ? (
              <span className="live-badge">
                <span className="live-dot" /> {ct("live.live.prefix")}
              </span>
            ) : (
              <Badge accent="gold" icon="clock">
                {ct("live.next.badge")}
              </Badge>
            )}
            <h2>{onAirNow ? liveName : info ? tx(info.slot.name) : ""}</h2>
            {!onAirNow && (
              <p className="lede">
                {tx(DAY_NAMES[when?.day ?? 0])}
                {ct("auto.live.e58d3887c0716716")}
                {to12h(when?.time || "10:00")} · {visitorPlace() || HQ.city}
                {streamCountdown && (
                  <>
                    {" · "}
                    {streamCountdown.days > 0 ? tidyCount(ct("auto.live.7bb8b701077b0130", { days: streamCountdown.days })) : ""}
                    {streamCountdown.hours} {ct("auto.live.204d342adf100c7b")}
                  </>
                )}
              </p>
            )}

            <div className="live-panel__frame">
              {available.length > 1 && (
                <div className="platform-pick">
                  <span className="platform-pick__label">{ct("live.platform.label")}</span>
                  <div className="platform-pick__row" role="group" aria-label={ct("auto.live.918e2504283bee65")}>
                    {available.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={"platform-pick__btn" + (p === platform ? " is-active" : "")}
                        onClick={() => setChosen(p)}
                      >
                        <Icon name={p} size={16} />
                        {platformLabel(p)}
                      </button>
                    ))}
                  </div>
                  <p className="platform-pick__hint">{ct("live.platform.hint")}</p>
                </div>
              )}

              {(checkingLiveId || checkingFallbackId) && !playableId && !deadLiveId && !verifiedFallbackId && !shutNow && !officeStopped ? (
                <LiveWaiting cover={cover} />
              ) : streaming && watchable ? (
                <VideoPlayer
                  hideEscape
                  source={liveSource}
                  title={liveName || ct("auto.live.bc108377bb47f9e6")}
                  compact
                  live
                  /* The check says live, so the screen plays by itself (notes
                     384, 388) — a verified broadcast, a walled channel follow,
                     or the stream link all open with no tap, WITH SOUND: no
                     live from a channel is ever muted, and the audio opens by
                     itself the moment the broadcast starts. */
                  autoPlay={streaming && watchable}
                />
              ) : overrideGuest && overrideId ? (
                <VideoPlayer
                  hideEscape
                  source={{ platform: "youtube", youtubeId: "", youtubeChannelId: overrideId }}
                  title={liveName || ct("auto.live.bc108377bb47f9e6")}
                  compact
                  live
                  /* The office commanded the guest slot (notes 404, 410): the
                     guest Play is published and the read is walled — so that
                     commanded channel opens by itself instead of the waiting
                     clock, WITH SOUND like every live. The MAIN slot never
                     opens here: a pressed main with no detected broadcast
                     waits on the clock below — autoplay only works once the
                     main livestream has started live on the channel. A
                     verified off still waits; a detected broadcast still
                     wins. */
                  autoPlay
                />
              ) : !onAirNow && !waitingForClick ? (
                /* Nobody is broadcasting: the screen says so, and promises what
                   happens next — over the last stream's own still, dimmed. The
                   player opens the service by itself once Play is published for the stream
                   starts (src/lib/livestatus.ts). The main channel's previous
                   services sit right under it (note 392), so the moment a live
                   ends its thumbnails are already on the screen. */
                <>
                <div className="live-ended">
                  {cover && <img className="live-ended__bg" src={cover} alt="" loading="lazy" />}
                  <span className="live-ended__scrim" aria-hidden="true" />
                  <div className="live-ended__body">
                    <h3 className="live-ended__title">
                      <span className="live-dot live-dot--off" aria-hidden="true" />
                      {ct("auto.live.46806425cfa4b23c")}</h3>
                    <p className="live-ended__text">
                      {ct("auto.live.cc22c36df87987a4")}</p>
                    <div className="btn-row center">
                      {(latest || recentItems.length > 0 || recentFallback.length > 0) && (
                        <Btn
                          size="sm"
                          variant="gold"
                          icon="play"
                          onClick={() => document.getElementById("recent-services")?.scrollIntoView({ behavior: "smooth" })}
                        >
                          {ct("auto.live.58511836749f04df")}</Btn>
                      )}
                      <Btn size="sm" variant="ghost" to="/sermons" iconRight="arrowRight">
                        {ct("auto.live.5a337fb840693709")}</Btn>
                    </div>
                  </div>
                </div>
                {/* Note 413: duplicate Recent services removed — see #recent-services below. */}
                </>
              ) : configured ? (
                /* Service on, stream not open yet: last still under the ticking clock (note 133). */
                <LiveWaiting cover={cover} />
              ) : latest ? (
                /* On air but pointed at nothing: play the most recent message. */
                <>
                  <VideoPlayer
                    hideEscape
                    source={sermonSource(latest)}
                    title={ct("auto.live.2af95d5fd1e87dae", { title: latest.title })}
                    poster={sermonThumb(latest)}
                    compact
                  />
                  <Notice icon="info">{ct("live.preview.note")}</Notice>
                </>
              ) : (
                <Notice icon="live">
                  <b>{ct("live.fallback.title")}</b> {ct("live.fallback.text")}
                </Notice>
              )}
            </div>

            {available.length > 0 && (
              <div className="btn-row center live-panel__links">
                {available.includes("youtube") && (
                  <Btn variant={onAirNow ? "crimson" : "gold"} icon="youtube" href={youtubeLink}>
                    {ct("live.watch.button1")}
                  </Btn>
                )}
                {available.includes("facebook") && (
                  <Btn variant="ghost" icon="facebook" href={LIVE.facebookUrl}>
                    {ct("live.watch.button2")}
                  </Btn>
                )}
              </div>
            )}

            {!onAirNow && (
              <>
                {info && <Countdown target={info.at.getTime()} />}
                <div className="btn-row center">
                  <Btn
                    variant={reminders[branch.id] ? "quiet" : "gold"}
                    icon="bell"
                    onClick={() => {
                      setReminders((r) => ({ ...r, [branch.id]: !r[branch.id] }));
                      fireToast(
                        reminders[branch.id]
                          ? ct("auto.live.54b178755f52a4bc")
                          : ct("auto.live.4e86ecb6fa0f11c7"),
                        "success"
                      );
                      if (!reminders[branch.id] && "Notification" in window && Notification.permission === "default")
                        Notification.requestPermission().catch(() => {});
                    }}
                  >
                    {reminders[branch.id] ? ct("auto.live.d8c590b55179a68c") : ct("auto.live.82eb731a67d7c84b")}
                  </Btn>
                  <Btn
                    variant="ghost"
                    icon="calendar"
                    onClick={() =>
                      info &&
                      addToCalendar({
                        title: `${info.slot.name} — ${SITE.name}`,
                        description: `${branch.name} · ${branch.city}`,
                        location: branch.address || branch.city,
                        start: info.at,
                        minutes: info.slot.minutes || 120,
                      })
                    }
                  >
                    {ct("auto.live.d4d3f2fff83ddffe")}</Btn>
                  <Btn variant="ghost" icon="headphones" href={SITE.socials[0].url}>
                    {ct("auto.live.119262a1855436a8")}</Btn>
                </div>
              </>
            )}

            {available.length > 0 && (
              <p className="live-panel__where">
                <Icon name={platform === "facebook" ? "facebook" : "youtube"} size={15} />
                {ct("live.where.text", { platforms: tx(available.map((p) => platformLabel(p)).join(" and ")) })}
              </p>
            )}
          </div>
          <aside className="live-panel__side">
            <h3>{ct("live.side.title")}</h3>
            <ul className="live-side-list">
              {sideList.map((item, i) => (
                <li key={i}>
                  <Icon name={item.icon} size={18} />
                  <span>
                    <b>{item.title}</b>
                    <em>{item.text}</em>
                  </span>
                  {item.action}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Section>

      {/* ---- the last message, playing on this page ------------------------ */}
      {latest && (
        <Section tone="raised">
          <SectionHeading
            eyebrow={ct("live.last.eyebrow")}
            title={ct("live.last.title")}
            lede={ct("live.last.lede")}
            actions={
              <Btn to={`/sermons/${latest.id}`} variant="ghost" iconRight="arrowRight">
                {ct("live.card.message")}
              </Btn>
            }
          />
          <SermonWatch sermon={latest} className="vcard--wide" />
        </Section>
      )}


      <Section tone="light" id="recent-services">
        <SectionHeading
          eyebrow={ct("live.replay.eyebrow")}
          title={ct("live.replay.title")}
          lede={ct("live.replay.lede", { limit: tx(numberWord(limit)) })}
          actions={
            <>
              {platformLinks.youtube && (
                <Btn size="sm" variant="ghost" href={platformLinks.youtube} icon="youtube" iconRight="external">
                  {ct("auto.live.db942c55e9ec899c")}
                  {platformLabel("youtube")}
                </Btn>
              )}
              {platformLinks.facebook && (
                <Btn size="sm" variant="ghost" href={platformLinks.facebook} icon="facebook" iconRight="external">
                  {ct("auto.live.db942c55e9ec899c")}
                  {platformLabel("facebook")}
                </Btn>
              )}
              <Btn to="/sermons" variant="ghost" iconRight="arrowRight">
                {ct("live.replay.action")}
              </Btn>
            </>
          }
        />
        {recentFallback.length ? (
          <div className="grid grid-2">
            {recentFallback.map((s, i) => (
              <Reveal key={s.id} delay={i * 60}>
                <SermonWatch sermon={s} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="grid grid-3">
            {recentItems.map((it, i) => (
              <Reveal key={it.videoId} delay={i * 50}>
                <RecentServiceCard item={it} />
              </Reveal>
            ))}
          </div>
        )}
      </Section>

      {pastCards.length > 0 && (
        <Section>
          <SectionHeading
            eyebrow={ct("live.past.eyebrow")}
            title={ct("live.past.title")}
            lede={ct("live.past.lede", { hours: tx(numberWord(sermonTurnaroundHours())) })}
            actions={
              <Btn to="/sermons" variant="ghost" iconRight="arrowRight">
                {ct("live.past.action")}
              </Btn>
            }
          />
          <div className="grid grid-3">
            {pastCards.map((s, i) => (
              <Reveal key={s.id} delay={(i % 3) * 60}>
                <SermonWatch sermon={s} />
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("live.ways.eyebrow")} title={ct("live.ways.title")} />
        <WatchCards />
      </Section>

      {notesOpen && <ServiceNotesModal info={info} onClose={() => setNotesOpen(false)} />}
    </>
  );
}

/* The notepad behind the *Service notes* arrow — the same pad a sermon has:
   follow along with the outline, save it to the library, download it (note 226). */
function ServiceNotesModal({ info, onClose }: { info: NextServiceInfo | null; onClose: () => void }) {
  const lib = useLibrary();
  const key = info ? serviceNoteKey(info.at, info.slot.name) : serviceNoteKey(new Date(), "Service");
  const text = lib.serviceNotes[key] || "";
  const file = key.replace(/^service:/, "").replace(/:/g, "-") + ".txt";
  return (
    <Modal open onClose={onClose} title={ct("live.side.2.title")}>
      {info && (
        <p className="muted">
          {tx(info.slot.name)} · {tx(DAY_NAMES[whenOf(info).day])} {to12h(whenOf(info).time)} · {fmtDate(info.at, "long")}
        </p>
      )}
      <Textarea
        rows={8}
        value={text}
        onChange={(e) => lib.setServiceNote(key, e.target.value)}
        placeholder={ct("live.side.2.text")}
      />
      <div className="notes-actions">
        <Btn size="sm" variant="ghost" icon="bookmark" onClick={() => { lib.setServiceNote(key, text); fireToast(tx("Saved to your library"), "success"); }}>
          {tx("Save to library")}</Btn>
        <span className="field__hint">
          {text.length} {ct("auto.sermon.475e8e013b769d00")}</span>
      </div>
      <div className="btn-row mt-3">
        <Btn size="sm" variant="ghost" icon="download" onClick={() => {
          if (!text.trim()) { fireToast(tx("Write a note first"), "info"); return; }
          downloadText(file, text);
        }}>
          {tx("Download note")}</Btn>
      </div>
    </Modal>
  );
}

/** This gathering on the visitor's own clock (note 85). */
function whenOf(info: NextServiceInfo) {
  return clockHere(info.slot.time, info.slot.day, churchTimezone());
}
