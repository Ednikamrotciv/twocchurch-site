import React, { useState } from "react";
import { Link } from "../lib/router";
import { tx } from "../lib/i18n";
import { useNow, useToasts } from "../lib/hooks";
import { nextService, displayLive, countdownParts, to12h, DAY_NAMES, fmtDate, zoneYear, clockHere, churchTimezone, visitorPlace } from "../lib/store";
import { SITE, SERVICES, VALUES, MINISTRIES, img } from "../data/site";
import { BRANCHES, HQ, branchFlag, branchZone } from "../data/branches";
import { sermonsNewestFirst, sermonDate } from "../data/sermons";
import { EVENTS } from "../data/content";
import { Badge, Btn, Card, Eyebrow, Icon, Reveal, Rich, Section, SectionHeading, Monogram } from "../components/ui";
import { ct } from "../data/copy";
import { EventCard, GivingCTA, MinistryCard, NextServiceCard, SermonCard, TestimonyCard, VerseOfDay, eventDate, daysUntil } from "../components/blocks";
import { AnnouncementSlides } from "../components/slides";
import { useTestimonies } from "../lib/collections";
import { fireToast } from "../lib/hooks";
import { mailto } from "../lib/store";

export function Home() {
  const now = useNow(1000);
  /* The office's Weekly services card, read on the church's own clock. */
  const info = nextService(SERVICES, now, churchTimezone());
  /* When that gathering happens, read on the visitor's own clock (note 85). */
  const when = info ? clockHere(info.slot.time, info.slot.day, churchTimezone()) : null;
  const latest = sermonsNewestFirst();
  const featured = latest[0];
  const { all: testimonies, amen } = useTestimonies();
  const upcoming = [...EVENTS].sort((a, b) => daysUntil(a) - daysUntil(b)).slice(0, 3);

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="hero">
        <div className="hero__bg" aria-hidden="true">
          <img className="hero__photo" src={img("hero")} alt="" />
          {/* Phones get the office's own verse graphic instead of the banner. */}
          <img className="hero__mobile" src={img("hero-mobile")} alt="" />
          <span className="hero__scrim" />
          <img className="hero__faint" src={img("hero-faint")} alt="" />
          <span className="hero__glow" />
          <span className="hero__grain" />
        </div>
        <div className="container hero__inner">
          <Reveal delay={60}>
            <p className="eyebrow hero__eyebrow">{SITE.name}</p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="hero__title">
              <Rich text={ct("home.hero.title")} />
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="hero__lede">{ct("home.hero.lede")}</p>
          </Reveal>
          <Reveal delay={240} className="hero__cta">
            <Btn to="/sermons" size="lg" icon="play">
              {ct("home.hero.cta1")}
            </Btn>
            <Btn to="/locations" size="lg" variant="ghost" icon="compass">
              {ct("home.hero.cta2")}
            </Btn>
            <Btn to="/prayer" size="lg" variant="crimson" icon="prayer">
              {ct("home.hero.cta3")}
            </Btn>
            <Btn to="/testimonies" query={{ share: 1 }} size="lg" variant="quiet" icon="quote">
              {ct("home.hero.cta4")}
            </Btn>
          </Reveal>
          <Reveal delay={300} className="hero__meta">
            {displayLive(info) ? (
              <span className="hero__live">
                <span className="live-dot" />{" "}
                {/* The office's switch can put us on air with no gathering to
                    name, so the badge then stands alone rather than carrying a
                    trailing separator into an empty name. */}
                {info?.isLive ? (
                  <>
                    {ct("auto.home.caff7790d4063599")}
                    {tx(info.slot.name)}
                  </>
                ) : (
                  ct("auto.site.96c2adc6bda4059f")
                )}
              </span>
            ) : (
              info && (
                <span className="hero__next">
                  <Icon name="clock" size={15} />
                  {ct("auto.home.7af560c8a7a14349")}<b>{tx(info.slot.name)}</b> {when ? tx(DAY_NAMES[when.day]) : ""} {when ? to12h(when.time) : ""} {ct("auto.home.f8b81a4278b923bb")}{(visitorPlace() || HQ.city).split(",")[0]}{" "}
                  <em>
                    {ct("auto.home.8ded8fa080b51139")}{countdownParts(info.msUntil).days}{ct("auto.home.d2448217aa4f6a76")}{countdownParts(info.msUntil).hours}{ct("auto.home.a75c1e7b9034d2aa")}{countdownParts(info.msUntil).minutes}{ct("auto.home.c009d7385019ed69")}</em>
                </span>
              )
            )}
            <Link to="/watch-live" className="hero__link">
              {ct("home.hero.stream")} <Icon name="arrowRight" size={14} />
            </Link>
          </Reveal>
        </div>
        <div className="hero__verse" aria-hidden="true">
          <span>“{tx(SITE.verse.text)}” — {SITE.verse.ref}</span>
        </div>
      </section>

      {/* ---------------- welcome / mission ---------------- */}
      <Section className="split">
        <figure className="split__figure">
          <div className="split__media">
            {/* The welcome box is the announcement slide space: the office's
                pictures, each composed into a designed slide of its own (SPEC
                note 116). With nothing posted it shows the welcome photo,
                exactly as it did before. */}
            <AnnouncementSlides />
          </div>
          {/* The years-of-ministry count used to be a chip floating on the
              picture. The picture is a designed poster now, and a chip laid
              over it sat on top of the poster's own words, so it is the
              poster's caption (SPEC note 116). */}
          <figcaption className="split__badge">
            <b>{zoneYear() - SITE.founded}</b>
            <em>{ct("home.welcome.badge")}</em>
          </figcaption>
        </figure>
        <div className="split__body">
          <Eyebrow>{ct("home.welcome.eyebrow")}</Eyebrow>
          <h2>{ct("home.welcome.title")}</h2>
          <p className="lede">{ct("home.welcome.lede", { church: SITE.name })}</p>
          <ul className="tick-list">
            {VALUES.slice(0, 5).map((v) => (
              <li key={v.title}>
                <Icon name={v.icon} size={18} />
                <span>
                  <b>{tx(v.title)}</b>
                  <em>{tx(v.text)}</em>
                </span>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <Btn to="/about" icon="arrowRight">
              {ct("home.welcome.cta1")}
            </Btn>
            <Btn to="/ministries" variant="ghost" icon="people">
              {ct("home.welcome.cta2")}
            </Btn>
          </div>
        </div>
      </Section>

      {/* ---------------- next service + verse ---------------- */}
      <Section tone="raised" className="home-next">
        <div className="home-next__grid">
          <Reveal>
            <NextServiceCard />
          </Reveal>
          <Reveal delay={80}>
            <VerseOfDay />
          </Reveal>
        </div>
      </Section>

      {/* ---------------- latest sermon ---------------- */}
      <Section>
        <SectionHeading
          eyebrow={ct("home.sermons.eyebrow")}
          title={ct("home.sermons.title")}
          lede={ct("home.sermons.lede")}
          actions={
            <Btn to="/sermons" variant="ghost" iconRight="arrowRight">
              {ct("home.sermons.action")}
            </Btn>
          }
        />
        {featured && (
          <div className="home-feature">
            <SermonCard sermon={featured} layout="feature" />
            <div className="home-feature__list">
              {latest.slice(1, 4).map((s) => (
                <SermonCard key={s.id} sermon={s} layout="row" />
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ---------------- testimonies ---------------- */}
      <Section>
        <SectionHeading
          eyebrow={ct("home.testimonies.eyebrow")}
          title={ct("home.testimonies.title")}
          lede={ct("home.testimonies.lede")}
          actions={
            <Btn to="/testimonies" query={{ share: 1 }} variant="crimson" icon="quote">
              {ct("home.testimonies.action")}
            </Btn>
          }
        />
        <div className="grid grid-3">
          {testimonies.slice(0, 3).map((t, i) => (
            <Reveal key={t.id} delay={i * 70}>
              <TestimonyCard testimony={t} onAmen={() => amen(t.id)} />
            </Reveal>
          ))}
        </div>
        <div className="center mt-3">
          <Btn to="/testimonies" variant="ghost" iconRight="arrowRight">
            {ct("auto.home.d0a3a00cf7452d25")}{testimonies.length} {ct("auto.home.b97672eba3f40f12")}</Btn>
        </div>
      </Section>

      {/* ---------------- events ---------------- */}
      <Section tone="raised">
        <SectionHeading
          eyebrow={ct("home.events.eyebrow")}
          title={ct("home.events.title")}
          actions={
            <Btn to="/events" variant="ghost" iconRight="arrowRight">
              {ct("home.events.action")}
            </Btn>
          }
        />
        <div className="grid grid-3">
          {upcoming.map((e, i) => (
            <Reveal key={e.id} delay={i * 70}>
              <EventCard event={e} />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------------- branches ---------------- */}
      <Section className="home-branches">
        <SectionHeading
          eyebrow={ct("home.branches.eyebrow")}
          title={ct("home.branches.title")}
          lede={ct("home.branches.lede")}
          actions={
            <Btn to="/locations" icon="compass">
              {ct("home.branches.action")}
            </Btn>
          }
        />
        <div className="branch-strip">
          {BRANCHES.map((b) => {
            const c = clockHere(b.schedule[0].time, b.schedule[0].day, branchZone(b));
            return (
              <Link key={b.id} to="/locations" query={{ branch: b.id }} className="branch-chip">
                <span className="branch-chip__flag">{branchFlag(b)}</span>
                <span className="branch-chip__body">
                  <b>{b.city}</b>
                  <em>
                    {tx(DAY_NAMES[c.day])} {to12h(c.time)}
                  </em>
                </span>
                <Icon name="chevronRight" size={15} />
              </Link>
            );
          })}
        </div>
      </Section>

      {/* ---------------- ministries ---------------- */}
      <Section tone="light">
        <SectionHeading
          center
          eyebrow={ct("home.ministries.eyebrow")}
          title={ct("home.ministries.title")}
          lede={ct("home.ministries.lede")}
        />
        <div className="grid grid-3">
          {MINISTRIES.slice(0, 6).map((m, i) => (
            <Reveal key={m.id} delay={i * 60}>
              <MinistryCard ministry={m} onJoin={() => (window.location.href = mailto(SITE.email, ct("auto.home.73a8166fb6a12bc6", { "name": m.name }), ct("auto.home.0ff58e93c1bc7492", { "name": m.name })))} />
            </Reveal>
          ))}
        </div>
        <div className="center mt-3">
          <Btn to="/ministries" variant="quiet" iconRight="arrowRight">
            {ct("auto.home.fbd5dd4bffee1afa")}{MINISTRIES.length} {ct("auto.home.2617b23455be3e8d")}</Btn>
        </div>
      </Section>

      <GivingCTA />
    </>
  );
}
