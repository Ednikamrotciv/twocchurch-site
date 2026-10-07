/* Admin schema: what the office can edit, and how saves write back to data modules.
   Sections hold plain JSON; `bind` mutates module exports in place (pages keep references). */

import { DAY_NAMES, churchTimezone, setBaseCurrency, setChurchTimezone, setVisitorCurrencyEnabled, setVisitorTimeEnabled, slugify, todayKey, zonedParts, zoneYear } from "./store";
import {
  SITE,
  STATS,
  VALUES,
  BELIEFS,
  TIMELINE,
  LEADERSHIP,
  MINISTRIES,
  FAQS,
  DEPARTMENTS,
  GIVING_FUNDS,
  GIVING_BREAKDOWN,
  BANK_ACCOUNTS,
  SERVICES,
} from "../data/site";
import { BRANCHES, syncCountries, syncHq } from "../data/branches";
import { SERMONS, SPEAKERS, SERMON_YEARS, sermonDate } from "../data/sermons";
import {
  CONTACT_TOPICS,
  EVENTS,
  EVENT_FILTERS,
  GIVING_FAQS,
  GIVING_METHODS,
  MEMORY_VERSES,
  PRAYER_CATEGORIES,
  PRAYER_FOCUS,
  READING_PLAN,
  SCRIPTURES,
  SERVING_FAQS,
  SERVING_TEAMS,
  TESTIMONY_CATEGORIES,
  SEED_TESTIMONIES,
  VISIT_EXPECT,
  VISIT_FAQS,
} from "../data/content";
import { ANNOUNCEMENTS } from "../data/announcements";
import { SLIDES, SLIDE_DESIGNS, purgeExpiredSlides } from "../data/slides";
import { purgeExpiredAnnouncements } from "../data/announcements";
import { LIVE } from "../data/live";
import { COPY_PAGES, bindCopyPage, copyPageById, copyPageList } from "../data/copy";
import { PHOTO_GROUPS, PHOTO_SLOTS, applyPhotos, readPhotos } from "../data/photos";

/* ------------------------------------------------------------------ helpers */

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export function setPath(obj: any, path: string, value: any) {
  const parts = path.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function syncObject(target: any, source: any) {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const key of Object.keys(source)) target[key] = source[key];
}

/** Refill `target` in place, keeping objects alive where ids match (note 78: id-less entries never match each other). */
export function applyToList<T extends any[]>(target: T, incoming: any, idKey?: string) {
  const list: any[] = Array.isArray(incoming) ? incoming : [];
  const next: any[] = [];
  const pool = new Map<any, any[]>();
  if (idKey) {
    for (const item of target) {
      const key = item?.[idKey];
      if (key === undefined || key === null || key === "") continue;
      const bucket = pool.get(key);
      if (bucket) bucket.push(item);
      else pool.set(key, [item]);
    }
  }
  list.forEach((item, i) => {
    const key = idKey ? item?.[idKey] : undefined;
    let existing: any;
    if (idKey) {
      if (key !== undefined && key !== null && key !== "") existing = pool.get(key)?.shift();
    } else {
      existing = target[i];
    }
    if (existing && typeof existing === "object" && typeof item === "object" && item !== null) {
      syncObject(existing, item);
      next.push(existing);
    } else {
      next.push(clone(item));
    }
  });
  target.length = 0;
  for (const item of next) target.push(item);
}

/* ------------------------------------------------------------------ photos */

const PHOTO_BLURBS: Record<string, string> = {
  "Main photos":
    "The big photos behind the headlines. Upload a photo from your phone or computer, or paste the address of one — whatever you choose shows up everywhere that photo is used.",
  "Ministries & programmes":
    "The photos on the ministries, prayer, devotional and giving pages.",
  "Leadership photos": "The photos of the leadership team on the About page.",
};

/* Photo sections hide from the Update tab (notes 51, 58, 62); the Photos card still opens them. */
const PHOTO_SECTION_IDS: Record<string, string> = {
  "Main photos": "photos-main",
  "Ministries & programmes": "photos-ministries",
  "Leadership photos": "photos-leadership",
};

const photoSections: SectionDef[] = PHOTO_GROUPS.map((group) => {
  const slots = PHOTO_SLOTS.filter((slot) => slot.group === group);
  return {
    id: PHOTO_SECTION_IDS[group] || "photos",
    label: group,
    group: "Photos & covers",
    icon: "camera",
    blurb:
      (PHOTO_BLURBS[group] || "") +
      " Leave a photo empty to go back to the original one. A branch, ministry or person that has been given its own photo keeps it.",
    kind: "object" as const,
    everythingHidden: true,
    fields: slots.map((slot) => ({
      path: slot.key,
      label: slot.label,
      type: "image" as const,
      hint: slot.where,
    })),
    read: () => {
      const all = readPhotos();
      const out: Record<string, string> = {};
      for (const slot of slots) out[slot.key] = all[slot.key] || "";
      return out;
    },
    bind: (value: any) => applyPhotos({ ...readPhotos(), ...(value || {}) }),
  };
});

/* ------------------------------------------------------------------- fields */

export type FieldType =
  | "text"
  | "slug"
  | "textarea"
  | "number"
  | "time"
  | "date"
  | "select"
  | "boolean"
  | "image"
  | "video"
  | "static"
  | "strings"
  | "list"
  | "testimonyKind";

export type Field = {
  path: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  options?: (string | { value: string; label: string })[];
  /** Friendly names for a select's stored values, e.g. { youtube: "YouTube" }. */
  optionLabels?: Record<string, string>;
  /** Store the selected value as a number (used for weekday indexes). */
  numberValues?: boolean;
  /** Read-only fields are shown but cannot be changed (e.g. a copy key). */
  readonly?: boolean;
  /** Fill the select from the current admin state instead of fixed options. */
  optionsFrom?: "branches" | "testimonyCategories";
  /** First entry offered by a select that is allowed to stay empty. */
  placeholderOption?: string;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  /** nested editor for type: "list" */
  fields?: Field[];
  itemLabel?: string | ((item: any) => string);
  itemMeta?: string | ((item: any) => string);
  makeNew?: () => any;
  addLabel?: string;
  /** Capped lists read newest-first; past the cap the oldest entry leaves. */
  maxItems?: number;

  /** Bundled fallback photo shown when the field is empty. */
  fallbackPhoto?: string;

  /** Re-cut uploads to one shape before hosting (slides use the 1600x1200 frame). */
  frame?: "slide";

  /** Stand-in shown with no photo and no fallback (initials, a video still). */
  emptyNote?: string;

};

