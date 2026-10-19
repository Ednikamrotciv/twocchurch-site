import React, { useEffect } from "react";
import { useRoute, navigate, ADMIN_PREFIX } from "./lib/router";
import { Header, Footer, ScrollTop, SkipLink, MaintenanceSite, PreviewBanner, BootSplash } from "./components/layout";
import { Toaster } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { startCms, useCmsVersion, useCmsReady, useMaintenance, usePreviewingWhileWaiting, useStaleBuild, checkStaleBuild } from "./lib/cms";
import { mountShaderBackground } from "./lib/shaderbg";
import { startVisitorClock, useVisitorClock, useVisitorClockRefresh } from "./lib/visitor";
import { useI18nTick, ensureI18n, setProtectedValues, i18nAsk, i18nTickN, chooseLang, dismissAsk } from "./lib/i18n";
import { allCopySources } from "./data/copy";
import { startRates, useRates, useRatesRefresh } from "./lib/rates";
import { useLiveStream } from "./lib/livestatus";
import { nextService, onAir, churchTimezone } from "./lib/store";
import { useNow } from "./lib/hooks";
import { SERVICES } from "./data/site";
import { resolvePath } from "./lib/routes";
import { ADMIN_RETURN_MS, readAdminReturn } from "./lib/adminReturn";
import { ct } from "./data/copy";
import { SITE } from "./data/site";

const Admin = React.lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));

export function App() {
  const route = useRoute();
  const version = useCmsVersion();
  /* New code since the last publish: visitors wait, the office never does. */
  const maintenance = useMaintenance();
  /* Where the visitor is (their IP's time zone). Reading it here re-renders the
     whole site the moment the answer lands, so every time on the page moves
     onto the visitor's own clock in one pass (SPEC note 85). */
  const clock = useVisitorClock();
  useVisitorClockRefresh();
  /* The visitor's own language, from their IP country — lines swap in as
     translations land (note 209). */
  useI18nTick();
  useEffect(() => {
    /* Everything follows the IP language except identity: only the church's
       full legal name stays exactly as the office typed it (note 421). */
    setProtectedValues([SITE.name]);
    if (clock?.country) void ensureI18n(clock.country, allCopySources());
  }, [clock?.country, version]);
  /* Today's rates, from the visitor's browser (note 98). */
  useRates();
  useRatesRefresh();

  /* Whether the church is broadcasting, asked once for the whole site (note 133).
     The short cadence is only worth asking for while a broadcast is expected:
     a gathering is on the clock, or one starts within the next three quarters
     of an hour — or the visitor sits on the Watch page itself (note 306),
     where a YouTube start must show in seconds on live and on local alike. */
  const minute = useNow(60_000);
  /* The office's Weekly services card, read on the church's own clock. */
  const gathering = nextService(SERVICES, minute, churchTimezone());
  const expecting = !!gathering && (onAir(gathering) || gathering.msUntil < 45 * 60 * 1000);
  const onWatchPage = route.path === "/watch-live" || route.path.startsWith("/watch-live/");
  useLiveStream(expecting || onWatchPage, false, onWatchPage);

  // Load the published content once; the version counter then re-renders the
  // page every time the office applies something.
  useEffect(() => {
    startCms();
    /* If the host serves newer code than this bundle, reload onto it so
       mobile and desktop decide maintenance from the same update (note 302:
       retried with a normal reload — never a hard refresh — and re-checked
       while the tab stays open, so an update that lands later still takes). */
    void checkStaleBuild().catch(() => {});
    
    const onVis = () => {
      if (document.visibilityState === "visible") void checkStaleBuild().catch(() => {});
    };
    const onOnline = () => {
      void checkStaleBuild().catch(() => {});
    };
    const poll = window.setInterval(() => {
      void checkStaleBuild().catch(() => {});
    }, 30_000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    startVisitorClock();
    const unmountShader = mountShaderBackground();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.clearInterval(poll);
      if (typeof unmountShader === "function") (unmountShader as () => void)();
    };
  }, []);

  /* Rates are only worth fetching when the visitor reads in a currency of their
     own — and which currency that is only becomes known when the clock lands,
     so this effect runs again then (see `startRates`). */
  useEffect(() => {
    startRates();
  }, [clock?.currency]);

  // The browser tab's words follow the site's own wording (and the office can
  // reword them under "Site-wide text" in the editor) — in the visitor's own
  // language too, so the tab title moves when translations land (note 421).
  const langTick = i18nTickN();
  useEffect(() => {
    document.title = ct("site.tabTitle", { church: SITE.name });
  }, [version, clock?.tz, langTick]);

  // #/admin (and everything under it) is the very same site, with the office's
  // tools on top. See src/pages/Admin.tsx.
  if (route.editing)
    return (
      <>
        <React.Suspense fallback={null}>
          <Admin />
        </React.Suspense>
        <LangAsk />
      </>
    );

  /* Visitors wait on maintenance until the office publishes (notes 249, 302) —
     logo and notice only, nothing else. Nothing renders until boot + first
     sync AND the first version check settle, so a published site never flashes
     the notice on launch — and a stale bundle never flashes live before it
     reloads onto the update. */
  const ready = useCmsReady();
  const stale = useStaleBuild();
  /* Local preview (?maintenance=1): the notice shows at once, even before boot
     settles — otherwise the splash covers the very page asked for. */
  if (maintenance && !ready) return <MaintenanceSite />;
  if (!ready || !stale.settled) return <BootSplash />;
  /* FIXED: stale-build waiting never shows maintenance to visitors — the
     reload in checkStaleBuild() still runs in the background, but visitors
     keep reading the site instead of sitting on "We'll be right back" when
     a reload is delayed or fails. Only an explicit ?maintenance=1 waits. */
  if (maintenance) return <MaintenanceSite />;

  return (
    <>
      <SiteApp key={version} />
      <LangAsk />
    </>
  );
}

