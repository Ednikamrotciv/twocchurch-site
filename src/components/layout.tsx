import React, { useEffect, useMemo, useState } from "react";
import { tx } from "../lib/i18n";
import { Link, navigate, useRoute } from "../lib/router";
import { useHotkey, useMediaQuery, useScrollProgress, useTheme, useNow, useClickOutside, useBodyLock } from "../lib/hooks";
import { nextService, onAir, countdownParts, to12h, DAY_SHORT, fmtDate, zoneYear, clockAt, churchTimezone, visitorPlace } from "../lib/store";
import { SITE, SERVICES, NAV, FOOTER_LINKS, LOGO_MARK } from "../data/site";
import { siteFile } from "../lib/livefeed";
import { BRANCHES, HQ } from "../data/branches";
import { SERMONS, sermonDate, sermonThumb } from "../data/sermons";
import { EVENTS, SEED_TESTIMONIES } from "../data/content";
import { Icon, IconBtn, OPEN_SEARCH_EVENT } from "./ui";
import { eventDate, AnnouncementBanner } from "./blocks";
import { ct } from "../data/copy";

/* ------------------------------------------------------------------ search index */

export type SearchResult = { title: string; sub: string; to: string; group: string; image?: string; icon?: string };

export function buildSearchIndex(): SearchResult[] {
  const out: SearchResult[] = [];
  NAV.forEach((n) => out.push({ title: ct(n.label), sub: ct(n.desc), to: n.to, group: ct("auto.site.87e12eb455d96a3d"), icon: "arrowRight" }));
  out.push({ title: ct("auto.site.bd483b824b77a2eb"), sub: ct("auto.site.751fc90d5c1e1a94"), to: "/prayer", group: ct("auto.site.87e12eb455d96a3d"), icon: "prayer" });
  out.push({ title: ct("auto.site.68fc9277d442974e"), sub: ct("auto.site.889d4217cb3054de"), to: "/visit", group: ct("auto.site.87e12eb455d96a3d"), icon: "ticket" });
  out.push({ title: ct("auto.site.f52fde95565321c4"), sub: ct("auto.site.e6b3ff9b0492442a"), to: "/watch-live", group: ct("auto.site.87e12eb455d96a3d"), icon: "live" });
  out.push({ title: ct("auto.site.fa0cb5a87e43a7a9"), sub: ct("auto.site.d2caeb10c5229249"), to: "/devotional", group: ct("auto.site.87e12eb455d96a3d"), icon: "book" });
  out.push({ title: ct("auto.site.befb7cc797a4b1a6"), sub: ct("auto.site.4433e647d803e156"), to: "/ministries", group: ct("auto.site.87e12eb455d96a3d"), icon: "people" });
  out.push({ title: ct("auto.site.9c4a6583be884afa"), sub: ct("auto.site.615a2808c27e0c49"), to: "/library", group: ct("auto.site.87e12eb455d96a3d"), icon: "bookmark" });

  SERMONS.forEach((s) =>
    out.push({
      title: tx(s.title),
      sub: `${s.speaker} · ${s.durationText}`,
      to: `/sermons/${s.id}`,
      group: ct("auto.site.87cbe2336529b73a"),
      image: sermonThumb(s),
    })
  );
  BRANCHES.forEach((b) => out.push({ title: b.city, sub: `${b.name} · ${b.country} · ${b.pastor}`, to: `/locations?branch=${b.id}`, group: ct("auto.site.34338808974a0881"), icon: "pin" }));
  EVENTS.forEach((e) => out.push({ title: tx(e.title), sub: `${e.location} · ${to12h(clockAt(eventDate(e)).time)}`, to: `/events`, group: ct("auto.site.4e4aad3fa996c40e"), icon: "calendar" }));
  SEED_TESTIMONIES.forEach((t) => out.push({ title: tx(t.title), sub: `${t.name} · ${t.city}`, to: "/testimonies", group: ct("auto.site.ca64a95e0b990edf"), icon: "quote" }));
  return out;
}

/* ------------------------------------------------------------------ header */

function ServicePill() {
  const now = useNow(1000);
  /* The office's Weekly services card, read on the church's own clock. */
  const info = nextService(SERVICES, now, churchTimezone());
  if (!info) return null;
  /* The office's *We are on air now* switch, or the clock (SPEC note 83). */
  const live = onAir(info);
  return (
    <div className={"service-pill" + (live ? " service-pill--live" : "")}>
      {live ? (
        <>
          <span className="live-dot" />
          <b>{ct("auto.site.96c2adc6bda4059f")}</b>
          {/* Which gathering is on is the clock's to say. When the office's
              switch is the one that put us on air, there is no slot to name —
              the badge alone is the honest answer. */}
          {info.isLive && <span>{tx(info.slot.name)}</span>}
        </>
      ) : (
        <>
          <Icon name="clock" size={14} />
          <span>{(visitorPlace() || HQ.city).split(",")[0]} · {tx(info.slot.name)} {ct("auto.site.5df3daaf05ddb736")}{" "}</span>
          <b>{countdownParts(info.msUntil).days > 0 ? `${countdownParts(info.msUntil).days}d ` : ""}{countdownParts(info.msUntil).hours}{ct("auto.site.78a4b60026fcee61")}{countdownParts(info.msUntil).minutes}{ct("auto.site.ac1b197f609e9dbe")}</b>
        </>
      )}
    </div>
  );
}

