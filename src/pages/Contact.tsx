import React, { useState } from "react";
import { Link } from "../lib/router";
import { SITE, DEPARTMENTS, FAQS, img } from "../data/site";
import { BRANCHES, DEFAULT_BRANCH_ID, HQ, branchZone } from "../data/branches";
import { CONTACT_TOPICS } from "../data/content";
import { fireToast } from "../lib/hooks";
import { mailto, copyText, whatsappLink, mapEmbedUrl, DAY_NAMES, zonedParts, to12h, clockHere, zoneLabel } from "../lib/store";
import { Badge, Btn, Card, Checkbox, Field, Icon, IconBtn, Input, Notice, Reveal, Rich, Section, SectionHeading, Select, Textarea, Accordion } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";

/* The office hours are the head office's, so the open/closed state is read on
   the head office's own clock — Lagos, Nigeria — whatever clock the reader
   themselves is on (SPEC notes 84/85). The *times* in the answer are shown the
   same way as every other time on the site: 9:00 AM, not 09:00. */
function officeState(now = new Date()) {
  const clock = zonedParts(now, branchZone(HQ));
  const entry = SITE.officeHours.find((h) => h.day === clock.weekday);
  if (!entry) return { open: false, text: ct("auto.contact.bcef068edf2debbf") };
  const [oh, om] = entry.open.split(":").map(Number);
  const [ch, cm] = entry.close.split(":").map(Number);
  const minutes = clock.hour * 60 + clock.minute;
  const openM = oh * 60 + om;
  const closeM = ch * 60 + cm;
  if (minutes < openM) return { open: false, text: ct("auto.contact.6e852a9565b1a40c", { open: to12h(entry.open) }) };
  if (minutes > closeM) return { open: false, text: ct("auto.contact.2bb4afeb7ff0bd32") };
  const left = closeM - minutes;
  return { open: true, text: ct("auto.contact.a222e8b7a8549d5e", { "v0": Math.floor(left / 60), "v1": left % 60 }) };
}

