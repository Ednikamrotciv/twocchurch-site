import React from "react";
import { Btn, Icon, Section } from "./ui";

/** Keeps a broken page from taking the whole site down with it. Self-healing
    tiers (the office never taps): a first crash retries in place silently; a
    repeat spends one budgeted auto-reload per page per 10 minutes; only a
    crash that survives both reaches the card below, with its details. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; route: string; stack: string; nonce: number; retriedRoute: string; retryFailed: boolean; scroll: number; phase: "" | "healing" | "reloading"; healed: number }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, route: "", stack: "", nonce: 0, retriedRoute: "", retryFailed: false, scroll: 0, phase: "", healed: 0 };
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
    const now = Date.now();
    /* Tier 0 — silent in-place retry (at most one per 5s, so a stubborn
       break can never spin: one extra render, no card, no reload). */
    const canSilent = !this.state.healed || now - this.state.healed > 5000;
    if (canSilent) {
      try {
        window.setTimeout(() => {
          try {
            this.setState((q) => (q.error ? { error: null, nonce: q.nonce + 1, phase: "", healed: Date.now() } : null));
          } catch {}
        }, 0);
      } catch {}
      this.setState((s) => ({
        error,
        route,
        stack,
        scroll,
        phase: "healing",
        healed: now,
        retryFailed: !!s.retriedRoute && s.retriedRoute === route,
        retriedRoute: "",
      }));
      console.error("World Overcomers app error (silent retry):", { route, error, stack });
      return;
    }
    /* Tier 1 — one budgeted auto-reload (volatile live caches dropped
       first, exactly like the manual button). Budget lives in session
       storage so a crash that survives its own reload lands on the card
       instead of looping; without working storage there is no budget, so
       no auto-reload either. */
    if (storageOk() && autoReloadDue(route)) {
      takeAutoReload(route);
      try {
        clearVolatileLiveCaches();
      } catch {}
      try {
        clearChunkRetryMarks();
      } catch {}
      try {
        window.setTimeout(() => {
          try {
            window.location.reload();
          } catch {}
        }, 350);
      } catch {}
      this.setState((s) => ({
        error,
        route,
        stack,
        scroll,
        phase: "reloading",
        retryFailed: !!s.retriedRoute && s.retriedRoute === route,
        retriedRoute: "",
      }));
      console.error("World Overcomers app error (auto reload):", { route, error, stack });
      return;
    }
    /* Tier 2 — the crash survived: the card, with everything the office
       needs to report it. */
    this.setState((s) => ({
      error,
      route,
      stack,
      scroll,
      phase: "",
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
      if (here && here !== this.state.route) this.setState({ error: null, route: "", stack: "", retriedRoute: "", retryFailed: false, scroll: 0, phase: "", healed: 0 });
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
  /* One tap = browser reload: the button does exactly what reloading the
     browser page does — fresh bundle, fresh state, same address. Before it,
     volatile live caches are dropped so a stale on-air/verdict answer can
     never re-poison the fresh load. Chunk-retry marks are dropped too, so a
     crash that came from a stale chunk gets its one auto-retry again after
     the manual reload instead of landing straight back on this card. */
  private retry = () => {
    try {
      clearVolatileLiveCaches();
    } catch {}
    try {
      clearChunkRetryMarks();
    } catch {}
    try {
      window.location.reload();
    } catch {
      /* reload unavailable — the card stays with its way home */
    }
  };
  render() {
    if (this.state.error) {
      /* Healing tiers never show the error card: a brief neutral moment
         while the page brings itself back (silent retry, then at most one
         auto-reload). Only a crash that survives both reaches the card. */
      if (this.state.phase === "healing" || this.state.phase === "reloading") {
        return (
          <Section className="error-state">
            <p className="muted">One moment — bringing the page back.</p>
          </Section>
        );
      }
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
            <Btn onClick={this.retry} icon="refresh">
              Reload the page
            </Btn>
            <Btn variant="ghost" to="/" icon="home" onClick={() => { try { clearChunkRetryMarks(); } catch {} try { clearVolatileLiveCaches(); } catch {} this.setState({ error: null }); }}>
              Try the home page
            </Btn>
          </div>
          {errorDetails(this.state.error, this.state.stack, this.state.route)}
        </Section>
      );
    }
    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
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

/* Tap-open details on the error card (office diagnosis): the card used to
   name only the route, so a persistent crash on one device/host could never
   say whether it was a failed chunk load (stale or incomplete deploy) or a
   render throw — now the page itself carries the message, the component
   stack and the running build stamps. Never throws; purely additive. */
function errorDetails(error: Error | null, stack: string, route: string): React.ReactNode {
  let message = "";
  try {
    message = String((error && (error as Error).message) || error || "unknown error");
  } catch {
    message = "unknown error";
  }
  let deploy = "";
  let code = "";
  let notes = "";
  try {
    const q = (n: string) => document.querySelector('meta[name="' + n + '"]')?.getAttribute("content") || "";
    deploy = q("wom-deploy");
    code = q("wom-code");
    notes = q("wom-notes");
  } catch {}
  let body = "";
  try {
    body = [message, "", String(stack || "").slice(0, 1500), "", "route: " + route, "deploy: " + deploy, "code: " + code, "notes: " + notes].join("\n");
  } catch {
    body = message;
  }
  return (
    <details style={{ marginTop: "1rem", fontSize: "0.8rem", opacity: 0.85 }}>
      <summary>Error details (for the office)</summary>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left" }}>{body}</pre>
    </details>
  );
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

/* Volatile live answers that must never re-poison a fresh load: the last
   on-air/verdict read plus the boot-retry flag, so a resource failure before
   React boots also gets its one retry again. Never throws. */
function clearVolatileLiveCaches(): void {
  try {
    localStorage.removeItem("wom.livestatus");
  } catch {}
  try {
    sessionStorage.removeItem("wom.live.targetNote");
  } catch {}
  try {
    sessionStorage.removeItem("wom.boot.retried");
  } catch {}
}

/* Chunk-retry marks (see `lazyPage` in lib/router.tsx): one per lazy page per
   tab. A manual reload drops them so the fresh load gets its one silent
   chunk retry again — a stale-chunk crash then heals instead of landing
   straight back on this card. Never throws. */
function clearChunkRetryMarks(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i) || "";
      if (k.indexOf("wom.chunk.retried.") === 0) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {}
}

/* Auto-reload budget (loop-proof): at most one silent reload per page per
   10 minutes, tracked in session storage so a crash that survives its own
   reload lands on the card instead of looping. Without working storage
   there is no budget — and no auto-reload. Never throws. */
const AUTO_KEY = "wom.eb.auto";
const AUTO_MS = 10 * 60_000;
function storageOk(): boolean {
  try {
    sessionStorage.setItem("__wom_t", "1");
    sessionStorage.removeItem("__wom_t");
    return true;
  } catch {
    return false;
  }
}
function autoReloadDue(route: string): boolean {
  try {
    const raw = sessionStorage.getItem(AUTO_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const ts = Number((all && all[route]) || 0);
    return !ts || Date.now() - ts > AUTO_MS;
  } catch {
    return true;
  }
}
function takeAutoReload(route: string): void {
  try {
    const raw = sessionStorage.getItem(AUTO_KEY);
    let all: Record<string, number> = {};
    try {
      all = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      all = {};
    }
    all[route] = Date.now();
    sessionStorage.setItem(AUTO_KEY, JSON.stringify(all));
  } catch {
    /* no budget without storage — the card stays instead */
  }
}
