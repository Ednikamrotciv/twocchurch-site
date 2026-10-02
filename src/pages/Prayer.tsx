import React, { useMemo, useState } from "react";
import { Link } from "../lib/router";
import { PRAYER_CATEGORIES, PRAYER_FOCUS, SCRIPTURES } from "../data/content";
import { ct } from "../data/copy";
import { SITE, img } from "../data/site";
import { BRANCHES, branchZone } from "../data/branches";
import { useLocalState, fireToast, useNow } from "../lib/hooks";
import { KEYS, mailto, whatsappLink, copyText, pickForDay, fmtDate, relativeTime, nextService, to12h, DAY_NAMES, clockHere } from "../lib/store";
import { usePrayerRequests, useWall } from "../lib/collections";
import { Badge, Btn, Card, Checkbox, Chip, Empty, Field, Icon, Input, Monogram, Notice, Reveal, Rich, Section, SectionHeading, Select, Tabs, Textarea, Accordion } from "../components/ui";
import { PageHead } from "../components/layout";
import { SearchBox, categoryLabel } from "../components/blocks";

export function Prayer() {
  const [tab, setTab] = useState<"send" | "wall" | "mine">("send");
  const { requests, add, remove, toggleAnswered, markPrayed } = usePrayerRequests();
  const wall = useWall();
  const [wallCat, setWallCat] = useState("all");
  const [wallQ, setWallQ] = useState("");
  const now = useNow(30000);
  const focus = pickForDay(PRAYER_FOCUS, "focus")?.text || "";

  const wallFiltered = useMemo(
    () =>
      wall.all.filter((w) => {
        if (wallCat !== "all" && w.category !== wallCat) return false;
        if (wallQ.trim() && !`${w.text} ${w.name}`.toLowerCase().includes(wallQ.trim().toLowerCase())) return false;
        return true;
      }),
    [wall.all, wallCat, wallQ]
  );

  const answered = requests.filter((r) => r.answered).length;

  return (
    <>
      <PageHead
        eyebrow={ct("prayer.head.eyebrow")}
        title={<Rich text={ct("prayer.head.title")} />}
        lede={ct("prayer.head.lede")}
        image={img("prayer")}
        crumbs={[{ label: ct("auto.prayer.ab84f09eba88e857"), to: "/" }, { label: ct("auto.prayer.15f16409c14fe008") }]}
        actions={
          <>
            <Btn variant="crimson" icon="prayer" onClick={() => setTab("send")}>
              {ct("auto.prayer.32b0baab0a43e2fa")}</Btn>
            <Btn variant="ghost" icon="whatsapp" href={`https://wa.me/${SITE.whatsapp.replace(/[^\d]/g, "")}`}>
              {ct("auto.prayer.16fd4969c6c9cbd8")}</Btn>
          </>
        }
      >
        <div className="prayer-stats">
          <span><b>{wall.total.toLocaleString()}</b> {ct("auto.prayer.2871539c60ae82d5")}</span>
          <span><b>{requests.length}</b> {ct("auto.prayer.98bb69dbc3310382")}</span>
          <span><b>{ct("auto.prayer.9801c95f8df5b296")}</b> {ct("auto.prayer.d0255996ef4f4357")}</span>
        </div>
      </PageHead>

      <Section>
        <div className="prayer-layout">
          <div>
            <Tabs
              tabs={[
                { id: "send", label: ct("auto.prayer.4e6c6e0b89002bd2") },
                { id: "wall", label: ct("auto.prayer.8199912ac1c2079b"), count: wall.all.length },
                { id: "mine", label: ct("auto.prayer.29dce00df5cc846c"), count: requests.length },
              ]}
              active={tab}
              onChange={(t) => setTab(t as any)}
            />

            {tab === "send" && <PrayerForm onSubmit={add} onPosted={() => setTab("wall")} />}

            {tab === "wall" && (
              <div className="wall">
                <PostToWall onPost={wall.add} />
                <div className="filterbar">
                  <SearchBox value={wallQ} onChange={setWallQ} placeholder={ct("auto.prayer.2cb868754db8f94c")} />
                  <div className="chips">
                    <Chip active={wallCat === "all"} onClick={() => setWallCat("all")} count={wall.all.length}>
                      {ct("auto.prayer.d87c424c1b5a1925")}</Chip>
                    {PRAYER_CATEGORIES.slice(0, 6).map((c) => (
                      <Chip key={c.id} active={wallCat === c.id} onClick={() => setWallCat(c.id)} count={wall.all.filter((w) => w.category === c.id).length}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                {wallFiltered.length === 0 ? (
                  <Empty icon="prayer" title={ct("prayer.wall.empty.title")} text={ct("prayer.wall.empty.text")} />
                ) : (
                  <ul className="wall-list">
                    {wallFiltered.map((w) => (
                      <li key={w.id} className={"wall-item" + (w.mine ? " wall-item--mine" : "")}>
                        <div className="wall-item__head">
                          <Monogram name={w.name} size={36} tone={w.mine ? "gold" : "ink"} />
                          <span>
                            <b>{w.name}</b>
                            <em>{relativeTime(w.createdAt)} · {categoryLabel(w.category)}</em>
                          </span>
                          {w.mine && <Badge accent="gold">{ct("auto.prayer.8df3c3f1d86ab270")}</Badge>}
                        </div>
                        <p>{w.text}</p>
                        <div className="wall-item__foot">
                          <button type="button" className={"pray-btn" + (wall.iPrayed(w.id) ? " pray-btn--on" : "")} onClick={() => wall.pray(w.id)} aria-pressed={wall.iPrayed(w.id)}>
                            <Icon name="prayer" size={16} /> {wall.iPrayed(w.id) ? ct("auto.prayer.187119665f3ed0bf") : ct("auto.prayer.5ffc34a841739af9")} <b>{w.prayed}</b>
                          </button>
                          {w.mine && (
                            <button type="button" className="link-btn" onClick={() => { wall.remove(w.id); fireToast(ct("auto.prayer.055452eadc32b673"), "success"); }}>
                              <Icon name="trash" size={14} /> {ct("auto.prayer.2d9b7047a8bead4e")}</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "mine" && (
              <div className="my-requests">
                {requests.length === 0 ? (
                  <Empty
                    icon="prayer"
                    title={ct("auto.prayer.6c28423b13a96ec2")}
                    text={ct("prayer.mine.note")}
                    action={<Btn icon="send" onClick={() => setTab("send")}>{ct("auto.prayer.017b1883e0691b92")}</Btn>}
                  />
                ) : (
                  <>
                    <div className="my-requests__head">
                      <Badge accent="emerald" icon="check">{answered} {ct("auto.prayer.6fa269747880796d")}</Badge>
                      <Badge accent="gold" icon="clock">{requests.length - answered} {ct("auto.prayer.c793420550d869a4")}</Badge>
                    </div>
                    <ul className="request-list">
                      {requests.map((r) => (
                        <li key={r.id} className={"request-item" + (r.answered ? " request-item--answered" : "")}>
                          <div className="request-item__head">
                            <Badge accent={r.urgency === "urgent" ? "crimson" : "sky"}>{r.urgency === "urgent" ? ct("auto.prayer.09c52804cfc003c5") : ct("auto.prayer.b1b5a194f525d2c5")}</Badge>
                            <Badge accent="gold">{categoryLabel(r.category)}</Badge>
                            <span className="muted">{fmtDate(r.createdAt, "medium")}</span>
                          </div>
                          <p>{r.text}</p>
                          <div className="request-item__foot">
                            <button type="button" className={"pray-btn" + (r.iPrayed ? " pray-btn--on" : "")} onClick={() => markPrayed(r.id)}>
                              <Icon name="prayer" size={15} /> {r.iPrayed ? ct("auto.prayer.87b18cf9e4dfe9c0") : ct("auto.prayer.739d12e78f1cd056")} <b>{r.prayed}</b>
                            </button>
                            <button type="button" className={"answered-btn" + (r.answered ? " answered-btn--on" : "")} onClick={() => { toggleAnswered(r.id); if (!r.answered) fireToast(ct("auto.prayer.0fc739aef84dd89f"), "success"); }}>
                              <Icon name="check" size={15} /> {r.answered ? ct("auto.prayer.1ecf8083ce3f019a") : ct("auto.prayer.dd4a75d1fde1db58")}
                            </button>
                            <button type="button" className="link-btn" onClick={() => { remove(r.id); fireToast(ct("auto.prayer.6a98d6f2c53ae39b"), "success"); }}>
                              <Icon name="trash" size={14} /> {ct("auto.prayer.2c9b6eb4d1d00725")}</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <Notice icon="lock">
                      {ct("auto.prayer.90e8c6ae59e2d83f")}</Notice>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="prayer-side">
            <Card className="focus-card">
              <span className="focus-card__icon"><Icon name="fire" size={22} /></span>
              <h3>{ct("prayer.side.focus.title")}</h3>
              <p>{focus}</p>
              <button type="button" className="link-btn" onClick={() => copyText(focus, ct("auto.prayer.da840f163a2d9c9f"))}>
                <Icon name="copy" size={14} /> {ct("auto.prayer.9a999c537eb72e32")}</button>
            </Card>

            <Card>
              <h3>{ct("prayer.side.how.title")}</h3>
              <ul className="tick-list tick-list--compact">
                {["clock", "people", "shield", "heart"].map((icon, i) => (
                  <li key={icon}>
                    <Icon name={icon} size={16} />
                    <span><Rich text={ct(`prayer.side.how.${i + 1}`)} /></span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3>{ct("prayer.side.gather.title")}</h3>
              <ul className="times-list times-list--compact">
                {BRANCHES[0].schedule
                  .filter((s) => s.name.toLowerCase().includes("prayer") || s.name.toLowerCase().includes("vigil"))
                  .map((s, i) => {
                    const c = clockHere(s.time, s.day, branchZone(BRANCHES[0]));
                    return (
                      <li key={i}>
                        <b>{DAY_NAMES[c.day]}</b>
                        <span>{to12h(c.time)}</span>
                        <em>{s.name}</em>
                      </li>
                    );
                  })}
              </ul>
              <Btn to="/watch-live" size="sm" variant="ghost" block icon="live">
                {ct("prayer.side.gather.action")}
              </Btn>
            </Card>

            <Card className="urgent-card">
              <Icon name="alert" size={20} />
              <h3>{ct("prayer.side.urgent.title")}</h3>
              <p>
                <Rich
                  text={ct("prayer.side.urgent.text", {
                    phone: SITE.phone,
                    phoneDigits: SITE.phone.replace(/[^\d+]/g, ""),
                  })}
                />
              </p>
              <Btn size="sm" variant="crimson" block icon="whatsapp" href={`https://wa.me/${SITE.whatsapp.replace(/[^\d]/g, "")}`}>
                {ct("prayer.side.urgent.action")}
              </Btn>
            </Card>
          </aside>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading center eyebrow={ct("prayer.scriptures.eyebrow")} title={ct("prayer.scriptures.title")} lede={ct("prayer.scriptures.lede")} />
        <Accordion
          items={SCRIPTURES.slice(0, 10).map((s) => ({ q: `${s.ref} — ${s.theme}`, a: <span>“{s.text}”</span> }))}
          defaultOpen={0}
        />
      </Section>

      <Section>
        <div className="grid grid-3">
          <Card className="callout-card">
            <Icon name="people" size={24} />
            <h3>{ct("prayer.intercessors.title")}</h3>
            <p>{ct("prayer.intercessors.text")}</p>
            <Btn size="sm" variant="ghost" href={mailto(SITE.prayerEmail, ct("auto.prayer.44b86b6e8c3bded7"), "Hello,\n\nI'd like to serve on the prayer & intercession team.\n\nName:\nBranch:\nAvailability:\n")}>
              {ct("auto.prayer.8ca44a5a8277ff43")}</Btn>
          </Card>
          <Card className="callout-card">
            <Icon name="book" size={24} />
            <h3>{ct("prayer.learn.title")}</h3>
            <p>{ct("prayer.learn.text")}</p>
            <Btn size="sm" variant="ghost" to="/sermons">
              {ct("auto.prayer.e8cc4b4438380325")}</Btn>
          </Card>
          <Card className="callout-card">
            <Icon name="quote" size={24} />
            <h3>{ct("prayer.answered.title")}</h3>
            <p>{ct("prayer.answered.text")}</p>
            <Btn size="sm" variant="ghost" to="/testimonies" query={{ share: 1 }}>
              {ct("auto.prayer.2d0498ebfeb9dd9a")}</Btn>
          </Card>
        </div>
      </Section>
    </>
  );
}

function PrayerForm({ onSubmit, onPosted }: { onSubmit: (r: any) => void; onPosted: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    category: "healing",
    urgency: "normal" as "normal" | "urgent",
    text: "",
    anonymous: false,
    followUp: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<null | { text: string; category: string; name: string }>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const cat = PRAYER_CATEGORIES.find((c) => c.id === form.category) || PRAYER_CATEGORIES[0];
  const verse = pickForDay(SCRIPTURES.filter((s) => s.theme === cat.verseTheme).length ? SCRIPTURES.filter((s) => s.theme === cat.verseTheme) : SCRIPTURES, form.category);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.anonymous && !form.name.trim()) errs.name = "Add your name, or tick anonymous.";
    if (form.text.trim().length < 10) errs.text = "Please write a little more so we can pray specifically.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) errs.email = "That email doesn't look right.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      fireToast(ct("auto.prayer.ce49e6065df0aa07"), "error");
      return;
    }
    onSubmit({
      name: form.anonymous ? ct("auto.prayer.1f4ccbbee72e3aaf") : form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      category: form.category,
      urgency: form.urgency,
      text: form.text.trim(),
      anonymous: form.anonymous,
      followUp: form.followUp,
    });
    setSent({ text: form.text.trim(), category: form.category, name: form.anonymous ? ct("auto.prayer.1f4ccbbee72e3aaf") : form.name.trim() });
    fireToast(ct("auto.prayer.b35ec2c6d50eeca7"), "success");
  };

  if (sent) {
    const body = ct("auto.prayer.aca3923370978462", { "name": sent.name, "v1": categoryLabel(sent.category), "text": sent.text });
    return (
      <div className="prayer-success">
        <span className="prayer-success__icon"><Icon name="check" size={26} /></span>
        <h2>{ct("prayer.sent.title")}</h2>
        <p className="lede">{ct("prayer.sent.text")}</p>
        <div className="prayer-verse">
          <Icon name="book" size={18} />
          <blockquote>
            “{verse.text}”
            <cite>{verse.ref}</cite>
          </blockquote>
        </div>
        <div className="btn-row">
          <Btn icon="mail" href={mailto(SITE.prayerEmail, ct("auto.prayer.9c170a7c674be23d", { "v0": categoryLabel(sent.category) }), body)}>
            {ct("auto.prayer.6b90369c0c8c5aa5")}</Btn>
          <Btn variant="ghost" icon="whatsapp" href={whatsappLink(body)}>
            {ct("auto.prayer.ab98d52a92ed1e23")}</Btn>
          <Btn variant="ghost" icon="copy" onClick={() => copyText(body, ct("auto.prayer.aa4da2a232f06a4b"))}>
            {ct("auto.prayer.4dc3fbb346169fe2")}</Btn>
        </div>
        <Notice icon="people">
          {ct("auto.prayer.7207b28fc9d5e13e")}{" "}
          <button type="button" className="link-btn" onClick={onPosted}>
            {ct("auto.prayer.b633471a892c2c93")}</button>
          .
        </Notice>
        <div className="btn-row">
          <Btn variant="quiet" icon="plus" onClick={() => { setSent(null); set({ text: "" }); }}>
            {ct("auto.prayer.54c8176781076ede")}</Btn>
        </div>
      </div>
    );
  }

  return (
    <form className="prayer-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label={ct("auto.prayer.1395ed436049aa42")} error={errors.name}>
          <Input value={form.anonymous ? "" : form.name} disabled={form.anonymous} onChange={(e) => set({ name: e.target.value })} placeholder={ct("auto.prayer.e13f69dee573813f")} invalid={!!errors.name} />
        </Field>
        <Field label={ct("auto.prayer.b6806cd9c9031e40")} hint={ct("auto.prayer.5076c51e3be1c4c7")} error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder={ct("auto.prayer.ef259f899f7c25f8")} invalid={!!errors.email} />
        </Field>
        <Field label={ct("auto.prayer.ac25c3b855d729e1")} hint={ct("auto.prayer.d5b25b45414aa69c")}>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 214 555 0147" />
        </Field>
        <Field label={ct("auto.prayer.6a5824ad4e0b795c")}>
          <Select value={form.category} onChange={(e) => set({ category: e.target.value })} options={PRAYER_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
        </Field>
        <div className="form-grid__full">
          <Field label={ct("auto.prayer.24a5f711eb94f968")}>
            <div className="chips">
              <Chip active={form.urgency === "normal"} onClick={() => set({ urgency: "normal" })} icon="clock">
                {ct("auto.prayer.642102886d58a5a1")}</Chip>
              <Chip active={form.urgency === "urgent"} onClick={() => set({ urgency: "urgent" })} icon="alert">
                {ct("auto.prayer.58fefb3b0415445a")}</Chip>
            </div>
          </Field>
        </div>
        <div className="form-grid__full">
          <Field label={ct("auto.prayer.620ba024ef283ae5")} required hint={ct("auto.prayer.03c61934335a6805", { "length": form.text.length })} error={errors.text}>
            <Textarea rows={7} value={form.text} onChange={(e) => set({ text: e.target.value })} placeholder={ct("auto.prayer.bbd4f97c81141115")} invalid={!!errors.text} />
          </Field>
        </div>
        <div className="form-grid__full">
          <Checkbox checked={form.anonymous} onChange={(v) => set({ anonymous: v })} label={ct("auto.prayer.d2822f4951b76f48")} hint={ct("auto.prayer.44b1c7e40d0c5d55")} />
          <Checkbox checked={form.followUp} onChange={(v) => set({ followUp: v })} label={ct("auto.prayer.ba40f4d4e16ae235")} hint={ct("auto.prayer.e78a83e8a49ab321")} />
        </div>
      </div>
      <div className="prayer-form__foot">
        <Btn type="submit" variant="crimson" size="lg" icon="prayer">
          {ct("auto.prayer.7b21b735d9166af4")}</Btn>
        <p className="muted">
          <Icon name="lock" size={14} /> {ct("auto.prayer.1180279501bd7174")}</p>
      </div>
    </form>
  );
}

function PostToWall({ onPost }: { onPost: (w: any) => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("healing");
  const [anon, setAnon] = useState(true);
  return (
    <div className="wall-post">
      <h3>{ct("auto.prayer.390887f0b89e12c1")}</h3>
      <p className="muted">{ct("prayer.wall.note")}</p>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={ct("auto.prayer.01cbe729c2ae9878")} />
      <div className="wall-post__row">
        <Input value={anon ? "" : name} disabled={anon} onChange={(e) => setName(e.target.value)} placeholder={ct("auto.prayer.5e773ef9267bcb50")} />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} options={PRAYER_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
        <Btn
          icon="send"
          onClick={() => {
            if (text.trim().length < 8) {
              fireToast(ct("auto.prayer.c867ed00a1a88b61"), "error");
              return;
            }
            onPost({ name: anon ? ct("auto.prayer.1f4ccbbee72e3aaf") : name.trim() || ct("auto.prayer.63bd20d38814e64a"), category, text: text.trim() });
            setText("");
            fireToast(ct("auto.prayer.8c736db88a3c6401"), "success");
          }}
        >
          {ct("auto.prayer.d8b8f61d3a815aa4")}</Btn>
      </div>
      <Checkbox checked={anon} onChange={setAnon} label={ct("auto.prayer.740d5c672a9b52c6")} />
    </div>
  );
}
