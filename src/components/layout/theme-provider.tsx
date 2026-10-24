/**
 * src/components/layout/theme-provider.tsx
 *
 * Wraps next-themes, which handles the actual mechanics required by the
 * brief's theming requirements:
 *   - Light/Dark/System: `enableSystem` watches prefers-color-scheme and
 *     follows it live when the user has selected "System".
 *   - Persistence: choice is written to localStorage (key: "theme") and
 *     re-applied on every load.
 *   - No flash of wrong theme: next-themes injects a tiny inline script
 *     into the document <head> (via the `suppressHydrationWarning`
 *     pattern in src/app/layout.tsx) that sets the `.dark` class before
 *     React hydrates, so there's never a light->dark flash on reload.
 *
 * The `.dark` class this toggles is what src/styles/tokens.css's `.dark`
 * block selects on — so this single provider is the entire mechanism
 * connecting "user clicked Dark Mode" to every token in the app updating.
 */
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="marketmitra-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };
