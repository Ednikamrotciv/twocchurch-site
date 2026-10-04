/* pageMap.ts — which page the office is looking at: panel title + section ids per page.
   `sections` is kept though the Edit card was removed (note 52). */

import { matchPath } from "./router";

export type PageInfo = {
  /** The route this describes (same patterns as App.tsx). */
  pattern: string;
  /** What the office calls the page. */
  label: string;
  /** Section ids, in the order they appear on the page. */
  sections: string[];
};

const PAGES: PageInfo[] = [
  {
    pattern: "/",
    label: "Home page",
    sections: [
      "copy-home", "copy-site",
      "photos-main",
      "sermons",
      "testimonyCategories",
      "events",
      "branches",
      "ministries",
      "scriptures",
      "givingFunds",
      "stats",
      "announcements",
    ],
  },
  {
    pattern: "/about",
    label: "About page",
    sections: ["copy-about", "copy-site", "photos-main", "values", "timeline", "beliefs", "leadership", "photos-leadership", "stats", "faqs"],
  },
  { pattern: "/locations", label: "Locations page", sections: ["copy-locations", "copy-site", "photos-main", "branches", "services"] },
  { pattern: "/sermons", label: "Watch sermons page", sections: ["copy-sermons", "copy-site", "photos-main", "sermons"] },
  { pattern: "/sermons/:id", label: "A sermon", sections: ["copy-sermon", "copy-site", "sermons"] },
  { pattern: "/watch-live", label: "Watch live page", sections: ["copy-live", "copy-site", "photos-main", "live", "services", "sermons", "announcements"] },
  { pattern: "/events", label: "Events page", sections: ["copy-events", "copy-site", "photos-main", "events", "eventFilters", "announcements"] },
  { pattern: "/testimonies", label: "Testimonies page", sections: ["copy-testimonies", "copy-site", "photos-main", "testimonyCategories"] },
  {
    pattern: "/giving",
    label: "Giving page",
    sections: ["copy-giving", "copy-site", "photos-main", "givingFunds", "givingBreakdown", "givingMethods", "bankAccounts", "givingFaqs"],
  },
  { pattern: "/prayer", label: "Prayer page", sections: ["copy-prayer", "copy-site", "photos-main", "prayerFocus", "prayerCategories", "scriptures"] },
  {
    pattern: "/contact",
    label: "Contact page",
    sections: ["copy-contact", "copy-site", "photos-main", "site", "services", "departments", "contactTopics", "branches", "faqs"],
  },
  { pattern: "/visit", label: "Plan a visit page", sections: ["copy-visit", "copy-site", "photos-main", "services", "branches", "visitExpect", "visitFaqs"] },
  { pattern: "/devotional", label: "Devotional page", sections: ["copy-devotional", "copy-site", "photos-main", "scriptures", "readingPlan", "memoryVerses"] },
  {
    pattern: "/ministries",
    label: "Ministries page",
    sections: ["copy-ministries", "copy-site", "photos-main", "photos-ministries", "ministries", "servingTeams", "servingFaqs"],
  },
  { pattern: "/library", label: "My library page", sections: ["copy-library", "copy-site"] },
];

const FALLBACK: PageInfo = { pattern: "", label: "Church website", sections: ["copy-site", "site", "photos-main"] };

export function pageInfoFor(path: string): PageInfo {
  for (const page of PAGES) {
    if (page.pattern === "/") continue;
    if (matchPath(page.pattern, path)) return page;
  }
  if (path === "/") return PAGES[0];
  return FALLBACK;
}

export const ALL_PAGES: PageInfo[] = PAGES;
