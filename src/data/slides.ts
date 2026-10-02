/* ============================================================================
   Announcement slides.

   The home page's welcome box is a *slide space*: a picture the office uploads
   is not printed as a plain photo — it is composed into a designed announcement
   slide, poster-fashion, with the office's own words on it, and the space flips
   between the slides the office has posted (arrows and dots, as on any
   carousel). **Each upload gets a design of its own** — see `slideDesignOf`
   and `slideDesigns`, which spread the slides across the design set and are
   keyed on the picture itself, so replacing a picture re-designs that slide and
   nothing else moves.

   A slide is artwork, not chrome: the designs are drawn in the fixed *poster*
   palette in `src/styles/pages.css` and deliberately do not follow the site's
   light and dark themes — a printed poster looks the same in a bright room and
   a dim one.

   The office edits this list under *Events & notices → Announcement slides*
   (see the `slides` section in src/lib/cmsSchema.ts). Nothing is on the site
   until they publish, as with every other section.
   ========================================================================== */

export type SlideDesign = "plate" | "band" | "arch" | "rays" | "seal" | "split" | "numeral" | "ribbon";

/** The design set, in the order the assigner works through it. */
export const SLIDE_DESIGNS: { id: SlideDesign; name: string; blurb: string }[] = [
  { id: "plate", name: "Parchment plate", blurb: "A printed plate on parchment, the words set beneath it." },
  { id: "band", name: "Crimson band", blurb: "The picture full-bleed, the words stacked down a crimson band." },
  { id: "arch", name: "Sanctuary arch", blurb: "The picture inside a gold arch, on a dark wall." },
  { id: "rays", name: "Ray card", blurb: "A warm picture, rays behind, and a crimson card of words." },
  { id: "seal", name: "Seal & mandala", blurb: "A mandala seal over the picture, the words at its centre." },
  { id: "split", name: "Two-part poster", blurb: "Picture above a gold rule, the words on the panel beneath." },
  { id: "numeral", name: "Numbered plate", blurb: "A numbered column of words beside a framed picture." },
  { id: "ribbon", name: "Ribbon", blurb: "A warm picture with a parchment ribbon across the foot." },
];

export const SLIDE_DESIGN_IDS: SlideDesign[] = SLIDE_DESIGNS.map((d) => d.id);

export function slideDesignName(id: string): string {
  return SLIDE_DESIGNS.find((d) => d.id === id)?.name || "Automatic";
}

export type AnnouncementSlide = {
  id: string;
  /** The picture: an upload, a pasted address, or one of the bundled photos. */
  image: string;
  /** The big words on the slide. */
  headline: string;
  /** The small words under them. */
  line: string;
  /** The button's own words — empty, or no link, means the slide carries no button. */
  cta: string;
  /** Where the button goes: a page of this site ("/visit") or a full web address. */
  link: string;
  /** A pinned design id, or "auto" for one of the slide's own. */
  design: string;
  /** Off keeps the slide (and its picture) without showing it. */
  active: boolean;
  /** Last day the slide may show, "YYYY-MM-DD" — empty means it never lapses. */
  expiresDate?: string;
  /** Last time on that day, "HH:MM" — empty means the end of the day. */
  expiresTime?: string;
};

export const SLIDES: AnnouncementSlide[] = [
  {
    id: "welcome-home",
    image: "src/assets/img/choir.jpg",
    headline: "Welcome home",
    line: "First Sunday or fiftieth — there is a seat here with your name on it.",
    cta: "Plan your visit",
    link: "/visit",
    design: "auto",
    active: true,
  },
  {
    id: "watch-live",
    image: "src/assets/img/worshipband.jpg",
    headline: "We are live every Sunday",
    line: "9:00 & 11:30 AM. The broadcast plays on this site whenever we are on air.",
    cta: "Go to the live stream",
    link: "/watch-live",
    design: "auto",
    active: true,
  },
];

/** The slides the site shows: the ones the office has switched on, that carry something. */
export function visibleSlides(slides: AnnouncementSlide[] = SLIDES): AnnouncementSlide[] {
  return slides.filter((s) => s && s.active !== false && !isSlideExpired(s) && (String(s.image || "").trim() || String(s.headline || "").trim()));
}