export type SectionDef = {
  id: string;
  label: string;
  group: string;
  icon: string;
  blurb: string;
  kind: "object" | "list";
  idKey?: string;
  fields: Field[];
  itemLabel?: (item: any) => string;
  /** Small print on the row; `list` includes unpublished edits (note 86). */
  itemMeta?: (item: any, list: any[]) => string;
  /** Group rows under a heading from this field (branches, by country). */
  groupBy?: string;
  makeNew?: () => any;
  /** Build the Add entry from the list (a branch starts from the last one). Falls back to `makeNew`. */
  makeNewFor?: (list: any[]) => any;
  /** Wording of the foot Add button. */
  addLabel?: string;
  /** Path of the nested list, so an object section deletes like a real list. */
  deletableItems?: string;
  /** Child entries (branches only): `parentKey` holds the parent's id. */
  tree?: {
    parentKey: string;
    /** The button on every entry that adds a child. */
    childLabel: string;
    /** Short label for the row button (note 81). */
    childShort: string;
    /** The button on every entry that adds another entry beside it. */
    siblingLabel: string;
    makeChild: (parent: any) => any;
    makeSibling: (item: any) => any;
    /** What the toast says after each of the two buttons. */
    childToast: string;
    siblingToast: string;
    /** How the office adds a country of its own (note 81). */
    countryKey?: string;
    countryLabel?: string;
    countryPlaceholder?: string;
    countryToast?: string;
    makeCountry?: (country: string) => any;
  };
  read: () => any;
  bind: (value: any) => void;
  /** Code-fixed entries: the console hides Add, Duplicate, Delete and reorder. */
  fixed?: boolean;
  /** Left out of the editor at the church's request (note 51); content still renders. */
  hidden?: boolean;
  /** Update-tab only skip; still reachable from its Edit-tab job (notes 53, 58, 62). */
  everythingHidden?: boolean;
};

/* ------------------------------------------------------------------ options */

export const ICON_NAMES = [
  "cross", "book", "prayer", "people", "home", "gift", "shield", "globe", "heart", "compass",
  "star", "headphones", "archive", "live", "play", "pin", "phone", "mail", "whatsapp", "youtube",
  "facebook", "instagram", "x", "calendar", "clock", "sun", "moon", "bookmark", "download", "share",
  "copy", "external", "filter", "quote", "user", "send", "info", "alert", "map", "sparkle",
  "lock", "tag", "clipboard", "camera", "fire", "ticket", "grid", "eye", "qr", "bell", "link",
];

export const REGION_OPTIONS = ["North America", "Africa", "Europe", "Asia"];
export const ACCENT_OPTIONS = ["gold", "crimson", "sky", "violet", "emerald"];
export const EVENT_CATEGORIES = ["service", "conference", "outreach", "youth", "prayer", "class"];
export const ANNOUNCEMENT_LEVELS = ["notice", "important", "celebration"];
export const VIDEO_PLATFORMS = ["youtube", "facebook", "upload"];
export const VIDEO_PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  upload: "A video file uploaded here",
};
/** A stream comes from one of the two live platforms — not an uploaded file. */
export const STREAM_PLATFORMS = ["youtube", "facebook"];

const scheduleField = (path = "schedule"): Field => ({
  path,
  label: "Service times",
  type: "list",
  itemLabel: "name",
  itemMeta: "time",
  addLabel: "Add service time",
  fields: [
    { path: "name", label: "Service name", type: "text" },
    { path: "day", label: "Day", type: "select", options: DAY_OPTIONS, numberValues: true },
    { path: "time", label: "Start time", type: "time" },
  ],
  makeNew: () => ({ name: "New service", day: 0, time: "18:00", minutes: 90 }),
});

/* Weekdays are stored as numbers (0 = Sunday); the select shows their names. */
const DAY_OPTIONS: { value: string; label: string }[] = DAY_NAMES.map((name, i) => ({ value: String(i), label: name }));

/* ----------------------------------------------------------------- sections */

/* New branches start here, whichever button builds them. */
const blankBranch = (): any => ({
  id: "",
  name: "",
  city: "",
  country: "",
  flag: "",
  region: "North America",
  address: "",
  lat: 0,
  lng: 0,
  timezone: churchTimezone(),
  phone: "",
  email: "",
  pastor: "",
  pastorRole: "Branch Pastor",
  established: String(zoneYear()),
  capacity: 0,
  languages: ["English"],
  image: "src/assets/img/building2.jpg",
  isSub: false,
  parentId: "",
  schedule: [{ name: "Sunday Celebration", day: 0, time: "10:00", minutes: 120 }],
});

/* A branch added *under* one that already exists. It keeps its parent's
   country, flag, region and time zone, so it lands in the same block of the
   Locations page the moment it is published. */
const subBranchOf = (parent: any): any => ({
  ...blankBranch(),
  country: parent?.country || "",
  flag: parent?.flag || "",
  region: parent?.region || "North America",
  timezone: parent?.timezone || churchTimezone(),
  languages: Array.isArray(parent?.languages) && parent.languages.length ? [...parent.languages] : ["English"],
  image: parent?.image || "src/assets/img/building2.jpg",
  isSub: true,
  parentId: parent?.id || "",
});

/* A branch added *beside* one that already exists: its own branch, in the same
   country (the office starts it in the country they are standing in). */
const siblingBranchOf = (item: any): any => ({
  ...blankBranch(),
  country: item?.country || "",
  flag: item?.flag || "",
  region: item?.region || "North America",
  timezone: item?.timezone || churchTimezone(),
  languages: Array.isArray(item?.languages) && item.languages.length ? [...item.languages] : ["English"],
  image: item?.image || "src/assets/img/building2.jpg",
  isSub: false,
  parentId: "",
});

/* A country exists because a branch names it (note 81). */
const countryBranchOf = (country: string): any => ({
  ...blankBranch(),
  country: String(country || "").trim(),
});

/* Id-less entries are named after themselves (`Grace Alone` → `grace-alone`); taken names number apart. */
function mintIds(list: any, seeds: string[], fallback: string): any[] {
  if (!Array.isArray(list)) return list;
  const taken = new Set(list.map((item) => String(item?.id ?? "").trim()).filter(Boolean));
  return list.map((item) => {
    if (!item || typeof item !== "object") return item;
    if (String(item.id ?? "").trim()) return item;
    const words = seeds.map((k) => String(item?.[k] ?? "").trim()).find((v) => v) || "";
    const base = slugify(words) || fallback;
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    taken.add(id);
    return { ...item, id };
  });
};

