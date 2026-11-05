/* Watch Live — standalone engine.
   The old livestream screen (guest slot, shut latch, override channels,
   designated follows, office-stop rules, ~400 lines of screen state) was
   removed and replaced with the standalone player (watch-live-standalone):
   verify first, autoplay muted, cover lifts only on PLAYING, dead/walled
   fallbacks with repair. The lists below (Recent services, Previous sermons,
   Ways to watch) are unchanged. */

import React, { useEffect, useState } from "react";
import { tx } from "../lib/i18n";
import { Link } from "../lib/router";
import { SITE, SERVICES, img } from "../data/site";
import { LIVE, hiddenReplays, numberWord, pastLimit, recentLimit, sermonTurnaroundHours } from "../data/live";
import { ct } from "../data/copy";
import { BRANCHES, DEFAULT_BRANCH_ID, HQ } from "../data/branches";
import { sermonsNewestFirst, sermonSource, sermonThumb } from "../data/sermons";
import { useLocalState, useNow, fireToast } from "../lib/hooks";
import { KEYS, nextService, onAir, displayLive, to12h, DAY_NAMES, countdownParts, addToCalendar, mailto, clockHere, tidyCount, churchTimezone, visitorPlace, fmtDate, downloadText, serviceNoteKey, type NextServiceInfo } from "../lib/store";
import { parseYoutubeId, platformLabel, watchUrl, youtubeThumb } from "../lib/embed";
import { useLiveStream, liveTarget, facebookTarget } from "../lib/livestatus";
import { useLibrary } from "../lib/collections";
import { useRecentServices, designatedFallback } from "../lib/recentstreams";
import { Badge, Btn, Icon, IconBtn, Modal, Notice, Reveal, Rich, Section, SectionHeading, Textarea } from "../components/ui";
import { PageHead } from "../components/layout";
import { SectionBoundary } from "../components/ErrorBoundary";
import { Countdown, RecentServiceCard, SermonWatch, VideoPlayer, WatchCards, platformWatchLinks } from "../components/blocks";
import { StandaloneLivePlayer } from "../components/standaloneLive";
import { useCmsVersion } from "../lib/cms";

