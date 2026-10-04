/* Photos: every picture from bundled src/assets/img/, swappable from the console. Logo excluded (site.ts). */
import { siteFile } from "../lib/livefeed";

export type PhotoSlot = {
  /** The bundled file name, e.g. "hero" → src/assets/img/hero.jpg */
  key: string;
  /** Plain-language name shown in the console. */
  label: string;
  /** Where the photo shows up, in the office's words. */
  where: string;
  /** Which console section it belongs to. */
  group: string;
};

export const PHOTO_SLOTS: PhotoSlot[] = [
  {
    key: "hero",
    label: "Home banner",
    where: "The big photo behind the headline on the home page, and the top of the Watch live page.",
    group: "Main photos",
  },
  {
    key: "hero-faint",
    label: "Home page background",
    where: "Laid over the home banner as a faint texture, behind the home page headline only.",
    group: "Main photos",
  },
  {
    key: "welcome",
    label: "Welcome section photo",
    where: "Next to “What you can expect” on the home page, and the top of the Contact page.",
    group: "Main photos",
  },
  {
    key: "worshipband",
    label: "Worship band",
    where: "The top of the Watch sermons and Testimonies pages, and the Worship & media ministry.",
    group: "Main photos",
  },
  {
    key: "choir",
    label: "Choir",
    where: "The top of the Events page, the Women of Worth ministry, and a few branches.",
    group: "Main photos",
  },
  {
    key: "building",
    label: "Church building",
    where: "The top of the Plan a visit page and some branch cards.",
    group: "Main photos",
  },
  {
    key: "building2",
    label: "Church building (second view)",
    where: "The top of the About page and some branch cards.",
    group: "Main photos",
  },
  {
    key: "giving",
    label: "Giving / open hands",
    where: "The top of the Giving page and the Missions ministry.",
    group: "Main photos",
  },
  {
    key: "youth",
    label: "Young people",
    where: "The top of the Ministries page and the Overcomers Youth ministry.",
    group: "Ministries & programmes",
  },
  {
    key: "kids",
    label: "Children",
    where: "The Kingdom Kids ministry.",
    group: "Ministries & programmes",
  },
  {
    key: "prayer",
    label: "Prayer",
    where: "The top of the Prayer page and the Prayer & intercession ministry.",
    group: "Ministries & programmes",
  },
  {
    key: "bible",
    label: "Open Bible",
    where: "The top of the Daily devotional page and the Men of Valour ministry.",
    group: "Ministries & programmes",
  },
  {
    key: "outreach",
    label: "Outreach",
    where: "The Mercy & outreach ministry and some branch cards.",
    group: "Ministries & programmes",
  },
  {
    key: "pastor-1",
    label: "Leadership photo 1",
    where: "The first person on the About page leadership team. Change it here, or give that person their own photo in the Leadership section.",
    group: "Leadership photos",
  },
  {
    key: "pastor-2",
    label: "Leadership photo 2",
    where: "The second person on the leadership team.",
    group: "Leadership photos",
  },
  {
    key: "pastor-3",
    label: "Leadership photo 3",
    where: "The third person on the leadership team.",
    group: "Leadership photos",
  },
  {
    key: "pastor-4",
    label: "Leadership photo 4",
    where: "The fourth person on the leadership team.",
    group: "Leadership photos",
  },
];

export const PHOTO_GROUPS: string[] = PHOTO_SLOTS.reduce<string[]>((groups, slot) => {
  if (!groups.includes(slot.group)) groups.push(slot.group);
  return groups;
}, []);

export const PHOTO_KEYS = PHOTO_SLOTS.map((s) => s.key);

const PREFIX = "src/assets/img/";

export const bundledPhoto = (key: string) => PREFIX + key + ".jpg";

export const photoById = (key: string) => PHOTO_SLOTS.find((s) => s.key === key);

/** The key a stored value points at, e.g. "src/assets/img/hero.jpg" → "hero". */
export function photoKeyOf(value: string): string {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return "";
  return value.slice(PREFIX.length).replace(/\.[a-z0-9]+$/i, "");
}

/* The office's replacements, keyed by photo name. Empty means "the bundle". */
let overrides: Record<string, string> = {};

/** The photo to show for a bundled name, following any replacement. */
export function photoSrc(key: string): string {
  /* Stored values stay host-relative ("src/assets/…") so content moves between
     hosts; the page URL is resolved here, so nested routes still load. */
  return siteFile(overrides[key] || bundledPhoto(key));
}

/**
 * Resolve a value that may be a bundled photo path, an uploaded photo, or a
 * link the office pasted. Used by the console's previews.
 */
export function resolvePhoto(value: string): string {
  if (!value) return "";
  const key = photoKeyOf(value);
  return key ? photoSrc(key) : value;
}

/** A record's own photo, or a bundled one when empty — never a broken picture. */
export function photoOr(value: string | undefined, fallbackKey: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? resolvePhoto(raw) : photoSrc(fallbackKey);
}

export function readPhotos(): Record<string, string> {
  return { ...overrides };
}

/* ------------------------------------------------------------- collections */

/** Lists carrying their own photos, for pushing shared-photo changes into. */
const collections: any[][] = [];

export function registerPhotoCollection(list: any[] | undefined) {
  if (Array.isArray(list) && !collections.includes(list)) collections.push(list);
}

const PHOTO_FIELDS = ["image", "photo", "cover", "poster", "picture"];

export function applyPhotos(next: any) {
  const map: Record<string, string> = {};
  for (const key of PHOTO_KEYS) {
    const value = next && typeof next[key] === "string" ? next[key].trim() : "";
    if (value) map[key] = value;
  }
  overrides = map;

  for (const list of collections) {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      for (const field of PHOTO_FIELDS) {
        const value = item[field];
        const key = typeof value === "string" ? photoKeyOf(value) : "";
        if (key) item[field] = photoSrc(key);
      }
    }
  }
}

/** Wipe every replacement — used by “restore the original content”. */
export function clearPhotos() {
  overrides = {};
}
