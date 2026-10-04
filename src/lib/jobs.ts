/* jobs.ts — everyday jobs pointing at their sections; every offered section belongs to one. */

import { SECTION_DEFS, photoSectionId, sectionIsHidden, type SectionDef } from "./cmsSchema";
import { COPY_PAGES, COPY_ROLE_LABELS, copyIsLocked, copyRoleOf } from "../data/copy";
import { PHOTO_SLOTS } from "../data/photos";

export type Job = {
  id: string;
  icon: string;
  title: string;
  /** One line, in the office's words, saying what this job covers. */
  blurb: string;
  /** Section ids this job opens (see src/lib/cmsSchema.ts). */
  sections: string[];
};

/* Eleven jobs in office order (notes 52, 57, 58, 62 shaped this list). */
export const JOBS: Job[] = [
  {
    id: "words",
    icon: "pencil",
    title: "The words on every page",
    blurb: "Headlines, paragraphs and the small notes — page by page, segment by segment.",
    sections: [
      "copy-home",
      "copy-about",
      "copy-sermons",
      "copy-sermon",
      "copy-live",
      "copy-events",
      "copy-giving",
      "copy-prayer",
      "copy-testimonies",
      "copy-visit",
      "copy-contact",
      "copy-locations",
      "copy-ministries",
      "copy-devotional",
      "copy-library",
      "copy-site",
    ],
  },
  {
    id: "photos",
    icon: "camera",
    title: "Photos & banners",
    blurb: "The pictures across the whole site — upload your own, or paste the address of one.",
    sections: ["photos-main", "photos-ministries", "photos-leadership"],
  },
  {
    id: "services",
    icon: "clock",
    title: "Service times & branches",
    blurb: "Your weekly rhythm and every branch, with its address and local times.",
    sections: ["services", "branches"],
  },
  {
    id: "teaching",
    icon: "play",
    title: "Sermons & the live stream",
    blurb: "The message archive and going on air.",
    sections: ["sermons", "live"],
  },
  {
    id: "events",
    icon: "calendar",
    title: "Events & notices",
    blurb: "Conferences, classes and outreaches — the notice strip under the header, and the slide space on the home page.",
    sections: ["events", "eventFilters", "announcements", "slides"],
  },
  {
    id: "giving",
    icon: "gift",
    title: "Giving",
    blurb: "The funds, where the money goes, and your bank details by region.",
    sections: ["givingFunds", "givingBreakdown", "bankAccounts", "givingMethods", "givingFaqs"],
  },
  {
    id: "church",
    icon: "cross",
    title: "Church details & contact",
    blurb: "Phone, email, address, office hours, social links, the desks and the FAQs.",
    sections: ["site", "leadership", "departments", "contactTopics", "faqs"],
  },
  {
    id: "serving",
    icon: "people",
    title: "Ministries & serving",
    blurb: "The ministries, the teams looking for volunteers, and first-timer questions.",
    sections: ["ministries", "servingTeams", "servingFaqs", "visitExpect", "visitFaqs"],
  },
  {
    id: "about",
    icon: "book",
    title: "About, beliefs & numbers",
    blurb: "Your values, statement of faith, story timeline and headline numbers.",
    sections: ["values", "beliefs", "timeline", "stats"],
  },
  {
    id: "prayer",
    icon: "fire",
    title: "Prayer & testimonies",
    blurb: "The prayer focus list, the categories, and the testimony wall.",
    sections: ["prayerFocus", "prayerCategories", "testimonyCategories", "testimonies"],
  },
  {
    id: "devotional",
    icon: "bookmark",
    title: "Devotional & verses",
    blurb: "The verse pool, the reading plan and the verses offered for memorising.",
    sections: ["scriptures", "readingPlan", "memoryVerses"],
  },
];

/** The route a page-text group belongs to, so a search hit can take the office
    there. `null` means "this page already shows it" (site-wide text). */
const COPY_PAGE_ROUTES: Record<string, string | null> = {
  home: "/",
  about: "/about",
  sermons: "/sermons",
  sermon: "/sermons",
  live: "/watch-live",
  events: "/events",
  giving: "/giving",
  prayer: "/prayer",
  testimonies: "/testimonies",
  visit: "/visit",
  contact: "/contact",
  locations: "/locations",
  ministries: "/ministries",
  devotional: "/devotional",
  library: "/library",
  site: null,
};

export type Hit = {
  kind: "copy" | "record" | "photo" | "section";
  key: string;
  title: string;
  detail: string;
  sectionId: string;
  /** For records: the id of the list item, so the drawer can open it. */
  entryKey?: string;
  /** Navigate here first (page text lives on its own page). */
  route?: string;
};

export const HIT_GROUPS: { kind: Hit["kind"]; label: string }[] = [
  { kind: "copy", label: "Words on the site" },
  { kind: "record", label: "Items you have added" },
  { kind: "photo", label: "Photos" },
  { kind: "section", label: "Parts of the site" },
];

