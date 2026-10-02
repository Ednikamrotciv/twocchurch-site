import React, { useState } from "react";
import { GIVING_FUNDS, GIVING_BREAKDOWN, BANK_ACCOUNTS, SITE, FAQS, img } from "../data/site";
import { GIVING_FAQS, GIVING_METHODS } from "../data/content";
import { ct } from "../data/copy";
import { copyText, fmtMoney, mailto, moneyText } from "../lib/store";
import { navigate, useRoute } from "../lib/router";
import { Badge, Btn, Card, Eyebrow, Field, Icon, IconBtn, Input, Progress, Reveal, Rich, Section, SectionHeading, Select, Textarea, Accordion, Tabs } from "../components/ui";
import { PageHead } from "../components/layout";

const PRESETS = [25, 50, 100, 250, 500, 1000];
const METHODS = GIVING_METHODS;
const TABS = ["give", "funds", "other"] as const;
type TabId = (typeof TABS)[number];

export function Giving() {
  // Which of the three panels is open lives in the address ("#/giving?tab=other"),
  // so a link — or the "Give now" button — can open the panel it means. The first
  // tab is the default, so it keeps the clean address.
  const { query } = useRoute();
  const wanted = (query.get("tab") || "").toLowerCase();
  const tab: TabId = (TABS as readonly string[]).includes(wanted) ? (wanted as TabId) : "give";
  const setTab = (next: string) => navigate("/giving", { tab: next === "give" ? undefined : next }, { replace: true });
  const [amount, setAmount] = useState(100);
  const [fund, setFund] = useState("tithe");
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");

  return (
    <>
      <PageHead
        eyebrow={ct("giving.head.eyebrow")}
        title={<Rich text={ct("giving.head.title")} />}
        lede={ct("giving.head.lede")}
        image={img("giving")}
        crumbs={[{ label: ct("auto.giving.2594c065b729d044"), to: "/" }, { label: ct("auto.giving.0c826e9a9722c32b") }]}
        actions={
          <Btn icon="gift" onClick={() => setTab("other")}>
            {ct("auto.giving.69337ad1b8cc24c8")}</Btn>
        }
      />

      <Section>
        <div className="giving-grid">
          <div>
            <Tabs
              tabs={[
                { id: "give", label: ct("auto.giving.59244d45d165533c") },
                { id: "funds", label: ct("auto.giving.9a21a322a1f658b3") },
                { id: "other", label: ct("auto.giving.d5e1031bb2373cc2") },
              ]}
              active={tab}
              onChange={(t) => setTab(t as any)}
            />

            {tab === "give" && (
              <Card className="give-panel">
                <h3>{ct("giving.step1")}</h3>
                <div className="amount-grid">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={"amount-btn" + (amount === p ? " amount-btn--active" : "")}
                      onClick={() => setAmount(p)}
                    >
                      {fmtMoney(p)}
                    </button>
                  ))}
                </div>

                <h3>{ct("giving.step2")}</h3>
                <div className="fund-grid">
                  {GIVING_FUNDS.map((f) => (
                    <button key={f.id} type="button" className={"fund-btn" + (fund === f.id ? " fund-btn--active" : "")} onClick={() => setFund(f.id)}>
                      <b>{f.name}</b>
                      <em>{f.desc}</em>
                      <span className="fund-btn__verse">{f.verse}</span>
                    </button>
                  ))}
                </div>

                <h3>{ct("giving.step3")}</h3>
                <div className="method-grid">
                  {METHODS.map((m) => (
                    <button key={m.id} type="button" className={"method-btn" + (method === m.id ? " method-btn--active" : "")} onClick={() => setMethod(m.id)}>
                      <Icon name={m.id === "transfer" ? "home" : "people"} size={18} />
                      <span>
                        <b>{m.label}</b>
                        <em>{m.note}</em>
                      </span>
                    </button>
                  ))}
                </div>

                <Field label={ct("auto.giving.8b75c7788a548651")}>
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={ct("auto.giving.d6394240a9ba3e61")} />
                </Field>
              </Card>
            )}

            {tab === "funds" && (
              <div className="funds-panel">
                <Card>
                  <h3>{moneyText(ct("giving.alloc.title"))}</h3>
                  <p className="muted">{ct("giving.alloc.note")}</p>
                  <ul className="alloc-list">
                    {GIVING_BREAKDOWN.map((a) => (
                      <li key={a.label}>
                        <span className="alloc-list__head">
                          <b>{a.label}</b>
                          <em>{a.pct}%</em>
                        </span>
                        <Progress value={a.pct} />
                      </li>
                    ))}
                  </ul>
                </Card>
                <div className="grid grid-2">
                  {GIVING_FUNDS.map((f) => (
                    <Card key={f.id} className="fund-detail">
                      <Badge accent="gold">{f.verse}</Badge>
                      <h3>{f.name}</h3>
                      <p>{f.desc}</p>
                      <Btn size="sm" variant="quiet" icon="gift" onClick={() => { setFund(f.id); setTab("give"); }}>
                        {ct("auto.giving.52dbf311bdd548c0")}</Btn>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {tab === "other" && (
              <div className="other-panel">
                <Card>
                  <h3>{ct("giving.bank.title")}</h3>
                  <p className="muted">{ct("giving.bank.note")}</p>
                  <div className="bank-grid">
                    {BANK_ACCOUNTS.map((b) => (
                      <div className="bank-card" key={b.region}>
                        <Badge accent="sky">{b.region}</Badge>
                        <b>{b.bank}</b>
                        <span>{b.name}</span>
                        <dl>
                          <dt>{ct("auto.giving.104b940be6bb5f3a")}</dt>
                          <dd>
                            {b.acct}
                            <IconBtn name="copy" label={ct("auto.giving.c59940ad33337564")} onClick={() => copyText(b.acct, ct("auto.giving.bbdd4850f6eb6349"))} />
                          </dd>
                          {(b as any).routing && (
                            <>
                              <dt>{ct("auto.giving.54c0839a76c72ceb")}</dt>
                              <dd>
                                {(b as any).routing}
                                <IconBtn name="copy" label={ct("auto.giving.1afa9f685ba27c91")} onClick={() => copyText((b as any).routing, ct("auto.giving.c9f998c3079bbcaa"))} />
                              </dd>
                            </>
                          )}
                          {(b as any).sort && (
                            <>
                              <dt>{ct("auto.giving.2b180e750d6ad3ec")}</dt>
                              <dd>
                                {(b as any).sort}
                                <IconBtn name="copy" label={ct("auto.giving.35838a70d4c41b21")} onClick={() => copyText((b as any).sort, ct("auto.giving.4d1214fd5db05f9c"))} />
                              </dd>
                            </>
                          )}
                        </dl>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>

          <aside className="giving-side">
            <Card className="side-cta">
              <Icon name="book" size={22} />
              <h3>{ct("giving.verse.title")}</h3>
              <p>{ct("giving.verse.text")}</p>
              <cite>{ct("giving.verse.ref")}</cite>
            </Card>
            <Card>
              <h3>{ct("giving.help.title")}</h3>
              <p className="muted">{ct("giving.help.text")}</p>
              <a className="link-row" href={`mailto:${SITE.givingEmail}`}>
                <Icon name="mail" size={16} /> {SITE.givingEmail}
              </a>
              <a className="link-row" href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>
                <Icon name="phone" size={16} /> {SITE.phone}
              </a>
            </Card>
          </aside>
        </div>
      </Section>

      <Section tone="raised" id="giving-faq">
        <div className="faq-layout">
          <div className="faq-intro">
            <Eyebrow>{ct("giving.faq.eyebrow")}</Eyebrow>
            <h2>{ct("giving.faq.title")}</h2>
            <p className="lede">{ct("giving.faq.text")}</p>
            <div className="faq-help">
              <span className="faq-help__icon">
                <Icon name="mail" size={18} />
              </span>
              <h3>{ct("giving.faq.still.title")}</h3>
              <p>{ct("giving.faq.still.text")}</p>
              <Btn
                size="sm"
                icon="mail"
                href={mailto(SITE.givingEmail, ct("auto.giving.8959ccab0cc5de42"), ct("auto.giving.c7700e1f58b51246"))}
              >
                {ct("auto.giving.3945ed8489320585")}</Btn>
              <a className="link-row" href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>
                <Icon name="phone" size={15} /> {SITE.phone}
              </a>
            </div>
          </div>

          <div className="faq-list">
            <Accordion
              numbered
              defaultOpen={0}
              items={GIVING_FAQS.map((f) => ({ q: f.q, a: f.a }))}
            />
          </div>
        </div>
      </Section>

      <Section>
        <div className="giving-closing">
          <h2>{ct("giving.thanks")}</h2>
          <p className="lede">{ct("giving.thanks.text")}</p>
          <div className="btn-row center">
            <Btn to="/testimonies" variant="ghost" icon="quote">
              {ct("auto.giving.ee7f3c5dde54ed94")}</Btn>
            <Btn to="/ministries" variant="ghost" icon="people">
              {ct("auto.giving.0899639f40c9eb2e")}</Btn>
          </div>
        </div>
      </Section>
    </>
  );
}
