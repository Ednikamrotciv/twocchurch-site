/* Branches in Nigeria, America, Canada (groups in list order). HQ: Lagos Oke-Odo.
   Sub-branches nest via parentId; none shipped (note 87). Editable in console. */

import { img } from "./site";
import { registerPhotoCollection } from "./photos";
import { churchTimezone, zoneOr, type ServiceSlot } from "../lib/store";

export type Branch = {
  id: string;
  name: string;
  city: string;
  country: string;
  flag: string;
  region: string;
  address: string;
  lat: number;
  lng: number;
  timezone: string;
  phone: string;
  email: string;
  pastor: string;
  pastorRole: string;
  established: string;
  capacity: number;
  languages: string[];
  image: string;
  /**
   * The head office: the branch whose address and map the contact page shows.
   * Exactly one branch should carry it — Lagos, Oke-Odo.
   */
  isHq?: boolean;
  /** A sub-branch, under `parentId` (none shipped — note 87). */
  isSub?: boolean;
  /** The branch a sub-branch belongs to (set by *Add a sub-branch*). */
  parentId?: string;
  schedule: ServiceSlot[];
};

/* The flag a branch flies is its country's own — Nigeria 🇳🇬, America 🇺🇸,
   Canada 🇨🇦 — worked out from the country name, so it can never be the wrong
   picture. A branch's stored `flag` is only the fallback for a country with
   no mapping (and the drawer still offers it). */
export function countryFlag(country: string): string {
  const c = String(country || "").trim().toLowerCase();
  if (c === "nigeria") return "🇳🇬";
  if (c === "america" || c === "united states" || c === "usa" || c === "u.s." || c === "us") return "🇺🇸";
  if (c === "canada") return "🇨🇦";
  return "";
}

export function branchFlag(branch: Pick<Branch, "country" | "flag">): string {
  return countryFlag(branch.country) || branch.flag || "";
}

