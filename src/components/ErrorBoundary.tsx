import React from "react";
import { Btn, Icon, Section } from "./ui";

/** Keeps a broken page from taking the whole site down with it. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; route: string; stack: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
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
      route = window.location.hash || window.location.pathname || "";
    } catch {
      /* location unreadable — the stack still tells */
    }
    const stack = String(info?.componentStack || "");
    this.setState({ route, stack });
    console.error("World Overcomers app error:", { route, error, stack });
  }
  componentDidUpdate(_prevProps: { children: React.ReactNode }) {
    /* Self-heal on navigation: leaving the page that broke clears the card,
       so one bad frame can never trap the visitor — going home and back, or
       the livestream remounting, paints fresh with no reload. */
    if (this.state.error) {
      let here = "";
      try {
        here = window.location.hash || window.location.pathname || "";
      } catch {}
      if (here && here !== this.state.route) this.setState({ error: null, route: "", stack: "" });
    }
  }
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
          <div className="btn-row center">
            <Btn onClick={() => window.location.reload()} icon="refresh">
              Reload the page
            </Btn>
            <Btn variant="ghost" to="/" icon="home" onClick={() => this.setState({ error: null })}>
              Try the home page
            </Btn>
          </div>
        </Section>
      );
    }
    return this.props.children;
  }
}
