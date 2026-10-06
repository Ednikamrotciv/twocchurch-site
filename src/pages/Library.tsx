import React, { useState } from "react";
import { tx } from "../lib/i18n";
import { Link } from "../lib/router";
import { SERMONS, sermonDate } from "../data/sermons";
import { READING_PLAN } from "../data/content";
import { useLibrary, useReadingPlan, useGivingLog, usePrayerRequests, useTestimonies, useWall, useVisitPlan } from "../lib/collections";
import { KEYS, fmtDate, fmtMoney, fmtDuration, parseDuration } from "../lib/store";
import { Badge, Btn, Card, Empty, Icon, Modal, Notice, Reveal, Rich, Section, SectionHeading, Tabs } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { SermonCard } from "../components/blocks";
import { fireToast } from "../lib/hooks";

export function Library() {
  const [tab, setTab] = useState<"saved" | "notes" | "activity">("saved");
  const lib = useLibrary();
  const reading = useReadingPlan();
  const giving = useGivingLog();
  const prayers = usePrayerRequests();
  const testimonies = useTestimonies();
  const wall = useWall();
  const visit = useVisitPlan();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const savedSermons = SERMONS.filter((s) => lib.saved.includes(s.id));
  const watchedSermons = SERMONS.filter((s) => lib.watched.includes(s.id));
  const noteEntries = SERMONS.filter((s) => (lib.notes[s.id] || "").trim().length > 0);
  const watchedMinutes = watchedSermons.reduce((n, s) => n + parseDuration(s.durationText), 0);

  const resetAll = () => {
    Object.values(KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    ["wom.amenMap", "wom.prayedMap", "wom.memorised", "wom.reminders"].forEach((k) => localStorage.removeItem(k));
    setConfirmOpen(false);
    fireToast(ct("auto.library.84c17ce4af826175"), "success");
    window.setTimeout(() => window.location.reload(), 900);
  };

  return (
    <>
      <PageHead
        eyebrow={ct("library.head.eyebrow")}
        title={<Rich text={ct("library.head.title")} />}
        lede={ct("library.head.lede")}
        crumbs={[{ label: ct("auto.library.b182fa74ccf0acd5"), to: "/" }, { label: ct("auto.library.1a616812db45af13") }]}
        actions={
          <>
            <Btn to="/sermons" variant="ghost" icon="play">
              {ct("auto.library.471619d406fc1b6d")}</Btn>
            <Btn variant="quiet" icon="trash" onClick={() => setConfirmOpen(true)}>
              {ct("auto.library.2dd4264e786234ff")}</Btn>
          </>
        }
      />

      <Section>
        <div className="library-stats">
          <Card className="stat-card">
            <span className="stat-card__value">{savedSermons.length}</span>
            <span className="stat-card__label">{ct("auto.library.728002199694abc8")}</span>
          </Card>
          <Card className="stat-card">
            <span className="stat-card__value">{watchedSermons.length}</span>
            <span className="stat-card__label">{ct("auto.library.794016789f8160b1")}{watchedMinutes ? ` · ${fmtDuration(watchedMinutes)}` : ""}</span>
          </Card>
          <Card className="stat-card">
            <span className="stat-card__value">{noteEntries.length}</span>
            <span className="stat-card__label">{ct("auto.library.cdff37ff9b62c03e")}</span>
          </Card>
        </div>

        <Tabs
          tabs={[
            { id: "saved", label: ct("auto.library.aca2a86e69b9517f"), count: savedSermons.length },
            { id: "notes", label: ct("auto.library.477f584c6f37b12d"), count: noteEntries.length },
            { id: "activity", label: ct("auto.library.24bbe5e1c1a9cf40") },
          ]}
          active={tab}
          onChange={(t) => setTab(t as any)}
        />

        {tab === "saved" && (
          <div className="library-panel">
            {savedSermons.length === 0 ? (
              <Empty
                icon="bookmark"
                title={ct("auto.library.00fe26ab45b8621a")}
                text={ct("library.saved.empty")}
                action={<Btn to="/sermons" icon="play">{ct("auto.library.dac5de769e160147")}</Btn>}
              />
            ) : (
              <div className="grid grid-3">
                {savedSermons.map((s, i) => (
                  <Reveal key={s.id} delay={(i % 3) * 50}>
                    <SermonCard sermon={s} />
                  </Reveal>
                ))}
              </div>
            )}
            {watchedSermons.length > 0 && (
              <>
                <h3 className="mt-4">{ct("auto.library.155b47873f3e2d1e")}</h3>
                <div className="watched-strip">
                  {watchedSermons.map((s) => (
                    <Link key={s.id} to={`/sermons/${s.id}`} className="watched-chip">
                      <Icon name="check" size={14} />
                      <span>
                        <b>{tx(s.title)}</b>
                        <em>{fmtDate(sermonDate(s), "short")}</em>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="library-panel">
            {noteEntries.length === 0 ? (
              <Empty icon="clipboard" title={ct("auto.library.6fa615e979d6ff98")} text={ct("library.notes.empty")} action={<Btn to="/sermons" icon="play">{ct("auto.library.608a70ba08df0ccb")}</Btn>} />
            ) : (
              <ul className="notes-list">
                {noteEntries.map((s) => (
                  <li key={s.id}>
                    <Card>
                      <div className="notes-list__head">
                        <div>
                          {s.scripture && <Badge accent="gold">{s.scripture}</Badge>}
                          <h3>{tx(s.title)}</h3>
                          <p className="muted">
                            {s.speaker} · {fmtDate(sermonDate(s), "medium")}
                          </p>
                        </div>
                        <Btn size="sm" variant="ghost" to={`/sermons/${s.id}`} iconRight="arrowRight">
                          {ct("auto.library.eabbe11199a48a90")}</Btn>
                      </div>
                      <p className="notes-list__body">{tx(lib.notes[s.id])}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="library-panel">
            <div className="grid grid-2">
              <Card>
                <h3>{ct("auto.library.1ab96b2633fb6107")}</h3>
                {prayers.requests.length === 0 ? (
                  <p className="muted">{ct("auto.library.d6d83b80c3fba441")}<Link to="/prayer">{ct("auto.library.3a64c04a251aa3d3")}</Link>.</p>
                ) : (
                  <ul className="mini-list">
                    {prayers.requests.slice(0, 5).map((r) => (
                      <li key={r.id}>
                        <Badge accent={r.answered ? "emerald" : "gold"}>{r.answered ? ct("auto.library.ae2c7da828a58f99") : ct("auto.library.c9057b8997bf1b28")}</Badge>
                        <span>{tx(r.text.slice(0, 90))}{r.text.length > 90 ? "…" : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Btn size="sm" variant="ghost" to="/prayer" block iconRight="arrowRight">
                  {ct("auto.library.f27930ab96ab64da")}</Btn>
              </Card>

              <Card>
                <h3>{ct("auto.library.f3b1f624004ad365")}</h3>
                {testimonies.mine.length === 0 ? (
                  <p className="muted">{ct("auto.library.64e7b0d116afa248")}<Link to="/testimonies?share=1">{ct("auto.library.e6f8de589c2e59a1")}</Link>.</p>
                ) : (
                  <ul className="mini-list">
                    {testimonies.mine.map((t) => (
                      <li key={t.id}>
                        <Badge accent="crimson">{tx(t.title.slice(0, 30))}</Badge>
                        <span>{fmtDate(t.createdAt, "short")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Btn size="sm" variant="ghost" to="/testimonies" block iconRight="arrowRight">
                  {ct("auto.library.dd66ffa356a97f8a")}</Btn>
              </Card>

              <Card>
                <h3>{ct("auto.library.cc9677737e0e43aa")}</h3>
                <p className="muted">{ct("auto.library.afe76bf88264cd39")}<b>{wall.mine.length + Object.keys(wall.all).length ? wall.all.filter((w) => wall.iPrayed(w.id)).length : 0}</b> {ct("auto.library.7cd7388a7ab5cce3")}<b>{wall.total.toLocaleString()}</b> {ct("auto.library.3afa8cb2a9302bc3")}</p>
                <Btn size="sm" variant="ghost" to="/prayer" block iconRight="arrowRight">
                  {ct("auto.library.984b761cecb2a3c5")}</Btn>
              </Card>

              <Card>
                <h3>{ct("auto.library.bb2e42382fd6d921")}</h3>
                {visit.plan ? (
                  <>
                    <p className="muted">
                      {ct("auto.library.882e251c958948bd")}{fmtDate(visit.plan.createdAt, "medium")} · {visit.plan.adults} {ct("auto.library.9d78e579b9e988a0")}{visit.plan.kids ? `, ${visit.plan.kids} child(ren)` : ""}
                    </p>
                    <div className="btn-row">
                      <Btn size="sm" variant="ghost" to="/visit" iconRight="arrowRight">
                        {ct("auto.library.12a8f2ab3672006a")}</Btn>
                      <Btn size="sm" variant="quiet" icon="trash" onClick={() => { visit.clear(); fireToast(ct("auto.library.97d49d0fe69f34f6"), "success"); }}>
                        {ct("auto.library.70ecc4d8dd176419")}</Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted">{ct("auto.library.e0cbde4dd15d9c0c")}</p>
                    <Btn size="sm" variant="ghost" to="/visit" block icon="ticket">
                      {ct("auto.library.38f8cfa242c56073")}</Btn>
                  </>
                )}
              </Card>

              <Card>
                <h3>{ct("auto.library.f797d90657c4e2bf")}</h3>
                <p className="muted">
                  {reading.done.length} {ct("auto.library.d1d6d400dde335f9")}{READING_PLAN.length} {ct("auto.library.fc3944f187dfa978")}</p>
                <Btn size="sm" variant="ghost" to="/devotional" block iconRight="arrowRight">
                  {ct("auto.library.7c74d6968f26b3c7")}</Btn>
              </Card>

              <Card>
                <h3>{ct("auto.library.8db052bc85781fa5")}</h3>
                {giving.log.length === 0 ? (
                  <p className="muted">{ct("auto.library.cc05be88d0dae861")}</p>
                ) : (
                  <ul className="mini-list">
                    {giving.log.slice(0, 5).map((g) => (
                      <li key={g.id}>
                        <b>{fmtMoney(g.amount)}</b>
                        <span>
                          {tx(g.fund)} · {fmtDate(g.createdAt, "short")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Btn size="sm" variant="ghost" to="/giving" block iconRight="arrowRight">
                  {ct("auto.library.3aa1c7685a096481")}</Btn>
              </Card>
            </div>
          </div>
        )}
      </Section>

      <Section tone="raised">
        <Notice icon="lock" tone="gold">{ct("library.privacy")}</Notice>
      </Section>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={ct("library.clear.title")}
        footer={
          <>
            <Btn variant="quiet" onClick={() => setConfirmOpen(false)}>
              {ct("auto.library.7aa16dfc97674835")}</Btn>
            <Btn variant="crimson" icon="trash" onClick={resetAll}>
              {ct("auto.library.bfde9fdce513d525")}</Btn>
          </>
        }
      >
        <p>{ct("library.clear.text")}</p>
      </Modal>
    </>
  );
}
