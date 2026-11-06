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
  /* One tap = browser reload: the button does exactly what reloading the
     browser page does — fresh bundle, fresh state, same address. Before it,
     volatile live caches are dropped so a stale on-air/verdict answer can
     never re-poison the fresh load. */
  private retry = () => {
    try {
      localStorage.removeItem("wom.livestatus");
    } catch {}
    try {
      sessionStorage.removeItem("wom.live.targetNote");
    } catch {}
    try {
      window.location.reload();
    } catch {
      /* reload unavailable — the card stays with its way home */
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
