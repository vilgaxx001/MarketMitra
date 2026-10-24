/**
 * src/components/layout/theme-toggle.tsx
 *
 * The user-facing control for the theme system. Two variants:
 *  - ThemeToggle: simple icon button that cycles light -> dark -> system
 *  - ThemeToggleMenu: dropdown exposing all three options explicitly,
 *    used in Settings where users expect to see + pick from all states
 *    rather than cycle blindly.
 */
"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Cycles through light -> dark -> system on each click. Suited to a topbar icon button. */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Avoid hydration mismatch: theme is only known client-side after mount.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Sun />
      </Button>
    );
  }

  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={`Theme: ${theme}. Click to change.`}>
      <Icon />
    </Button>
  );
}

/** Explicit Light/Dark/System picker — used in Settings > Appearance. */
function ThemeToggleMenu() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" leadingIcon={mounted && theme === "dark" ? <Moon /> : <Sun />}>
          {mounted ? (theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light") : "Theme"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ThemeToggle, ThemeToggleMenu };
