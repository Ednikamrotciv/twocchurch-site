import React from "react";
import { Btn, Icon, Section } from "./ui";
import { clearLiveStatusCache, recheckLiveNow } from "../lib/livestatus";

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
      const route = this.state.route || "";
      return (
        <Section className="error-state">
          <span className="prayer-success__icon"><Icon name="alert" size={26} /></span>
          <h2>Something went wrong on our side</h2>
          <p className="lede">
            We are sorry — this page failed to load. Reloading usually fixes it. If it keeps happening, please let the church office
            know exactly what you clicked.
          </p>
          {route ? <p className="muted">Page: {route}</p> : null}
          <p className="muted">Nothing was lost — your place is saved. One tap brings the page back.</p>
          <div className="btn-row center">
            <Btn onClick={() => this.handleReload()} icon="refresh">
              Reload the page
            </Btn>
            <Btn variant="ghost" to="/" icon="home" onClick={() => this.handleHome()}>
              Try the home page
            </Btn>
          </div>
        </Section>
      );
    }
    return this.props.children;
  }
  /* Force-fresh reload of the SAME page: clears the remembered on-air answer
     and every video verdict first, so the fresh load re-asks what's live now
     instead of replaying the stale broadcast the crash interrupted (which is
     how a reload used to land on a different stream). The address keeps its
     path (e.g. /watch-live) with a cache-busting query, so it can never
     wander to another stream. */
  private handleReload() {
    try {
      clearLiveStatusCache();
    } catch {}
    try {
      recheckLiveNow();
    } catch {}
    this.setState({ error: null, route: "", stack: "" });
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("fresh", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      try {
        window.location.reload();
      } catch {}
    }
  }
  private handleHome() {
    try {
      clearLiveStatusCache();
    } catch {}
    try {
      recheckLiveNow();
    } catch {}
    this.setState({ error: null, route: "", stack: "" });
  }
}