export const BRANCHES: Branch[] = [
  {
    id: "lagos",
    name: "Overcomers' Cathedral, Lagos",
    city: "Lagos",
    country: "Nigeria",
    flag: "\u{1F1F3}\u{1F1EC}",
    region: "Africa",
    address: "Overcomers' Cathedral, Oke-Odo Road, Agbado Oke-Odo, Alimosho, Lagos State, Nigeria",
    lat: 6.6855,
    lng: 3.2640,
    timezone: "Africa/Lagos",
    phone: "+234 812 555 0170",
    email: "lagos@worldovercomers.org",
    pastor: "Pastor Joshua Adeyemi",
    pastorRole: "Branch Pastor",
    established: "2016",
    capacity: 2500,
    languages: ["English", "Yoruba", "Igbo", "Pidgin"],
    image: img("choir"),
    isHq: true,
    parentId: "",
    schedule: [
      { day: 0, time: "07:00", name: "First Service", minutes: 120 },
      { day: 0, time: "09:30", name: "Main Celebration", minutes: 150 },
      { day: 2, time: "18:00", name: "Word Clinic", minutes: 90 },
      { day: 4, time: "22:00", name: "Night Vigil (fortnightly)", minutes: 240 },
    ],
  },
  {
    id: "abuja",
    name: "Overcomers' Tabernacle, Abuja",
    city: "Abuja",
    country: "Nigeria",
    flag: "\u{1F1F3}\u{1F1EC}",
    region: "Africa",
    address: "Plot 142 Cadastral Zone, Jabi District, Abuja 900108, Nigeria",
    lat: 9.0765,
    lng: 7.3986,
    timezone: "Africa/Lagos",
    phone: "+234 803 555 0184",
    email: "abuja@worldovercomers.org",
    pastor: "Pastor Ruth Ekong",
    pastorRole: "Branch Pastor",
    established: "2019",
    capacity: 1200,
    languages: ["English", "Hausa", "Igbo", "Pidgin"],
    image: img("building2"),
    schedule: [
      { day: 0, time: "07:30", name: "First Service", minutes: 120 },
      { day: 0, time: "09:30", name: "Main Celebration", minutes: 120 },
      { day: 3, time: "18:00", name: "Midweek Bible Study", minutes: 90 },
      { day: 5, time: "18:30", name: "Prayer & Fasting", minutes: 90 },
    ],
  },
  {
    id: "edo",
    name: "Overcomers' Tabernacle, Edo",
    city: "Edo",
    country: "Nigeria",
    flag: "\u{1F1F3}\u{1F1EC}",
    region: "Africa",
    address: "24 Sapele Road, Benin City, Edo State 300102, Nigeria",
    lat: 6.335,
    lng: 5.6037,
    timezone: "Africa/Lagos",
    phone: "+234 805 555 0129",
    email: "edo@worldovercomers.org",
    pastor: "Pastor Samuel Ogunleye",
    pastorRole: "Branch Pastor",
    established: "2022",
    capacity: 900,
    languages: ["English", "Edo", "Igbo", "Pidgin"],
    image: img("outreach"),
    schedule: [
      { day: 0, time: "08:00", name: "Sunday Celebration", minutes: 120 },
      { day: 0, time: "10:30", name: "Second Service", minutes: 120 },
      { day: 2, time: "18:00", name: "Bible Study", minutes: 90 },
      { day: 5, time: "22:00", name: "Night Vigil (monthly)", minutes: 240 },
    ],
  },
  {
    id: "ogun",
    name: "Overcomers' Tabernacle, Ogun",
    city: "Ogun",
    country: "Nigeria",
    flag: "\u{1F1F3}\u{1F1EC}",
    region: "Africa",
    address: "7 Quarry Road, Abeokuta, Ogun State 110244, Nigeria",
    lat: 7.1475,
    lng: 3.3619,
    timezone: "Africa/Lagos",
    phone: "+234 807 555 0163",
    email: "ogun@worldovercomers.org",
    pastor: "Pastor Deborah Ijeoma",
    pastorRole: "Branch Pastor",
    established: "2024",
    capacity: 800,
    languages: ["English", "Yoruba", "Pidgin"],
    image: img("prayer"),
    schedule: [
      { day: 0, time: "07:00", name: "First Service", minutes: 120 },
      { day: 0, time: "09:30", name: "Main Service", minutes: 120 },
      { day: 3, time: "18:00", name: "Word Clinic", minutes: 90 },
      { day: 6, time: "07:00", name: "Saturday Prayer Meeting", minutes: 90 },
    ],
  },
  {
    id: "dallas",
    name: "Overcomers' Cathedral, Dallas",
    city: "Dallas, Texas",
    country: "America",
    flag: "\u{1F1FA}\u{1F1F8}",
    region: "North America",
    address: "7420 Overcomer Way, Dallas, TX 75217, United States",
    lat: 32.7767,
    lng: -96.797,
    timezone: "America/Chicago",
    phone: "+1 (214) 555-0147",
    email: "dallas@worldovercomers.org",
    pastor: "Pastor Emmanuel Adeyemi",
    pastorRole: "Founder & Senior Pastor",
    established: "1999",
    capacity: 3200,
    languages: ["English", "Spanish", "Yoruba"],
    image: img("building"),
    schedule: [
      { day: 0, time: "09:00", name: "Sunday Celebration", minutes: 120 },
      { day: 0, time: "11:30", name: "Sunday Celebration", minutes: 120 },
      { day: 0, time: "17:00", name: "Sunday Evening Word Study", minutes: 90 },
      { day: 3, time: "19:00", name: "Midweek Bible Study", minutes: 90 },
      { day: 5, time: "18:30", name: "Prayer & Fasting", minutes: 90 },
    ],
  },
  {
    id: "atlanta",
    name: "Overcomers' Fellowship, Atlanta",
    city: "Atlanta, Georgia",
    country: "America",
    flag: "\u{1F1FA}\u{1F1F8}",
    region: "North America",
    address: "1180 Peachtree View NE, Atlanta, GA 30309, United States",
    lat: 33.749,
    lng: -84.388,
    timezone: "America/New_York",
    phone: "+1 (404) 555-0193",
    email: "atlanta@worldovercomers.org",
    pastor: "Rev. Michael Thompson",
    pastorRole: "Branch Pastor & Executive Pastor",
    established: "2007",
    capacity: 1400,
    languages: ["English", "French"],
    image: img("building2"),
    schedule: [
      { day: 0, time: "10:00", name: "Sunday Celebration", minutes: 120 },
      { day: 0, time: "12:30", name: "Sunday Celebration", minutes: 120 },
      { day: 2, time: "19:00", name: "Midweek Word & Prayer", minutes: 90 },
      { day: 5, time: "19:00", name: "Friday Fire", minutes: 120 },
    ],
  },
  {
    id: "toronto",
    name: "Overcomers' Centre, Toronto",
    city: "Toronto, Ontario",
    country: "Canada",
    flag: "\u{1F1E8}\u{1F1E6}",
    region: "North America",
    address: "88 Wellesley Street East, Toronto, ON M4Y 1H1, Canada",
    lat: 43.6532,
    lng: -79.3832,
    timezone: "America/Toronto",
    phone: "+1 (416) 555-0128",
    email: "toronto@worldovercomers.org",
    pastor: "Pastor Daniel Kim",
    pastorRole: "Branch Pastor & Youth Pastor",
    established: "2024",
    capacity: 700,
    languages: ["English", "Korean", "Tagalog"],
    image: img("building2"),
    schedule: [
      { day: 0, time: "10:30", name: "Sunday Celebration", minutes: 120 },
      { day: 0, time: "14:00", name: "Youth & Young Adults", minutes: 90 },
      { day: 3, time: "19:00", name: "Midweek Prayer", minutes: 90 },
    ],
  },
];