/** First thing in the tab order, on the public site and in the admin alike. */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById("main");
        if (main) {
          main.setAttribute("tabindex", "-1");
          main.focus();
          main.scrollIntoView();
        }
      }}
    >
      {ct("auto.site.bf0a61e9d4be7298")}</a>
  );
}

export function Header() {
  const { path } = useRoute();
  const { theme, toggle } = useTheme();
  const { scrolled, progress } = useScrollProgress();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /* Tablets and up get the full desktop nav; only phones collapse to the menu. */
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const menuRef = useClickOutside<HTMLDivElement>(() => setOpen(false));

  useEffect(() => {
    setOpen(false);
  }, [path]);

  /* A page can ask for the site search (the 404 page has a "search the whole
     site" button) — see OPEN_SEARCH_EVENT in src/components/ui.tsx. */
  useEffect(() => {
    const openSearch = () => setPaletteOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, openSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, openSearch);
  }, []);

  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [open]);

  useHotkey("mod+k", (e) => {
    e.preventDefault();
    setPaletteOpen((v) => !v);
  });

  return (
    <>
      <div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <div className="site-chrome">
      <div className="topbar">
        <div className="container topbar__inner">
          <span className="topbar__item">
            <Icon name="pin" size={14} /> {SITE.name}
          </span>
          <ServicePill />
          <div className="topbar__right">
            <Link to="/donate" className="topbar__link">
              <Icon name="gift" size={14} /> {ct("auto.site.7fa7983f92fdee2e")}</Link>
            <Link to="/prayer" className="topbar__link">
              <Icon name="prayer" size={14} /> {ct("auto.site.c0b56bbc24e5fac5")}</Link>
            <Link to="/ministries" query={{ volunteer: 1 }} className="topbar__link">
              <Icon name="people" size={14} /> {ct("auto.site.4d148e30b8789721")}</Link>
          </div>
        </div>
      </div>

      <header className={"header" + (scrolled ? " header--scrolled" : "")}>
        <div className="container header__inner">
          <Link to="/" className="brand" aria-label={ct("auto.site.35ab10970eb7d78e", { "name": SITE.name })}>
            <img className="brand__logo" src={siteFile(LOGO_MARK)} alt={SITE.name} />
          </Link>

          {isDesktop && (
            <nav className="header__nav" aria-label={ct("auto.site.4a99948ffddda2de")}>
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} className={"nav-link" + (path === n.to || (n.to !== "/" && path.startsWith(n.to)) ? " nav-link--active" : "")}>
                  {ct(n.label)}
                </Link>
              ))}
            </nav>
          )}

          <div className="header__actions">
            <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label={ct("auto.site.837a90ae74bfd487")}>
              <Icon name="search" size={16} />
              <span>{ct("auto.site.9dee2234b6f68d65")}</span>
            </button>
            <IconBtn name={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? ct("auto.site.b39edfa424d8f1e5") : ct("auto.site.a67a178a3a37f22b")} onClick={toggle} />
            {(
              <div className="menu-wrap" ref={menuRef}>
                <IconBtn name={open ? "close" : "menu"} label={open ? ct("auto.site.009d947d494f4334") : ct("auto.site.c3277c798e3051c0")} onClick={() => setOpen((v) => !v)} className="header__menu" />
                {open && <MenuDropdown path={path} />}
              </div>
            )}
          </div>
        </div>
      </header>
      <AnnouncementBanner />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />    </>
  );
}

/* ------------------------------------------------------------------ menu dropdown */

