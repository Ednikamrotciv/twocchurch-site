import React, { useMemo, useState } from "react";
import { tx } from "../lib/i18n";
import { Link } from "../lib/router";
import { BRANCHES, DEFAULT_BRANCH_ID, branchFlag, branchZone } from "../data/branches";
import { SITE, FAQS, img } from "../data/site";
import { useLocalState, fireToast } from "../lib/hooks";
import { KEYS, DAY_NAMES, to12h, nextOccurrence, fmtDate, mailto, copyText, downloadText, clockAt, clockHere, tidyCount } from "../lib/store";
import { useVisitPlan } from "../lib/collections";
import { VISIT_EXPECT, VISIT_FAQS } from "../data/content";
import { Badge, Btn, Card, Checkbox, Field, Icon, Input, Notice, Progress, Reveal, Rich, Section, SectionHeading, Select, Textarea, Accordion } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";

export function Visit() {
  const [step, setStep] = useState(0);
  const { plan, setPlan } = useVisitPlan();
  const [branchId, setBranchId] = useLocalState<string>(KEYS.branch, DEFAULT_BRANCH_ID);
  const [serviceIdx, setServiceIdx] = useState(0);
  const [party, setParty] = useState({ adults: 2, kids: 0, accessibility: "none", notes: "" });
  const [you, setYou] = useState({ name: "", email: "", questions: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const branch = BRANCHES.find((b) => b.id === branchId) || BRANCHES[0];
  /* Accessibility options, labeled once and reused by the form and the pass. */
  const accessOpts = [
    { value: "none", label: ct("auto.visit.34bf9843bbbb81e2") },
    { value: "wheelchair", label: ct("auto.visit.3633ee5ac1f80013") },
    { value: "hearing", label: ct("auto.visit.e0dbda8f8e1c8db6") },
    { value: "sensory", label: ct("auto.visit.b67dbffc020e17cd") },
    { value: "front", label: ct("auto.visit.fc2e42341bf52cbd") },
    { value: "back", label: ct("auto.visit.8b2daf6c75dafbf5") },
  ];
  const accessLabel = (v: string) => accessOpts.find((o) => o.value === v)?.label || v;
  /* The visit happens at the branch, so the gathering's *instant* is worked out
     on the branch's own clock; what the visitor reads is that instant on theirs
     (SPEC notes 84/85). */
  const zone = branchZone(branch);
  const sundayServices = branch.schedule.filter((s) => s.day === 0);
  const service = sundayServices[serviceIdx] || sundayServices[0];
  const when = service ? nextOccurrence(service, new Date(), zone) : null;

  const steps = [ct("auto.visit.d85efa085b64df19"), ct("auto.visit.55896ce1df248298"), ct("auto.visit.0d9b4334d3a944e5"), ct("auto.visit.7db3c8d1b3489508")];

  const summaryText = useMemo(() => {
    if (!service || !when) return "";
    return [
      ct("auto.visit.aa4ef2e732ed4466", { "name": SITE.name }),
      `${branch.name}`,
      `${branch.address}`,
      "",
      ct("auto.visit.687dbc3caf4ff5a5", { "name": service.name }),
      `When: ${fmtDate(when, "long")} at ${to12h(clockAt(when).time)}`,
      `Worship: ${party.adults} adult${party.adults === 1 ? "" : "s"}${party.kids ? `, ${party.kids} child${party.kids === 1 ? "" : "ren"}` : ""}`,
      party.accessibility !== "none" ? ct("auto.visit.cf547a49e71d27d0", { "accessibility": party.accessibility }) : "",
      party.notes ? ct("auto.visit.1d172ae40174ca25", { "notes": party.notes }) : "",
      you.name ? ct("auto.visit.1665ab0270cea3d3", { "name": you.name }) : "",
      you.questions ? ct("auto.visit.af22859830db4ce9", { "questions": you.questions }) : "",
      "",
      ct("auto.visit.6d1a2414bec46635", { "phone": SITE.phone, "email": SITE.email }),
    ]
      .filter(Boolean)
      .join("\n");
  }, [branch, zone, service, when, party, you]);

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return !!service;
    if (step === 2) return party.adults >= 1 || party.kids >= 1;
    return true;
  };

  const finish = () => {
    const errs: Record<string, string> = {};
    if (!you.name.trim()) errs.name = "We'd love to know your name.";
    if (you.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(you.email)) errs.email = "That email doesn't look right.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPlan({
      branchId,
      serviceIndex: serviceIdx,
      adults: party.adults,
      kids: party.kids,
      accessibility: party.accessibility,
      name: you.name.trim(),
      email: you.email.trim(),
      questions: you.questions.trim(),
      createdAt: Date.now(),
    });
    setDone(true);
    fireToast(ct("auto.visit.ff10f8ac073c3a7d"), "success");
  };

  return (
    <>
      <PageHead
        eyebrow={ct("visit.head.eyebrow")}
        title={<Rich text={ct("visit.head.title")} />}
        lede={ct("visit.head.lede")}
        image={img("visit")}
        crumbs={[{ label: ct("auto.visit.1c320bac4a59d325"), to: "/" }, { label: ct("auto.visit.439eae8c075b2d25") }]}
        actions={
          <>
            <Btn to="/locations" variant="ghost" icon="compass">
              {ct("visit.head.action1")}
            </Btn>
            <Btn to="/sermons" variant="ghost" icon="play">
              {ct("visit.head.action2")}
            </Btn>
          </>
        }
      />

      <Section>
        <div className="wizard">
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s} className={"step" + (i === step ? " step--active" : "") + (i < step || done ? " step--done" : "")}>
                <span className="step__num">{i < step || done ? <Icon name="check" size={13} /> : i + 1}</span>
                <em>{s}</em>
              </li>
            ))}
          </ol>
          <Progress value={done ? 4 : step} max={4} />

          {done && service && when ? (
            <Card className="visit-pass">
              <Badge accent="gold" icon="ticket">{ct("auto.visit.e1f3809a2de04bfb")}</Badge>
              <h2>{ct("visit.pass.title", { name: you.name })}</h2>
              <p className="lede">{ct("visit.pass.lede", { city: branch.city })}</p>
              <dl className="visit-pass__grid">
                <div>
                  <dt>{ct("auto.visit.02bd07f5eca6319c")}</dt>
                  <dd>{branch.name}</dd>
                  <span>{branch.address}</span>
                </div>
                <div>
                  <dt>{ct("auto.visit.42a57a44819fdb95")}</dt>
                  <dd>{tx(service.name)}</dd>
                  <span>
                    {fmtDate(when, "long")} · {to12h(clockAt(when).time)}
                  </span>
                </div>
                <div>
                  <dt>{ct("auto.visit.1a5a8eba72b2ef1b")}</dt>
                  <dd>
                    {tx(`${party.adults} adult${party.adults === 1 ? "" : "s"}`)}
                    {party.kids ? `, ${tx(`${party.kids} child${party.kids === 1 ? "" : "ren"}`)}` : ""}
                  </dd>
                  <span>{party.accessibility !== "none" ? accessLabel(party.accessibility) : ct("auto.visit.6131b9078dd282f6")}</span>
                </div>
                <div>
                  <dt>{ct("auto.visit.215836ee73aa7d6f")}</dt>
                  <dd>{ct("auto.visit.2890614d49f0cc3c")}</dd>
                  <span>{ct("auto.visit.878734761cb686ef")}</span>
                </div>
              </dl>
              <div className="btn-row">
                <Btn icon="copy" onClick={() => copyText(summaryText, ct("auto.visit.0bc45989be351b28"))}>
                  {ct("auto.visit.09f4e0d93a65ed08")}</Btn>
                <Btn icon="mail" variant="ghost" href={mailto(branch.email, ct("auto.visit.164de0006be9a079", { "city": branch.city, "name": you.name }), summaryText + "\n\nPlease let the welcome team know I'm coming.")}>
                  {ct("auto.visit.3ccd80ac1a3e6a65")}</Btn>
                <Btn variant="ghost" icon="download" onClick={() => downloadText("my-visit-plan.txt", summaryText)}>
                  {ct("auto.visit.017e8bea84990e2b")}</Btn>
                <Btn variant="ghost" icon="compass" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(branch.address)}`}>
                  {ct("auto.visit.54ab865b0bacd752")}</Btn>
                <Btn variant="quiet" icon="edit" onClick={() => { setDone(false); setStep(0); }}>
                  {ct("auto.visit.5509968bb05e625a")}</Btn>
              </div>
            </Card>
          ) : (
            <Card className="wizard__panel">
              {step === 0 && (
                <div>
                  <h3>{ct("visit.step1")}</h3>
                  <p className="muted">{ct("visit.step1.note")}</p>
                  <div className="branch-choose">
                    {BRANCHES.map((b) => (
                      <button key={b.id} type="button" className={"branch-choose__item" + (branchId === b.id ? " is-active" : "")} onClick={() => { setBranchId(b.id); setServiceIdx(0); }}>
                        <span className="branch-choose__flag">{branchFlag(b)}</span>
                        <b>{b.city}</b>
                        <em>{b.country} · {sundayServices.length || b.schedule.filter((s) => s.day === 0).length} {ct("auto.visit.38177e66cc15039f")}</em>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h3>{ct("visit.step2")}</h3>
                  <p className="muted">{ct("visit.step2.note")}</p>
                  <div className="service-choose">
                    {sundayServices.map((s, i) => {
                      const at = nextOccurrence(s, new Date(), zone);
                      const shown = clockAt(at);
                      return (
                        <button key={s.name + s.time} type="button" className={"service-choose__item" + (serviceIdx === i ? " is-active" : "")} onClick={() => setServiceIdx(i)}>
                          <b>{tx(s.name)}</b>
                          <span>{to12h(shown.time)}</span>
                          <em>{ct("auto.visit.2db7ce7214855b23")}{fmtDate(at, "medium")}</em>
                          <span className="muted">{tidyCount(`${Math.round(s.minutes / 60)} ${ct("auto.visit.18b7dd7c06508615")}`)}</span>
                        </button>
                      );
                    })}
                    {branch.schedule
                      .filter((s) => s.day !== 0)
                      .map((s) => {
                        const shown = clockHere(s.time, s.day, zone);
                        return (
                          <div key={s.name + s.time} className="service-choose__item service-choose__item--muted">
                            <b>{tx(s.name)}</b>
                            <span>
                              {tx(DAY_NAMES[shown.day])}{ct("auto.visit.7e76c3868e2697b7")}{to12h(shown.time)}
                            </span>
                            <em>{ct("auto.visit.ce07aebc2755dd25")}</em>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h3>{ct("visit.step3")}</h3>
                  <div className="counter-grid">
                    <div className="counter">
                      <span>{ct("auto.visit.3300602480eade95")}</span>
                      <div>
                        <Btn size="sm" variant="ghost" icon="minus" onClick={() => setParty((p) => ({ ...p, adults: Math.max(1, p.adults - 1) }))} />
                        <b>{party.adults}</b>
                        <Btn size="sm" variant="ghost" icon="plus" onClick={() => setParty((p) => ({ ...p, adults: Math.min(30, p.adults + 1) }))} />
                      </div>
                    </div>
                    <div className="counter">
                      <span>{ct("auto.visit.00fb449a139a22ab")}</span>
                      <div>
                        <Btn size="sm" variant="ghost" icon="minus" onClick={() => setParty((p) => ({ ...p, kids: Math.max(0, p.kids - 1) }))} />
                        <b>{party.kids}</b>
                        <Btn size="sm" variant="ghost" icon="plus" onClick={() => setParty((p) => ({ ...p, kids: Math.min(20, p.kids + 1) }))} />
                      </div>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-grid__full">
                      <Field label={ct("auto.visit.c7206374da405a05")} hint={ct("auto.visit.d57b189f329ccb76")}>
                        <Select
                          value={party.accessibility}
                          onChange={(e) => setParty((p) => ({ ...p, accessibility: e.target.value }))}
                          options={accessOpts}
                        />
                      </Field>
                    </div>
                    <div className="form-grid__full">
                      <Field label={ct("auto.visit.d4d0a252ee9c026b")} hint={ct("auto.visit.464bfcc9a13c0b00")}>
                        <Textarea rows={3} value={party.notes} onChange={(e) => setParty((p) => ({ ...p, notes: e.target.value }))} placeholder={ct("auto.visit.8cde805b442d74f2")} />
                      </Field>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="form-grid">
                  <Field label={ct("auto.visit.8676623591e95d04")} required error={errors.name}>
                    <Input value={you.name} onChange={(e) => setYou((y) => ({ ...y, name: e.target.value }))} placeholder={ct("auto.visit.01720b4b0a590432")} invalid={!!errors.name} />
                  </Field>
                  <Field label={ct("auto.visit.6b0d5d676d320d6e")} hint={ct("auto.visit.c2caf7cd9942308c")} error={errors.email}>
                    <Input type="email" value={you.email} onChange={(e) => setYou((y) => ({ ...y, email: e.target.value }))} placeholder={ct("auto.visit.54a990ef33fcc7fe")} invalid={!!errors.email} />
                  </Field>
                  <div className="form-grid__full">
                    <Field label={ct("auto.visit.01e211082f83e7b9")}>
                      <Textarea rows={4} value={you.questions} onChange={(e) => setYou((y) => ({ ...y, questions: e.target.value }))} placeholder={ct("auto.visit.9668531048c49169")} />
                    </Field>
                  </div>
                  <div className="form-grid__full">
                    <Notice icon="lock">{ct("visit.privacy")}</Notice>
                  </div>
                </div>
              )}

              <div className="wizard__foot">
                <Btn variant="quiet" icon="arrowLeft" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  {ct("auto.visit.4cb351d8a3bc07b9")}</Btn>
                {step < 3 ? (
                  <Btn iconRight="arrowRight" disabled={!canNext()} onClick={() => setStep((s) => Math.min(3, s + 1))}>
                    {ct("auto.visit.7f9f510626dfcf47")}</Btn>
                ) : (
                  <Btn icon="check" onClick={finish}>
                    {ct("auto.visit.394c6eef9b23e8de")}</Btn>
                )}
              </div>
            </Card>
          )}
        </div>
      </Section>

      {plan && !done && (
        <Section tone="raised">
          <Notice icon="ticket">
            {ct("auto.visit.18c8fe29d152db60")}{BRANCHES.find((b) => b.id === plan.branchId)?.city} {ct("auto.visit.bcf7e601488bb368")}{" "}
            {fmtDate(plan.createdAt, "medium")}).{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                const b = BRANCHES.find((x) => x.id === plan.branchId) || BRANCHES[0];
                setBranchId(b.id);
                setServiceIdx(plan.serviceIndex);
                setParty({ adults: plan.adults, kids: plan.kids, accessibility: plan.accessibility, notes: plan.questions });
                setYou({ name: plan.name, email: plan.email, questions: plan.questions });
                setDone(true);
                document.querySelector(".wizard")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {ct("auto.visit.773aadc50173d384")}</button>
          </Notice>
        </Section>
      )}

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("visit.expect.eyebrow")} title={ct("visit.expect.title")} />
        <div className="grid grid-3">
          {VISIT_EXPECT.map((e, i) => (
            <Reveal key={e.title} delay={i * 50}>
              <Card className="expect-card">
                <span className="expect-card__icon">
                  <Icon name={e.icon === "kids" ? "people" : e.icon} size={22} />
                </span>
                <h3>{tx(e.title)}</h3>
                <p>{tx(e.text)}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading center eyebrow={ct("visit.faq.eyebrow")} title={ct("visit.faq.title")} />
        <div className="narrow">
          <Accordion
            items={[
              ...FAQS.slice(0, 5).map((f) => ({ q: tx(f.q), a: tx(f.a) })),
              ...VISIT_FAQS.map((f) => ({ q: tx(f.q), a: tx(f.a) })),
            ]}
          />
        </div>
        <div className="center mt-3">
          <Btn to="/contact" variant="ghost" icon="send">
            {ct("visit.faq.action")}
          </Btn>
        </div>
      </Section>
    </>
  );
}