function snippet(value: string, q: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return text.slice(0, 72);
  const from = Math.max(0, at - 26);
  const cut = text.slice(from, from + 84);
  return (from > 0 ? "…" : "") + cut + (from + 84 < text.length ? "…" : "");
}

/** Find anything changeable, by the office's own words (searches the live draft). */
export function searchEverything(query: string, draft: Record<string, any>): Hit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = { copy: 0, record: 0, photo: 0, section: 0 };
  const CAPS: Record<string, number> = { copy: 14, record: 12, photo: 6, section: 8 };
  const push = (hit: Hit) => {
    if (seen.has(hit.key) || counts[hit.kind] >= CAPS[hit.kind]) return;
    seen.add(hit.key);
    counts[hit.kind]++;
    hits.push(hit);
  };

  /* 1. The words visitors read (current draft value, not just the shipped one). */
  for (const page of COPY_PAGES) {
    const sectionId = "copy-" + page.id;
    /* A section the church asked to be left out of the editor is not listed
       anywhere, so a hit for one of its lines would lead nowhere either. */
    if (sectionIsHidden(sectionId)) continue;
    const list = draft[sectionId];
    const current = new Map<string, string>();
    if (Array.isArray(list)) {
      for (const entry of list) if (entry && entry.id) current.set(String(entry.id), String(entry.value ?? ""));
    }
    for (const entry of page.entries) {
      /* A locked line is never listed in the drawer, so a hit for it would lead
         nowhere — it stays out of the search too. */
      if (copyIsLocked(entry.id)) continue;
      const value = current.has(entry.id) ? (current.get(entry.id) as string) : entry.value;
      if (!entry.label.toLowerCase().includes(q) && !value.toLowerCase().includes(q)) continue;
      const role = copyRoleOf(entry.id);
      push({
        kind: "copy",
        key: "copy:" + entry.id,
        title: snippet(value, q) || entry.label,
        detail: entry.label + " · " + page.label + (role ? " · fixed " + COPY_ROLE_LABELS[role].toLowerCase() : ""),
        sectionId,
        entryKey: entry.id,
        route: COPY_PAGE_ROUTES[page.id] || undefined,
      });
    }
  }

  /* 2. The items the office has added — sermons, branches, events, people … */
  for (const def of SECTION_DEFS) {
    if (def.kind !== "list" || def.fixed) continue;
    const list = Array.isArray(draft[def.id]) ? draft[def.id] : [];
    list.forEach((item: any, index: number) => {
      if (counts.record >= CAPS.record) return;
      const label = def.itemLabel ? String(def.itemLabel(item) || "") : "";
      const meta = def.itemMeta ? String(def.itemMeta(item, list) || "") : "";
      const hay = (label + " " + meta + " " + safeStringify(item)).toLowerCase();
      if (!hay.includes(q)) return;
      push({
        kind: "record",
        key: "rec:" + def.id + ":" + index,
        title: label || meta.slice(0, 60) || "Untitled",
        detail: def.label,
        sectionId: def.id,
        entryKey: String(item?.id || index),
      });
    });
  }

  /* 3. Photos, by the name the office knows them by. */
  for (const slot of PHOTO_SLOTS) {
    if (counts.photo >= CAPS.photo) break;
    if (!(slot.label + " " + slot.where + " " + slot.group).toLowerCase().includes(q)) continue;
    push({
      kind: "photo",
      key: "photo:" + slot.key,
      title: slot.label,
      detail: slot.where,
      sectionId: photoSectionId(slot.key),
      entryKey: slot.key,
    });
  }

  /* 4. The parts of the site themselves. */
  for (const def of SECTION_DEFS as SectionDef[]) {
    if (counts.section >= CAPS.section) break;
    if (sectionIsHidden(def.id)) continue;
    if (!(def.label + " " + def.group + " " + def.blurb).toLowerCase().includes(q)) continue;
    push({
      kind: "section",
      key: "sec:" + def.id,
      title: def.label,
      detail: def.group + " — " + def.blurb,
      sectionId: def.id,
    });
  }

  return hits;
}

function safeStringify(item: any): string {
  try {
    return JSON.stringify(item ?? {});
  } catch {
    return "";
  }
}

/** Coverage guard: every offered section in exactly one job (notes 51, 52, 58). */
export function sectionsWithoutJob(): string[] {
  const counts = new Map<string, number>();
  for (const job of JOBS) for (const id of job.sections) counts.set(id, (counts.get(id) || 0) + 1);
  return SECTION_DEFS.map((def) => def.id).filter((id) => {
    if (sectionIsHidden(id)) return false;
    return counts.get(id) !== 1;
  });
}

/** The sections that sit in more than one job (a mistake — see above). */
export function sectionsInSeveralJobs(): string[] {
  const counts = new Map<string, number>();
  for (const job of JOBS) for (const id of job.sections) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}
