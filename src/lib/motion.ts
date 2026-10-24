/**
 * src/lib/motion.ts
 *
 * Reusable animation tokens/utilities consumed by components as
 * className fragments. The project does not depend on framer-motion —
 * Tailwind's `animate-*` utilities (mapped to keyframes in
 * tailwind.config.ts, durations/easings from src/styles/tokens.css)
 * cover every UI transition need (fade, scale, slide) with zero JS
 * animation library weight in the bundle.
 *
 * For the marketing site's "expressive" register (hover lift, magnetic
 * buttons, gradient glow, cursor interaction) — out of scope for THIS
 * module's authenticated-app components, but the utilities are defined
 * here so the future marketing-site module reuses them rather than
 * reinventing per-component hover logic.
 */

import { cn } from "@/lib/utils";

/** Standard entrance/exit pairs for Radix-based overlay components
 *  (Dialog, Popover, DropdownMenu, etc.) — pass to `className` on the
 *  Radix `*.Content` part. Radix automatically toggles `data-state`
 *  between "open"/"closed", which these utilities key off of. */
export const overlayTransition = cn(
  "data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out",
  "data-[state=open]:duration-base data-[state=closed]:duration-fast"
);

export const fadeTransition = cn(
  "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
);

/** Drawer/sheet sliding in from the right edge (notification panel,
 *  mobile sidebar, project detail drawer). */
export const drawerTransitionRight = cn(
  "data-[state=open]:animate-slide-in-from-right data-[state=closed]:animate-slide-out-to-right",
  "data-[state=open]:duration-moderate data-[state=closed]:duration-base"
);

/** Toast entrance — slides up + fades in from the bottom edge. */
export const toastTransition = cn("animate-slide-in-from-bottom");

/**
 * Marketing-only "expressive" hover-lift utility. Intentionally NOT used
 * by any authenticated-app component built in this module — see
 * docs/DESIGN_SYSTEM.md section 1 on the two visual registers.
 */
export const expressiveHoverLift = cn(
  "transition-transform duration-base ease-expressive",
  "hover:-translate-y-0.5 active:translate-y-0"
);

/** Standard interactive press feedback used across the component library
 *  (buttons, cards that act as triggers). Subtle — workspace register. */
export const pressFeedback = cn(
  "transition-transform duration-fast ease-standard active:scale-[0.98]"
);
