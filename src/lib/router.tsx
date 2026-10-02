import React, { useCallback, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

export type RouteState = {
  path: string;
  query: URLSearchParams;
  hash: string;
  /** True when the URL is under #/admin — the site with the office's tools on. */
  editing: boolean;
  /** The address said "admin" somewhere other than the front ("…/ministries/admin"). */
  movedAdmin: boolean;
};

/** Every admin URL lives under this prefix; the site's own routes follow it. */
export const ADMIN_PREFIX = "/admin";

const listeners = new Set<() => void>();
let current: RouteState = readLocation();

function readLocation(): RouteState {
  let raw = window.location.hash || "";
  if (raw.startsWith("#")) raw = raw.slice(1);
  /* Standalone hosts (npm run dev, or any export off perchance.org where the
     generator name is absent): the real path names the route, so /admin opens
     the console without a hash. On perchance.org the path is the generator
     name and the hash stays the route. */
  if (!raw && !(window as any).generatorName) {
    const pn = window.location.pathname || "";
    if (pn && pn !== "/") raw = pn + (window.location.search || "");
  }
  // The perchance editor appends non-path hashes (e.g. "#edit"); anything that
  // is not an app route is treated as the home page.
  if (!raw.startsWith("/")) raw = "/";
  const qIndex = raw.indexOf("?");
  let path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const search = qIndex === -1 ? "" : raw.slice(qIndex + 1);
  let cleaned = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  /* #/admin renders the home page with the office's tools on; #/admin/sermons is
     the sermons page, editable. The prefix is opaque to every page.

     People also write it the other way round — "…/ministries/admin" — when they
     mean "the ministries page, with the tools". So "admin" is the office's word
     wherever it appears in the address: take it out, keep the order of the rest,
     and treat it as the office's view. */
  const parts = cleaned.split("/").filter(Boolean);
  const rest = parts.filter((p) => p.toLowerCase() !== "admin");
  const editing = rest.length !== parts.length;
  let target = "/" + rest.join("/");
  if (target.length > 1 && target.endsWith("/")) target = target.slice(0, -1);
  return {
    path: target || "/",
    query: new URLSearchParams(search),
    hash: raw,
    editing,
    movedAdmin: parts.some((p, i) => i > 0 && p.toLowerCase() === "admin"),
  };
}

function emit() {
  current = readLocation();
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", emit);
  window.addEventListener("popstate", emit);
}

export function getRoute(): RouteState {
  return current;
}

export function buildUrl(
  to: string,
  query?: Record<string, string | number | undefined>,
  opts?: { absolute?: boolean; plain?: boolean }
): string {
  let path = to || "/";
  if (!path.startsWith("/")) path = "/" + path;
  // While the office is editing, every link they follow stays in edit mode —
  // so browsing the site *is* browsing the admin.
  if (current.editing && !opts?.absolute && !opts?.plain) path = ADMIN_PREFIX + (path === "/" ? "" : path);
  const params = new URLSearchParams();
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    });
  }
  const qs = params.toString();
  return "#" + path + (qs ? "?" + qs : "");
}

export function navigate(
  to: string,
  query?: Record<string, string | number | undefined>,
  opts?: { replace?: boolean; plain?: boolean }
) {
  const url = buildUrl(to, query, opts);
  if (opts?.replace) {
    const base = window.location.href.split("#")[0];
    window.history.replaceState(null, "", base + url);
    emit();
  } else if (window.location.hash === url) {
    emit();
  } else {
    window.location.hash = url;
  }
}

export function useRoute(): RouteState {
  const [state, setState] = useState<RouteState>(current);
  useEffect(() => {
    const fn = () => setState(current);
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return state;
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pParts = pattern.split("/").filter(Boolean);
  const aParts = path.split("/").filter(Boolean);
  if (pParts.length !== aParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    const p = pParts[i];
    const a = aParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(a);
    } else if (p.toLowerCase() !== a.toLowerCase()) {
      return null;
    }
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  query?: Record<string, string | number | undefined>;
  children: ReactNode;
};

export function Link({ to, query, children, onClick, ...rest }: LinkProps) {
  const href = buildUrl(to, query);
  const handle = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to, query);
    },
    [to, query, onClick]
  );
  return (
    <a href={href} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

export function absoluteLink(to: string): string {
  const name = (window as any).generatorName || "";
  const base = name ? `https://perchance.org/${name}` : window.location.href.split("#")[0];
  // Share links always point at the public site, never at the office's view.
  return base + buildUrl(to, undefined, { absolute: true });
}

export function useTitle(title: string) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
  }, [title]);
}