function MenuDropdown({ path }: { path: string }) {
  return (
    <div className="menu-pop">
      <nav className="menu-pop__nav" aria-label={ct("auto.site.23691641be29d520")}>
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={"menu-pop__link" + (path === n.to || (n.to !== "/" && path.startsWith(n.to)) ? " menu-pop__link--active" : "")}
          >
            <span>{ct(n.label)}</span>
            <Icon name="arrowRight" size={14} />
          </Link>
        ))}
        <span className="menu-pop__sep" aria-hidden="true" />
        <Link to="/visit" className="menu-pop__link">
          <span>{ct("auto.site.02513ca9b2542ec0")}</span>
          <Icon name="arrowRight" size={14} />
        </Link>
        <Link to="/ministries" query={{ volunteer: 1 }} className="menu-pop__link">
          <span>{ct("auto.site.5ca2c6e261e515ab")}</span>
          <Icon name="arrowRight" size={14} />
        </Link>
        <Link to="/prayer" className="menu-pop__link">
          <span>{ct("auto.site.ea176046002ed167")}</span>
          <Icon name="arrowRight" size={14} />
        </Link>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ command palette */

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const index = useMemo(() => buildSearchIndex(), []);
  useBodyLock(open);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return index.slice(0, 8);
    const scored = index
      .map((r) => {
        const title = r.title;
        const hay = `${title} ${r.sub} ${r.group}`.toLowerCase();
        const idx = hay.indexOf(term);
        return { r, score: idx === -1 ? -1 : (title.toLowerCase().startsWith(term) ? 100 : 50) - idx / 10 };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
    return scored.map((s) => s.r);
  }, [q, index]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  const go = (r?: SearchResult) => {
    if (!r) return;
    onClose();
    const [path, search] = r.to.split("?");
    if (search) {
      navigate(path, Object.fromEntries(new URLSearchParams(search)) as any);
    } else {
      navigate(r.to);
    }
  };

  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label={ct("auto.site.1690138f71fe3e0e")}>
      <div className="palette__backdrop" onClick={onClose} />
      <div className="palette__panel">
        <div className="palette__search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ct("auto.site.6201607ef9610587")}
            aria-label={ct("auto.site.5f736fa45e4299d5")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
          <kbd>{ct("auto.site.fec7c59d7c089d04")}</kbd>
        </div>
        <div className="palette__list">
          {results.length === 0 && <p className="palette__empty">{ct("auto.site.b9d0f81af68aeb2b")}{q}{ct("auto.site.c71f70dee5e22f9f")}</p>}
          {results.map((r, i) => (
            <button
              key={r.to + r.title + i}
              className={"palette__item" + (i === active ? " palette__item--active" : "")}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              <span className="palette__thumb">
                {r.image ? <img src={r.image} alt="" loading="lazy" /> : <Icon name={r.icon || "chevronRight"} size={16} />}
              </span>
              <span className="palette__text">
                <b>{r.title}</b>
                <em>{r.sub}</em>
              </span>
              <span className="palette__group">{r.group}</span>
            </button>
          ))}
        </div>
        <div className="palette__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {ct("auto.site.18fe199b1712dcca")}</span>
          <span><kbd>↵</kbd> {ct("auto.site.ba4af0889c217c21")}</span>
          <span><kbd>{ct("auto.site.421abae9d66d2ca8")}</kbd> {ct("auto.site.cdb28bdc77700115")}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ footer */

export function Footer() {
  const year = zoneYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <img src={siteFile(LOGO_MARK)} alt={SITE.name} className="footer__logo" />
            <h3>{SITE.name}</h3>
            <p className="muted">{tx(SITE.tagline)}</p>
          </div>
          {FOOTER_LINKS.map((col) => (
            <nav className="footer__col" key={col.title} aria-label={ct(col.title)}>
              <h4>{ct(col.title)}</h4>
              {col.links.map((l) => {
                const [path, qs] = l.to.split("?");
                const query = Object.fromEntries(new URLSearchParams(qs || ""));
                return (
                  <Link key={l.label} to={path} query={query} className="footer__link">
                    {ct(l.label)}
                  </Link>
                );
              })}
            </nav>
          ))}
          <div className="footer__col footer__contact">
            <h4>{ct("auto.site.d2bc94004c10f261")}</h4>
            <p>{SITE.address}</p>
            <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={14} /> {SITE.phone}</a>
            <a href={`mailto:${SITE.email}`}><Icon name="mail" size={14} /> {SITE.email}</a>
            <div className="social-row">
              {SITE.socials.map((s) => (
                <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}>
                  <Icon name={s.icon} size={17} />
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="footer__bottom">
          {/* The name may already end in a full stop ("… Ministries Inc.") and the
              collected line starts with its own, so the stop is not printed twice. */}
          <span>© {year} {SITE.name.replace(/\.\s*$/, "")}{ct("auto.site.9dbf1a6691d1bfa7")}</span>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ misc chrome */

export function ScrollTop() {
  const { scrolled } = useScrollProgress();
  return (
    <button
      type="button"
      className={"to-top" + (scrolled ? " to-top--visible" : "")}
      aria-label={ct("auto.site.7c04895953a3ea70")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <Icon name="arrowUp" size={18} />
    </button>
  );
}

export function PageHead({
  eyebrow,
  title,
  lede,
  image,
  crumbs,
  actions,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  image?: string;
  crumbs?: { label: string; to?: string }[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className={"page-head" + (image ? " page-head--image" : "")}>
      {image && (
        <div className="page-head__bg" aria-hidden="true">
          <img src={image} alt="" />
        </div>
      )}
      <div className="container page-head__inner">
        {crumbs && (
          <nav className="breadcrumbs" aria-label={ct("auto.site.b6a65473c104609a")}>
            {crumbs.map((c, i) => (
              <span key={i}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <em>{c.label}</em>}
                {i < crumbs.length - 1 && <Icon name="chevronRight" size={13} />}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {actions && <div className="page-head__actions">{actions}</div>}
        {children}
      </div>
    </section>
  );
}

export function LiveBadge() {
  return (
    <span className="live-badge">
      <span className="live-dot" /> {ct("auto.site.e269e790f10a3df1")}</span>
  );
}

export function TodayChip() {
  const now = useNow(30000);
  return (
    <span className="today-chip">
      <Icon name="calendar" size={14} /> {fmtDate(now, "weekday")}
    </span>
  );
}

export function dayLabel(day: number) {
  return DAY_SHORT[day] || "";
}
