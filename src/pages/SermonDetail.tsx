import React, { useState } from "react";
import { useRoute, Link, navigate } from "../lib/router";
import { sermonById, sermonDate, sermonsNewestFirst, sermonSource, sermonWatchUrl } from "../data/sermons";
import { ct } from "../data/copy";
import { platformLabel } from "../lib/embed";
import { useLocalState, fireToast } from "../lib/hooks";
import { KEYS, downloadText, fmtDate, fmtDuration, parseDuration, addToCalendar } from "../lib/store";
import { useLibrary } from "../lib/collections";
import { Btn, Card, Icon, IconBtn, Reveal, Rich, Section, SectionHeading, ShareRow, TagList, Textarea, Notice } from "../components/ui";
import { VideoPlayer, SermonWatch } from "../components/blocks";
import { Breadcrumbs } from "../components/ui";
import { NotFound } from "./NotFound";

/* Which platform a message lives on, and the icon that stands for it. */
export function sermonPlatform(platform?: string): "youtube" | "facebook" | "upload" {
  return platform === "facebook" ? "facebook" : platform === "upload" ? "upload" : "youtube";
}

export function sermonPlatformIcon(platform?: string): string {
  const kind = sermonPlatform(platform);
  return kind === "facebook" ? "facebook" : kind === "upload" ? "play" : "youtube";
}

