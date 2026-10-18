import React, { useState } from "react";
import { tx } from "../lib/i18n";
import { Link } from "../lib/router";
import { MEMORY_VERSES, PRAYER_FOCUS, READING_PLAN, SCRIPTURES } from "../data/content";
import { img, SITE } from "../data/site";
import { useReadingPlan } from "../lib/collections";
import { useLocalState, fireToast } from "../lib/hooks";
import { KEYS, pickForDay, copyText, whatsappLink, downloadText, fmtDate, todayKey } from "../lib/store";
import { Badge, Btn, Card, Checkbox, Eyebrow, Icon, Progress, Reveal, Rich, Section, SectionHeading, ShareRow } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { VerseOfDay } from "../components/blocks";

export function Devotional() {
  const verse = pickForDay(SCRIPTURES, "votd");
  const plan = useReadingPlan();
  const [memorised, setMemorised] = useLocalState<string[]>("wom.memorised", []);
  /* The key is a plain calendar date, never a formatted one — a formatted date
     moves with the visitor's chosen language and would orphan the saved text. */
  const [reflection, setReflection] = useLocalState<string>("wom.reflection." + todayKey(), "");
  const [focusIdx, setFocusIdx] = useState(0);

  const doneCount = READING_PLAN.filter((d) => plan.done.includes(d.day)).length;
  const weekProgress = Math.round((doneCount / READING_PLAN.length) * 100);

  return (
    <>
      <PageHead
        eyebrow={ct("devotional.head.eyebrow")}
        title={<Rich text={ct("devotional.head.title")} />}
        lede={ct("devotional.head.lede")}
        image={img("bible")}
        crumbs={[{ label: ct("auto.devotional.37a970f2b73c673b"), to: "/" }, { label: ct("auto.devotional.c7cf3f7e79eecc37") }]}
        actions={
          <>
            <Btn icon="book" onClick={() => document.getElementById("reading-plan")?.scrollIntoView({ behavior: "smooth" })}>
              {ct("auto.devotional.940501507dd5e3d1")}</Btn>
            <Btn variant="ghost" icon="play" to="/sermons">
              {ct("auto.devotional.8dd6f5c792370aae")}</Btn>
          </>
        }
      />

      <Section>
        <div className="devotional-grid">
          <div className="devotional-main">
            <Card className="devotion-today">
              <Eyebrow>{fmtDate(new Date(), "long")}</Eyebrow>
              <blockquote className="devotion-today__verse">“{tx(verse.text)}”</blockquote>
              <cite>{verse.ref}</cite>
              <p className="muted">{ct("devotional.reflect.text")}</p>
              <div className="btn-row">
                <Btn size="sm" variant="ghost" icon="copy" onClick={() => copyText(`"${tx(verse.text)}" — ${verse.ref}`, ct("auto.devotional.20cc69da3c351693"))}>
                  {ct("auto.devotional.9aaef367b783a36e")}</Btn>
                <Btn size="sm" variant="ghost" icon="whatsapp" href={whatsappLink(`"${tx(verse.text)}" — ${verse.ref}`)}>
                  {ct("auto.devotional.c7b81a2e44ca0d37")}</Btn>
                <Btn size="sm" variant="quiet" icon="download" onClick={() => downloadText("today-reflection.txt", `${fmtDate(new Date(), "long")}\n\n"${verse.text}" — ${verse.ref}\n\nREFLECTION\n${reflection}\n`)}>
                  {ct("auto.devotional.2fff9550a9658bf1")}</Btn>
              </div>
            </Card>

            <Card className="reflection">
              <h3>{ct("devotional.reflect.title")}</h3>
              <p className="muted">{ct("devotional.reflect.note")}</p>
              <textarea
                className="textarea"
                rows={6}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder={ct("auto.devotional.5a9f3257a076ff36")}
              />
              <p className="field__hint">{reflection.length} {ct("auto.devotional.feb38ba1ed05b040")}</p>
            </Card>

            <div id="reading-plan">
              <Card className="reading-plan">
                <div className="reading-plan__head">
                  <div>
                    <h3>{ct("devotional.read.title")}</h3>
                    <p className="muted">{ct("devotional.read.note")}</p>
                  </div>
                  <div className="reading-plan__ring">
                    <span>{weekProgress}%</span>
                    <em>{doneCount}/{READING_PLAN.length} {ct("auto.devotional.ed43b0501a769ad9")}</em>
                  </div>
                </div>
                <Progress value={weekProgress} />
                <ul className="reading-list">
                  {READING_PLAN.map((d) => {
                    const isDone = plan.done.includes(d.day);
                    return (
                      <li key={d.day} className={isDone ? "is-done" : ""}>
                        <Checkbox checked={isDone} onChange={() => plan.toggle(d.day)} label={<b>{d.day}</b>} />
                        <span className="reading-list__ref">{d.reference}</span>
                        <span className="reading-list__theme">{tx(d.theme)}</span>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setFocusIdx((i) => i + 1);
                            fireToast(ct("auto.devotional.0d164d75055219b4"), "info");
                          }}
                        >
                          <Icon name="book" size={14} /> {ct("auto.devotional.198295eb6ab1aa3a")}</button>
                      </li>
                    );
                  })}
                </ul>
                {doneCount === READING_PLAN.length && (
                  <div className="reading-complete">
                    <Icon name="check" size={18} /> {ct("auto.devotional.8ce51afc369767c5")}</div>
                )}
                <div className="btn-row">
                  <Btn size="sm" variant="ghost" icon="download" onClick={() => downloadText("reading-plan.txt", READING_PLAN.map((d) => `${d.day} — ${d.reference} (${d.theme}) ${plan.done.includes(d.day) ? "✔" : ""}`).join("\n"))}>
                    {ct("auto.devotional.75d674ec7d1f1f0d")}</Btn>
                  <Btn size="sm" variant="quiet" icon="trash" onClick={() => { plan.clear(); fireToast(ct("auto.devotional.c2f9cffb9742386a"), "success"); }}>
                    {ct("auto.devotional.9a23662d92e20a5c")}</Btn>
                </div>
              </Card>
            </div>

            <Card className="memory">
              <h3>{ct("devotional.memory.title")}</h3>
              <p className="muted">{ct("devotional.memory.note")}</p>
              <ul className="memory-list">
                {MEMORY_VERSES.map((m) => {
                  const known = memorised.includes(m.ref);
                  return (
                    <li key={m.ref} className={known ? "is-done" : ""}>
                      <b>{m.ref}</b>
                      <span>“{tx(m.text)}”</span>
                      <Btn size="sm" variant={known ? "quiet" : "ghost"} icon={known ? "check" : "bookmark"} onClick={() => setMemorised((l) => (known ? l.filter((x) => x !== m.ref) : [...l, m.ref]))}>
                        {known ? ct("auto.devotional.c5c0367a086d50cb") : ct("auto.devotional.b60fe1a3568321ba")}
                      </Btn>
                    </li>
                  );
                })}
              </ul>
              <Progress value={memorised.length} max={MEMORY_VERSES.length} />
              <p className="field__hint">{memorised.length} {ct("auto.devotional.7ef64d56bb83e717")}{MEMORY_VERSES.length} {ct("auto.devotional.fae60cb529785d14")}</p>
            </Card>
          </div>

          <aside className="devotional-side">
            <VerseOfDay compact />
            <Card className="side-cta">
              <Icon name="fire" size={22} />
              <h3>{ct("devotional.focus.title")}</h3>
              <p>{tx(pickForDay(PRAYER_FOCUS, "focus2")?.text || "")}</p>
              <Btn size="sm" variant="ghost" block to="/prayer" icon="prayer">
                {ct("auto.devotional.eb08149e1a343bb7")}</Btn>
            </Card>
            <Card>
              <h3>{ct("devotional.streak.title")}</h3>
              <p className="muted">
                {ct("auto.devotional.99c040c7b64d3c16")}<b>{doneCount}</b> {ct("auto.devotional.595ac03532c205c4")}<b>{memorised.length}</b> {ct("auto.devotional.c400629103d03410")}{ct("devotional.streak.text")}
              </p>
              <ShareRow title={ct("auto.devotional.56922750d86c6cd9")} path="/devotional" text={verse.text} />
            </Card>
            <Card>
              <h3>{ct("devotional.deeper.title")}</h3>
              <ul className="side-list">
                <li>
                  <Link to="/sermons">
                    <b>{ct("auto.devotional.d877bb2b38aa24f2")}</b>
                    <em>{ct("auto.devotional.711cf6e6c3688f27")}</em>
                  </Link>
                </li>
                <li>
                  <Link to="/watch-live">
                    <b>{ct("auto.devotional.7410971c7d478615")}</b>
                    <em>{ct("auto.devotional.79538f42d7fcd363")}</em>
                  </Link>
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("devotional.mail.eyebrow")} title={ct("devotional.mail.title")} lede={ct("devotional.mail.lede", { church: SITE.short })} />
        <div className="newsletter-block">
          <NewsletterInline />
        </div>
      </Section>
    </>
  );
}

function NewsletterInline() {
  const [email, setEmail] = useState("");
  const [subs, setSubs] = useLocalState<{ email: string; at: number }[]>(KEYS.newsletter, []);
  const [done, setDone] = useState(false);
  if (done) return <Card className="callout-card"><Icon name="check" size={20} /><h3>{ct("auto.devotional.e22e798a580d432b")}</h3><p className="muted">{ct("auto.devotional.c803816480c42965")}</p></Card>;
  return (
    <Card className="newsletter-inline">
      <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ct("auto.devotional.1210496dd0616efc")} aria-label={ct("auto.devotional.a8b3aef590ca07c4")} />
      <Btn
        icon="send"
        onClick={() => {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            fireToast(ct("auto.devotional.a777c5e6d5a93607"), "error");
            return;
          }
          setSubs((l) => (l.some((s) => s.email === email) ? l : [...l, { email, at: Date.now() }]));
          setDone(true);
          fireToast(ct("auto.devotional.153d1cacc2e9edd5"), "success");
        }}
      >
        {ct("auto.devotional.c7431011edcc5190")}</Btn>
    </Card>
  );
}
