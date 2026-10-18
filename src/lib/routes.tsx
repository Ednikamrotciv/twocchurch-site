/* routes.tsx — the site's pages, shared by the public site and #/admin. Forgiving addresses. */

import React from "react";
import { matchPath } from "./router";
import { Home } from "../pages/Home";
import { NotFound } from "../pages/NotFound";

const About = React.lazy(() => import("../pages/About").then((m) => ({ default: m.About })));
const Locations = React.lazy(() => import("../pages/Locations").then((m) => ({ default: m.Locations })));
const Sermons = React.lazy(() => import("../pages/Sermons").then((m) => ({ default: m.Sermons })));
const SermonDetail = React.lazy(() => import("../pages/SermonDetail").then((m) => ({ default: m.SermonDetail })));
const WatchLive = React.lazy(() => import("../pages/WatchLive").then((m) => ({ default: m.WatchLive })));
const Events = React.lazy(() => import("../pages/Events").then((m) => ({ default: m.Events })));
const Testimonies = React.lazy(() => import("../pages/Testimonies").then((m) => ({ default: m.Testimonies })));
const Giving = React.lazy(() => import("../pages/Giving").then((m) => ({ default: m.Giving })));
const Prayer = React.lazy(() => import("../pages/Prayer").then((m) => ({ default: m.Prayer })));
const Contact = React.lazy(() => import("../pages/Contact").then((m) => ({ default: m.Contact })));
const Visit = React.lazy(() => import("../pages/Visit").then((m) => ({ default: m.Visit })));
const Devotional = React.lazy(() => import("../pages/Devotional").then((m) => ({ default: m.Devotional })));
const Ministries = React.lazy(() => import("../pages/Ministries").then((m) => ({ default: m.Ministries })));
const Library = React.lazy(() => import("../pages/Library").then((m) => ({ default: m.Library })));

export const ROUTES: { pattern: string; element: React.ReactNode }[] = [
  { pattern: "/", element: <Home /> },
  { pattern: "/about", element: <About /> },
  { pattern: "/locations", element: <Locations /> },
  { pattern: "/sermons", element: <Sermons /> },
  { pattern: "/sermons/:id", element: <SermonDetail /> },
  { pattern: "/watch-live", element: <WatchLive /> },
  { pattern: "/events", element: <Events /> },
  { pattern: "/testimonies", element: <Testimonies /> },
  { pattern: "/giving", element: <Giving /> },
  { pattern: "/give", element: <Giving /> },
  { pattern: "/donate", element: <Giving /> },
  { pattern: "/prayer", element: <Prayer /> },
  { pattern: "/contact", element: <Contact /> },
  { pattern: "/visit", element: <Visit /> },
  { pattern: "/devotional", element: <Devotional /> },
  { pattern: "/ministries", element: <Ministries /> },
  { pattern: "/library", element: <Library /> },
];

/* Aliases people use; compared lowercased, punctuation stripped. */
const ALIASES: Record<string, string> = {
  home: "/", homepage: "/", index: "/", main: "/", start: "/", welcome: "/", landing: "/",
  about: "/about", aboutus: "/about", ourstory: "/about", whoweare: "/about", beliefs: "/about",
  whatwebelieve: "/about", whatwebelievein: "/about", history: "/about", vision: "/about",
  mission: "/about", purpose: "/about", values: "/about", leadership: "/about", leaders: "/about",
  staff: "/about", team: "/about", pastor: "/about", pastors: "/about", faq: "/about", faqs: "/about",
  locations: "/locations", location: "/locations", branches: "/locations", branch: "/locations",
  campuses: "/locations", campus: "/locations", findus: "/locations", address: "/locations",
  servicetimes: "/locations", services: "/locations", times: "/locations", map: "/locations",
  sermons: "/sermons", sermon: "/sermons", messages: "/sermons", message: "/sermons",
  teachings: "/sermons", teaching: "/sermons", preachings: "/sermons", preaching: "/sermons",
  archive: "/sermons", sermonarchive: "/sermons", videos: "/sermons", video: "/sermons",
  media: "/sermons", watch: "/sermons",
  live: "/watch-live", watchlive: "/watch-live", stream: "/watch-live", streams: "/watch-live",
  streaming: "/watch-live", livestream: "/watch-live", broadcast: "/watch-live",
  broadcasts: "/watch-live", online: "/watch-live", onlinelive: "/watch-live",
  events: "/events", event: "/events", calendar: "/events", whatson: "/events", upcoming: "/events",
  testimonies: "/testimonies", testimony: "/testimonies", stories: "/testimonies", story: "/testimonies",
  praise: "/testimonies", miracles: "/testimonies",
  giving: "/giving", give: "/giving", donate: "/giving", donation: "/giving", donations: "/giving",
  offering: "/giving", offerings: "/giving", tithe: "/giving", tithes: "/giving", generosity: "/giving",
  givingonline: "/giving", giveonline: "/giving",
  prayer: "/prayer", prayers: "/prayer", pray: "/prayer", prayerrequest: "/prayer",
  prayerrequests: "/prayer", intercession: "/prayer", requestprayer: "/prayer",
  contact: "/contact", contactus: "/contact", reachus: "/contact", getintouch: "/contact",
  enquiries: "/contact", enquiry: "/contact", emailus: "/contact",
  visit: "/visit", visits: "/visit", visiting: "/visit", planavisit: "/visit", imnew: "/visit",
  newhere: "/visit", newcomer: "/visit", newcomers: "/visit", firsttime: "/visit",
  firstvisit: "/visit", guest: "/visit",
  devotional: "/devotional", devotionals: "/devotional", devotion: "/devotional", daily: "/devotional",
  dailydevotional: "/devotional", readingplan: "/devotional", verse: "/devotional",
  verses: "/devotional", today: "/devotional",
  ministries: "/ministries", ministry: "/ministries", groups: "/ministries", group: "/ministries",
  serve: "/ministries", serving: "/ministries", volunteer: "/ministries", volunteering: "/ministries",
  outreach: "/ministries", missions: "/ministries", departments: "/ministries",
  library: "/library", mylibrary: "/library", saved: "/library", bookmarks: "/library",
  downloads: "/library", resources: "/library",
};

