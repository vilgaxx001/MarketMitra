# MarketMitra — Design System

Source of truth: `src/styles/tokens.css` (raw tokens) and `tailwind.config.ts`
(Tailwind utility mapping). This document explains the *why* behind the
values; the files themselves are the canonical *what*.

## 1. Design direction

The product has two visual registers, deliberately different:

- **Marketing site** (`(marketing)` route group): expressive, dark-by-default,
  the 3D AI Core hero, gradient brand moments. This is the "Apple keynote"
  register — built to make a strong first impression once.
- **Authenticated app** (`(app)`, `admin`): quiet, high-precision, fast. This
  is the "Linear / Stripe Dashboard / Vercel Dashboard" register — a tool
  used dozens of times a day, where personality would become friction.
  Both registers share one hue family (blue → cyan → emerald) so moving
  from logged-out to logged-in never feels like a different product.

## 2. Color system

All color tokens are HSL triplets (`"221 83% 53%"`, not `hsl(...)` or hex),
because Tailwind's alpha-modifier syntax (`bg-primary/50`) requires raw
components. Reference a color via Tailwind utility (`bg-primary`,
`text-muted-foreground`), never via a raw hex value in component code.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `primary` | Electric blue `#2563EB` | Lightened blue (AA-adjusted) | Primary actions, links, focus ring |
| `secondary` | Cyan `#06B6D4` | Lightened cyan | Secondary accents, charts |
| `accent` | Emerald `#10B981` | Lightened emerald | Success/positive accents, growth metrics |
| `destructive` | Red | Lightened red | Delete, errors, irreversible actions |
| `warning` | Amber | Lightened amber | Caution states, plan-limit warnings |
| `success` / `info` | — | — | Semantic status, distinct from brand accent so "this succeeded" never depends on remembering accent = green |
| `muted` | Near-white gray | Near-black gray | Secondary text, disabled states, subtle backgrounds |
| `border` / `input` | Light gray | Low-contrast dark gray | Dividers, input borders — always subtle, never a strong line |

Dark mode is **not** an inversion of light mode — every value is re-tuned so
text/background pairs hit WCAG AA contrast independently in each theme.

## 3. Typography

One scale, 1.25 ratio ("major third"), from `text-xs` (12px) to `text-6xl`
(60px). One font family handles both display and body roles
(`--font-sans` / `--font-display` both resolve to Inter, loaded via
`next/font` in `src/app/layout.tsx`) — a deliberate choice: at MarketMitra's
information density (dashboards, tables, forms), a second display typeface
adds visual interest only the marketing site has room to spend. Headings
get tighter tracking (`--tracking-tight`) and a heavier weight (650) via the
`@layer base` rule in `globals.css`, which is what differentiates them from
body text without a different typeface.

## 4. Spacing & layout

