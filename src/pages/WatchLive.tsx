import React, { useMemo, useState } from "react";
import { Link } from "../lib/router";
import { SITE, SERVICES, img } from "../data/site";
import { LIVE, hiddenReplays, numberWord, pastLimit, recentLimit, sermonTurnaroundHours } from "../data/live";
import { ct } from "../data/copy";
import { BRANCHES, DEFAULT_BRANCH_ID, HQ } from "../data/branches";
import { sermonsNewestFirst, sermonSource, sermonThumb } from "../data/sermons";
import { useLocalState, useNow, fireToast } from "../lib/hooks";
import { KEYS, nextService, onAir, to12h, DAY_NAMES, countdownParts, addToCalendar, mailto, clockHere, tidyCount, churchTimezone } from "../lib/store";
import { isFacebookVideoUrl, parseYoutubeId, platformLabel, watchUrl, youtubeThumb, type VideoPlatform, type VideoSource } from "../lib/embed";
import { useLiveStream, liveTarget, facebookTarget } from "../lib/livestatus";
import { useRecentServices } from "../lib/recentstreams";
import { Badge, Btn, Icon, IconBtn, Notice, Reveal, Rich, Section, SectionHeading } from "../components/ui";
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

  /* ---- is the church on air right now? -------------------------------
     Not a guess: the page asks YouTube about the church's channel (or the
     stream link) every so often and follows the answer — see
     src/lib/livestatus.ts. `justNow` tells the check to run on the short
     cadence when a service is on the clock. The check itself is the page's
     one poll (the site's, really — App.tsx mounts it), so this page and the
     header are reading the same answer. */
  const justNow = !!info && (onAir(info) || info.msUntil < 45 * 60 * 1000);
  const air = useLiveStream(justNow);
  const detectedId = air.state === "live" ? air.videoId : "";
  /* Is there anywhere for the check to look — a channel, a stream link, or a
     Facebook page? This is the promise the waiting screen makes: the office
     has pointed the site at a broadcast, so one is coming. With nothing set at
     all the panel falls back to the most recent message instead (below). */
  const configured = !!liveTarget() || !!facebookTarget();

  /* ---- the two lists under the screen ---------------------------------
     "Recent services" is the services we streamed most recently — six of them
     unless the office has asked for another number in the console (Live
     stream → *How many recent services to show*) — read from the church's own
     channel (src/lib/recentstreams.ts): a service takes its place the moment
     its stream ends, and the oldest one drops off the end. Nobody types it in.
     "Previous sermons" is the opposite: the messages the office writes up and
     uploads by hand (the Sermons section of the console), which is why they
     carry notes and discussion questions. The broadcast never rolls into it
     on its own. */
  const limit = recentLimit();
  const past = pastLimit();
  const recentStreams = useRecentServices({ soon: justNow, liveNow: air.state === "live" });
  const onScreenId = air.state === "live" ? detectedId : "";
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

  /* The still behind the waiting and the ended screens: the last broadcast we
     know of — the one that has just ended, if this browser watched it end, else
     the newest service on the church's channel — and the most recent message as
     the last resort. It is dimmed exactly as the last message's own cover is,
     so the screen is never a blank box (SPEC note 133). */
  const cover =
    (air.endedAt && air.videoId ? youtubeThumb(air.videoId) : "") ||
    recentStreams.items[0]?.thumb ||
    (latest && sermonThumb(latest)) ||
    img("hero");

  /* which platforms the office has actually configured (the stream that is on
     air right now counts as YouTube being available, even if all the office
     gave us was the channel to watch) */
  const available = useMemo(() => {
    const list: VideoPlatform[] = [];
    if (detectedId || parseYoutubeId(LIVE.youtubeId)) list.push("youtube");
    if (isFacebookVideoUrl(LIVE.facebookUrl)) list.push("facebook");
    return list;
  }, [detectedId, LIVE.youtubeId, LIVE.facebookUrl]);
  const preferred: VideoPlatform = detectedId ? "youtube" : LIVE.provider === "facebook" ? "facebook" : "youtube";
  const [chosen, setChosen] = useState<VideoPlatform>(preferred);
  const platform: VideoPlatform | null = available.includes(chosen) ? chosen : available[0] || null;
  const liveSource: VideoSource =
    platform === "facebook"
      ? { platform: "facebook", facebookUrl: LIVE.facebookUrl }
      : { platform: "youtube", youtubeId: detectedId || LIVE.youtubeId };
  const youtubeLink = watchUrl({ platform: "youtube", youtubeId: detectedId || LIVE.youtubeId });

  /* Where the live state comes from — and the office's switch is only one of
     them. `onAir()` is the shared answer (the stream the check found, the
     *We are on air right now* switch, or the service clock; SPEC notes 83,
     133), so this page and the header can never disagree. `streaming` is the
     narrower question the *screen* asks: the broadcast itself is running. */
  const streaming = air.state === "live";
  const onAirNow = onAir(info);
  /* What the panel calls the broadcast while it is on air. The stream's own
     title when the check found one; else the gathering the clock has on, since
     that is the one that is actually being broadcast (the office's switch alone
     has no gathering to name); else the office's own *Headline while live*. */
  const liveName = air.title || (info?.isLive ? info.slot.name : "") || LIVE.liveTitle || info?.slot.name || "";
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
      action: latest ? (
        <Link className="icon-btn" to={`/sermons/${latest.id}`} aria-label={ct("auto.live.6af04181792b1ee8")}>
          <Icon name="arrowRight" size={18} />
        </Link>
      ) : null,
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
        image={img("hero")}
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
            <h2>{onAirNow ? liveName : info?.slot.name}</h2>
            {!onAirNow && (
              <p className="lede">
                {DAY_NAMES[when?.day ?? 0]}
                {ct("auto.live.e58d3887c0716716")}
                {to12h(when?.time || "10:00")} · {HQ.city}
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

              {streaming && available.length > 0 ? (
                <VideoPlayer
                  source={liveSource}
                  title={liveName || ct("auto.live.bc108377bb47f9e6")}
                  compact
                  live
                  autoPlay
                />
              ) : !onAirNow ? (
                /* Nobody is broadcasting: the screen says so, and promises what
                   happens next — over the last stream's own still, dimmed. The
                   player opens the service by itself the moment the stream
                   starts (src/lib/livestatus.ts). */
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
              ) : configured ? (
                /* The service is on and the stream has not opened yet — the
                   minutes between the gathering starting and the broadcast
                   appearing: the last stream's own still, dimmed, under the
                   ticking clock that says so (SPEC note 133). */
                <LiveWaiting cover={cover} />
              ) : latest ? (
                /* On air, but the office has pointed the site at nothing at all
                   — no channel, no stream link, no Facebook page. There is no
                   broadcast to promise, so the screen does what it always did:
                   it plays the most recent message and says so (the drawer warns
                   the office about this state). */
                <>
                  <VideoPlayer
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
                {ct("live.where.text", { platforms: available.map((p) => platformLabel(p)).join(" and ") })}
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
          lede={ct("live.replay.lede", { limit: numberWord(limit) })}
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
            lede={ct("live.past.lede", { hours: numberWord(sermonTurnaroundHours()) })}
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
    </>
  );
}
