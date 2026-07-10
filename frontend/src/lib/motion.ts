import type { Transition, Variants } from "motion/react";

/**
 * Shared motion primitives for the app's "premium transitions" layer.
 * Timing/easing mirror the CSS `--ease-standard` token in index.css so
 * Motion-driven animations feel consistent with the existing CSS ones.
 */

export const EASE_STANDARD = [0.16, 1, 0.3, 1] as const;

export const standardTransition: Transition = {
  duration: 0.2,
  ease: EASE_STANDARD,
};

export const quickTransition: Transition = {
  duration: 0.15,
  ease: EASE_STANDARD,
};

/** Route/page-level enter+exit transition, used around `<Outlet />`. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: standardTransition },
  exit: { opacity: 0, y: -4, transition: quickTransition },
};

/** Fade+scale+lift transition for dropdown/menu/popover panels. */
export const panelVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: quickTransition },
  exit: { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12, ease: EASE_STANDARD } },
};

/** Fade+scale+lift for menus that open upward/anchored bottom-right (avatar menu). */
export const panelVariantsFromTop: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: quickTransition },
  exit: { opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.12, ease: EASE_STANDARD } },
};

/** Backdrop fade for full-screen overlays (modals). */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: "easeIn" } },
};

/** Modal panel fade+scale. */
export const modalPanelVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: standardTransition },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: quickTransition },
};

/** Toast enter/exit. */
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: standardTransition },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15, ease: EASE_STANDARD } },
};

/** Stagger container for lists/grids of cards or rows. */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

/** Individual stagger item — pair with `staggerContainer` on the parent. */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: standardTransition },
};

/** Simple opacity crossfade, used for tab-switch and loading-state transitions. */
export const crossfadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15, ease: EASE_STANDARD } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: EASE_STANDARD } },
};

/** Slightly longer crossfade for data refresh — ~250ms total feel. */
export const refreshCrossfadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: EASE_STANDARD } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: EASE_STANDARD } },
};
