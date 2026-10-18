import type { Transition, Variants } from "framer-motion";

/* One motion language for the whole site (SPEC note 148): every animated
   surface shares this ease and these springs, so a modal, a toast, a reveal
   and an accordion all feel like the same place. Reduced motion stays
   centralised — the root MotionConfig quiets all of it at once. */

export const EASE = [0.22, 1, 0.36, 1] as const;

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.9,
};

export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 36,
  mass: 0.8,
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0 },
};

export const modalBackdrop: Variants = {
  hidden: { opacity: 0, backdropFilter: "blur(0px)" },
  shown: { opacity: 1, backdropFilter: "blur(6px)" },
};

export const modalPanel: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1 },
};

export const toastCard: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.95 },
  shown: { opacity: 1, y: 0, scale: 1 },
  gone: { opacity: 0, y: 10, scale: 0.93 },
};

export const fold: Variants = {
  hidden: { height: 0, opacity: 0 },
  shown: { height: "auto", opacity: 1 },
  gone: { height: 0, opacity: 0 },
};