/** The head-office branch (copy of the `isHq` one, kept by syncHq()). */
export const HQ: Branch = { ...(BRANCHES.find((b) => b.isHq) ?? BRANCHES[0]) };

/** The branch a visitor starts on, before they have saved one of their own. */
export const DEFAULT_BRANCH_ID = HQ.id || BRANCHES[0]?.id || "";

/** A branch's own zone for writing service times (notes 84/85). */
export function branchZone(branch?: Branch): string {
  return zoneOr(branch?.timezone, churchTimezone());
}

/** Re-point `HQ` at whichever branch is marked Global HQ (in place). */
export function syncHq() {
  const head = BRANCHES.find((b) => b.isHq) ?? BRANCHES[0];
  if (!head || head === HQ) return;
  for (const key of Object.keys(HQ)) if (!(key in head)) delete (HQ as any)[key];
  Object.assign(HQ, head);
}

/** The branch a gathering was added under, if it was given one. */
export function parentOf(branch: Branch | undefined): Branch | undefined {
  const id = branch?.parentId;
  return id ? BRANCHES.find((b) => b.id === id) : undefined;
}

/** A branch's sub-branches, for its *Sub-branches* button (note 86). */
export function subBranchesOf(branch: Branch | undefined): Branch[] {
  const id = branch?.id;
  if (!id) return [];
  return BRANCHES.filter((b) => !!b.isSub && b.parentId === id);
}

/** The countries, in the order their first branch appears above. */
export const COUNTRIES: string[] = BRANCHES.reduce<string[]>(
  (out, b) => (out.includes(b.country) ? out : [...out, b.country]),
  []
);

/** Refill COUNTRIES from BRANCHES in place, so new countries reach the page. */
export function syncCountries() {
  const next = BRANCHES.reduce<string[]>((out, b) => (out.includes(b.country) ? out : [...out, b.country]), []);
  COUNTRIES.length = 0;
  for (const name of next) COUNTRIES.push(name);
}

export type CountryGroup<T> = { country: string; flag: string; region: string; rows: T[] };

/** Group rows by country, keeping BRANCHES order. */
export function groupByCountry<T extends { branch: Branch }>(rows: T[]): CountryGroup<T>[] {
  const order = new Map<string, number>();
  BRANCHES.forEach((b, i) => {
    if (!order.has(b.country)) order.set(b.country, i);
  });
  const groups = new Map<string, CountryGroup<T>>();
  for (const row of rows) {
    const key = row.branch.country;
    let group = groups.get(key);
    if (!group) {
      group = { country: key, flag: branchFlag(row.branch), region: row.branch.region, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => (order.get(a.country) ?? 1e6) - (order.get(b.country) ?? 1e6));
}

registerPhotoCollection(BRANCHES as any[]);
