import React from "react";
import { Btn, Icon, Section } from "./ui";

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
  /* One tap brings the SAME page back (note 408): the card retries the page
     subtree in place — same address, same synced words, same on-air answer —
     so the livestream that returns is the one the visitor was watching, not
     whatever a cold boot resolves first (seed words, a guest answer landing
     before the main one, an override still converging). The page's own mount
     checks re-run on the remount, so a stream that is live still opens by
     itself, with sound. Only a crash that repeats on the same route takes
     the full reload — that render is broken, not its state. */
  private retry = () => {
    if (this.state.retryFailed) {
      try {
        window.location.reload();
      } catch {
        /* reload unavailable — the card stays with its way home */
      }
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

/* The address that broke — read in one place so the card, the report and the
   retry all name the same page. */
function readBoundaryRoute(): string {
  return window.location.hash || window.location.pathname || "";
}
