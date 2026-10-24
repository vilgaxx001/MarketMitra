/**
 * src/components/command-palette/command-palette.tsx
 *
 * Global Ctrl+K command palette. Real functionality — not a visual
 * mockup. Every registered command executes its actual action (navigate,
 * open modal, switch theme, etc.).
 *
 * ARCHITECTURE:
 *   - CommandPaletteProvider (rendered once in root layout) owns the
 *     open/close state and the Ctrl+K / Cmd+K keyboard listener.
 *   - useCommandPalette() hook lets any component register commands or
 *     imperatively open the palette.
 *   - Commands are registered per-module in their own layout/page files
 *     via useRegisterCommands() — the palette never imports domain
 *     modules directly, keeping the dependency graph clean.
 */
"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FolderOpen,
  Zap,
  BarChart2,
  Users,
  Settings,
  CreditCard,
  HelpCircle,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Context & types
 * ---------------------------------------------------------------------- */

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  /** The action executed when the command is selected. */
  onSelect: () => void;
  /** Used by the fuzzy search — searched in addition to label. */
  keywords?: string[];
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  registerCommands: (commands: PaletteCommand[]) => () => void;
}

const CommandPaletteContext = React.createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

/**
 * Registers a set of commands for as long as the calling component is
 * mounted — commands are automatically deregistered on unmount. Use this
 * in page/layout components to register context-aware commands (e.g. the
 * Projects page registers "New project", "Search projects", etc.).
 */
export function useRegisterCommands(commands: PaletteCommand[]) {
  const { registerCommands } = useCommandPalette();

  React.useEffect(() => {
    const deregister = registerCommands(commands);
    return deregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCommands]);
}

/* -------------------------------------------------------------------------
 * Provider
 * ---------------------------------------------------------------------- */

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [extraCommands, setExtraCommands] = React.useState<PaletteCommand[]>([]);

  // Ctrl+K / Cmd+K global listener
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const registerCommands = React.useCallback((commands: PaletteCommand[]) => {
    setExtraCommands((prev) => [...prev, ...commands]);
    return () => {
      setExtraCommands((prev) => prev.filter((c) => !commands.some((nc) => nc.id === c.id)));
    };
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen, registerCommands }}>
      {children}
      <CommandPaletteModal
        open={open}
        onOpenChange={setOpen}
        extraCommands={extraCommands}
      />
    </CommandPaletteContext.Provider>
  );
}

/* -------------------------------------------------------------------------
 * Modal
 * ---------------------------------------------------------------------- */

function CommandPaletteModal({
  open,
  onOpenChange,
  extraCommands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extraCommands: PaletteCommand[];
}) {
  const router = useRouter();
  const { setTheme } = useTheme();

  const close = () => onOpenChange(false);

  // Built-in commands always present regardless of page context
  const builtInCommands: PaletteCommand[] = [
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      group: "Navigation",
      icon: <LayoutDashboard />,
      onSelect: () => { router.push("/dashboard"); close(); },
    },
    {
      id: "nav-projects",
      label: "Go to Projects",
      group: "Navigation",
      icon: <FolderOpen />,
      onSelect: () => { router.push("/projects"); close(); },
    },
    {
      id: "nav-generate",
      label: "Generate AI Content",
      group: "Navigation",
      icon: <Zap />,
      onSelect: () => { router.push("/generate"); close(); },
    },
    {
      id: "nav-analytics",
      label: "View Analytics",
      group: "Navigation",
      icon: <BarChart2 />,
      onSelect: () => { router.push("/analytics"); close(); },
    },
    {
      id: "nav-team",
      label: "Manage Team",
      group: "Navigation",
      icon: <Users />,
      onSelect: () => { router.push("/team"); close(); },
    },
    {
      id: "nav-billing",
      label: "Billing & Subscription",
      group: "Navigation",
      icon: <CreditCard />,
      onSelect: () => { router.push("/billing"); close(); },
    },
    {
      id: "nav-settings",
      label: "Settings",
      group: "Navigation",
      icon: <Settings />,
      onSelect: () => { router.push("/settings"); close(); },
    },
    {
      id: "theme-light",
      label: "Switch to Light Mode",
      group: "Appearance",
      icon: <Sun />,
      onSelect: () => { setTheme("light"); close(); },
    },
    {
      id: "theme-dark",
      label: "Switch to Dark Mode",
      group: "Appearance",
      icon: <Moon />,
      onSelect: () => { setTheme("dark"); close(); },
    },
    {
      id: "theme-system",
      label: "Use System Theme",
      group: "Appearance",
      icon: <Monitor />,
      onSelect: () => { setTheme("system"); close(); },
    },
    {
      id: "help",
      label: "Help & Support",
      group: "Help",
      icon: <HelpCircle />,
      onSelect: () => { router.push("/support"); close(); },
    },
    {
      id: "logout",
      label: "Log Out",
      group: "Account",
      icon: <LogOut />,
      keywords: ["sign out", "exit"],
      onSelect: () => { router.push("/api/v1/auth/logout"); close(); },
    },
  ];

  const allCommands = [...builtInCommands, ...extraCommands];

  // Group commands for display
  const groups = allCommands.reduce<Record<string, PaletteCommand[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group]!.push(cmd);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 shadow-xl max-w-xl"
        hideCloseButton
        aria-label="Command palette"
      >
        <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:size-4 [&_[cmdk-input]]:h-10 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-1">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              placeholder="Type a command or search…"
              className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
              No commands found.
            </Command.Empty>

            {Object.entries(groups).map(([group, commands]) => (
              <Command.Group key={group} heading={group}>
                {commands.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={[cmd.label, ...(cmd.keywords ?? [])].join(" ")}
                    onSelect={cmd.onSelect}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md text-sm",
                      "aria-selected:bg-muted aria-selected:text-foreground",
                      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    )}
                  >
                    {cmd.icon && (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
                        {cmd.icon}
                      </span>
                    )}
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && (
                      <div className="flex items-center gap-0.5">
                        {cmd.shortcut.map((key) => (
                          <kbd
                            key={key}
                            className="inline-flex h-5 select-none items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[10px]">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[10px]">ESC</kbd>
              Close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
