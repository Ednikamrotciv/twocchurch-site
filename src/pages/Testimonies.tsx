import React, { useMemo, useRef, useState } from "react";
import { useRoute, Link } from "../lib/router";
import { TESTIMONY_CATEGORIES } from "../data/content";
import { SITE, img } from "../data/site";
import { useLocalState, fireToast } from "../lib/hooks";
import { KEYS, compressImage, mailto, fmtDate, uid } from "../lib/store";
import { useTestimonies } from "../lib/collections";
import { Badge, Btn, Card, Checkbox, Chip, Empty, Field, Icon, Input, Modal, Notice, Reveal, Rich, Section, SectionHeading, Select, ShareRow, Textarea, Monogram } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { SearchBox, TestimonyCard, catAccent, categoryLabel } from "../components/blocks";

type Draft = {
  name: string;
  email: string;
  city: string;
  category: string;
  title: string;
  body: string;
  anonymous: boolean;
  consent: boolean;
  photo?: string;
};

const EMPTY: Draft = { name: "", email: "", city: "", category: "other", title: "", body: "", anonymous: false, consent: false };

export function Testimonies() {
  const { query } = useRoute();
  const openFromQuery = query.get("share") === "1";
  const [formOpen, setFormOpen] = useState(openFromQuery);
  const [reading, setReading] = useState<string | null>(null);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "amens">("recent");
  const { all, mine, amen, add, remove, totalAmens } = useTestimonies();

  const filtered = useMemo(() => {
    let list = all.filter((t) => {
      if (cat !== "all" && t.category !== cat) return false;
      if (q.trim()) {
        const hay = `${t.title} ${t.body} ${t.name} ${t.city}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    if (sort === "amens") list = [...list].sort((a, b) => b.amens - a.amens);
    return list;
  }, [all, cat, q, sort]);

  const readingItem = all.find((t) => t.id === reading) || null;

  return (
    <>
      <PageHead
        eyebrow={ct("testimonies.head.eyebrow")}
        title={<Rich text={ct("testimonies.head.title")} />}
        lede={ct("testimonies.head.lede", { count: all.length, amens: totalAmens.toLocaleString() })}
        image={img("worshipband")}
        crumbs={[{ label: ct("auto.testimonies.97608bdbefee81ea"), to: "/" }, { label: ct("auto.testimonies.02391ef47eadc21d") }]}
        actions={
          <>
            <Btn variant="crimson" icon="quote" onClick={() => setFormOpen(true)}>
              {ct("auto.testimonies.90c628b9a6e01c28")}</Btn>
            <Btn to="/prayer" variant="ghost" icon="prayer">
              {ct("auto.testimonies.3e25340a60f0656b")}</Btn>
          </>
        }
      />

      <Section>
        <div className="grid grid-3 testimony-stats">
          <Card className="stat-card">
            <span className="stat-card__value">{all.length}</span>
            <span className="stat-card__label">{ct("testimonies.stat1.label")}</span>
            <p className="muted">{ct("testimonies.stat1.text")}</p>
          </Card>
          <Card className="stat-card">
            <span className="stat-card__value">{totalAmens.toLocaleString()}</span>
            <span className="stat-card__label">{ct("testimonies.stat2.label")}</span>
            <p className="muted">{ct("testimonies.stat2.text")}</p>
          </Card>
          <Card className="stat-card">
            <span className="stat-card__value">{TESTIMONY_CATEGORIES.length}</span>
            <span className="stat-card__label">{ct("testimonies.stat3.label")}</span>
            <p className="muted">{ct("testimonies.stat3.text")}</p>
          </Card>
        </div>
        <div className="center mt-3">
          <Btn icon="quote" variant="gold" onClick={() => setFormOpen(true)}>
            {ct("auto.testimonies.bd536eb1547e74a0")}</Btn>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading
          eyebrow={ct("testimonies.wall.eyebrow")}
          title={ct("testimonies.wall.title")}
          lede={ct("testimonies.wall.lede")}
        />
        <div className="filterbar">
          <SearchBox value={q} onChange={setQ} placeholder={ct("auto.testimonies.27f8ee0b26496082")} />
          <div className="chips">
            <Chip active={cat === "all"} onClick={() => setCat("all")} count={all.length}>
              {ct("auto.testimonies.6ce146b7ad94a9be")}</Chip>
            {TESTIMONY_CATEGORIES.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} count={all.filter((t) => t.category === c.id).length}>
                {c.label}
              </Chip>
            ))}
          </div>
          <div className="filterbar__selects">
            <label className="inline-field">
              <span>{ct("auto.testimonies.f1f9b99e27c71a77")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="recent">{ct("auto.testimonies.9491718c89f17835")}</option>
                <option value="amens">{ct("auto.testimonies.e27a816bc1d7ea82")}</option>
              </select>
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty
            icon="quote"
            title={ct("testimonies.empty.title")}
            text={ct("testimonies.empty.text")}
            action={
              <Btn icon="quote" variant="crimson" onClick={() => setFormOpen(true)}>
                {ct("auto.testimonies.c143c8f136a1d200")}</Btn>
            }
          />
        ) : (
          <div className="grid grid-3">
            {filtered.map((t, i) => (
              <Reveal key={t.id} delay={(i % 3) * 60}>
                <TestimonyCard testimony={t} onOpen={() => setReading(t.id)} onAmen={() => amen(t.id)} />
              </Reveal>
            ))}
          </div>
        )}

        {mine.length > 0 && (
          <div className="my-testimonies mt-4">
            <h3>{ct("testimonies.mine.title")}</h3>
            <p className="muted">{ct("testimonies.mine.note")}</p>
            <div className="grid grid-3">
              {mine.map((t) => (
                <Card key={t.id} className="mini-testimony">
                  <Badge accent={catAccent(t.category)}>{categoryLabel(t.category)}</Badge>
                  <b>{t.title}</b>
                  <em>{ct("auto.testimonies.0fd05211657e35d8")}{fmtDate(t.createdAt, "short")}</em>
                  <div className="btn-row">
                    <Btn size="sm" variant="ghost" icon="eye" onClick={() => setReading(t.id)}>
                      {ct("auto.testimonies.40ad2e4cd41070ed")}</Btn>
                    <Btn size="sm" variant="quiet" icon="trash" onClick={() => { remove(t.id); fireToast(ct("auto.testimonies.64c8cd587171ed79"), "success"); }}>
                      {ct("auto.testimonies.0636a3e80d7624d9")}</Btn>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section tone="light">
        <SectionHeading center eyebrow={ct("testimonies.share.eyebrow")} title={ct("testimonies.share.title")} lede={ct("testimonies.share.lede")} />
        <div className="testimony-cta">
          <div>
            <h3>{ct("testimonies.ways.title")}</h3>
            <ul className="tick-list">
              <li><Icon name="quote" size={18} /><span><b>{ct("auto.testimonies.a8b7c2dc21dc974d")}</b><em>{ct("auto.testimonies.da457f865af1b85f")}</em></span></li>
              <li><Icon name="mail" size={18} /><span><b>{ct("auto.testimonies.ef7c12dedc8f8f07")}</b><em>{ct("auto.testimonies.daf9a6eaef79dbb3")}{SITE.email} {ct("auto.testimonies.2b1ed228891904c1")}</em></span></li>
              <li><Icon name="youtube" size={18} /><span><b>{ct("auto.testimonies.15a7eeebb31519da")}</b><em>{ct("auto.testimonies.3cafa53402960c4d")}</em></span></li>
            </ul>
          </div>
          <div className="testimony-cta__actions">
            <Btn variant="crimson" icon="quote" onClick={() => setFormOpen(true)}>
              {ct("auto.testimonies.8fc62726930b732f")}</Btn>
            <Btn variant="ghost" icon="mail" href={mailto(SITE.email, ct("auto.testimonies.f7e661c6f4d3943f"), ct("auto.testimonies.c18ff69bbb8cab6a"))}>
              {ct("auto.testimonies.8bd0bb5dddb597ec")}</Btn>
          </div>
        </div>
      </Section>

      <ShareForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={(d) => add(d)} />

      <Modal open={!!readingItem} onClose={() => setReading(null)} title={readingItem?.title || ""} size="md" footer={readingItem ? <ShareRow title={readingItem.title} path="/testimonies" text={readingItem.body} /> : null}>
        {readingItem && (
          <div className="testimony-full">
            <div className="testimony-full__who">
              {readingItem.photo ? <img src={readingItem.photo} alt="" className="testimony-full__photo" /> : <Monogram name={readingItem.name} size={52} />}
              <div>
                <b>{readingItem.name}</b>
                <em>
                  {readingItem.city} · {fmtDate(readingItem.createdAt, "long")}
                </em>
                <Badge accent={catAccent(readingItem.category)}>{categoryLabel(readingItem.category)}</Badge>
              </div>
            </div>
            <p>{readingItem.body}</p>
            <button type="button" className={"amen-btn amen-btn--lg" + (readingItem.iAmened ? " amen-btn--on" : "")} onClick={() => amen(readingItem.id)}>
              <Icon name="prayer" size={17} /> {ct("auto.testimonies.571e2839a906c888")}<b>{readingItem.amens}</b>
            </button>
            <p className="muted">
              {ct("auto.testimonies.f942def3596c9602")}<Link to="/prayer">{ct("auto.testimonies.841581cef748b7e7")}</Link>.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

function ShareForm({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (d: Omit<Draft, "consent" | "email"> & { email: string }) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileNote, setFileNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const reset = () => {
    setDraft(EMPTY);
    setErrors({});
    setFileNote("");
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileNote(ct("auto.testimonies.eea1fb4399362ca2"));
      return;
    }
    setFileNote(ct("auto.testimonies.84804b6021dcdbd1"));
    const dataUrl = await compressImage(file, 900, 0.76);
    set({ photo: dataUrl });
    setFileNote(ct("auto.testimonies.756237970267563e", { "v0": Math.round((dataUrl.length * 0.75) / 1024) }));
  };

  const valid = () => {
    const e: Record<string, string> = {};
    if (!draft.anonymous && !draft.name.trim()) e.name = "Tell us your name, or tick “share anonymously”.";
    if (!draft.title.trim()) e.title = "Give your testimony a title.";
    if (draft.body.trim().length < 40) e.body = "Please write at least a couple of sentences (40+ characters).";
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email)) e.email = "That email doesn't look right.";
    if (!draft.consent) e.consent = "Please confirm we may share your story.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ct("testimonies.modal.title")}
      size="lg"
      footer={
        <>
          <Btn variant="quiet" onClick={() => { reset(); onClose(); }}>
            {ct("auto.testimonies.95ebc4e26af2cef3")}</Btn>
          <Btn
            icon="send"
            onClick={() => {
              if (!valid()) {
                fireToast(ct("auto.testimonies.6969eda1afd696a0"), "error");
                return;
              }
              onSubmit({
                name: draft.anonymous ? ct("auto.testimonies.7baab97d05cbcf14") : draft.name.trim(),
                email: draft.email.trim(),
                city: draft.city.trim() || ct("auto.testimonies.3a0d1c6562302e84"),
                category: draft.category,
                title: draft.title.trim(),
                body: draft.body.trim(),
                anonymous: draft.anonymous,
                photo: draft.photo,
              });
              fireToast(ct("auto.testimonies.1c96c822692db103"), "success");
              reset();
              onClose();
            }}
          >
            {ct("auto.testimonies.7d3d15b28948b473")}</Btn>
        </>
      }
    >
      <div className="form-grid">
        <Field label={ct("auto.testimonies.532d9524fced9dad")} required error={errors.name}>
          <Input value={draft.anonymous ? "" : draft.name} disabled={draft.anonymous} onChange={(e) => set({ name: e.target.value })} placeholder={ct("auto.testimonies.b4f059dd6dbe8f74")} invalid={!!errors.name} />
        </Field>
        <Field label={ct("auto.testimonies.7afa3c42fb4dac53")} hint={ct("auto.testimonies.76dcb27c1bea1a7d")} error={errors.email}>
          <Input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} placeholder={ct("auto.testimonies.5819a3d654b94907")} invalid={!!errors.email} />
        </Field>
        <Field label={ct("auto.testimonies.a80b5f9326ace3f2")}>
          <Input value={draft.city} onChange={(e) => set({ city: e.target.value })} placeholder={ct("auto.testimonies.4352126c7b40e3e5")} />
        </Field>
        <Field label={ct("auto.testimonies.edaab29f854c1c5e")}>
          <Select
            value={draft.category}
            onChange={(e) => set({ category: e.target.value })}
            options={TESTIMONY_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          />
        </Field>
        <div className="form-grid__full">
          <Checkbox checked={draft.anonymous} onChange={(v) => set({ anonymous: v })} label={ct("auto.testimonies.4bc8574598212b34")} hint={ct("auto.testimonies.0bf3b3ea6e065813")} />
        </div>
        <div className="form-grid__full">
          <Field label={ct("auto.testimonies.54c37a104d537fa9")} required error={errors.title}>
            <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={ct("auto.testimonies.3e7aa3600963a5a1")} invalid={!!errors.title} maxLength={90} />
          </Field>
        </div>
        <div className="form-grid__full">
          <Field label={ct("auto.testimonies.9d55a45d0b468264")} required hint={ct("auto.testimonies.bd10d9fa438e4963", { "length": draft.body.length })} error={errors.body}>
            <Textarea rows={8} value={draft.body} onChange={(e) => set({ body: e.target.value })} placeholder={ct("auto.testimonies.1241eb207da2a389")} invalid={!!errors.body} />
          </Field>
        </div>
        <div className="form-grid__full">
          <Field label={ct("auto.testimonies.d94082af5eb0d9de")} hint={fileNote || ct("auto.testimonies.4000d5d164776490")}>
            <div className="upload">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
              {draft.photo ? (
                <div className="upload__preview">
                  <img src={draft.photo} alt="" />
                  <Btn size="sm" variant="quiet" icon="trash" onClick={() => { set({ photo: undefined }); setFileNote(""); }}>
                    {ct("auto.testimonies.16ad4e9cc42702ed")}</Btn>
                </div>
              ) : (
                <Btn variant="ghost" icon="camera" onClick={() => fileRef.current?.click()}>
                  {ct("auto.testimonies.2a9135faef770eeb")}</Btn>
              )}
            </div>
          </Field>
        </div>
        <div className="form-grid__full">
          <Checkbox checked={draft.consent} onChange={(v) => set({ consent: v })} label={ct("auto.testimonies.064abd2f68b95bb6")} />
          {errors.consent && <p className="field__error"><Icon name="alert" size={13} /> {errors.consent}</p>}
        </div>
      </div>
      <Notice icon="lock" tone="gold">
        {ct("testimonies.privacy")}
      </Notice>
    </Modal>
  );
}
