import React from "react";
import { Btn, Icon, Section } from "./ui";
import { recordCrash, crashLooping, clearCrashLoop, rememberError, isChunkLoadError } from "../lib/safe";

/** Keeps a broken page from taking the whole site down with it. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; route: string; stack: string; nonce: number; retriedRoute: string; retryFailed: boolean; scroll: number; looping: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, route: "", stack: "", nonce: 0, retriedRoute: "", retryFailed: false, scroll: 0, looping: false };
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
    /* Never-throw crash bookkeeping (note 441): persist the error for the
       office, count repeats across hard reloads, and notice a loop so the
       card can send the visitor home instead of re-crashing forever. */
    try {
      rememberError(error, route);
    } catch {}
    let looping = false;
    try {
      const rec = recordCrash(route);
      looping = rec.count >= 3 && crashLooping(route);
    } catch {}
    this.setState((s) => ({
      route,
      stack,
      scroll,
      /* Crashed again on the route our own retry just restored: the render
         itself is broken, so the next tap takes the full reload instead. */
      retryFailed: !!s.retriedRoute && s.retriedRoute === route,
      retriedRoute: "",
      looping,
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
      if (here && here !== this.state.route) {
        try {
          clearCrashLoop();
        } catch {}
        this.setState({ error: null, route: "", stack: "", retriedRoute: "", retryFailed: false, scroll: 0, looping: false });
      }
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
  /* One tap brings the SAME page back (notes 435, 441): the button says
     Reload and it reloads — a full page load that drops the poisoned
     in-memory render (shut latch, grace refs, half-mounted player) and boots
     the same address fresh from the published words + saved draft. Three
     hard-reload fallbacks so the tap works even when reload() itself is
     blocked (iframe, privacy mode): reload(), then href re-assign, then
     history.go(0). Only if all three throw does it fall back to the
     in-place remount. A chunk-load failure or a 3x crash loop skips the
     same-address reload and goes straight home, so a bad deploy or a
     poisonous draft can never trap the visitor on the same card. */
  private hardReloadSamePage = () => {
    try {
      window.location.reload();
      return true;
    } catch {}
    try {
      const href = window.location.href;
      (window.location as any).href = href;
      return true;
    } catch {}
    try {
      window.history.go(0);
      return true;
    } catch {}
    return false;
  };
  private retry = () => {
    try {
      clearCrashPlacement();
    } catch {
      /* placement state is best-effort — the reload still fixes */
    }
    /* Looping or a stale chunk: the same address is the problem, so do not
       reload it — go home clean instead. */
    try {
      if (this.state.looping || isChunkLoadError(this.state.error)) {
        this.goHome();
        return;
      }
    } catch {}
    if (this.hardReloadSamePage()) return;
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
  private goHome = () => {
    try {
      clearCrashPlacement();
    } catch {}
    try {
      clearCrashLoop();
    } catch {}
    /* Clear the card at once so a blocked navigation still leaves a safe
       page, then navigate for real — hash, pathname and hard href in order. */
    this.setState({ error: null, route: "", stack: "", retriedRoute: "", retryFailed: false, scroll: 0, looping: false });
    try {
      window.location.hash = "#/";
    } catch {}
    try {
      if (window.location.pathname !== "/") {
        (window.location as any).href = "/";
      }
    } catch {}
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
          {this.state.looping ? (
            <p className="muted">This page kept failing, so going home is safest — your work is saved.</p>
          ) : null}
          <div className="btn-row center">
            <Btn onClick={this.retry} icon="refresh">
              {this.state.looping ? "Try again" : "Reload the page"}
            </Btn>
            <Btn variant="ghost" to="/" icon="home" onClick={this.goHome}>
              Try the home page
            </Btn>
          </div>
        </Section>
      );
    }
    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
  }
}

/* The address that broke — read in one place so the card, the report and the
   retry all name the same page. */
function readBoundaryRoute(): string {
  return window.location.hash || window.location.pathname || "";
}

/* Transient placement that may re-crash the next boot (note 435): the drawer
   view, its open sections/entries, its last touch, the last admin page and
   the exit/admin return notes, plus the stale-reload counter. Content
   (draft, history, pending, cache, notes, publish stamps) is never touched —
   only where the office was standing. Clearing it means a Reload boots the
   page's default drawer instead of re-opening the same poisoned view. */
function clearCrashPlacement() {
  const sessionKeys = [
    "wom.cms.drawerView",
    "wom.cms.drawerOpenSections",
    "wom.cms.drawerOpenEntry",
    "wom.cms.drawerTouch",
    "wom.cms.lastAdminPage",
    "wom.cms.exitReturn",
    "wom.cms.staleReload",
  ];
  for (const k of sessionKeys) {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  }
}