const CORE_SECTIONS: SectionDef[] = [
  /* ---------------------------------------------------------------- church */
  {
    id: "site",
    label: "Church profile",
    group: "Church",
    icon: "cross",
    blurb: "Mission, contact details, office hours and social links.",
    kind: "object",
    fields: [
      { path: "short", label: "Short name", type: "text", hint: "Used where space is tight, e.g. \u201cWorld Overcomers\u201d." },
      { path: "initials", label: "Initials", type: "text" },
      { path: "tagline", label: "Tagline", type: "text" },
      { path: "founded", label: "Founded (year)", type: "number", min: 1800, max: 2100 },
      { path: "mission", label: "Mission", type: "textarea", rows: 4 },
      { path: "vision", label: "Vision", type: "textarea", rows: 4 },
      { path: "verse.ref", label: "Anchor verse reference", type: "text" },
      { path: "verse.text", label: "Anchor verse text", type: "textarea", rows: 3 },
      { path: "phone", label: "Phone", type: "text" },
      { path: "whatsapp", label: "WhatsApp (digits only)", type: "text" },
      { path: "email", label: "General email", type: "text" },
      { path: "prayerEmail", label: "Prayer email", type: "text" },
      { path: "givingEmail", label: "Giving email", type: "text" },
      { path: "mediaEmail", label: "Media email", type: "text" },
      { path: "address", label: "Head office address", type: "textarea", rows: 2 },
      {
        path: "timezone",
        label: "Time zone",
        type: "text",
        placeholder: "Africa/Lagos",
      },
      {
        path: "visitorTime",
        label: "Show each visitor their own time zone",
        type: "boolean",
        hint: "On, times are shown in the visitor's own time zone, found from their IP address — a member in Dallas reads the Lagos Sunday gathering as Sunday afternoon, their time. Off, everyone reads the church's clock above, whatever their own clock says.",
      },
      {
        path: "currency",
        label: "Currency",
        type: "text",
        placeholder: "USD",
        hint: "The currency the church's own figures are written in — the giving amounts, every event's cost, the allocation card. An ISO code: USD for US dollars, NGN for naira, GBP for pounds. Everything you type as a money amount is read as this currency, and every reader is shown it in theirs (see the switch below).",
      },
      {
        path: "visitorCurrency",
        label: "Show each visitor their own currency",
        type: "boolean",
        hint: "On, amounts are shown in the currency of the country the visitor's IP address is in, converted at the day's rate — a member in Lagos reads a $25 offering as naira. Off, every reader sees the currency above, exactly as you typed your figures.",
      },
      {
        path: "socials",
        label: "Social links",
        type: "list",
        itemLabel: "label",
        itemMeta: "handle",
        addLabel: "Add social link",
        fields: [
          { path: "label", label: "Label", type: "text" },
          { path: "handle", label: "Handle", type: "text" },
          { path: "url", label: "URL", type: "text" },
        ],
        makeNew: () => ({ label: "New link", handle: "", url: "https://", icon: "link" }),
      },
      {
        path: "officeHours",
        label: "Office hours",
        type: "list",
        itemLabel: "day",
        itemMeta: "open",
        addLabel: "Add office day",
        fields: [
          { path: "day", label: "Day", type: "select", options: DAY_OPTIONS, numberValues: true },
          { path: "open", label: "Opens", type: "time" },
          { path: "close", label: "Closes", type: "time" },
        ],
        makeNew: () => ({ day: 1, open: "09:00", close: "17:00" }),
      },
    ],
    /* The church name is NOT part of this section: it comes from main.pjs
       (churchName) and is deliberately locked. Neither is the logo — the
       office can reword everything else about the church profile. */
    read: () => {
      const copy = clone(SITE);
      delete (copy as any).name;
      return copy;
    },
    /* The two clocks follow the profile: hand them to the time helpers as soon
       as it is bound, so the whole site re-reads in the new zone and (when the
       office has asked for it) on each visitor's own clock (notes 84/85). */
    bind: (v) => {
      Object.assign(SITE, clone(v));
      setChurchTimezone(SITE.timezone);
      setVisitorTimeEnabled(SITE.visitorTime);
      setBaseCurrency(SITE.currency);
      setVisitorCurrencyEnabled(SITE.visitorCurrency);
    },
  },
  {
    id: "leadership",
    label: "Leadership",
    group: "Church",
    icon: "people",
    blurb: "Pastors, deacons and department heads shown on the About page and in sermon by-lines.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "name", label: "Full name", type: "text" },
      { path: "role", label: "Role", type: "text" },
      { path: "bio", label: "Short biography", type: "textarea", rows: 4 },
      { path: "image", label: "Photo", type: "image", hint: "Shown on this person's card on the About page. Leave it empty to show their initials instead.", emptyNote: "No photo of their own — their initials are shown instead." },
      { path: "monogram", label: "Monogram", type: "text", hint: "Two letters shown when there is no photo." },
      { path: "verse", label: "Life verse", type: "textarea", rows: 2 },
    ],
    itemLabel: (i) => i?.name || "New leader",
    itemMeta: (i) => i?.role || "",
    makeNew: () => ({ id: "", name: "", role: "", bio: "", monogram: "" }),
    read: () => clone(LEADERSHIP),
    bind: (v) => applyToList(LEADERSHIP as any[], mintIds(v, ["name"], "leader"), "id"),
  },
  {
    id: "departments",
    label: "Contact desks",
    group: "Church",
    icon: "mail",
    blurb: "The inboxes listed on the contact page, so visitors reach the right desk first time.",
    kind: "list",
    fields: [
      { path: "name", label: "Desk", type: "text" },
      { path: "email", label: "Email", type: "text" },
      { path: "desc", label: "What it handles", type: "textarea", rows: 2 },
      { path: "hours", label: "Reply hours", type: "text" },
    ],
    itemLabel: (i) => i?.name || "New desk",
    itemMeta: (i) => i?.email || "",
    makeNew: () => ({ name: "", email: "", desc: "", hours: "Mon\u2013Fri, 9 AM\u20135 PM" }),
    read: () => clone(DEPARTMENTS),
    bind: (v) => applyToList(DEPARTMENTS as any[], v),
  },
  {
    id: "faqs",
    label: "FAQs",
    group: "Church",
    icon: "info",
    blurb: "Questions asked most often. The first five also appear on the Plan Your Visit page.",
    kind: "list",
    fields: [
      { path: "q", label: "Question", type: "text" },
      { path: "a", label: "Answer", type: "textarea", rows: 4 },
    ],
    itemLabel: (i) => i?.q || "New question",
    itemMeta: (i) => (i?.a ? String(i.a).slice(0, 68) + (String(i.a).length > 68 ? "\u2026" : "") : ""),
    makeNew: () => ({ q: "", a: "" }),
    read: () => clone(FAQS),
    bind: (v) => applyToList(FAQS as any[], v),
  },

  /* ------------------------------------------------- services & activities */
  {
    id: "services",
    label: "Weekly services",
    group: "Services & activities",
    icon: "clock",
    blurb: "The services every live badge, countdown and next-gathering notice on the site follows — read on the church's own clock.",
    kind: "list",
    fields: [
      { path: "name", label: "Service name", type: "text" },
      { path: "day", label: "Day", type: "select", options: DAY_OPTIONS, numberValues: true },
      { path: "time", label: "Start time", type: "time" },
      { path: "minutes", label: "Minutes long", type: "number", min: 15, max: 600, step: 15 },
    ],
    itemLabel: (i) => i?.name || "New service",
    itemMeta: (i) => `${DAY_NAMES[i?.day] || ""} ${i?.time || ""}`.trim(),
    makeNew: () => ({ name: "New service", day: 0, time: "10:00", minutes: 90 }),
    read: () => clone(SERVICES),
    bind: (v) => applyToList(SERVICES as any[], v),
  },
  {
    id: "branches",
    label: "Branches",
    group: "Services & activities",
    icon: "pin",
    blurb: "",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "name", label: "Branch name", type: "text" },
      { path: "city", label: "City", type: "text" },
      { path: "country", label: "Country", type: "text", hint: "The Locations page groups branches by this name — Nigeria, America, Canada — in the order the countries first appear in this list." },
      { path: "flag", label: "Flag emoji", type: "text", placeholder: "\uD83C\uDDFA\uD83C\uDDF8" },
      { path: "region", label: "Region", type: "select", options: REGION_OPTIONS },
      { path: "address", label: "Address", type: "textarea", rows: 2 },
      { path: "lat", label: "Latitude", type: "number", step: 0.0001 },
      { path: "lng", label: "Longitude", type: "number", step: 0.0001 },
      {
        path: "timezone",
        label: "Time zone",
        type: "text",
        placeholder: "Africa/Lagos",
        hint: "This branch's service times are read on this clock, so its countdown is right for the city it gathers in. IANA name — Africa/Lagos, America/Chicago, America/Toronto.",
      },
      { path: "phone", label: "Phone", type: "text" },
      { path: "email", label: "Email", type: "text" },
      { path: "pastor", label: "Branch pastor", type: "text" },
      { path: "pastorRole", label: "Pastor's title", type: "text" },
      { path: "languages", label: "Languages", type: "strings" },
      { path: "image", label: "Photo", type: "image", fallbackPhoto: "building2" },
      /* No Global HQ / Sub-branch fields any more (note 131); `isHq`/`isSub` are set elsewhere. */
      {
        path: "parentId",
        label: "Sub-branch of",
        type: "select",
        optionsFrom: "branches",
        placeholderOption: "A branch in its own right",
        hint: "The branch this gathering was added under. Set for you when you press Add a sub-branch; the Locations page shows it beneath that branch.",
      },
      scheduleField(),
    ],
    itemLabel: (i) => i?.name || "New branch",
    /* Row aside: city plus live sub-branch count (`parentId` decides; note 86). */
    itemMeta: (i, list) => {
      const city = String(i?.city || "");
      const id = String(i?.id || "");
      if (!id) return city;
      const kids = (list || []).filter((x) => x !== i && String(x?.parentId || "") === id).length;
      return kids ? `${city} · ${kids} sub-branch${kids === 1 ? "" : "es"}` : city;
    },
    groupBy: "country",
    addLabel: "Add a branch",
    tree: {
      parentKey: "parentId",
      childLabel: "Add a sub-branch",
      childShort: "Sub-branch",
      siblingLabel: "Add a branch",
      makeChild: subBranchOf,
      makeSibling: siblingBranchOf,
      childToast: "Added a sub-branch — fill in its details, then publish.",
      siblingToast: "Added a branch — fill in its details, then publish.",
      countryKey: "country",
      countryLabel: "Add a country",
      countryPlaceholder: "Country name, e.g. Ghana",
      countryToast: "Added a new country — give its first branch a name and city, then publish.",
      makeCountry: countryBranchOf,
    },
    /* *Add a branch* at the foot of the list starts from the last branch, so it
       lands in a country that already exists (and with its flag, region and
       time zone). A brand-new country comes from *Add a country*. */
    makeNewFor: (list: any[]) => siblingBranchOf(list[list.length - 1] || {}),
    makeNew: blankBranch,
    read: () => clone(BRANCHES),
    bind: (v) => {
      applyToList(BRANCHES as any[], mintIds(v, ["name", "city"], "branch"), "id");
      /* A branch added in a country of its own adds that country to the page's
         chips and stats straight away, and the head office follows the Global
         HQ tick wherever the office puts it (SPEC notes 78–79). */
      syncCountries();
      syncHq();
      /* A gathering with a parent is a sub-branch; `bind` keeps `isSub` in step (note 131). */
      for (const branch of BRANCHES as any[]) branch.isSub = !!String(branch.parentId || "");
    },
  },
  {
    id: "ministries",
    label: "Ministries",
    group: "Services & activities",
    icon: "grid",
    blurb: "Departments and serving teams listed on the Ministries page, including where to volunteer.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "name", label: "Ministry name", type: "text" },
      { path: "image", label: "Photo", type: "image", hint: "The picture on this ministry's card on the Ministries page.", fallbackPhoto: "youth" },
      { path: "description", label: "Description", type: "textarea", rows: 3 },
      { path: "meets", label: "Meets", type: "text" },
      { path: "leader", label: "Leader", type: "text" },
      { path: "for", label: "Who it is for", type: "text" },
    ],
    itemLabel: (i) => i?.name || "New ministry",
    itemMeta: (i) => i?.meets || "",
    makeNew: () => ({ id: "", name: "", image: "src/assets/img/welcome.jpg", description: "", meets: "", leader: "", for: "Everyone" }),
    read: () => clone(MINISTRIES),
    bind: (v) => applyToList(MINISTRIES as any[], mintIds(v, ["name"], "ministry"), "id"),
  },
  {
    id: "events",
    label: "Events & activities",
    group: "Services & activities",
    icon: "calendar",
    blurb: "Conferences, vigils, outreaches and classes. Dates are stored as days from today, so the calendar never goes stale.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "title", label: "Event title", type: "text" },
      { path: "description", label: "Description", type: "textarea", rows: 3 },
      { path: "category", label: "Category", type: "select", options: EVENT_CATEGORIES },
      { path: "offsetDays", label: "In how many days", type: "number", min: 0, max: 730, hint: "0 = today, 7 = a week from now." },
      { path: "time", label: "Start time", type: "time" },
      { path: "durationMin", label: "Minutes long", type: "number", min: 15, max: 1440, step: 15 },
      { path: "location", label: "Where", type: "text" },
      { path: "branchId", label: "Host branch", type: "select", optionsFrom: "branches" },
      { path: "image", label: "Photo", type: "image", hint: "The picture on this activity's card — and on the home page when it is featured.", fallbackPhoto: "welcome" },
      { path: "cost", label: "Cost", type: "text" },
      { path: "featured", label: "Feature on the home page", type: "boolean" },
      { path: "register", label: "Show a register button", type: "boolean" },
    ],
    itemLabel: (i) => i?.title || "New event",
    itemMeta: (i) => `in ${i?.offsetDays ?? 0} day(s) \u00b7 ${i?.time || ""}`,
    makeNew: () => ({
      id: "",
      title: "",
      description: "",
      category: "service",
      offsetDays: 7,
      time: "18:30",
      durationMin: 120,
      location: "",
      branchId: BRANCHES[0]?.id || "dallas",
      image: "src/assets/img/welcome.jpg",
      cost: "Free",
      register: false,
    }),
    read: () => clone(EVENTS),
    bind: (v) => applyToList(EVENTS as any[], mintIds(v, ["title"], "event"), "id"),
  },
  {
    id: "announcements",
    label: "Announcements",
    group: "Services & activities",
    icon: "bell",
    blurb: "Short notices that appear in a dismissible strip under the header for three weeks after their date.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "title", label: "Headline", type: "text" },
      { path: "body", label: "Details", type: "textarea", rows: 3 },
      { path: "level", label: "Tone", type: "select", options: ANNOUNCEMENT_LEVELS },
      { path: "date", label: "Post date", type: "date", hint: "Dated in the future? It stays hidden until that day." },
      { path: "expiresDate", label: "Expiry date", type: "date" },
      { path: "expiresTime", label: "Expiry time", type: "time" },
      { path: "link", label: "Link (optional)", type: "text", placeholder: "/watch-live" },
      { path: "linkLabel", label: "Link label", type: "text" },
      { path: "active", label: "Show on the site", type: "boolean" },
    ],
    itemLabel: (i) => i?.title || "New announcement",
    itemMeta: (i) => `${i?.date || ""} \u00b7 ${i?.level || ""}`.trim(),
    makeNew: () => ({
      id: "",
      title: "",
      body: "",
      level: "notice",
      date: todayKey(),
      active: true,
    }),
    read: () => clone(ANNOUNCEMENTS),
    bind: (v) => applyToList(ANNOUNCEMENTS as any[], purgeExpiredAnnouncements(mintIds(v, ["title"], "notice")), "id"),
  },
  {
    id: "slides",
    label: "Announcement slides",
    group: "Services & activities",
    icon: "sparkle",
    blurb:
      "The slide space on the home page. Upload a picture and it becomes a designed slide of its own, with your words on it — every picture is designed differently.",
    kind: "list",
    idKey: "id",
    fields: [
      {
        path: "image",
        label: "The picture",
        type: "image",
        frame: "slide",
        emptyNote: "No picture yet — the welcome photo stands in until you upload one.",
      },
      {
        path: "headline",
        label: "The big words",
        type: "text",
        hint: "Set large on the slide. Two or three words work best — “Welcome home”, “Carols by candlelight”.",
      },
      {
        path: "line",
        label: "The small words under them",
        type: "text",
        hint: "One line: the date, the place, or what it is for.",
      },
      {
        path: "design",
        label: "Design",
        type: "select",
        options: ["auto", ...SLIDE_DESIGNS.map((d) => d.id)],
        optionLabels: { auto: "Automatic (a different one for every picture)" },
        hint: "Automatic gives each picture a design of its own. Pin one here to keep a particular design on this slide.",
      },
      { path: "active", label: "Show this slide", type: "boolean" },
      {
        path: "expiresDate",
        label: "Expiry date",
        type: "date",
      },
      {
        path: "expiresTime",
        label: "Expiry time",
        type: "time",
      },
    ],
    itemLabel: (i) => i?.headline || "New slide",
    itemMeta: (i) => [i?.line, i?.cta && i?.link ? i.cta : "", i?.expiresDate ? `ends ${i.expiresDate}` : ""].filter(Boolean).join(" · ").slice(0, 90),
    makeNew: () => ({ id: "", image: "", headline: "", line: "", cta: "Read more", link: "", design: "auto", active: true, expiresDate: "", expiresTime: "" }),
    read: () => clone(SLIDES),
    bind: (v) => applyToList(SLIDES as any[], purgeExpiredSlides(mintIds(v, ["headline"], "slide")), "id"),
  },

  /* -------------------------------------------------------------- teaching */
  {
    id: "sermons",
    label: "Sermons",
    group: "Teaching",
    icon: "play",
    blurb: "",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "title", label: "Message title", type: "text" },
      { path: "speaker", label: "Speaker", type: "text" },
      {
        path: "platform",
        label: "Where it plays from",
        type: "select",
        options: VIDEO_PLATFORMS,
        optionLabels: VIDEO_PLATFORM_LABELS,
        hint: "YouTube, Facebook, or a video file you uploaded. Fill in the matching field below.",
      },
      { path: "youtubeId", label: "YouTube video link", type: "text", placeholder: "https://www.youtube.com/watch?v=…", hint: "Paste the whole YouTube link — the address from your browser's bar, or the link the Share button gives you (https://youtu.be/…)." },
      { path: "facebookUrl", label: "Facebook video link", type: "text", placeholder: "https://www.facebook.com/…/videos/…" },
      { path: "uploadUrl", label: "Upload the video", type: "video" },
      { path: "durationText", label: "Duration", type: "text", placeholder: "48 min" },
      { path: "scripture", label: "Scripture", type: "text" },
      { path: "summary", label: "Summary", type: "textarea", rows: 4 },
      { path: "points", label: "Sermon points", type: "strings", addLabel: "Add point" },
      { path: "questions", label: "Discussion questions", type: "strings", addLabel: "Add question" },
      { path: "venue", label: "Venue", type: "text" },
    ],
    itemLabel: (i) => i?.title || "New sermon",
    itemMeta: (i) => [i?.fromLive ? "Broadcast" : "", i?.speaker, i?.durationText].filter(Boolean).join(" \u00b7 "),
    makeNew: () => ({
      id: "",
      title: "",
      speaker: "",
      platform: "youtube",
      youtubeId: "",
      facebookUrl: "",
      uploadUrl: "",
      durationText: "45 min",
      scripture: "",
      summary: "",
      points: [],
      questions: [],
      tags: [],
      venue: "Overcomers' Cathedral, Dallas",
      /* A message is dated the day it is uploaded — the office never types a
         date (SPEC note 141). */
      date: todayKey(),
      fromLive: false,
    }),
    read: () => clone(SERMONS),
    bind: (v) => applyToList(SERMONS as any[], mintIds(v, ["title"], "message"), "id"),
  },
  {
    id: "scriptures",
    label: "Verse pool",
    group: "Teaching",
    icon: "quote",
    blurb: "The scriptures the daily devotional and verse-of-the-day cards draw from.",
    kind: "list",
    fields: [
      { path: "ref", label: "Reference", type: "text" },
      { path: "text", label: "Verse text", type: "textarea", rows: 3 },
      { path: "theme", label: "Theme", type: "text", hint: "e.g. faith, healing, provision" },
    ],
    itemLabel: (i) => i?.ref || "New verse",
    itemMeta: (i) => i?.theme || "",
    makeNew: () => ({ ref: "", text: "", theme: "faith" }),
    read: () => clone(SCRIPTURES),
    bind: (v) => applyToList(SCRIPTURES as any[], v),
  },

  /* --------------------------------------------------------------- giving */
  {
    id: "givingFunds",
    label: "Giving funds",
    group: "Giving",
    icon: "gift",
    blurb: "The funds a giver can designate, with the verse quoted beside each one.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "name", label: "Fund name", type: "text" },
      { path: "desc", label: "Description", type: "textarea", rows: 2 },
      { path: "verse", label: "Verse reference", type: "text" },
    ],
    itemLabel: (i) => i?.name || "New fund",
    itemMeta: (i) => i?.verse || "",
    makeNew: () => ({ id: "", name: "", desc: "", verse: "" }),
    read: () => clone(GIVING_FUNDS),
    bind: (v) => applyToList(GIVING_FUNDS as any[], mintIds(v, ["name"], "fund"), "id"),
  },
  {
    id: "givingBreakdown",
    label: "Where giving goes",
    group: "Giving",
    icon: "grid",
    blurb: "The published allocation of every dollar. Percentages should add up to 100.",
    kind: "list",
    fields: [
      { path: "label", label: "Category", type: "text" },
      { path: "pct", label: "Percent", type: "number", min: 0, max: 100 },
    ],
    itemLabel: (i) => i?.label || "New category",
    itemMeta: (i) => `${i?.pct ?? 0}%`,
    makeNew: () => ({ label: "", pct: 0 }),
    read: () => clone(GIVING_BREAKDOWN),
    bind: (v) => applyToList(GIVING_BREAKDOWN as any[], v),
  },
  {
    id: "bankAccounts",
    label: "Bank details",
    group: "Giving",
    icon: "clipboard",
    blurb: "Transfer instructions per region. Anything you type here is public on the giving page.",
    kind: "list",
    fields: [
      { path: "region", label: "Region & currency", type: "text" },
      { path: "bank", label: "Bank", type: "text" },
      { path: "name", label: "Account name", type: "text" },
      { path: "acct", label: "Account number", type: "text" },
      { path: "routing", label: "Routing / sort code", type: "text" },
      { path: "sort", label: "Extra reference", type: "text" },
    ],
    itemLabel: (i) => i?.region || "New account",
    itemMeta: (i) => i?.bank || "",
    makeNew: () => ({ region: "", bank: "", name: "", acct: "", routing: "" }),
    read: () => clone(BANK_ACCOUNTS),
    bind: (v) => applyToList(BANK_ACCOUNTS as any[], v),
  },

  /* ----------------------------------------------------------------- about */
  {
    id: "values",
    label: "Values",
    group: "About & numbers",
    icon: "sparkle",
    blurb: "The convictions on the About page — a heading and a sentence each.",
    kind: "list",
    fields: [
      { path: "title", label: "Value", type: "text" },
      { path: "text", label: "What it means", type: "textarea", rows: 3 },
    ],
    itemLabel: (i) => i?.title || "New value",
    makeNew: () => ({ title: "", text: "", icon: "star" }),
    read: () => clone(VALUES),
    bind: (v) => applyToList(VALUES as any[], v),
  },
  {
    id: "beliefs",
    label: "Statement of faith",
    group: "About & numbers",
    icon: "shield",
    blurb: "What the house believes, each with the passage that anchors it.",
    kind: "list",
    fields: [
      { path: "title", label: "Doctrine", type: "text" },
      { path: "text", label: "Statement", type: "textarea", rows: 4 },
      { path: "verse", label: "Passage", type: "text" },
    ],
    itemLabel: (i) => i?.title || "New statement",
    itemMeta: (i) => i?.verse || "",
    makeNew: () => ({ title: "", text: "", verse: "" }),
    read: () => clone(BELIEFS),
    bind: (v) => applyToList(BELIEFS as any[], v),
  },
  {
    id: "timeline",
    label: "Our story",
    group: "About & numbers",
    icon: "clock",
    blurb: "The milestones along the bottom of the About page.",
    kind: "list",
    fields: [
      { path: "year", label: "Year", type: "text" },
      { path: "title", label: "Milestone", type: "text" },
      { path: "text", label: "What happened", type: "textarea", rows: 3 },
    ],
    itemLabel: (i) => i?.title || "New milestone",
    itemMeta: (i) => i?.year || "",
    makeNew: () => ({ year: String(zoneYear()), title: "", text: "" }),
    read: () => clone(TIMELINE),
    bind: (v) => applyToList(TIMELINE as any[], v),
  },
  {
    id: "stats",
    label: "Headline numbers",
    group: "About & numbers",
    icon: "grid",
    blurb: "The counters used across the site, e.g. branches worldwide and members in covenant.",
    kind: "list",
    fields: [
      { path: "value", label: "Number", type: "number", min: 0 },
      { path: "label", label: "Label", type: "text" },
      { path: "suffix", label: "Suffix", type: "text", placeholder: "+" },
    ],
    itemLabel: (i) => `${i?.value ?? 0}${i?.suffix || ""}`,
    itemMeta: (i) => i?.label || "",
    makeNew: () => ({ value: 0, label: "", suffix: "" }),
    read: () => clone(STATS),
    bind: (v) => applyToList(STATS as any[], v),
  },
];

