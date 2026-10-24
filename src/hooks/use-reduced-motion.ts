/**
 * src/hooks/use-reduced-motion.ts
 *
 * CSS's `prefers-reduced-motion` media query (handled globally in
 * globals.css) stops CSS transitions/animations automatically, but it has
 * no effect on imperative JavaScript animation — requestAnimationFrame
 * loops, Three.js render loops, GSAP timelines, canvas particle systems.
 * Anything in that category MUST check this hook and either skip
 * animating or substantially reduce motion when it returns true.
 *
 * USAGE:
 *   const reducedMotion = useReducedMotion();
 *   useEffect(() => {
 *     if (reducedMotion) return; // render a static frame instead
 *     const raf = requestAnimationFrame(loop);
 *     return () => cancelAnimationFrame(raf);
 *   }, [reducedMotion]);
 */
"use client";

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}