export function SermonDetail() {
  const { path } = useRoute();
  const id = decodeURIComponent(path.split("/")[2] || "");
  const sermon = sermonById(id);
  const { saved, watched, notes, toggleSaved, markWatched, setNote } = useLibrary();
  const [tab, setTab] = useState<"notes" | "discussion" | "transcript">("notes");

  /* The whole archive, newest first — walked by the pager and the foot cards. */
  const ordered = sermonsNewestFirst();
  const idx = sermon ? ordered.findIndex((s) => s.id === sermon.id) : -1;
  const prev = idx >= 0 ? ordered[idx + 1] : undefined;
  const next = idx > 0 ? ordered[idx - 1] : undefined;
  const previousSermons = sermon ? ordered.filter((s) => s.id !== sermon.id).slice(0, 3) : [];

  if (!sermon) return <NotFound />;

  const isSaved = saved.includes(sermon.id);
  const isWatched = watched.includes(sermon.id);
  const date = sermonDate(sermon);
  const minutes = parseDuration(sermon.durationText);

  const outline = [
    `${sermon.title}`,
    `${sermon.speaker}${sermon.speakerRole ? ` — ${sermon.speakerRole}` : ""}`,
    `Preached ${fmtDate(date, "long")}${sermon.scripture ? ` · ${sermon.scripture}` : ""}`,
    "",
    ...(sermon.summary ? [ct("auto.sermon.0355b78f49f341e6"), sermon.summary, ""] : []),
    ...(sermon.points.length ? [ct("auto.sermon.c93f82d73d378fbe"), ...sermon.points.map((p, i) => `${i + 1}. ${p}`), ""] : []),
    ...(sermon.questions.length
      ? [ct("auto.sermon.95a2d90e3fe12937"), ...sermon.questions.map((q, i) => `${i + 1}. ${q}`), ""]
      : []),
    ct("auto.sermon.98c6c3bb89ddea4a", { "v0": sermonWatchUrl(sermon) }),
    "",
    ct("auto.sermon.c76b5c607af8c131"),
    notes[sermon.id] || "",
  ].join("\n");

  return (
    <>
      <section className="sermon-detail-head">
        <div className="container">
          <Breadcrumbs items={[{ label: ct("auto.sermon.823b39145f302775"), to: "/" }, { label: ct("auto.sermon.a6363cbc677c349d"), to: "/sermons" }, { label: sermon.title }]} />
          <div className="sermon-detail-head__grid">
            <div>
              <h1>{sermon.title}</h1>
              <p className="sermon-detail-head__meta">
                <span><Icon name="user" size={15} /> {sermon.speaker}</span>
                <span><Icon name="calendar" size={15} /> {fmtDate(date, "long")}</span>
                {minutes > 0 && <span><Icon name="clock" size={15} /> {fmtDuration(minutes)}</span>}
                {sermon.scripture && <span><Icon name="book" size={15} /> {sermon.scripture}</span>}
                {sermon.venue && <span><Icon name="pin" size={15} /> {sermon.venue}</span>}
                {sermon.fromLive && (
                  <span className="sermon-detail-head__tag"><Icon name="live" size={15} /> {ct("live.past.badge")}</span>
                )}
              </p>
              <div className="btn-row">
                <Btn onClick={() => { toggleSaved(sermon.id); fireToast(isSaved ? ct("auto.sermon.0f362bf75d8cb2b6") : ct("auto.sermon.a3b0fccb23cbabe2"), "success"); }} variant={isSaved ? "quiet" : "ghost"} size="sm" icon="bookmark">
                  {isSaved ? ct("auto.sermon.33e8112e56a3821f") : ct("auto.sermon.561b0d2a96900813")}
                </Btn>
                <Btn onClick={() => { markWatched(sermon.id); fireToast(ct("auto.sermon.5b65851557d95354"), "success"); }} variant={isWatched ? "quiet" : "ghost"} size="sm" icon="check">
                  {isWatched ? ct("auto.sermon.3adf4aa5a77632dc") : ct("auto.sermon.dd9cf8fca70a7f35")}
                </Btn>
                <Btn size="sm" variant="ghost" icon="download" onClick={() => downloadText(`${sermon.id}-outline.txt`, outline)}>
                  {ct("auto.sermon.1a0cc08ff3609cee")}</Btn>
                <Btn size="sm" variant="ghost" icon="calendar" onClick={() => addToCalendar({ title: ct("auto.sermon.648d4979a7fd1840", { "title": sermon.title }), description: sermon.summary, location: sermon.venue, start: date, minutes })}>
                  {ct("auto.sermon.79834a15c3e7147c")}</Btn>
              </div>
            </div>
            <div className="sermon-detail-head__player">
              <VideoPlayer source={sermonSource(sermon)} title={sermon.title} onPlay={() => markWatched(sermon.id)} compact />
            </div>
          </div>
        </div>
      </section>

      <Section>
        <div className="sermon-detail-grid">
          <div className="sermon-detail__main">
            <ShareRow title={sermon.title} path={`/sermons/${sermon.id}`} text={sermon.summary} />

            <div className="sermon-summary">
              <h2>{ct("sermon.about.title")}</h2>
              {sermon.summary ? (
                <p className="lede">{sermon.summary}</p>
              ) : (
                <p className="lede muted">
                  {ct("auto.sermon.1dd7203c8cd5c18d")}</p>
              )}
              <TagList tags={sermon.tags} />
            </div>

            <div className="sermon-tabs">
              <div className="tabs" role="tablist">
                {[
                  { id: "notes", label: ct("auto.sermon.2eb12a2e3bed3107") },
                  { id: "discussion", label: ct("auto.sermon.3affa8727d3eb8ab") },
                  { id: "transcript", label: ct("auto.sermon.e7b6175d3f2969ec") },
                ].map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} className={"tab" + (tab === t.id ? " tab--active" : "")} onClick={() => setTab(t.id as any)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "notes" && (
                <div className="sermon-notes">
                  <h3>{ct("sermon.points.title")}</h3>
                  {sermon.points.length > 0 ? (
                    <ol className="numbered">
                      {sermon.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ol>
                  ) : (
                    <Notice icon="info">
                      {ct("auto.sermon.a2241865082286b4")}</Notice>
                  )}
                  {sermon.scripture && (
                    <>
                      <h3>{ct("sermon.scripture.title")}</h3>
                      <p className="scripture-line">
                        <Icon name="book" size={16} /> {sermon.scripture}
                      </p>
                    </>
                  )}
                  <h3>{ct("sermon.notes.title")}</h3>
                  <Textarea
                    rows={6}
                    value={notes[sermon.id] || ""}
                    onChange={(e) => setNote(sermon.id, e.target.value)}
                    placeholder={ct("sermon.notes.placeholder")}
                  />
                  <p className="field__hint">
                    {(notes[sermon.id] || "").length} {ct("auto.sermon.475e8e013b769d00")}</p>
                  {(notes[sermon.id] || "").length > 0 && (
                    <Btn size="sm" variant="quiet" icon="download" onClick={() => downloadText(`${sermon.id}-my-notes.txt`, notes[sermon.id])}>
                      {ct("auto.sermon.9ab675167bb6107f")}</Btn>
                  )}
                </div>
              )}

              {tab === "discussion" && (
                <div className="sermon-notes">
                  <h3>{ct("sermon.questions.title")}</h3>
                  {sermon.questions.length > 0 ? (
                    <ol className="numbered">
                      {sermon.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                  ) : (
                    <Notice icon="info">
                      {ct("auto.sermon.f3e059e28b999f33")}</Notice>
                  )}
                  <Notice icon="people">
                    {ct("sermon.outline.note")} {ct("auto.sermon.86b7105edd54b4c7")}<Link to="/locations">{ct("auto.sermon.83f955af463a3d36")}</Link>.
                  </Notice>
                </div>
              )}

              {tab === "transcript" && (
                <div className="sermon-notes">
                  <h3>{ct("sermon.platforms.title")}</h3>
                  <ul className="tick-list">
                    <li>
                      <Icon name={sermonPlatformIcon(sermon.platform)} size={18} />
                      <span>
                        <b>{platformLabel(sermonPlatform(sermon.platform))}</b>
                        <em>{sermon.platform === "facebook" ? ct("auto.sermon.0f9e079b35430e0a") : sermon.platform === "upload" ? ct("auto.sermon.ac810e0b2e71b40a") : ct("auto.sermon.3be92c711c935268")}</em>
                      </span>
                      <Btn size="sm" variant="ghost" href={sermonWatchUrl(sermon)} iconRight="external">
                        {ct("auto.sermon.0c09afb94a053898")}</Btn>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          <aside className="sermon-detail__side">
            <Card className="side-nav">
              {prev && (
                <button type="button" className="side-nav__btn" onClick={() => { navigate(`/sermons/${prev.id}`); window.scrollTo({ top: 0 }); }}>
                  <Icon name="chevronLeft" size={16} />
                  <span><em>{ct("auto.sermon.2c8560c8d5d45089")}</em><b>{prev.title}</b></span>
                </button>
              )}
              <Btn className="side-nav__mid" to="/sermons" size="sm" variant="ghost" iconRight="arrowRight">
                {ct("auto.sermon.3cc71a29b2a2c648")}</Btn>
              {next && (
                <button type="button" className="side-nav__btn side-nav__btn--right" onClick={() => { navigate(`/sermons/${next.id}`); window.scrollTo({ top: 0 }); }}>
                  <span><em>{ct("auto.sermon.b78ac2604966af29")}</em><b>{next.title}</b></span>
                  <Icon name="chevronRight" size={16} />
                </button>
              )}
            </Card>
          </aside>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("sermon.archive.eyebrow")} title={ct("sermon.archive.title")} />
        <div className="grid grid-2">
          {previousSermons.map((s, i) => (
            <Reveal key={s.id} delay={i * 60}>
              <SermonWatch sermon={s} />
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}
