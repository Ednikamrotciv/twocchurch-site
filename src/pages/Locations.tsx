import React, { useEffect, useMemo, useState } from "react";
import { tx } from "../lib/i18n";
import { useRoute, Link } from "../lib/router";
import { BRANCHES, COUNTRIES, DEFAULT_BRANCH_ID, groupByCountry, type Branch } from "../data/branches";
import { photoOr } from "../data/photos";
import { useLocalState, fireToast, useNow } from "../lib/hooks";
import { useCmsVersion } from "../lib/cms";
import { KEYS, haversineKm, fmtDistance, copyText, nextService, countdownParts, to12h, DAY_NAMES } from "../lib/store";
import { Badge, Btn, Card, Chip, Eyebrow, Icon, Reveal, Rich, Section, SectionHeading, Notice } from "../components/ui";
import { ct } from "../data/copy";
import { PageHead } from "../components/layout";
import { BranchCard, BranchMapPopup, BranchPanel, ServiceTimesList, NextServiceCard, SearchBox, daysUntil } from "../components/blocks";

export function Locations() {
  const { query } = useRoute();
  const [branchId, setBranchId] = useLocalState<string>(KEYS.branch, DEFAULT_BRANCH_ID);
  const requested = query.get("branch");
  const [selectedId, setSelectedId] = useState<string>(requested || branchId);
  const [mapOpen, setMapOpen] = useState(false);
  const [country, setCountry] = useState<string>("");
  const [q, setQ] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied" | "unsupported">("idle");
  const now = useNow(30000);
  /* While the drawer is open over this very page, a branch or a sub-branch added
     from it has to appear here at once — hence the tick: the list below is built
     from `BRANCHES`, which the draft refills in place (SPEC note 78). */
  const cmsVersion = useCmsVersion();

  useEffect(() => {
    if (requested && BRANCHES.some((b) => b.id === requested)) setSelectedId(requested);
  }, [requested]);

  const ranked = useMemo(() => {
    const withDistance = BRANCHES.map((b) => ({
      branch: b,
      km: coords ? haversineKm(coords, { lat: b.lat, lng: b.lng }) : null,
    }));
    if (coords) withDistance.sort((a, b) => (a.km as number) - (b.km as number));
    return withDistance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, cmsVersion]);

  const filtered = ranked.filter(({ branch }) => {
    if (country && branch.country !== country) return false;
    if (!q.trim()) return true;
    const hay = `${branch.city} ${branch.country} ${branch.name} ${branch.address} ${branch.pastor} ${branch.languages.join(" ")}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  /* One block per country: its branches, then sub-branches under their parents (note 87). */
  const groups = useMemo(
    () =>
      groupByCountry(filtered).map((g) => {
        const rows = coords ? g.rows : [...g.rows].sort((a, b) => Number(!!a.branch.isSub) - Number(!!b.branch.isSub));
        const childrenOf = (row: { branch: Branch }) =>
          rows.filter((s) => s.branch.isSub && !!s.branch.parentId && s.branch.parentId === row.branch.id);
        const families = rows.map((row) => ({ parent: row, subs: childrenOf(row) })).filter((f) => f.subs.length > 0);
        const loose = rows.filter((r) => r.branch.isSub && !families.some((f) => f.subs.includes(r)));
        return { ...g, mains: rows.filter((r) => !r.branch.isSub), families, loose };
      }),
    [filtered, coords]
  );

  const subBranches = BRANCHES.filter((b) => b.isSub).length;

  const selected = BRANCHES.find((b) => b.id === selectedId) || BRANCHES[0];

  /* The rest of the family, for the panel beside the map. */
  const others = useMemo(() => {
    const rest = ranked.filter((r) => r.branch.id !== selected.id);
    if (coords) return rest.map((r) => ({ branch: r.branch, km: r.km }));
    const siblings = rest.filter((r) => r.branch.country === selected.country);
    return (siblings.length ? siblings : rest).map((r) => ({ branch: r.branch, km: null }));
  }, [ranked, selected, coords]);

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoState("unsupported");
      fireToast(ct("auto.locations.bf9bc60b355a9aba"), "error");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("idle");
        fireToast(ct("auto.locations.2ec154d09fa46001"), "success");
      },
      () => {
        setGeoState("denied");
        fireToast(ct("auto.locations.d781255ba0dcff8a"), "error");
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  };

  const select = (b: Branch, scroll = false) => {
    setSelectedId(b.id);
    if (scroll) document.getElementById("branch-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* One grid of cards, used for a country's own branches and for each set of
     sub-branches the same way. A branch the office has only just added has no
     URL id yet, so the row's place in the list stands in as its key. */
  const branchCards = (rows: { branch: Branch; km: number | null }[]) => (
    <div className="grid grid-3">
      {rows.map(({ branch, km }, i) => (
        <Reveal key={branch.id || `branch-row-${i}`} delay={i * 50}>
          <BranchCard branch={branch} distanceKm={typeof km === "number" ? km : null} active={branch.id === selectedId} onSelect={(b) => select(b, true)} />
        </Reveal>
      ))}
    </div>
  );

  return (
    <>
      <PageHead
        eyebrow={ct("locations.head.eyebrow")}
        title={<Rich text={ct("locations.head.title")} />}
        lede={ct("locations.head.lede")}
        image={photoOr(BRANCHES[0].image, "building")}
        crumbs={[{ label: ct("auto.locations.27cb1cfd354ac87c"), to: "/" }, { label: ct("auto.locations.ea0222ac08b57d85") }]}
        actions={
          <>
            <Btn onClick={locate} icon="pin" variant="gold">
              {geoState === "loading" ? ct("auto.locations.c83b24071db9fc46") : ct("locations.head.action1")}
            </Btn>
            <Btn to="/visit" variant="ghost" icon="ticket">
              {ct("locations.head.action2")}
            </Btn>
          </>
        }
      >
        <div className="location-stats">
          <span><b>{BRANCHES.length}</b> {ct("auto.locations.bf6bf4cc74684fcd")}</span>
          <span><b>{COUNTRIES.length}</b> {ct("auto.locations.458387c25b31edeb")}</span>
          {/* No sub-branches is not a fact worth a chip: with none in the list
              (SPEC note 87) the row is branches and countries, and the third
              chip comes back by itself the moment one is added. */}
          {subBranches > 0 && (
            <span><b>{subBranches}</b> {ct("auto.locations.c10a1349a5230a00")}</span>
          )}
        </div>
      </PageHead>

      <Section>
        <div className="filterbar">
          <SearchBox value={q} onChange={setQ} placeholder={ct("locations.search")} />
          <div className="chips">
            <Chip active={!country} onClick={() => setCountry("")}>
              {ct("auto.locations.e4309419b7c73058")}</Chip>
            {COUNTRIES.map((name) => (
              <Chip key={name} active={country === name} onClick={() => setCountry(name)}>
                {tx(name)}
              </Chip>
            ))}
          </div>
          {coords && (
            <Badge accent="sky" icon="pin">
              {ct("locations.geo.badge")}
            </Badge>
          )}
        </div>

        {(geoState === "denied" || geoState === "unsupported") && (
          <Notice icon="alert" tone="crimson">{ct("locations.geo.denied")}</Notice>
        )}

        {filtered.length === 0 ? (
          <Notice icon="search" tone="gold">
            <Rich text={ct("locations.noMatch")} />
          </Notice>
        ) : (
          groups.map((g) => (
            <div className="branch-country" key={g.country}>
              <div className="branch-country__head">
                <span className="branch-country__flag" aria-hidden="true">{g.flag}</span>
                <div>
                  <h3 className="branch-country__name">{g.country}</h3>
                  <p className="branch-country__meta">
                    {g.region} · {g.rows.length} {g.rows.length === 1 ? ct("auto.locations.b3a8fe54e6549bad") : ct("auto.locations.5ab0a53c9474c20d")}
                  </p>
                </div>
              </div>
              {g.mains.length > 0 && branchCards(g.mains)}
              {g.families.map((f) => (
                <div className="branch-sub" key={`subs-${f.parent.branch.id}`}>
                  {branchCards(f.subs)}
                </div>
              ))}
              {g.loose.length > 0 && (
                <div className="branch-sub">
                  {branchCards(g.loose)}
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      <Section tone="raised" id="branch-detail">
        <SectionHeading
          eyebrow={ct("locations.detail.eyebrow")}
          title={selected.city}
          lede={selected.name}
          actions={
            <Btn onClick={() => { setBranchId(selected.id); fireToast(ct("auto.locations.13dbd0dfc8a61ece", { "city": selected.city }), "success"); }} variant={branchId === selected.id ? "quiet" : "gold"} icon="star" size="sm">
              {branchId === selected.id ? ct("locations.detail.isBranch") : ct("locations.detail.setBranch")}
            </Btn>
          }
        />
        <BranchPanel branch={selected} others={others} onSelect={(b) => select(b, true)} />
        <div className="branch-detail-grid mt-3">
          <Card className="branch-detail__times">
            <h3>{ct("locations.times.title")}</h3>
            <ServiceTimesList branch={selected} />
          </Card>
          <Card className="branch-detail__next">
            <NextServiceCard />
          </Card>
          <Card className="branch-detail__ministries">
            <h3>{ct("locations.at.title")}</h3>
            <h4>{ct("locations.lang.title")}</h4>
            <div className="tag-list">
              {selected.languages.map((l) => (
                <span className="tag" key={l}><Icon name="globe" size={12} /> {l}</span>
              ))}
            </div>
            <div className="btn-row">
              <Btn size="sm" onClick={() => setMapOpen(true)} icon="compass">
                {ct("auto.locations.e9255c2c10ef0ddd")}</Btn>
              <Btn size="sm" variant="ghost" icon="phone" href={`tel:${selected.phone.replace(/[^\d+]/g, "")}`}>
                {ct("auto.locations.328109fa435071e3")}</Btn>
              <Btn size="sm" variant="quiet" icon="mail" href={`mailto:${selected.email}`}>
                {ct("auto.locations.73812256e1273207")}</Btn>
            </div>
          </Card>
        </div>
        {mapOpen && <BranchMapPopup branch={selected} onClose={() => setMapOpen(false)} />}
      </Section>

      <Section>
        <SectionHeading
          center
          eyebrow={ct("locations.groups.eyebrow")}
          title={ct("locations.groups.title")}
          lede={ct("locations.groups.lede")}
        />
        <div className="grid grid-3">
          <Card className="callout-card">
            <Icon name="people" size={24} />
            <h3>{ct("locations.card1.title")}</h3>
            <p>{ct("locations.card1.text")}</p>
          </Card>
          <Card className="callout-card">
            <Icon name="book" size={24} />
            <h3>{ct("locations.card2.title")}</h3>
            <p>{ct("locations.card2.text")}</p>
          </Card>
          <Card className="callout-card">
            <Icon name="heart" size={24} />
            <h3>{ct("locations.card3.title")}</h3>
            <p>{ct("locations.card3.text")}</p>
            <Btn size="sm" variant="ghost" to="/contact" iconRight="arrowRight">
              {ct("locations.card3.action")}
            </Btn>
          </Card>
        </div>
      </Section>
    </>
  );
}
