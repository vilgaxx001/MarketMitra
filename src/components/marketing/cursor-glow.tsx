/**
 * src/components/marketing/cursor-glow.tsx
 *
 * A soft radial glow that follows the pointer. Desktop-only (touch
 * devices have no persistent cursor, so this is a no-op there) and
 * skipped under prefers-reduced-motion. Position is written directly to
 * the DOM via a ref rather than React state, so tracking the pointer
 * doesn't trigger a re-render on every single `pointermove` — the
 * listener is also registered `{ passive: true }` since it never calls
 * preventDefault.
 */
"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) return;

    const node = glowRef.current;
    if (!node) return;

    function onMove(e: PointerEvent) {
      node!.style.transform = `translate3d(${e.clientX - 200}px, ${e.clientY - 200}px, 0)`;
      node!.style.opacity = "1";
    }
    function onLeave() {
      node!.style.opacity = "0";
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-0 hidden size-[400px] rounded-full opacity-0 mix-blend-screen transition-opacity duration-moderate md:block"
      style={{
        background:
          "radial-gradient(circle, hsl(var(--secondary) / 0.15) 0%, hsl(var(--primary) / 0.08) 40%, transparent 70%)",
        willChange: "transform",
      }}
    />
  );
}
