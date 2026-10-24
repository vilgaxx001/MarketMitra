/**
 * src/components/layout/topbar.tsx
 *
 * Dashboard topbar — search trigger, Ctrl+K hint, notifications bell,
 * theme toggle, and profile menu. Sticky at the top of the content area
 * (not the sidebar) so it scrolls with the sidebar rather than
 * independently.
 */
"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserAvatar } from "@/components/ui/avatar";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCommandPalette } from "@/components/command-palette/command-palette";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface TopbarProps {
  workspaceSlug: string;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string | null;
  /** Breadcrumb segments displayed after the workspace name. */
  breadcrumbs?: { label: string; href?: string }[];
  /** Optional: pass in the notification bell element from the parent shell. */
  notificationBell?: React.ReactNode;
}

function Topbar({
  workspaceSlug,
  userName,
  userEmail,
  userAvatarUrl,
  breadcrumbs = [],
  notificationBell,
}: TopbarProps) {
  const { setOpen: openPalette } = useCommandPalette();

  return (
    <header
      className={cn(
        "flex h-topbar shrink-0 items-center justify-between gap-4",
        "border-b border-border bg-card/80 backdrop-blur-md",
        "sticky top-0 z-sticky px-4 sm:px-6"
      )}
    >
      {/* Left: breadcrumb */}
      <div className="flex min-w-0 items-center">
        {breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => (
                <BreadcrumbItem key={i}>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>

      {/* Right: search, theme, notifications, profile */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Search / command palette trigger */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openPalette(true)}
          className="hidden items-center gap-2 text-muted-foreground sm:flex"
          aria-label="Open command palette"
        >
          <Search className="size-3.5" />
          <span className="text-xs">Search</span>
          <kbd className="ml-1 inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-muted px-1 font-mono text-[10px]">
            ⌘K
          </kbd>
        </Button>

        {/* Mobile search icon only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openPalette(true)}
          className="sm:hidden"
          aria-label="Search"
        >
          <Search className="size-4" />
        </Button>

        <ThemeToggle />

        {notificationBell}

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="Account menu"
            >
              <UserAvatar name={userName} src={userAvatarUrl} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs font-normal text-muted-foreground">{userEmail}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/${workspaceSlug}/settings/profile`}>Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/${workspaceSlug}/settings`}>Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/${workspaceSlug}/billing`}>Billing</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild destructive>
              <Link href="/api/v1/auth/logout">
                Log out
                <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export { Topbar };