Tailwind's default 4px spacing scale is used as-is. Named layout dimensions
(`--layout-sidebar-width`, `--layout-topbar-height`, etc.) exist so every
layout shell (Module 2's `src/components/layout/*`) references the same
constants — changing the sidebar width is a one-line token edit, not a
find-and-replace across a dozen files.

### Breakpoints

| Token | Width | Target |
|---|---|---|
| `xs` | 360px | Small Android phones, portrait |
| `sm` | 640px | Large phones, foldables unfolded |
| `md` | 768px | Tablets, portrait |
| `lg` | 1024px | Tablets landscape, small laptop |
| `xl` | 1280px | Laptop / desktop |
| `2xl` | 1536px | Large desktop |
| `3xl` | 1920px | Ultra-wide monitors |

Every layout in this module is built mobile-first (base styles target the
smallest viewport; `md:`/`lg:` etc. layer on enhancements) and tested in
both portrait and landscape — landscape phone/tablet is the case most
designs silently break in, so layouts use `min-h-dvh` (dynamic viewport
height) rather than `min-h-screen` to handle mobile browser chrome
correctly, and avoid fixed `vh`-based heights for primary content panes.

## 5. Elevation & shadows

Six elevation levels (`elevation-0` through `elevation-5`/`shadow-xl`),
mapped in `tokens.css`. Shadows are color-tinted toward slate, not pure
black, and layered (two shadows per level: a tight contact shadow + a soft
ambient one) — this is what separates "premium" elevation from a flat
`box-shadow: 0 2px 4px black`. Toasts sit at the highest elevation
(`shadow-xl`) because they must visually outrank an open modal.

## 6. Glassmorphism — used sparingly

A single `.glass` utility (`globals.css`) is the only sanctioned glass
treatment: `backdrop-filter: blur(16-20px) saturate(160%)` over a
semi-transparent surface color. Applied to: the command palette overlay,
the notification panel, and sticky navigation when scrolled over content.
**Not** used as a default card or panel treatment — overusing glass is one
of the fastest ways a UI starts to look like a template rather than a
considered product.

## 7. Motion

Five duration tokens (100ms instant → 480ms slow) and four named easings.
`--ease-expressive` (a pronounced overshoot curve) is reserved for
marketing-site moments (hover lift, magnetic buttons) — the authenticated
app exclusively uses `--ease-standard` and `--ease-decelerate`/`--ease-accelerate`
so the workspace always feels fast and precise rather than playful.
`prefers-reduced-motion: reduce` is honored globally via a CSS media query
in `globals.css`; JS-driven animation (future Three.js/GSAP modules) must
additionally check `useReducedMotion()` (`src/hooks/use-reduced-motion.ts`),
since the CSS media query alone doesn't stop imperative canvas/WebGL code.

## 8. Component library architecture

```
src/components/
├── ui/            Primitives — one component, one job, no business logic.
│                  Each wraps a Radix primitive (accessibility free,
│                  WAI-ARIA-compliant out of the box) styled with our tokens
│                  via class-variance-authority (cva) for variant props.
├── patterns/       Composed, app-aware components built FROM ui/ primitives:
│                  AsyncBoundary, DataTable, EmptyState, ConfirmDialog, etc.
│                  These encode the loading/error/empty/success contract.
├── command-palette/  Ctrl+K global command interface.
├── notifications/    Notification center (bell icon + panel).
└── layout/          Page shells: Sidebar, Topbar, AppShell, theme provider.
```

**Rule:** `ui/` components never import from `patterns/` or `layout/`
(no upward dependencies). `patterns/` may compose multiple `ui/`
components. Pages compose `layout/` + `patterns/` + `ui/`. This keeps the
primitive layer infinitely reusable and prevents circular imports.

### The four-state contract

Per the project's mandatory requirement, every feature that fetches or
mutates data must explicitly render four states: loading, error, empty,
success. Rather than every feature hand-rolling this, `src/components/
patterns/async-boundary.tsx` is the single shared implementation:

```tsx
<AsyncBoundary
  isLoading={isLoading}
  error={error}
  isEmpty={data?.length === 0}
  loadingFallback={<TableSkeleton rows={5} />}
  emptyFallback={<EmptyState title="No projects yet" ... />}
  errorFallback={(err) => <ErrorState error={err} onRetry={refetch} />}
>
  <ProjectsTable data={data} />
</AsyncBoundary>
```

This is what makes the four-state requirement structurally enforced rather
than a checklist someone has to remember per-feature.

## 9. Accessibility baseline

- Every interactive primitive is a Radix UI component underneath — Radix
  handles correct ARIA roles, keyboard interaction patterns (arrow-key nav
  in menus/selects, `Esc` to close, focus trapping in modals), and screen
  reader announcements, so individual components don't reimplement this.
- Focus is never suppressed. `globals.css` sets a visible 2px ring on
  `:focus-visible` globally; component-level focus rings (e.g. Button) use
  the same `ring` token, not a one-off color.
- Color is never the only signal — status badges, form errors, and toasts
  all pair color with an icon and/or text label.
- `forced-colors: active` (Windows High Contrast Mode) is explicitly
  handled for focus rings in `globals.css`.
- All icon-only buttons require an explicit `aria-label` prop — enforced at
  the TypeScript level in `src/components/ui/icon-button.tsx`.

## 10. Theming implementation

`next-themes` (already a dependency from Module 1) manages the `.dark`
class on `<html>`, system-preference detection via
`prefers-color-scheme`, and persistence via `localStorage` — see
`src/components/layout/theme-provider.tsx` and the toggle UI in
`src/components/ui/theme-toggle.tsx`. No custom theme logic is
hand-rolled; `next-themes` is a deliberately minimal, well-audited library
for exactly this problem, and reinventing it would be the kind of
unnecessary custom code requirement #7 ("build reusable components only,
avoid duplicated code") warns against.

## 11. Animation utilities reference

See `src/lib/motion.ts` for reusable Framer-Motion-free CSS-driven
animation variants (since the project doesn't depend on framer-motion;
motion is achieved via Tailwind's `animate-*` utilities mapped to the
keyframes in `tailwind.config.ts`, plus a small set of hand-rolled
hover/interaction utilities for the marketing-only "expressive" moments
like magnetic buttons and cursor glow). The 3D/particle architecture
(Three.js, R3F, GSAP) is scaffolded separately in `src/lib/three/` as
integration points only — see section 12.

## 12. 3D architecture (scaffolded, not built)

Per this module's scope, only the reusable architecture for future 3D
modules is prepared — no 3D scene is built yet. See:

- `src/lib/three/canvas-provider.tsx` — a lazy-loaded R3F `<Canvas>`
  wrapper with SSR disabled (Three.js requires `window`), suspense
  boundary, and reduced-motion fallback (renders a static gradient image
  instead of mounting WebGL when `prefers-reduced-motion` is set or the
  device reports low memory).
- `src/lib/three/use-particle-field.ts` — a typed hook interface for the
  particle-field generation logic the marketing hero's AI Core will use,
  unimplemented (throws `"Not yet implemented — see Module 2 scope note"`
  if called), so the *shape* of the API is locked in now and the
  marketing-site module (a future module) fills in the implementation
  without renegotiating the interface.

This intentionally mirrors the AI Provider Layer pattern from the overall
architecture: lock the interface now, implement behind it later.
