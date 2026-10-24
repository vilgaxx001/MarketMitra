/**
 * src/components/marketing/ai-core-fallback.tsx
 *
 * Pure CSS/SVG static rendering of the AI core — no canvas, no JS
 * animation loop. Used in three cases:
 *   1. `prefers-reduced-motion: reduce` — per the scene contract in
 *      src/lib/three/scene-provider.tsx, 3D scenes must render a static
 *      fallback rather than skip motion preferences.
 *   2. While the ~600KB Three.js chunk is still downloading (the
 *      `loading` fallback for the dynamic import).
 *   3. Devices without WebGL support.
 *
 * This still needs to look premium on its own — it's what a meaningful
 * share of mobile/low-power visitors will actually see.
 */
export function AICoreFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative aspect-square w-full max-w-[420px] ${className}`}
      role="img"
      aria-label="Abstract animated sphere representing MarketMitra's AI core"
    >
      <div
        className="absolute inset-[8%] rounded-full opacity-90 blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, hsl(var(--secondary) / 0.9), hsl(var(--primary) / 0.7) 45%, hsl(var(--accent) / 0.4) 75%, transparent 100%)",
        }}
      />
      <svg viewBox="0 0 200 200" className="relative size-full" aria-hidden="true">
        <defs>
          <radialGradient id="core-fill" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.95" />
            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.15" />
          </radialGradient>
          <linearGradient id="core-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--secondary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="78" fill="url(#core-fill)" />
        <circle cx="100" cy="100" r="92" fill="none" stroke="url(#core-ring)" strokeOpacity="0.35" strokeWidth="1" />
        <circle cx="100" cy="100" r="60" fill="none" stroke="url(#core-ring)" strokeOpacity="0.25" strokeWidth="1" />
      </svg>
    </div>
  );
}