/* ------------------------------------------------------------------ content */

const CONTENT_SECTIONS: SectionDef[] = [
  /* ----------------------------------------------------- live & broadcasts */
  {
    id: "live",
    label: "Live stream",
    group: "Live & broadcasts",
    icon: "live",
    /* The section's help paragraph was removed at the church's request (SPEC
       note 115): the fields carry their own hints, and the drawer shows the
       blurb only when there is one. */
    blurb: "",
    kind: "object",
    fields: [
      { path: "provider", label: "Plays by default", type: "select", options: STREAM_PLATFORMS, optionLabels: VIDEO_PLATFORM_LABELS },
      { path: "youtubeId", label: "YouTube stream link", type: "text", placeholder: "https://www.youtube.com/watch?v=…" },
      { path: "youtubeChannel", label: "YouTube channel to watch for live", type: "text", placeholder: "@yourchurch" },
      { path: "facebookUrl", label: "Facebook stream link", type: "text", placeholder: "https://www.facebook.com/…/videos/…" },
      { path: "recentLimit", label: "How many recent services to show", type: "number", min: 1, max: 24 },
      { path: "turnaroundHours", label: "Hours until a service is written up", type: "number", min: 1, max: 72 },
      { path: "liveTitle", label: "Headline while live", type: "text" },
      /* Drawn by Admin.tsx at the section foot; it belongs to Sermons, not the stream. */
      { path: "pastLimit", label: "How many previous sermons to show", type: "number", min: 1, max: 60 },
      /* On-air state lives on the Start/Stop buttons now, not on a field (note 106). */
      /* Watch cards left the drawer (note 110); fixed content now, still drawn on both pages. */
    ],
    read: () => clone(LIVE),
    bind: (v) => Object.assign(LIVE, clone(v)),
  },

  /* ------------------------------------------------------ prayer & worship */
  {
    id: "prayerFocus",
    label: "Prayer focus list",
    group: "Prayer & testimonies",
    icon: "fire",
    blurb: "The rotating prayer points shown on the prayer page and the devotional — one is picked each day.",
    kind: "list",
    fields: [{ path: "text", label: "Prayer point", type: "textarea", rows: 2 }],
    itemLabel: (i) => String(i?.text || "New prayer point").slice(0, 60),
    makeNew: () => ({ text: "" }),
    read: () => clone(PRAYER_FOCUS),
    bind: (v) => applyToList(PRAYER_FOCUS as any[], v),
  },
  {
    id: "prayerCategories",
    label: "Prayer categories",
    group: "Prayer & testimonies",
    icon: "tag",
    blurb: "What a prayer request can be about. Keep the ids as they are — events and verses are matched by them.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "id", label: "Key", type: "slug", hint: "Lowercase, no spaces. Changing it resets the category." },
      { path: "label", label: "Label", type: "text" },
      { path: "verseTheme", label: "Verse theme", type: "text", hint: "Matches the verse pool's theme field." },
    ],
    itemLabel: (i) => i?.label || "New category",
    itemMeta: (i) => i?.verseTheme || "",
    makeNew: () => ({ id: "", label: "", icon: "prayer", verseTheme: "faith" }),
    read: () => clone(PRAYER_CATEGORIES),
    bind: (v) => applyToList(PRAYER_CATEGORIES as any[], v, "id"),
  },
  {
    id: "testimonies",
    label: "Testimonies",
    group: "Prayer & testimonies",
    icon: "quote",
    blurb: "The testimony wall.",
    deletableItems: "items",
    kind: "object",
    fields: [
      {
        path: "items",
        label: "The wall",
        type: "list",
        maxItems: 10,
        fields: [
          { path: "title", label: "Headline", type: "text" },
          { path: "body", label: "Testimony", type: "textarea", rows: 5 },
          { path: "name", label: "Name", type: "text" },
          { path: "monogram", label: "Monogram", type: "text" },
          { path: "city", label: "City", type: "text" },
          {
            path: "category",
            label: "Kind of grace",
            type: "testimonyKind",
          },
        ],
        itemLabel: (i) => i?.title || "New testimony",
        itemMeta: (i) => [i?.name, i?.city].filter(Boolean).join(" · ").slice(0, 90),
        addLabel: "Add testimony",
        makeNew: () => ({ id: "", title: "", body: "", name: "", monogram: "", city: "", category: "other", createdAt: Date.now(), amens: 0, iAmened: false }),
      },
    ],
    read: () => ({ items: clone(SEED_TESTIMONIES), categories: clone(TESTIMONY_CATEGORIES) }),
    bind: (v) => {
      /* An early save kept the wall as a bare list — read it as the items. */
      const obj = v && typeof v === "object" && !Array.isArray(v) ? v : { items: v };
      /* The wall holds ten testimonies: past that, the oldest makes room. */
      const items = [...(obj.items || [])]
        .sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0))
        .slice(0, 10);
      applyToList(SEED_TESTIMONIES as any[], items, "id");
      if (obj.categories) applyToList(TESTIMONY_CATEGORIES as any[], obj.categories, "id");
    },
  },

  /* ------------------------------------------------------------- teaching */
  {
    id: "readingPlan",
    label: "Reading plan",
    group: "Teaching",
    icon: "bookmark",
    blurb: "The days of the current reading plan on the devotional page.",
    kind: "list",
    fields: [
      { path: "day", label: "Day", type: "text", placeholder: "Day 1" },
      { path: "reference", label: "Passage", type: "text", placeholder: "1 John 5:1-12" },
      { path: "theme", label: "Theme", type: "text" },
    ],
    itemLabel: (i) => i?.day || "New day",
    itemMeta: (i) => i?.reference || "",
    makeNew: () => ({ day: "", reference: "", theme: "" }),
    read: () => clone(READING_PLAN),
    bind: (v) => applyToList(READING_PLAN as any[], v),
  },
  {
    id: "memoryVerses",
    label: "Memory verses",
    group: "Teaching",
    icon: "clipboard",
    blurb: "The verses offered for memorising on the devotional page.",
    kind: "list",
    fields: [
      { path: "ref", label: "Reference", type: "text" },
      { path: "text", label: "Verse", type: "textarea", rows: 2 },
    ],
    itemLabel: (i) => i?.ref || "New verse",
    itemMeta: (i) => String(i?.text || "").slice(0, 50),
    makeNew: () => ({ ref: "", text: "" }),
    read: () => clone(MEMORY_VERSES),
    bind: (v) => applyToList(MEMORY_VERSES as any[], v),
  },

  /* ---------------------------------------------------------------- giving */
  {
    id: "givingMethods",
    label: "Ways to give",
    group: "Giving",
    icon: "gift",
    blurb: "The choices in step 3 of the giving wizard.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "id", label: "Key", type: "slug" },
      { path: "label", label: "Label", type: "text" },
      { path: "note", label: "Note", type: "textarea", rows: 2 },
    ],
    itemLabel: (i) => i?.label || "New method",
    itemMeta: (i) => i?.note || "",
    makeNew: () => ({ id: "", label: "", note: "" }),
    read: () => clone(GIVING_METHODS),
    bind: (v) => applyToList(GIVING_METHODS as any[], v, "id"),
  },
  {
    id: "givingFaqs",
    label: "Giving questions",
    group: "Giving",
    icon: "info",
    blurb: "The stewardship questions answered at the bottom of the giving page.",
    kind: "list",
    fields: [
      { path: "q", label: "Question", type: "text" },
      { path: "a", label: "Answer", type: "textarea", rows: 4 },
    ],
    itemLabel: (i) => i?.q || "New question",
    itemMeta: (i) => String(i?.a || "").slice(0, 50),
    makeNew: () => ({ q: "", a: "" }),
    read: () => clone(GIVING_FAQS),
    bind: (v) => applyToList(GIVING_FAQS as any[], v),
  },

  /* -------------------------------------------------- serving & visiting */
  {
    id: "servingTeams",
    label: "Serving rotas",
    group: "Services & activities",
    icon: "people",
    blurb: "The teams looking for volunteers, shown on the ministries page.",
    kind: "list",
    fields: [
      { path: "name", label: "Team", type: "text" },
      { path: "need", label: "Roles needed", type: "text" },
      { path: "slots", label: "Commitment", type: "text" },
    ],
    itemLabel: (i) => i?.name || "New team",
    itemMeta: (i) => i?.slots || "",
    makeNew: () => ({ name: "", need: "", slots: "" }),
    read: () => clone(SERVING_TEAMS),
    bind: (v) => applyToList(SERVING_TEAMS as any[], v),
  },
  {
    id: "servingFaqs",
    label: "Serving questions",
    group: "Services & activities",
    icon: "info",
    blurb: "Questions asked by people who want to volunteer.",
    kind: "list",
    fields: [
      { path: "q", label: "Question", type: "text" },
      { path: "a", label: "Answer", type: "textarea", rows: 4 },
    ],
    itemLabel: (i) => i?.q || "New question",
    itemMeta: (i) => String(i?.a || "").slice(0, 50),
    makeNew: () => ({ q: "", a: "" }),
    read: () => clone(SERVING_FAQS),
    bind: (v) => applyToList(SERVING_FAQS as any[], v),
  },
  {
    id: "visitExpect",
    label: "What to expect",
    group: "Services & activities",
    icon: "ticket",
    blurb: "The cards shown to first-time visitors: what happens when they arrive.",
    kind: "list",
    fields: [
      { path: "title", label: "Title", type: "text" },
      { path: "text", label: "Description", type: "textarea", rows: 3 },
    ],
    itemLabel: (i) => i?.title || "New card",
    makeNew: () => ({ title: "", text: "", icon: "heart" }),
    read: () => clone(VISIT_EXPECT),
    bind: (v) => applyToList(VISIT_EXPECT as any[], v),
  },
  {
    id: "visitFaqs",
    label: "First-timer questions",
    group: "Services & activities",
    icon: "info",
    blurb: "The extra questions shown under the first-visit wizard, after the main FAQs.",
    kind: "list",
    fields: [
      { path: "q", label: "Question", type: "text" },
      { path: "a", label: "Answer", type: "textarea", rows: 4 },
    ],
    itemLabel: (i) => i?.q || "New question",
    itemMeta: (i) => String(i?.a || "").slice(0, 50),
    makeNew: () => ({ q: "", a: "" }),
    read: () => clone(VISIT_FAQS),
    bind: (v) => applyToList(VISIT_FAQS as any[], v),
  },
  {
    id: "contactTopics",
    label: "Message topics",
    group: "Church",
    icon: "send",
    blurb: "Who a contact-form message can be addressed to, and which inbox it reaches.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "id", label: "Key", type: "slug" },
      { path: "label", label: "Topic", type: "text" },
      { path: "email", label: "Goes to", type: "text" },
    ],
    itemLabel: (i) => i?.label || "New topic",
    itemMeta: (i) => i?.email || "",
    makeNew: () => ({ id: "", label: "", email: "" }),
    read: () => clone(CONTACT_TOPICS),
    bind: (v) => applyToList(CONTACT_TOPICS as any[], v, "id"),
  },
  {
    id: "eventFilters",
    label: "Calendar filters",
    group: "Services & activities",
    icon: "filter",
    blurb: "The category chips above the events calendar. The keys must match the categories used by your events.",
    kind: "list",
    idKey: "id",
    fields: [
      { path: "id", label: "Category", type: "select", options: ["all", ...EVENT_CATEGORIES] },
      { path: "label", label: "Label", type: "text" },
    ],
    itemLabel: (i) => i?.label || "New filter",
    itemMeta: (i) => i?.id || "",
    makeNew: () => ({ id: "service", label: "" }),
    read: () => clone(EVENT_FILTERS),
    bind: (v) => applyToList(EVENT_FILTERS as any[], v, "id"),
  },
];

