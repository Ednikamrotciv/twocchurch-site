import React, { useState } from "react";
import { tx } from "../lib/i18n";
import { SITE, VALUES, BELIEFS, TIMELINE, LEADERSHIP, FAQS, MINISTRIES, img } from "../data/site";
import { BRANCHES, branchFlag } from "../data/branches";
import { Badge, Btn, Card, Eyebrow, Icon, Reveal, Rich, Section, SectionHeading, Accordion, Tiles } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { StatStrip } from "../components/blocks";
import { Link } from "../lib/router";

export function About() {
  const [tab, setTab] = useState<"story" | "beliefs" | "leadership">("story");

  return (
    <>
      <PageHead
        eyebrow={ct("about.head.eyebrow")}
        title={<Rich text={ct("about.head.title")} />}
        lede={ct("about.head.lede", { church: SITE.name })}
        image={img("building2")}
        crumbs={[{ label: ct("auto.about.ce37ee568aef40b7"), to: "/" }, { label: ct("auto.about.8d235efedb6f6fc7") }]}
        actions={
          <>
            <Btn to="/visit" icon="ticket">
              {ct("auto.about.99092a0a8ea3d4ab")}</Btn>
            <Btn to="/contact" variant="ghost" icon="mail">
              {ct("auto.about.d80141b421831af5")}</Btn>
          </>
        }
      />

      <Section>
        <div className="grid grid-3 mission-grid">
          <Reveal>
            <Card className="mission-card">
              <span className="mission-card__icon"><Icon name="cross" size={24} /></span>
              <h3>{ct("about.mission.title")}</h3>
              <p>{tx(SITE.mission)}</p>
            </Card>
          </Reveal>
          <Reveal delay={70}>
            <Card className="mission-card">
              <span className="mission-card__icon"><Icon name="globe" size={24} /></span>
              <h3>{ct("about.vision.title")}</h3>
              <p>{tx(SITE.vision)}</p>
            </Card>
          </Reveal>
          <Reveal delay={140}>
            <Card className="mission-card">
              <span className="mission-card__icon"><Icon name="prayer" size={24} /></span>
              <h3>{ct("about.anchor.title")}</h3>
              <p>“{tx(SITE.verse.text)}”</p>
              <cite>{SITE.verse.ref}</cite>
            </Card>
          </Reveal>
        </div>
        <p className="lede center mt-3">
          <Rich text={ct("about.pledge")} />
        </p>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("about.values.eyebrow")} title={ct("about.values.title")} />
        <Tiles items={VALUES} />
      </Section>

      <Section>
        <SectionHeading center eyebrow={ct("about.story.eyebrow")} title={ct("about.story.title")} lede={ct("about.story.lede")} />
        <ol className="timeline">
          {TIMELINE.map((t, i) => (
            <li key={t.year} className="timeline__item">
              <span className="timeline__dot" aria-hidden="true" />
              <span className="timeline__year">{t.year}</span>
              <div className="timeline__body">
                <h3>{tx(t.title)}</h3>
                <p>{tx(t.text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="light">
        <SectionHeading
          center
          eyebrow={ct("about.beliefs.eyebrow")}
          title={ct("about.beliefs.title")}
          lede={ct("about.beliefs.lede")}
        />
        <div className="beliefs-grid">
          {BELIEFS.map((b, i) => (
            <Reveal key={b.title} delay={i * 40}>
              <Card className="belief-card">
                <Badge accent="gold">{b.verse}</Badge>
                <h3>{tx(b.title)}</h3>
                <p>{tx(b.text)}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow={ct("about.leaders.eyebrow")}
          title={ct("about.leaders.title")}
          lede={ct("about.leaders.lede")}
          actions={
            <Btn to="/contact" variant="ghost" icon="mail">
              {ct("about.leaders.action")}
            </Btn>
          }
        />
        <div className="grid grid-4">
          {LEADERSHIP.map((p, i) => (
            <Reveal key={p.id} delay={i * 50}>
              <PersonCardLite person={p} />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="raised">
        <div className="stat-block">
          <SectionHeading center eyebrow={ct("about.numbers.eyebrow")} title={ct("about.numbers.title")} />
          <StatStrip />
        </div>
        <div className="grid grid-4 mt-3">
          {BRANCHES.map((b) => (
            <Link to="/locations" query={{ branch: b.id }} key={b.id} className="mini-branch">
              <span>{branchFlag(b)}</span>
              <b>{b.city}</b>
            </Link>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading center eyebrow={ct("about.faq.eyebrow")} title={ct("about.faq.title")} />
        <div className="narrow">
          <Accordion items={FAQS.map((f) => ({ q: tx(f.q), a: tx(f.a) }))} defaultOpen={0} />
        </div>
        <div className="center mt-3">
          <Btn to="/contact" variant="ghost" icon="send">
            {ct("about.faq.action")}
          </Btn>
        </div>
      </Section>
    </>
  );
}

function PersonCardLite({ person }: { person: (typeof LEADERSHIP)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card pad={false} className="person-card" hover>
      <div className="person-card__photo">
        {person.image ? (
          <img src={person.image} alt={person.name} loading="lazy" />
        ) : (
          <span className="person-card__mono">
            <span className="monogram monogram--gold" style={{ width: 96, height: 96, fontSize: 34 }}>
              {person.monogram}
            </span>
          </span>
        )}
      </div>
      <div className="person-card__body">
        <h3>{person.name}</h3>
        <p className="person-card__role">{tx(person.role)}</p>
        <p className="person-card__bio">{tx(open ? person.bio : person.bio.slice(0, 84) + "…")}</p>
        {open && person.verse && <blockquote className="person-card__verse">{tx(person.verse)}</blockquote>}
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
          {open ? ct("auto.about.c45ab7af05f750ce") : ct("about.readBio")} <Icon name={open ? "chevronDown" : "arrowRight"} size={14} />
        </button>
      </div>
    </Card>
  );
}
