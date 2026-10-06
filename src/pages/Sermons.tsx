import React, { useMemo, useState } from "react";
import { tx } from "../lib/i18n";
import { SERMONS, SPEAKERS, SERMON_YEARS, sermonsNewestFirst, newestFirst, sermonDate, sermonSource, type Sermon } from "../data/sermons";
import { ct } from "../data/copy";
import { img } from "../data/site";
import { Badge, Btn, Card, Empty, Eyebrow, Icon, Reveal, Rich, Section, SectionHeading } from "../components/ui";
import { PageHead } from "../components/layout";
import { SearchBox, SermonCard, VideoPlayer, WatchCards } from "../components/blocks";
import { fmtDate, fmtDuration, zonedParts, tidyCount } from "../lib/store";
import { NewsletterForm } from "../components/blocks";

export function Sermons() {
  const [speaker, setSpeaker] = useState("all");
  const [year, setYear] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "longest" | "shortest" | "title">("newest");

  const all = sermonsNewestFirst();
  const featured = all[0];

  const results = useMemo(() => {
    let list = all.filter((s) => {
      if (speaker !== "all" && s.speaker !== speaker) return false;
      if (year !== "all" && String(zonedParts(sermonDate(s)).year) !== year) return false;
      if (q.trim()) {
        const hay = `${s.title} ${s.speaker} ${s.scripture} ${s.summary} ${s.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const da = a.durationText.split(":").map(Number);
      const db = b.durationText.split(":").map(Number);
      const mins = (x: number[]) => (x.length === 3 ? x[0] * 60 + x[1] : x[0]);
      return sort === "longest" ? mins(db) - mins(da) : sort === "shortest" ? mins(da) - mins(db) : newestFirst(a, b);
    });
    return list;
  }, [all, speaker, year, q, sort]);

  const totalMinutes = SERMONS.reduce((n, s) => {
    const p = s.durationText.split(":").map(Number);
    return n + (p.length === 3 ? p[0] * 60 + p[1] : p[0]);
  }, 0);

  return (
    <>
      <PageHead
        eyebrow={ct("sermons.head.eyebrow")}
        title={<Rich text={ct("sermons.head.title")} />}
        lede={ct("sermons.head.lede", { count: SERMONS.length, hours: fmtDuration(totalMinutes) })}
        image={img("worshipband")}
        crumbs={[{ label: ct("auto.sermons.d98930b23a8fb023"), to: "/" }, { label: ct("auto.sermons.7a531bce75ffbdb7") }]}
        actions={
          <>
            <Btn to="/watch-live" variant="crimson" icon="live">
              {ct("auto.sermons.fc1c66de6a02d30f")}</Btn>
            <Btn to="/library" variant="ghost" icon="bookmark">
              {ct("auto.sermons.d8d17e68e5e5c719")}</Btn>
          </>
        }
      />

      <Section className="sermon-featured">
        <SectionHeading eyebrow={ct("sermons.featured.eyebrow")} title={tx(featured.title)} lede={`${featured.speaker} · ${fmtDate(sermonDate(featured), "long")}${featured.durationText ? ` · ${tx(featured.durationText)}` : ""}`} />
        <div className="sermon-featured__grid">
          <VideoPlayer source={sermonSource(featured)} title={tx(featured.title)} compact />
          <Card className="sermon-featured__side">
            {featured.scripture && <Badge accent="gold">{featured.scripture}</Badge>}
            {featured.summary && <p>{tx(featured.summary)}</p>}
            {featured.points.length > 0 && (
              <ul className="tick-list tick-list--compact">
                {featured.points.map((p) => (
                  <li key={p}>
                    <Icon name="check" size={16} />
                    <span>{tx(p)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="btn-row">
              <Btn to={`/sermons/${featured.id}`} icon="play">
                {ct("auto.sermons.d73260fc619ba3f5")}</Btn>
            </div>
          </Card>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading eyebrow={ct("sermons.archive.eyebrow")} title={ct("sermons.archive.title")} />
        <div className="filterbar">
          <SearchBox value={q} onChange={setQ} placeholder={ct("sermons.search")} />
          <div className="filterbar__selects">
            <label className="inline-field">
              <span>{ct("auto.sermons.ad8d1b74a984475d")}</span>
              <select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                <option value="all">{ct("auto.sermons.fad98d1cf848392d")}</option>
                {SPEAKERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field">
              <span>{ct("auto.sermons.16c37572baeef3a3")}</span>
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">{ct("auto.sermons.1f698050a7117e19")}</option>
                {SERMON_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field">
              <span>{ct("auto.sermons.addefba7cd7ea92e")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="newest">{ct("auto.sermons.99399bc799e697e6")}</option>
                <option value="longest">{ct("auto.sermons.e8eca975d436587c")}</option>
                <option value="shortest">{ct("auto.sermons.c2eb34f70c08b74e")}</option>
                <option value="title">{ct("auto.sermons.f8588c9ac52134db")}</option>
              </select>
            </label>
          </div>
        </div>

        <p className="result-count">
          {tidyCount(ct("sermons.results", { n: results.length }))}
        </p>

        {results.length === 0 ? (
          <Empty
            icon="search"
            title={ct("sermons.empty.title")}
            text={ct("sermons.empty.text")}
            action={
              <Btn
                onClick={() => {
                  setQ("");
                  setSpeaker("all");
                  setYear("all");
                }}
                variant="ghost"
                icon="close"
              >
                {ct("auto.sermons.9ec9682b5f8d7a6a")}</Btn>
            }
          />
        ) : (
          <div className="grid grid-3">
            {results.map((s, i) => (
              <Reveal key={s.id} delay={(i % 3) * 60}>
                <SermonCard sermon={s} />
              </Reveal>
            ))}
          </div>
        )}
      </Section>

      <Section>
        <SectionHeading center eyebrow={ct("sermons.ways.eyebrow")} title={ct("sermons.ways.title")} />
        <WatchCards />
        <div className="newsletter-block mt-3">
          <NewsletterForm />
        </div>
      </Section>
    </>
  );
}

export type { Sermon };