/* The same idea for the words these addresses usually *contain*, so anything
   that reads like "giving-online" or "sermon-archive-2024" still lands right. */
const PREFIXES: [string, string][] = [
  ["watchlive", "/watch-live"], ["livestream", "/watch-live"], ["broadcast", "/watch-live"],
  ["stream", "/watch-live"], ["live", "/watch-live"], ["online", "/watch-live"],
  ["sermon", "/sermons"], ["message", "/sermons"], ["preach", "/sermons"], ["teaching", "/sermons"],
  ["media", "/sermons"], ["archive", "/sermons"], ["video", "/sermons"], ["watch", "/sermons"],
  ["giv", "/giving"], ["tithe", "/giving"], ["offering", "/giving"], ["generosit", "/giving"],
  ["fund", "/giving"],
  ["pray", "/prayer"], ["intercess", "/prayer"],
  ["event", "/events"], ["calendar", "/events"],
  ["prais", "/testimonies"], ["testimon", "/testimonies"], ["stor", "/testimonies"],
  ["visit", "/visit"], ["newcomer", "/visit"], ["newhere", "/visit"], ["guest", "/visit"],
  ["contact", "/contact"], ["reachus", "/contact"], ["getintouch", "/contact"],
  ["connect", "/contact"], ["enquir", "/contact"],
  ["location", "/locations"], ["locate", "/locations"], ["branch", "/locations"], ["campus", "/locations"],
  ["findus", "/locations"], ["directions", "/locations"], ["church", "/locations"],
  ["ministr", "/ministries"], ["serv", "/ministries"], ["volunteer", "/ministries"],
  ["outreach", "/ministries"], ["mission", "/ministries"], ["department", "/ministries"],
  ["devotion", "/devotional"], ["daily", "/devotional"], ["verse", "/devotional"],
  ["reading", "/devotional"], ["bible", "/devotional"],
  ["about", "/about"], ["belief", "/about"], ["story", "/about"], ["who", "/about"],
  ["leader", "/about"], ["staff", "/about"], ["pastor", "/about"], ["vision", "/about"],
  ["value", "/about"], ["faq", "/about"],
  ["librar", "/library"], ["save", "/library"], ["bookmark", "/library"], ["resource", "/library"],
  ["download", "/library"], ["my", "/library"],
  ["home", "/"], ["index", "/"], ["main", "/"], ["welcome", "/"], ["start", "/"],
];

/** ".html" and friends, doubled slashes, trailing slashes — all the same page. */
function clean(path: string): string {
  let p = String(path || "").trim().replace(/\/{2,}/g, "/").replace(/\.(html?|php|aspx?|jsp)$/i, "");
  if (!p.startsWith("/")) p = "/" + p;
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/** "Watch live!" and "watch-live" both read as "watchlive". */
function plain(input: string): string {
  return String(input || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The first page in the table whose pattern fits, static patterns first. */
function matchRoute(path: string): { pattern: string; element: React.ReactNode } | undefined {
  const exact = ROUTES.find((r) => !r.pattern.includes(":") && matchPath(r.pattern, path));
  if (exact) return exact;
  return ROUTES.find((r) => r.pattern.includes(":") && matchPath(r.pattern, path));
}

export type Resolved = {
  element: React.ReactNode;
  /** The address of the page actually shown — may differ from the one asked for. */
  to: string;
};

export function resolvePath(input: string): Resolved {
  const path = clean(input);
  const direct = matchRoute(path);
  if (direct) return { element: direct.element, to: path };

  /* Trim trailing date/number segments ("/events/2026/05" is "/events"):
     strip them first, then match once. */
  const parts = path.split("/").filter(Boolean);
  let end = parts.length;
  while (end > 1 && /^\d+$/.test(parts[end - 1])) end--;
  if (end < parts.length) {
    const candidate = "/" + parts.slice(0, end).join("/");
    const hit = matchRoute(candidate);
    if (hit) return { element: hit.element, to: candidate };
  }

  /* Still nothing? Read the name the address starts with the way a person
     would — first the whole address as one word ("planavisit"), then its first
     segment ("/about-us"). */
  const words = [plain(path), parts[0] ? plain(parts[0]) : ""].filter(Boolean);
  for (const word of words) {
    const alias = ALIASES[word];
    if (alias) return { element: matchRoute(alias)!.element, to: alias };
  }
  /* …then for the words any part of it contains, so "/en/about" and
     "giving-online-2026" still land right. */
  for (const word of parts.map(plain).filter(Boolean)) {
    const prefix = PREFIXES.find(([key]) => word.startsWith(key));
    if (prefix) return { element: matchRoute(prefix[1])!.element, to: prefix[1] };
  }

  return { element: <NotFound />, to: path };
}

/** Just the page for an address (see resolvePath for the forgiving part). */
export function pageFor(path: string): React.ReactNode {
  return resolvePath(path).element;
}