/* The IP language already applies when this shows (note 421) — the notice is
   an opt-out: confirm it, keep English instead, or hide it for this visit. */
function LangAsk() {
  useI18nTick();
  const ask = i18nAsk();
  if (!ask.show) return null;
  return (
    <div className="langask" role="dialog" aria-live="polite" aria-label="Language choice">
      <p>
        {ct("site.lang.reading", { name: ask.name })}
      </p>
      <div className="langask__row">
        <button type="button" className="langask__go" onClick={() => chooseLang(ask.lang)}>
          {ask.name}
        </button>
        <button type="button" className="langask__keep" onClick={() => chooseLang("en")}>
          {ct("site.lang.keep")}
        </button>
      </div>
      <button type="button" className="langask__later" onClick={dismissAsk}>
        {ct("site.lang.later")}
      </button>
    </div>
  );
}

function SiteApp() {
  const { path } = useRoute();
  const { element, to } = resolvePath(path);
  /* Pages are cached, so a fresh element carries clock changes in without teardown. */
  const page = React.isValidElement(element) ? React.cloneElement(element as React.ReactElement) : element;

  // A forgiving address is rewritten to the page it really is, so the bar, a
  // refresh and a copy of the link all point at the real page.
  useEffect(() => {
    if (to !== path) navigate(to, undefined, { replace: true });
  }, [path, to]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.dataset.route = to.replace(/\//g, "-").replace(/^-/, "") || "home";
  }, [to]);

  /* The office stepped out to check the live site (Admin wrote down where they
     were on the way out). If they have not gone back within five minutes, take
     them back — the drawer is restored from that same note. Coming back by
     hand first unmounts this page and disarms the timer. */
  useEffect(() => {
    const rec = readAdminReturn();
    if (!rec) return;
    const wait = Math.max(0, ADMIN_RETURN_MS - (Date.now() - rec.at));
    const id = window.setTimeout(() => {
      navigate(ADMIN_PREFIX + (rec.path === "/" ? "" : rec.path));
    }, wait);
    return () => window.clearTimeout(id);
  }, []);

  const previewing = usePreviewingWhileWaiting();
  return (
    <>
      <SkipLink />
      {previewing && <PreviewBanner />}
      <Header />
      <main id="main" key={to}>
        <ErrorBoundary>
          <React.Suspense fallback={null}>{page}</React.Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <ScrollTop />
      <Toaster />
    </>
  );
}
