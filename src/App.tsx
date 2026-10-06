import React, { useEffect } from "react";
import { useRoute, navigate, ADMIN_PREFIX } from "./lib/router";
import { Header, Footer, ScrollTop, SkipLink } from "./components/layout";
import { Toaster } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { startCms, useCmsVersion } from "./lib/cms";
import { mountShaderBackground } from "./lib/shaderbg";
import { startVisitorClock, useVisitorClock, useVisitorClockRefresh } from "./lib/visitor";
import { useI18nTick, ensureI18n } from "./lib/i18n";
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
  /* Where the visitor is (their IP's time zone). Reading it here re-renders the
     whole site the moment the answer lands, so every time on the page moves
     onto the visitor's own clock in one pass (SPEC note 85). */
  const clock = useVisitorClock();
  useVisitorClockRefresh();
  /* The visitor's own language, from their IP country — lines swap in as
     translations land (note 209). */
  useI18nTick();
  useEffect(() => {
    if (clock?.country) void ensureI18n(clock.country, allCopySources());
  }, [clock?.country, version]);
  /* Today's rates, from the visitor's browser (note 98). */
  useRates();
  useRatesRefresh();

  /* Whether the church is broadcasting, asked once for the whole site (note 133). */
  const minute = useNow(60_000);
  /* The office's Weekly services card, read on the church's own clock. */
  const gathering = nextService(SERVICES, minute, churchTimezone());
  /* The short cadence is only worth asking for while a broadcast is expected:
     a gathering is on the clock, or one starts within the next three quarters
     of an hour. */
  const expecting = !!gathering && (onAir(gathering) || gathering.msUntil < 45 * 60 * 1000);
  useLiveStream(expecting);

  // Load the published content once; the version counter then re-renders the
  // page every time the office applies something.
  useEffect(() => {
    startCms();
    startVisitorClock();
    const unmountShader = mountShaderBackground();
    return unmountShader;
  }, []);

  /* Rates are only worth fetching when the visitor reads in a currency of their
     own — and which currency that is only becomes known when the clock lands,
     so this effect runs again then (see `startRates`). */
  useEffect(() => {
    startRates();
  }, [clock?.currency]);

  // The browser tab's words follow the site's own wording (and the office can
  // reword them under "Site-wide text" in the editor).
  useEffect(() => {
    document.title = ct("site.tabTitle", { church: SITE.name });
  }, [version, clock?.tz]);

  // #/admin (and everything under it) is the very same site, with the office's
  // tools on top. See src/pages/Admin.tsx.
  if (route.editing)
    return (
      <React.Suspense fallback={null}>
        <Admin />
      </React.Suspense>
    );

  return <SiteApp key={version} />;
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

  return (
    <>
      <SkipLink />
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
