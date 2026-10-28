import React, { useEffect, useState } from "react";
import { tx } from "../lib/i18n";
import { MINISTRIES, SITE, VALUES, img } from "../data/site";
import { BRANCHES, DEFAULT_BRANCH_ID } from "../data/branches";
import { fireToast } from "../lib/hooks";
import { mailto } from "../lib/store";
import { useRoute } from "../lib/router";
import { Badge, Btn, Card, Field, Icon, Input, Notice, Reveal, Rich, Section, SectionHeading, Select, Textarea, Accordion, Tiles } from "../components/ui";
import { SERVING_FAQS, SERVING_TEAMS } from "../data/content";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { MinistryCard } from "../components/blocks";

export function Ministries() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", branch: DEFAULT_BRANCH_ID, skills: "", area: SERVING_TEAMS[0].name, availability: ct("auto.ministries.1ba0f8994e7f4e98") });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const { query } = useRoute();

  // arriving from the topbar "Volunteer" link — jump straight to the serving form
  useEffect(() => {
    if (!query.get("volunteer")) return;
    const id = window.setTimeout(() => {
      const el = document.getElementById("volunteer");
      if (!el) return;
      // offset so the sticky topbar + header don't cover the section heading
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 128, behavior: "smooth" });
    }, 140);
    return () => window.clearTimeout(id);
  }, [query]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) {
      fireToast(ct("auto.ministries.770c9d720286dd7b"), "error");
      return;
    }
    fireToast(ct("auto.ministries.5200984e810a33af"), "success");
    window.location.href = mailto(
      SITE.email,
      ct("auto.ministries.fa4f83b8ab97c081", { "area": form.area }),
      `Hello,\n\nI would like to serve in ${form.area}.\n\nName: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\nBranch: ${BRANCHES.find((b) => b.id === form.branch)?.city}\nAvailability: ${form.availability}\nSkills / experience: ${form.skills}\n\nThank you.`
    );
  };

  return (
    <>
      <PageHead
        eyebrow={ct("ministries.head.eyebrow")}
        title={<Rich text={ct("ministries.head.title")} />}
        lede={ct("ministries.head.lede")}
        image={img("ministries")}
        crumbs={[{ label: ct("auto.ministries.b80d1414d336b555"), to: "/" }, { label: ct("auto.ministries.44d531a608e198bf") }]}
        actions={
          <>
            <Btn icon="send" onClick={() => document.getElementById("volunteer")?.scrollIntoView({ behavior: "smooth" })}>
              {ct("auto.ministries.7dbe9f5d2085eb5c")}</Btn>
            <Btn variant="ghost" icon="people" to="/locations">
              {ct("auto.ministries.9355263257d4989b")}</Btn>
          </>
        }
      />

      <Section>
        <SectionHeading center eyebrow={ct("ministries.list.eyebrow")} title={ct("ministries.list.title")} lede={ct("ministries.list.lede")} />
        <div className="grid grid-3">
          {MINISTRIES.map((m, i) => (
            <Reveal key={m.id} delay={(i % 3) * 60}>
              <MinistryCard
                ministry={m}
                onJoin={() =>
                  (window.location.href = mailto(SITE.email, ct("auto.ministries.999f5185e7f369ec", { "name": m.name }), ct("auto.ministries.ae9dfb15ff2bae84", { "name": m.name, "city": BRANCHES[0].city })))
                }
              />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("ministries.teams.eyebrow")} title={ct("ministries.teams.title")} lede={ct("ministries.teams.lede")} />
        <div className="serve-table">
          <div className="serve-table__head">
            <span>{ct("auto.ministries.dab3d64c4c99f0ed")}</span>
            <span>{ct("auto.ministries.57b2df4b5760549a")}</span>
            <span>{ct("auto.ministries.aaf6a0f0bd701751")}</span>
            <span />
          </div>
          {SERVING_TEAMS.map((t) => (
            <div className="serve-table__row" key={t.name}>
              <span className="serve-table__name">{tx(t.name)}</span>
              <span>{tx(t.need)}</span>
              <span className="muted">{tx(t.slots)}</span>
              <span>
                <Btn
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() => {
                    set({ area: t.name });
                    document.getElementById("volunteer")?.scrollIntoView({ behavior: "smooth" });
                    fireToast(ct("auto.ministries.8d445c5921ea31d8", { "name": t.name }), "info");
                  }}
                >
                  {ct("auto.ministries.8014c4193b570480")}</Btn>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="volunteer">
        <div className="volunteer-grid">
          <div>
            <SectionHeading eyebrow={ct("ministries.form.eyebrow")} title={ct("ministries.form.title")} lede={ct("ministries.form.lede")} />
            <form className="contact-form" onSubmit={submit} noValidate>
              <div className="form-grid">
                <Field label={ct("auto.ministries.6d1875bd8ab65474")} required>
                  <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={ct("auto.ministries.61055a60bb645ad9")} />
                </Field>
                <Field label={ct("auto.ministries.3fab61ff1d87a7be")} required>
                  <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder={ct("auto.ministries.c7118017e2223a8e")} />
                </Field>
                <Field label={ct("auto.ministries.bbd40e8759f87e06")}>
                  <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 214 555 0147" />
                </Field>
                <Field label={ct("auto.ministries.716385bd8210f38c")}>
                  <Select value={form.branch} onChange={(e) => set({ branch: e.target.value })} options={BRANCHES.map((b) => ({ value: b.id, label: `${b.city} (${b.country})` }))} />
                </Field>
                <Field label={ct("auto.ministries.7a13bb80b8c58c31")}>
                  <Select value={form.area} onChange={(e) => set({ area: e.target.value })} options={SERVING_TEAMS.map((t) => ({ value: t.name, label: tx(t.name) }))} />
                </Field>
                <Field label={ct("auto.ministries.e7ba164616c3853f")}>
                  <Select
                    value={form.availability}
                    onChange={(e) => set({ availability: e.target.value })}
                    options={[ct("auto.ministries.1ba0f8994e7f4e98"), ct("auto.ministries.c1a53d886217db61"), ct("auto.ministries.47e6a3b20160570b"), ct("auto.ministries.88af2adde90f594c"), ct("auto.ministries.4b809da19349da70"), ct("auto.ministries.b0f1dfdc53dbb7f5")].map((v) => ({ value: v, label: v }))}
                  />
                </Field>
                <div className="form-grid__full">
                  <Field label={ct("auto.ministries.bcc723c56b9f4884")} hint={ct("auto.ministries.88871ac384d27132")}>
                    <Textarea rows={4} value={form.skills} onChange={(e) => set({ skills: e.target.value })} placeholder={ct("auto.ministries.ea35f2e6e3c1627f")} />
                  </Field>
                </div>
              </div>
              <div className="prayer-form__foot">
                <Btn type="submit" icon="send" size="lg">
                  {ct("auto.ministries.e19aafee6a851927")}</Btn>
                <p className="muted">
                  <Icon name="lock" size={14} /> {ct("auto.ministries.35aa0c47b6b2f02e")}</p>
              </div>
            </form>
          </div>
          <aside className="volunteer-side">
            <Card className="side-cta">
              <Icon name="sparkle" size={22} />
              <h3>{ct("ministries.fit.title")}</h3>
              <p>{ct("ministries.fit.text")}</p>
              <Btn size="sm" variant="ghost" block to="/events" icon="calendar">
                {ct("ministries.fit.action")}
              </Btn>
            </Card>
            <Card>
              <h3>{ct("ministries.why.title")}</h3>
              <ul className="tick-list tick-list--compact">
                {VALUES.slice(3, 6).map((v) => (
                  <li key={v.title}>
                    <Icon name={v.icon} size={16} />
                    <span>
                      <b>{tx(v.title)}</b>
                      <em>{tx(v.text)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3>{ct("ministries.safeguard.title")}</h3>
              <p className="muted">{ct("ministries.safeguard.text")}</p>
              <Badge accent="emerald" icon="shield">{ct("ministries.safeguard.badge")}</Badge>
            </Card>
          </aside>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("ministries.faq.eyebrow")} title={ct("ministries.faq.title")} />
        <div className="narrow">
          <Accordion
            items={SERVING_FAQS.map((f) => ({ q: tx(f.q), a: tx(f.a) }))}
          />
        </div>
      </Section>
    </>
  );
}
