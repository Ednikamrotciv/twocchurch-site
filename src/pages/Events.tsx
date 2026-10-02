import React, { useMemo, useState } from "react";
import { EVENTS, EVENT_FILTERS, type ChurchEvent } from "../data/content";
import { BRANCHES, branchFlag } from "../data/branches";
import { SITE, img } from "../data/site";
import { photoOr } from "../data/photos";
import { Badge, Btn, Card, Chip, Empty, Icon, Notice, Reveal, Rich, Section, SectionHeading } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { Countdown, EventCard, eventDate, daysUntil, NewsletterForm } from "../components/blocks";
import { fmtDate, addToCalendar, mailto, moneyText, tidyCount, to12h, zonedParts, DAY_SHORT, clockAt } from "../lib/store";
import { useNow } from "../lib/hooks";

export function Events() {
  const [cat, setCat] = useState("all");
  const [branch, setBranch] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const now = useNow(30000);

  const sorted = useMemo(() => [...EVENTS].sort((a, b) => daysUntil(a) - daysUntil(b)), []);
  const featured = sorted.find((e) => e.featured) || sorted[0];
  const filtered = sorted.filter((e) => (cat === "all" || e.category === cat) && (branch === "all" || e.branchId === branch));

  const grouped = useMemo(() => {
    const map = new Map<string, ChurchEvent[]>();
    filtered.forEach((e) => {
      const key = fmtDate(eventDate(e), "month");
      map.set(key, [...(map.get(key) || []), e]);
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <PageHead
        eyebrow={ct("events.head.eyebrow")}
        title={<Rich text={ct("events.head.title")} />}
        lede={ct("events.head.lede")}
        image={img("choir")}
        crumbs={[{ label: ct("auto.events.30ed2e24ef8c5d3d"), to: "/" }, { label: ct("auto.events.07b5a84abdae9e2b") }]}
        actions={
          <>
            <Btn to="/contact" variant="ghost" icon="mail">
              {ct("events.head.action1")}
            </Btn>
            <Btn to="/ministries" icon="people">
              {ct("events.head.action2")}
            </Btn>
          </>
        }
      />

      {featured && (
        <Section className="event-feature">
          <div className="event-feature__grid">
            <div className="event-feature__media">
              <img src={photoOr(featured.image, "welcome")} alt="" />
              <span className="event-feature__tag">
                <Badge accent="crimson" icon="star">{ct("auto.events.46ce311349431e52")}</Badge>
              </span>
            </div>
            <div className="event-feature__body">
              <p className="eyebrow">{tidyCount(ct("events.featured.eyebrow", { days: daysUntil(featured) }))}</p>
              <h2>{featured.title}</h2>
              <p className="lede">{featured.description}</p>
              <ul className="event-feature__facts">
                <li><Icon name="calendar" size={16} /><span>{fmtDate(eventDate(featured), "long")}</span></li>
                <li><Icon name="clock" size={16} /><span>{to12h(clockAt(eventDate(featured)).time)} · {tidyCount(`${Math.round(featured.durationMin / 60)} ${ct("auto.events.7c883d7420442e2d")}`)}</span></li>
                <li><Icon name="pin" size={16} /><span>{featured.location}</span></li>
                <li><Icon name="ticket" size={16} /><span>{moneyText(featured.cost)}</span></li>
              </ul>
              <Countdown target={eventDate(featured).getTime()} />
              <div className="btn-row">
                <Btn
                  icon="calendar"
                  onClick={() => addToCalendar({ title: featured.title, description: featured.description, location: featured.location, start: eventDate(featured), minutes: featured.durationMin })}
                >
                  {ct("auto.events.7712435d13a34bec")}</Btn>
                <Btn variant="crimson" icon="send" href={mailto(SITE.email, ct("auto.events.707447261b0b635f", { "title": featured.title }), ct("auto.events.3a1bf7dbbbf8beaa", { "title": featured.title }))}>
                  {ct("auto.events.844cd44eb112c16f")}</Btn>
                <Btn variant="ghost" to="/locations" query={{ branch: featured.branchId }} icon="compass">
                  {ct("auto.events.9ac9eaed87588674")}</Btn>
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section tone="raised">
        <SectionHeading eyebrow={ct("events.calendar.eyebrow")} title={ct("events.calendar.title")} />
        <div className="filterbar">
          <div className="chips">
            {EVENT_FILTERS.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} count={c.id === "all" ? EVENTS.length : EVENTS.filter((e) => e.category === c.id).length}>
                {c.label}
              </Chip>
            ))}
          </div>
          <div className="filterbar__selects">
            <label className="inline-field">
              <span>{ct("auto.events.3d73d8dd86dabe04")}</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">{ct("auto.events.fee97d4062e98c39")}</option>
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.city}
                  </option>
                ))}
              </select>
            </label>
            <div className="view-toggle">
              <button type="button" className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} aria-label={ct("auto.events.7034df04be2681b5")}>
                <Icon name="grid" size={16} />
              </button>
              <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-label={ct("auto.events.390d39e4f20a8585")}>
                <Icon name="menu" size={16} />
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty
            icon="calendar"
            title={ct("events.empty.title")}
            text={ct("events.empty.text")}
            action={
              <Btn variant="ghost" onClick={() => { setCat("all"); setBranch("all"); }} icon="close">
                {ct("auto.events.413243f94a9728d0")}</Btn>
            }
          />
        ) : view === "grid" ? (
          <div className="grid grid-3">
            {filtered.map((e, i) => (
              <Reveal key={e.id} delay={(i % 3) * 60}>
                <EventCard event={e} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="event-timeline">
            {grouped.map(([month, list]) => (
              <div key={month} className="event-timeline__group">
                <h3 className="event-timeline__month">{month}</h3>
                {list.map((e) => {
                  const d = eventDate(e);
                  const at = clockAt(d);
                  const day = zonedParts(d);
                  const branch = BRANCHES.find((b) => b.id === e.branchId);
                  return (
                    <div className="event-row" key={e.id}>
                      <span className="event-row__date">
                        <b>{day.day}</b>
                        <em>{DAY_SHORT[day.weekday]}</em>
                      </span>
                      <span className="event-row__body">
                        <b>{e.title}</b>
                        <em>
                          {to12h(at.time)} · {e.location} {branch ? `· ${branchFlag(branch)}` : ""}
                        </em>
                        <span className="event-row__desc">{e.description}</span>
                      </span>
                      <span className="event-row__actions">
                        <Badge accent="gold">{daysUntil(e) === 0 ? ct("auto.events.2ecd29a0fde93091") : tidyCount(ct("auto.events.61f7113b9dc4143a", { "v0": daysUntil(e) }))}</Badge>
                        <Btn
                          size="sm"
                          variant="ghost"
                          icon="calendar"
                          onClick={() => addToCalendar({ title: e.title, description: e.description, location: e.location, start: d, minutes: e.durationMin })}
                        >
                          {ct("auto.events.eca9ce36521b255f")}</Btn>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section>
        <SectionHeading center eyebrow={ct("events.news.eyebrow")} title={ct("events.news.title")} lede={ct("events.news.lede")} />
        <div className="newsletter-block">
          <NewsletterForm />
        </div>
        <Notice icon="info">
          <Rich text={ct("events.submit", { email: SITE.email })} />
        </Notice>
      </Section>
    </>
  );
}