/* --------------------------------------------------------------- page text */

/* Hidden page-text sections (note 51): still ship and render; the drawer skips them. */
const HIDDEN_COPY_PAGES = new Set([
  "sermons",
  "sermon",
  "events",
  "giving",
  "prayer",
  "testimonies",
  "visit",
  "contact",
  "locations",
  "ministries",
  "devotional",
  "library",
  "site",
  "about",
  "live",
]);

const copySections: SectionDef[] = COPY_PAGES.map((page) => ({
  id: "copy-" + page.id,
  label: /text$/i.test(page.label) ? page.label : page.label + " text",
  group: "Page text",
  icon: "tag",
  blurb: "",
  kind: "list" as const,
  idKey: "id",
  fixed: true,
  hidden: HIDDEN_COPY_PAGES.has(page.id),
  fields: [
    {
      path: "label",
      label: "What this text is",
      type: "static" as const,
      hint: "A note for you about this line — visitors never see it.",
    },
    {
      path: "value",
      label: "Text",
      type: "textarea" as const,
      rows: 3,
    },
  ],
  itemLabel: (i: any) => i?.label || i?.id || "Text",
  itemMeta: (i: any) => String(i?.value || "").replace(/[*\[\]]/g, "").slice(0, 60),
  makeNew: () => ({ id: "", label: "", value: "" }),
  read: () => copyPageList(page.id),
  bind: (v) => bindCopyPage(page.id, v),
}));

