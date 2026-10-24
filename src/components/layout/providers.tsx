/**
 * src/components/layout/providers.tsx
 *
 * All global, root-level providers mounted exactly once in
 * src/app/layout.tsx. Every provider here must be a Client Component —
 * this file is the boundary between the RSC root layout and the client
 * provider tree.
 *
 * ORDER MATTERS:
 *   1. ThemeProvider — outermost, so all other providers and components
 *      can read the theme (e.g. TooltipProvider uses theme-aware colors).
 *   2. TooltipProvider — must wrap the entire app so Tooltip components
 *      anywhere in the tree can register with a single delay config
 *      rather than each declaring their own.
 *   3. CommandPaletteProvider — registers the global Ctrl+K listener and
 *      makes the palette available to every component via useCommandPalette().
 *   4. Toaster — last, so toast notifications always render on top of
 *      everything else (z-toast is the highest z-index tier).
 */
"use client";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPaletteProvider } from "@/components/command-palette/command-palette";
import { Toaster } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={400} skipDelayDuration={100}>
        <CommandPaletteProvider>
          {children}
          <Toaster />
        </CommandPaletteProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
