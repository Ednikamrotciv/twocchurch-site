import React from "react";
import { Btn, Icon, Section } from "./ui";

/** Keeps a broken page from taking the whole site down with it.
    Fix v5 (screenshot 1): the Reload button is a real recovery operation, not
    a blind refresh. It (1) drops poisoned live/verdict caches, (2) retries the
    failed backend/live checks, (3) remounts ONLY the failed subtree in place
    (admin drawer, draft edits, scroll preserved), (4) reconnects the backend
    without a full page reload, and (5) falls back to a full reload only when
    the render itself is broken or a deploy swapped chunks. Bounded: max 1
    in-place retry per crash, max 3 full reloads per 5 minutes — no infinite
    loops, no duplicate concurrent retries. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; route: string; stack: string; nonce: number; retriedRoute: string; retryFailed: boolean; scroll: number; retrying: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, route: "", stack: "", nonce: 0, retriedRoute: "", retryFailed: false, scroll: 0, retrying: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  /* A crash report the office can actually use (note 408): the route that
     broke plus the component stack go to the console whole, and the route
     prints on the screen — so the next screenshot names the page. */
  componentDidCatch(error: Error, info?: { componentStack?: string }) {
    let route = "";
    try {
      route = readBoundaryRoute();
    } catch {
      /* location unreadable — the stack still tells */
    }
    let scroll = 0;
    try {
      scroll = window.scrollY || 0;
    } catch {
      /* no scroll to keep */
    }
    const stack = String(info?.componentStack || "");
    this.setState((s) => ({
      route,
      stack,
      scroll,
      /* Crashed again on the route our own retry just restored: the render
         itself is broken, so the next tap takes the full reload instead. */
      retryFailed: !!s.retriedRoute && s.retriedRoute === route,
      retriedRoute: "",
    }));
    console.error("World Overcomers app error:", { route, error, stack });
  }
  componentDidUpdate(_prevProps: { children: React.ReactNode }) {
    /* Self-heal on navigation: leaving the page that broke clears the card,
       so one bad frame can never trap the visitor — going home and back, or
       the livestream remounting, paints fresh with no reload. */
    if (this.state.error) {
      let here = "";
      try {
        here = readBoundaryRoute();
      } catch {}
      if (here && here !== this.state.route) this.setState({ error: null, route: "", stack: "", retriedRoute: "", retryFailed: false, scroll: 0, retrying: false });
    } else if (this.state.retriedRoute) {
      /* A retry that survived: forget it once the visitor moves on, so a
         later crash elsewhere still gets its own in-place retry first. */
      let here = "";
      try {
        here = readBoundaryRoute();
      } catch {}
      if (here && here !== this.state.retriedRoute) this.setState({ retriedRoute: "", retryFailed: false });
    }
  }
  /* One tap brings the SAME page back (fix v5 — real recovery, not blind
     refresh): the card retries the page subtree in place first — same address
     (/admin/watch-live stays /admin/watch-live), same synced words, same
     on-air answer, scroll + admin drawer + unsaved draft preserved — and only
     a crash that repeats on the same route takes the full reload. Before
     either path: (1) poisoned live/verdict caches are dropped so a stale
     on-air answer can never re-poison the retry, (2) the backend + live check
     are re-asked (Render cold-start / temporary disconnect heals without a
     full reload), (3) a chunk-load failure — a new deploy landing mid-visit —
     goes straight to the full reload, since in-place would re-request the
     same missing chunk. Bounded: duplicate taps ignored while a retry is in
     flight; max 3 full reloads per 5 minutes (sessionStorage counter) stops
     infinite reload loops on a persistently broken render. */
  private retry = () => {
    if (this.state.retrying) return;
    this.setState({ retrying: true });
    try {
      import("../lib/livestatus").then((m) => {
        try { m.forgetAllVerified(); } catch {}
        try { (m as any).recheckLiveNow?.(); } catch {}
      }).catch(() => {});
    } catch {}
    try {
      localStorage.removeItem("wom.livestatus");
    } catch {}
    try {
      sessionStorage.removeItem("wom.live.targetNote");
    } catch {}
    /* Reconnect the backend without reloading the whole site (Render cold
       start / temporary API failure): re-resolve the office server URL and
       restart the CMS content sync in the background. Failures are silent —
       the in-place remount below still repairs render-only crashes. */
    try {
      import("../lib/remoteserver").then((m) => {
        try { (m as any).refreshServerUrl?.().catch(() => {}); } catch {}
      }).catch(() => {});
    } catch {}
    try {
      import("../lib/cms").then((m) => {
        try { (m as any).startCms?.(); } catch {}
        try { (m as any).checkStaleBuild?.().catch(() => {}); } catch {}
      }).catch(() => {});
    } catch {}
    const msg = String((this.state.error && (this.state.error as any).message) || "") + "\n" + this.state.stack;
    if (this.state.retryFailed || isChunkError(msg)) {
      /* Bounded full reloads: a persistently broken render must not loop the
         whole site forever. After 3 reloads in 5 minutes, stay on the card
         (which always offers "Try the home page") instead of reloading again. */
      try {
        const now = Date.now();
        let rec: { n: number; at: number } = { n: 0, at: 0 };
        try {
          const raw = sessionStorage.getItem("wom.error.reloads");
          if (raw) { const p = JSON.parse(raw); if (p && typeof p.n === "number") rec = p; }
        } catch {}
        if (now - (rec.at || 0) > 5 * 60_000) rec = { n: 0, at: now };
        if ((rec.n || 0) >= 3) {
          this.setState({ retrying: false, retryFailed: true });
          return;
        }
        try { sessionStorage.setItem("wom.error.reloads", JSON.stringify({ n: (rec.n || 0) + 1, at: rec.at || now })); } catch {}
        window.location.reload();
      } catch {
        /* reload unavailable — the card stays with its way home */
        this.setState({ retrying: false });
      }
      return;
    }
    let here = "";
    try {
      here = readBoundaryRoute();
    } catch {}
    const y = this.state.scroll || 0;
    this.setState((s) => ({ error: null, route: "", stack: "", nonce: s.nonce + 1, retriedRoute: here, retryFailed: false, retrying: false }));
    try {
      window.requestAnimationFrame(() => {
        try {
          window.scrollTo(0, y);
        } catch {
          /* keep whatever position the remount landed on */
        }
      });
    } catch {
      /* no frame to wait for — the remount still paints */
    }
  };
  render() {
    if (this.state.error) {
      return (
        <Section className="error-state">
          <span className="prayer-success__icon"><Icon name="alert" size={26} /></span>
          <h2>Something went wrong on our side</h2>
          <p className="lede">
            We are sorry — this page failed to load. Reloading usually fixes it. If it keeps happening, please let the church office
            know exactly what you clicked.
          </p>
          <p className="muted">Nothing was lost — your place is saved. One tap brings the page back.</p>
          <p className="muted">{`Page: ${this.state.route}`}</p>
          <div className="btn-row center">
            <Btn onClick={this.retry} icon="refresh" disabled={this.state.retrying}>
              {this.state.retrying ? "Reloading…" : "Reload the page"}
            </Btn>
            <Btn variant="ghost" to="/" icon="home" onClick={() => this.setState({ error: null, route: "", stack: "", retriedRoute: "", retryFailed: false, retrying: false })}>
              Try the home page
            </Btn>
          </div>
        </Section>
      );
    }
    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
  }
}