export function WatchLive() {
  const [branchId] = useLocalState<string>(KEYS.branch, DEFAULT_BRANCH_ID);
  const branch = BRANCHES.find((b) => b.id === branchId) || BRANCHES[0];
  const [reminders, setReminders] = useLocalState<Record<string, boolean>>("wom.reminders", {});
  const now = useNow(1000);
  useCmsVersion();
  const info = nextService(SERVICES, now, churchTimezone());
  const when = info ? clockHere(info.slot.time, info.slot.day, churchTimezone()) : null;
  const replays = sermonsNewestFirst();
  const latest = replays[0];

  /* Shared on-air answer (standalone check under the hood). The Watch page
     polls on the short cadence and checks at once on open. */
  const air = useLiveStream(true, false, true);
  const justNow = !!info && (onAir(info) || info.msUntil < 45 * 60 * 1000);

  useEffect(() => {
    try {
      for (const href of ["https://www.youtube.com", "https://s.ytimg.com", "https://i.ytimg.com", "https://noembed.com"]) {
        if (document.querySelector('link[rel="preconnect"][href="' + href + '"]')) continue;
        const l = document.createElement("link");
        l.rel = "preconnect";
        l.href = href;
        l.crossOrigin = "anonymous";
        document.head.appendChild(l);
      }
    } catch { /* preconnect is best-effort */ }
  }, [justNow, air.state]);

  /* The two lists under the screen: recent services + previous sermons. */
  const limit = recentLimit();
  const past = pastLimit();
  const recentStreams = useRecentServices({ soon: justNow, liveNow: air.state === "live" });
  const onScreenId = air.state === "live" ? air.videoId : "";
  const curatedIds = new Set(replays.map((s) => parseYoutubeId(s.youtubeId || "")).filter(Boolean));
  const takenOff = hiddenReplays();
  const recentItems = recentStreams.items
    .filter((it) => it.videoId !== onScreenId && !curatedIds.has(it.videoId) && !takenOff.has(it.videoId))
    .slice(0, limit);
  const recentFallback = recentItems.length
    ? []
    : replays.filter((s) => s.id !== latest?.id && !takenOff.has(parseYoutubeId(s.youtubeId || ""))).slice(0, limit);
  const fallbackIds = new Set(recentFallback.map((s) => s.id));
  const pastCards = replays.filter((s) => s.id !== latest?.id && !fallbackIds.has(s.id)).slice(0, past);
  const platformLinks = platformWatchLinks();

  const bakedLatestThumb = designatedFallback().items[0]?.thumb || "https://i.ytimg.com/vi/dcCt75FMm6o/hqdefault.jpg";
  const cover =
    (air.endedAt && air.videoId && air.platform !== "facebook" ? youtubeThumb(air.videoId) : "") ||
    recentStreams.items[0]?.thumb ||
    bakedLatestThumb ||
    (latest && sermonThumb(latest)) ||
    img("watch-live") ||
    bakedLatestThumb;

  const channel = String(LIVE.youtubeChannel || "@twocorg");
  const explicitId = parseYoutubeId(LIVE.youtubeId || "");
  const configured = !!liveTarget() || !!facebookTarget();
  const onAirNow = displayLive(info) || air.state === "live";
  const liveName = tx(air.title || info?.slot.name || LIVE.liveTitle || "");
  const streamCountdown = info ? countdownParts(info.msUntil) : null;

  const [notesOpen, setNotesOpen] = useState(false);
  const youtubeLink =
    watchUrl({ platform: "youtube", youtubeId: air.videoId }) ||
    (liveTarget()?.url || watchUrl({ platform: "youtube", youtubeId: LIVE.youtubeId }) || liveTarget()?.url || "");

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
          href={mailto(SITE.email, ct("auto.live.88aaa698409beda"), ct("auto.live.899e27b9b2d1e948"))}
        />
      ),
    },
    {
      icon: "heart",
      title: ct("live.side.4.title"),
      text: ct("live.side.4.text"),
      action: (
        <Link className="icon-btn" to="/visit" aria-label={ct("auto.live.3e9b1e2573d72ab")}>
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

      {/* ---- the screen: standalone player, wired to LIVE ---- */}
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
                    {streamCountdown.days > 0 ? tidyCount(ct("auto.live.7bb8b7013c0573", { days: streamCountdown.days })) : ""}
                    {streamCountdown.hours} {ct("auto.live.204d342adf100c7b")}
                  </>
                )}
              </p>
            )}

            <div className="live-panel__frame">
              {configured || explicitId ? (
                <StandaloneLivePlayer
                  channel={channel}
                  youtubeId={explicitId}
                  thumb={cover}
                  title={onAirNow ? liveName : ""}
                />
              ) : latest ? (
                <>
                  <VideoPlayer
                    hideEscape
                    hideDeadText
                    source={sermonSource(latest)}
                    title={ct("auto.live.2af95d5fd1e87dae", { title: latest.title })}
                    poster={sermonThumb(latest) || cover}
                    fallbackPoster={cover}
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

            <div className="btn-row center live-panel__links">
              {onAirNow && (
                <Btn variant="crimson" icon="youtube" href={youtubeLink}>
                  {ct("live.watch.button1")}
                </Btn>
              )}
              {LIVE.facebookUrl && (
                <Btn variant="ghost" icon="facebook" href={LIVE.facebookUrl}>
                  {ct("live.watch.button2")}
                </Btn>
              )}
            </div>

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
                    {reminders[branch.id] ? ct("auto.live.d8c50b559d82c67b") : ct("auto.live.82eb731a67d7c66")}
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
          <SectionBoundary label="last-message">
            <SermonWatch sermon={latest} className="vcard--wide" hideDeadText />
          </SectionBoundary>
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
        <SectionBoundary label="recent-services">
        {recentFallback.length ? (
          <div className="grid grid-2">
            {recentFallback.map((s, i) => (
              <Reveal key={s.id} delay={i * 60}>
                <SermonWatch sermon={s} hideDeadText />
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
        </SectionBoundary>
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
          <SectionBoundary label="past-sermons">
          <div className="grid grid-3">
            {pastCards.map((s, i) => (
              <Reveal key={s.id} delay={(i % 3) * 60}>
                <SermonWatch sermon={s} hideDeadText />
              </Reveal>
            ))}
          </div>
          </SectionBoundary>
        </Section>
      )}

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("live.ways.eyebrow")} title={ct("live.ways.title")} />
        <SectionBoundary label="ways-to-watch">
          <WatchCards />
        </SectionBoundary>
      </Section>

      {notesOpen && <ServiceNotesModal info={info} onClose={() => setNotesOpen(false)} />}
    </>
  );
}

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
          {text.length} {ct("auto.sermon.475e8e913b769d00")}</span>
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

function whenOf(info: NextServiceInfo) {
  return clockHere(info.slot.time, info.slot.day, churchTimezone());
}
