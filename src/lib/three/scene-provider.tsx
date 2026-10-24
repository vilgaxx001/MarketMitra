/**
 * src/lib/three/scene-provider.tsx
 *
 * THREE.JS / REACT THREE FIBER ARCHITECTURE SCAFFOLD
 * ==================================================
 * This file establishes the architectural patterns that all future 3D
 * modules will follow. The actual Three.js/R3F packages are listed in
 * package.json but are NOT imported here yet — they will be added in
 * the marketing site module (Module 7 variant: marketing page) so that
 * the ~600KB Three.js bundle is never shipped to the authenticated app
 * (dashboard, settings, billing) where it isn't needed.
 *
 * WHAT IS DEFINED HERE:
 *  1. The SceneConfig interface — the contract every 3D scene must fulfill.
 *  2. Dynamic import pattern for lazy-loading R3F Canvas.
 *  3. GSAP integration point (how GSAP timelines hook into R3F's render
 *     loop without causing double-renders).
 *  4. Reduced-motion bypass — all 3D scenes must call useReducedMotion()
 *     and render a static fallback image when it returns true.
 *
 * FUTURE 3D MODULES that will fill this scaffold:
 *  - AI Core sphere (marketing hero)           → src/app/(marketing)/_3d/ai-core.tsx
 *  - Neural network visualization (features)   → src/app/(marketing)/_3d/neural-net.tsx
 *  - AI Image Generation canvas                → src/modules/ai/providers/image-canvas.tsx
 *  - AI Voice visualizer                       → src/modules/ai/providers/voice-visualizer.tsx
 */

import type { ReactNode } from "react";

/* -------------------------------------------------------------------------
 * Scene contract
 * ---------------------------------------------------------------------- */

export interface SceneConfig {
  /** Target frame rate. All animations must respect this cap (no uncapped loops). */
  targetFPS: 30 | 60;
  /** Whether the scene is interactive (mouse move / scroll react). */
  interactive: boolean;
  /** Fallback <img> or <div> rendered when prefers-reduced-motion is true. */
  reducedMotionFallback: ReactNode;
  /** Whether to use the shadow map (expensive — disable for particle-only scenes). */
  shadows: boolean;
  /** Performance tier: "eco" skips postprocessing; "full" enables bloom/depth-of-field. */
  performanceTier: "eco" | "full";
}

export const defaultSceneConfig: SceneConfig = {
  targetFPS: 60,
  interactive: true,
  reducedMotionFallback: null,
  shadows: false,
  performanceTier: "eco",
};

/* -------------------------------------------------------------------------
 * Dynamic import pattern
 *
 * How every 3D scene component must be imported in pages/layouts:
 *
 *   const AICoreScene = dynamic(
 *     () => import("@/app/(marketing)/_3d/ai-core").then((m) => ({ default: m.AICoreScene })),
 *     {
 *       ssr: false,          // Three.js has no SSR support
 *       loading: () => <SceneSkeleton />,
 *     }
 *   );
 *
 * The `ssr: false` is mandatory — Three.js requires `window` and `WebGL`,
 * which don't exist in the Node.js render environment.
 * ---------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * GSAP integration contract
 *
 * When GSAP timelines need to run inside a React Three Fiber scene:
 *
 *   useFrame(() => {
 *     // R3F's render loop runs at targetFPS. GSAP's tick is independent,
 *     // but we can manually advance GSAP's global ticker here to keep
 *     // them synchronized and avoid double frame scheduling:
 *     //
 *     // gsap.ticker.tick()  ← uncomment when GSAP is installed
 *   });
 *
 * For GSAP animations that DON'T need to be inside the R3F canvas (e.g.
 * DOM element animations alongside a 3D scene), use the standard GSAP
 * timeline API outside of useFrame — they'll run on GSAP's own ticker.
 * ---------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * Particle engine contract
 *
 * The AI Core hero uses a particle system that must:
 *   1. Pre-allocate a fixed BufferGeometry (no dynamic resizing per frame).
 *   2. Write only to Float32Array position attributes per frame.
 *   3. Set geometry.attributes.position.needsUpdate = true each frame.
 *   4. Cap particle count at 500 on "eco" tier, 2000 on "full".
 *   5. Pause (stop writing, don't dispose) when the canvas is off-screen
 *      (IntersectionObserver with threshold 0).
 *
 * See src/app/(marketing)/_3d/ai-core.tsx (Module 7+) for implementation.
 * ---------------------------------------------------------------------- */

export const PARTICLE_COUNTS = {
  eco: 500,
  full: 2000,
} as const;

/* -------------------------------------------------------------------------
 * Spline integration
 *
 * Spline scenes are embedded via @splinetool/react-spline, also with
 * ssr: false. The embed URL comes from the Spline editor's "Publish"
 * workflow and is stored in an env var (not hardcoded) so it can be
 * updated via Spline's editor without a code deploy:
 *
 *   NEXT_PUBLIC_SPLINE_AI_CORE_URL=https://prod.spline.design/<scene-id>/scene.splinecode
 *
 * This var is intentionally NOT in .env.example yet — it will be added
 * in the marketing module alongside the actual Spline integration.
 * ---------------------------------------------------------------------- */

export const SPLINE_URLS = {
  aiCore: process.env.NEXT_PUBLIC_SPLINE_AI_CORE_URL ?? "",
} as const;