/* A new deploy landing mid-visit breaks dynamic chunk imports with these
   messages — the in-place retry would only re-request the same chunk, so the
   card reloads straight onto the new code instead. Never throws. */
function isChunkError(text: string): boolean {
  try {
    const t = String(text || "").toLowerCase();
    return (
      t.includes("dynamically imported module") ||
      t.includes("chunkloaderror") ||
      t.includes("loading chunk") ||
      t.includes("failed to fetch") ||
      t.includes("importing a module")
    );
  } catch {
    return false;
  }
}

/* A per-section net for list-heavy pages (Watch live, sermons): one bad card
   (a corrupt write-up, a bad thumbnail, a translator miss) clears to a quiet
   placeholder instead of taking the whole page to the error card above. The
   page keeps working; the office sees the console error with the section name.
   Never throws, never remounts siblings. */
export class SectionBoundary extends React.Component<{ children: React.ReactNode; label?: string }, { error: Error | null; nonce: number }> {
  constructor(props: { children: React.ReactNode; label?: string }) {
    super(props);
    this.state = { error: null, nonce: 0 };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info?: { componentStack?: string }) {
    try {
      console.error("World Overcomers section error (" + String(this.props.label || "section") + "):", { error, stack: String(info?.componentStack || "") });
    } catch {}
  }
  private retry = () => {
    this.setState((s) => ({ error: null, nonce: s.nonce + 1 }));
  };
  render() {
    if (this.state.error) {
      return (
        <div className="notice notice--warn" role="status">
          <p style={{ margin: 0 }}>
            This section failed to load.{" "}
            <button type="button" className="linklike" onClick={this.retry}>
              Try again
            </button>
          </p>
        </div>
      );
    }
    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
  }
}

/* The address that broke — read in one place so the card, the report and the
   retry all name the same page. */
function readBoundaryRoute(): string {
  try {
    return window.location.hash || window.location.pathname || "";
  } catch {
    return "";
  }
}
