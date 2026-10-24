/**
 * src/components/marketing/ai-core-visual.tsx
 *
 * Everything section 6 and 8 of the integration brief ask for, in one
 * place: dynamic-imports the ~600KB Three.js scene (never in the initial
 * bundle), skips WebGL entirely under prefers-reduced-motion, pauses
 * rendering when off-screen or the tab is hidden, and picks a
 * performance tier from a cheap device heuristic rather than always
 * assuming a capable GPU.
 *
 * This is the ONLY place `_3d/ai-core.tsx` is imported from.
 */
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { AICoreFallback } from "@/components/marketing/ai-core-fallback";
import type { SceneConfig } from "@/lib/three/scene-provider";

// Mandatory ssr:false — three.js touches `window` at module scope and has
// no SSR support (see scene-provider.tsx's documented dynamic-import pattern).
const AICoreScene = dynamic(
  () => import("@/app/(marketing)/_3d/ai-core").then((m) => ({ default: m.AICoreScene })),
  { ssr: false, loading: () => <AICoreFallback /> }
);

function detectPerformanceTier(): SceneConfig["performanceTier"] {
  if (typeof navigator === "undefined") return "eco";
  const coarsePointer = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const lowCoreCount = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
  // navigator.deviceMemory is Chromium-only; treated as an extra signal, never a hard requirement.
  const lowMemory = "deviceMemory" in navigator && (navigator as { deviceMemory?: number }).deviceMemory !== undefined
    ? (navigator as { deviceMemory?: number }).deviceMemory! <= 4
    : false;
  return coarsePointer || lowCoreCount || lowMemory ? "eco" : "full";
}

function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function AICoreVisual({ className = "" }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const [webglOk, setWebglOk] = useState(true);
  const [tier, setTier] = useState<SceneConfig["performanceTier"]>("eco");
  const [inView, setInView] = useState(false);
  const [tabActive, setTabActive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWebglOk(supportsWebGL());
    setTier(detectPerformanceTier());
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabActive(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const showStaticFallback = prefersReducedMotion || !webglOk;

  return (
    <div ref={containerRef} className={`relative aspect-square w-full max-w-[420px] ${className}`}>
      {showStaticFallback ? (
        <AICoreFallback />
      ) : (
        <AICoreScene
          performanceTier={tier}
          interactive={tier === "full"}
          targetFPS={tier === "full" ? 60 : 30}
          active={inView && tabActive}
        />
      )}
    </div>
  );
}
