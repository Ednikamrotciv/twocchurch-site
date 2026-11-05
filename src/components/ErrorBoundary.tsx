import React from "react";
import { Btn, Icon, Section } from "./ui";
import { repairLiveCaches, repairReload } from "../lib/repair";

/** Keeps a broken page from taking the whole site down with it. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; route: string; stack: string; nonce: number; retriedRoute: string; retryFailed: boolean; scroll: number }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, route: "", stack: "", nonce: 0, retriedRoute: "", retryFailed: false, scroll: 0 };
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
      if (here && here !== this.state.route) this.setState({ error: null, route: "", stack: "", retriedRoute: "", retryFailed: false, scroll: 0 });
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
  /* One tap brings the SAME page back, fixed — not just reloaded: the card
     first drops every volatile live cache (a stale on-air answer, a dead
     verdict, a thin recents list) and re-asks what's live now, then retries
     the page subtree in place — same address, same synced words, same on-air
     answer. A crash that repeats on the same route takes a flagged full
     reload instead (the next boot starts clean — see livestatus boot), and a
     chunk-load failure — a new deploy landing mid-visit — goes straight to
     the flagged reload, since the in-place retry would only re-request the
     same missing chunk. Either way one tap fixes it; the second tap always
     reloads clean. */
  private retry = () => {
    repairLiveCaches();
    const msg = String((this.state.error && (this.state.error as any).message) || "") + "\n" + this.state.stack;
    if (this.state.retryFailed || isChunkError(msg)) {
      repairReload();
      return;
    }
    let here = "";
    try {
      here = readBoundaryRoute();
    } catch {}
    const y = this.state.scroll || 0;
    this.setState((s) => ({ error: null, route: "", stack: "", nonce: s.nonce + 1, retriedRoute: here, retryFailed: false }));
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
            <Btn onClick={this.retry} icon="refresh">
              Reload the page
            </Btn>
            <Btn variant="ghost" to="/" icon="home" onClick={() => this.setState({ error: null })}>
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
    /* A section usually fails on stale live data (a bad thumbnail, a dead
       verdict behind the card) — drop it before the remount, like the page
       card above, so "Try again" heals instead of repainting the same break. */
    repairLiveCaches();
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