export function Contact() {
  const [topic, setTopic] = useState("general");
  const [form, setForm] = useState({ name: "", email: "", phone: "", branch: DEFAULT_BRANCH_ID, message: "", consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const hours = officeState();
  /* The head office's Sunday gatherings, read on the visitor's own clock like
     every other time on the site (SPEC note 85) — and taken from the schedule
     itself rather than repeated as prose, so they can never drift from it. */
  const sundayTimes = HQ.schedule
    .filter((s) => s.day === 0)
    .map((s) => to12h(clockHere(s.time, s.day, branchZone(HQ)).time))
    .join(" & ");
  const activeTopic = CONTACT_TOPICS.find((t) => t.id === topic) || CONTACT_TOPICS[0];
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const body = () => `Hello ${SITE.short} team,\n\n${form.message}\n\n—\nName: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone || "—"}\nNearest branch: ${BRANCHES.find((b) => b.id === form.branch)?.city}\nTopic: ${activeTopic.label}\nSent from the website contact form.`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Please tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) errs.email = "We need a valid email to reply to you.";
    if (form.message.trim().length < 12) errs.message = "Please add a little more detail.";
    if (!form.consent) errs.consent = "Please confirm we may store your message.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      fireToast(ct("auto.contact.7175fadb9bee75fa"), "error");
      return;
    }
    setSent(true);
    fireToast(ct("auto.contact.5024ff748e0fad85"), "success");
    window.location.href = mailto(activeTopic.email, ct("auto.contact.3f4f3eaca1eed92d", { "label": activeTopic.label, "name": form.name }), body());
  };

  return (
    <>
      <PageHead
        eyebrow={ct("contact.head.eyebrow")}
        title={<Rich text={ct("contact.head.title")} />}
        lede={ct("contact.head.lede")}
        image={img("welcome")}
        crumbs={[{ label: ct("auto.contact.e77689cdaed20a54"), to: "/" }, { label: ct("auto.contact.480fed087cc97e29") }]}
        actions={
          <>
            <Btn icon="whatsapp" variant="crimson" href={`https://wa.me/${SITE.whatsapp.replace(/[^\d]/g, "")}`}>
              {ct("contact.head.action1")}
            </Btn>
            <Btn variant="ghost" icon="prayer" to="/prayer">
              {ct("contact.head.action2")}
            </Btn>
          </>
        }
      />

      <Section>
        <div className="contact-cards">
          <Card className="contact-card">
            <span className="contact-card__icon"><Icon name="phone" size={22} /></span>
            <h3>{ct("contact.card1.title")}</h3>
            <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>{SITE.phone}</a>
            <p className="muted">{ct("contact.card1.note", { zone: zoneLabel(branchZone(HQ)) })}</p>
            <Badge accent={hours.open ? "emerald" : "quiet"} icon={hours.open ? "check" : "clock"}>
              {hours.text}
            </Badge>
          </Card>
          <Card className="contact-card">
            <span className="contact-card__icon"><Icon name="mail" size={22} /></span>
            <h3>{ct("contact.card2.title")}</h3>
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            <p className="muted">{ct("contact.card2.note")}</p>
            <Btn size="sm" variant="ghost" icon="copy" onClick={() => copyText(SITE.email, ct("auto.contact.78089400b46c9451"))}>
              {ct("auto.contact.9a7317714d5074f0")}</Btn>
          </Card>
          <Card className="contact-card">
            <span className="contact-card__icon"><Icon name="pin" size={22} /></span>
            <h3>{ct("contact.card3.title")}</h3>
            <p>{SITE.address}</p>
            <div className="btn-row">
              <Btn size="sm" variant="ghost" icon="compass" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(SITE.address)}`}>
                {ct("auto.contact.526b53103ae62fc9")}</Btn>
              <Btn size="sm" variant="quiet" icon="copy" onClick={() => copyText(SITE.address, ct("auto.contact.4123ba14f7b6764d"))}>
                {ct("auto.contact.63a7c701c6d5db48")}</Btn>
            </div>
          </Card>
          <Card className="contact-card">
            <span className="contact-card__icon"><Icon name="whatsapp" size={22} /></span>
            <h3>{ct("contact.card4.title")}</h3>
            <a href={`https://wa.me/${SITE.whatsapp.replace(/[^\d]/g, "")}`}>{ct("auto.contact.3b280b99e848a758")}</a>
            <p className="muted">{ct("contact.card4.note")}</p>
          </Card>
        </div>
      </Section>

      <Section tone="raised">
        <div className="contact-layout">
          <div>
            <SectionHeading eyebrow={ct("contact.form.eyebrow")} title={ct("contact.form.title")} lede={ct("contact.form.lede")} />
            {sent ? (
              <Card className="contact-sent">
                <span className="prayer-success__icon"><Icon name="check" size={24} /></span>
                <h3>{ct("contact.sent.title")}</h3>
                <p className="lede">
                  {ct("auto.contact.33a8392261e8e523")}{" "}
                  <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>{SITE.phone}</a>.
                </p>
                <div className="btn-row">
                  <Btn icon="mail" href={mailto(activeTopic.email, ct("auto.contact.3f4f3eaca1eed92d", { "label": activeTopic.label, "name": form.name }), body())}>
                    {ct("auto.contact.899adf067e79de4f")}</Btn>
                  <Btn variant="ghost" icon="copy" onClick={() => copyText(body(), ct("auto.contact.0bb95bff9e484576"))}>
                    {ct("auto.contact.178a2e70bb894209")}</Btn>
                  <Btn variant="ghost" icon="whatsapp" href={whatsappLink(body())}>
                    {ct("auto.contact.3825e1876700c7de")}</Btn>
                </div>
                <Btn variant="quiet" icon="plus" onClick={() => { setSent(false); set({ message: "" }); }}>
                  {ct("auto.contact.dd3212b7205eab86")}</Btn>
              </Card>
            ) : (
              <form className="contact-form" onSubmit={submit} noValidate>
                <div className="form-grid">
                  <Field label={ct("auto.contact.7c17505afeda2af3")} required error={errors.name}>
                    <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={ct("auto.contact.10232ffa18253453")} invalid={!!errors.name} />
                  </Field>
                  <Field label={ct("auto.contact.15bc1134d8c28ea5")} required error={errors.email}>
                    <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder={ct("auto.contact.4339ca008d1cf061")} invalid={!!errors.email} />
                  </Field>
                  <Field label={ct("auto.contact.bd25cee843ecadf1")} hint={ct("auto.contact.c5d0e418f0bc4c69")}>
                    <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 214 555 0147" />
                  </Field>
                  <Field label={ct("auto.contact.3df160e290bca083")}>
                    <Select
                      value={form.branch}
                      onChange={(e) => set({ branch: e.target.value })}
                      options={BRANCHES.map((b) => ({ value: b.id, label: `${b.city} (${b.country})` }))}
                    />
                  </Field>
                  <div className="form-grid__full">
                    <Field label={ct("auto.contact.082f178042038df9")}>
                      <div className="chips">
                        {CONTACT_TOPICS.map((t) => (
                          <button key={t.id} type="button" className={"chip" + (topic === t.id ? " chip--active" : "")} onClick={() => setTopic(t.id)}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="form-grid__full">
                    <Field label={ct("auto.contact.c8cd9f8c0b3600bd")} required hint={ct("auto.contact.eb2f7646f50d003f", { "email": activeTopic.email })} error={errors.message}>
                      <Textarea rows={7} value={form.message} onChange={(e) => set({ message: e.target.value })} placeholder={ct("auto.contact.e97c65939b274562")} invalid={!!errors.message} />
                    </Field>
                  </div>
                  <div className="form-grid__full">
                    <Checkbox checked={form.consent} onChange={(v) => set({ consent: v })} label={ct("auto.contact.e4258027ed73a286")} />
                    {errors.consent && <p className="field__error"><Icon name="alert" size={13} /> {errors.consent}</p>}
                  </div>
                </div>
                <div className="prayer-form__foot">
                  <Btn type="submit" size="lg" icon="send">
                    {ct("auto.contact.d6312f850ff95754")}</Btn>
                  <p className="muted">
                    <Icon name="lock" size={14} /> {ct("contact.privacy")}
                  </p>
                </div>
              </form>
            )}
          </div>

          <aside className="contact-side">
            <Card>
              <h3>{ct("contact.side1.title")}</h3>
              <iframe className="contact-map" title={ct("auto.contact.6cbc3dfe58364a2f")} src={mapEmbedUrl({ lat: HQ.lat, lng: HQ.lng })} loading="lazy" />
              <ul className="contact-facts">
                <li><Icon name="pin" size={15} /> {HQ.address}</li>
                <li><Icon name="clock" size={15} /> {ct("auto.contact.cacbc37dfc3f543c")}</li>
                <li><Icon name="people" size={15} /> {ct("auto.contact.48be42cde1b7d384", { "sundayTimes": sundayTimes })}</li>
              </ul>
              <Btn size="sm" variant="ghost" block icon="compass" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(HQ.address)}`}>
                {ct("auto.contact.e05e93dc063ff845")}</Btn>
            </Card>
            <Card>
              <h3>{ct("contact.side2.title")}</h3>
              <div className="social-row social-row--wide">
                {SITE.socials.map((s) => (
                  <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer">
                    <Icon name={s.icon} size={18} />
                    <span>
                      <b>{s.label}</b>
                      <em>{s.handle}</em>
                    </span>
                  </a>
                ))}
              </div>
            </Card>
            <Card className="urgent-card">
              <Icon name="alert" size={20} />
              <h3>{ct("contact.side3.title")}</h3>
              <p>{ct("contact.side3.text")}</p>
              <Btn size="sm" variant="crimson" block icon="phone" href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>
                {ct("contact.side3.action")}
              </Btn>
            </Card>
          </aside>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow={ct("contact.depts.eyebrow")} title={ct("contact.depts.title")} />
        <div className="dept-table">
          <div className="dept-table__head">
            <span>{ct("auto.contact.95082272542bba13")}</span>
            <span>{ct("auto.contact.fc90082e09bac11f")}</span>
            <span>{ct("auto.contact.7adf0c59fda5e250")}</span>
            <span />
          </div>
          {DEPARTMENTS.map((d) => (
            <div className="dept-table__row" key={d.name}>
              <span className="dept-table__name">{d.name}</span>
              <span>{d.desc}</span>
              <span className="muted">{d.hours}</span>
              <span className="dept-table__actions">
                <IconBtn name="mail" label={ct("auto.contact.fd6dac31fd551738", { "name": d.name })} href={`mailto:${d.email}`} />
                <IconBtn name="copy" label={ct("auto.contact.0c5a63cf473333c6")} onClick={() => copyText(d.email, ct("auto.contact.78089400b46c9451"))} />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("contact.faq.eyebrow")} title={ct("contact.faq.title")} />
        <div className="narrow">
          <Accordion items={FAQS.map((f) => ({ q: f.q, a: f.a }))} />
        </div>
        <div className="center mt-3">
          <Btn to="/visit" variant="ghost" icon="ticket">
            {ct("contact.faq.action")}
          </Btn>
        </div>
      </Section>
    </>
  );
}