/**
 * When a slide's own time runs out — a local-time instant, or null when the
 * office set no last day. No time means the end of the last day.
 */
export function slideExpiryAt(slide: AnnouncementSlide): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(slide?.expiresDate || "").trim());
  if (!m) return null;
  const t = /^(\d{2}):(\d{2})/.exec(String(slide?.expiresTime || "").trim());
  const hh = t ? Number(t[1]) : 23;
  const mm = t ? Number(t[2]) : 59;
  if (hh > 23 || mm > 59) return null;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, 59).getTime();
  return Number.isFinite(at) ? at : null;
}

/** True once the slide's own last moment has passed. */
export function isSlideExpired(slide: AnnouncementSlide, now: number = Date.now()): boolean {
  const at = slideExpiryAt(slide);
  return at !== null && now > at;
}

/** The list with every lapsed slide taken out — what clearing them means. */
export function purgeExpiredSlides(slides: AnnouncementSlide[]): AnnouncementSlide[] {
  if (!Array.isArray(slides)) return slides;
  const now = Date.now();
  return slides.some((s) => isSlideExpired(s, now)) ? slides.filter((s) => !isSlideExpired(s, now)) : slides;
}

/**
 * FNV-1a. Small, fast, and — unlike `Math.random()` — the same on every device
 * and every load, so a slide never changes its design behind the office's back.
 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The design a slide gets on its own: read off the picture (and, as a tiebreak,
 * the slide's own id), skipping the ones already taken — which is what makes
 * *every upload a different design*. A pinned `design` never goes through here.
 */
export function slideDesignOf(slide: AnnouncementSlide, taken: string[] = []): SlideDesign {
  const pool = SLIDE_DESIGN_IDS;
  const start = hash(`${slide.image || ""}|${slide.id || ""}`) % pool.length;
  for (let step = 0; step < pool.length; step++) {
    const id = pool[(start + step) % pool.length];
    if (!taken.includes(id)) return id;
  }
  return pool[start];
}

/**
 * Every slide's design, as an array lined up with the list it was given. Slots
 * are handed out in a *stable* order (by id, not by where the office has
 * dragged them), so reordering the list never re-designs the slides — only
 * adding one, removing one or replacing a picture does, and then only where it
 * must. Pinned designs keep their own slot, so the automatic ones work around
 * them.
 */
export function slideDesigns(slides: AnnouncementSlide[]): SlideDesign[] {
  const order = slides.map((slide, index) => ({ slide, index }));
  order.sort((a, b) => String(a.slide.id || a.slide.image || a.index).localeCompare(String(b.slide.id || b.slide.image || b.index)));
  const pinned = new Set<string>();
  for (const { slide } of order) {
    const id = String(slide.design || "").trim();
    if (id && id !== "auto" && (SLIDE_DESIGN_IDS as string[]).includes(id)) pinned.add(id);
  }
  const taken: string[] = [...pinned];
  const out: SlideDesign[] = [];
  for (const { slide, index } of order) {
    const pinnedId = String(slide.design || "").trim();
    const design = pinnedId && pinnedId !== "auto" && (SLIDE_DESIGN_IDS as string[]).includes(pinnedId)
      ? (pinnedId as SlideDesign)
      : slideDesignOf(slide, taken);
    out[index] = design;
    taken.push(design);
  }
  return out;
}

/* The 3D arrangements the slide space can take (see src/components/slides3d.tsx),
   chosen by the office in the *Slide space display* section. */
export type SlideLayout =
  | "coverflow" | "ring" | "stack" | "wall" | "fan" | "tunnel" | "helix"
  | "wave" | "cascade" | "pyramid" | "vortex" | "orbit" | "arch" | "zigzag"
  | "tower" | "horizon" | "bloom" | "comet" | "tide" | "crown";

export const SLIDE_LAYOUT_IDS: SlideLayout[] = [
  "coverflow", "ring", "stack", "wall", "fan", "tunnel", "helix",
  "wave", "cascade", "pyramid", "vortex", "orbit", "arch", "zigzag",
  "tower", "horizon", "bloom", "comet", "tide", "crown",
];