export const SECTION_DEFS: SectionDef[] = [...CORE_SECTIONS, ...CONTENT_SECTIONS, ...copySections, ...photoSections];

/** True when the drawer, jobs and search all skip the section (note 51). */
export function sectionIsHidden(id: string): boolean {
  return !!sectionById(id)?.hidden;
}

/** True when the section is kept out of the technical full list (the *Update* tab) only. */
export function sectionIsEverythingHidden(id: string): boolean {
  const def = sectionById(id);
  return !!def && (!!def.hidden || !!def.everythingHidden);
}

/** Which photo section holds a given bundled photo, e.g. "hero" → "photos-main". */
export function photoSectionId(slotKey: string): string {
  const slot = PHOTO_SLOTS.find((s) => s.key === slotKey);
  return slot ? PHOTO_SECTION_IDS[slot.group] || "" : "";
}

/* ---------------------------------------------------------------- defaults */

export function buildDefaults(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const def of SECTION_DEFS) {
    try {
      out[def.id] = def.read();
    } catch (err) {
      console.warn("cms: could not read default for", def.id, err);
      out[def.id] = def.kind === "list" ? [] : {};
    }
  }
  return out;
}

/** Recompute anything the data modules derived once at import time. */
export function refreshDerived() {
  try {
    const speakers = Array.from(new Set(SERMONS.map((s) => s.speaker))).filter(Boolean).sort();
    SPEAKERS.length = 0;
    speakers.forEach((s) => SPEAKERS.push(s));
    const years = Array.from(new Set(SERMONS.map((s) => String(zonedParts(sermonDate(s)).year)))).sort((a, b) => Number(b) - Number(a));
    SERMON_YEARS.length = 0;
    years.forEach((y) => SERMON_YEARS.push(y));
    /* The contact page reads the `HQ` object; keep it on whichever branch the
       office has marked Global HQ. */
    syncHq();
  } catch (err) {
    console.warn("cms: derived refresh failed", err);
  }
}

export function sectionById(id: string): SectionDef | undefined {
  return SECTION_DEFS.find((s) => s.id === id);
}
