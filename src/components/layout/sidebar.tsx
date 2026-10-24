/**
 * src/components/layout/sidebar.tsx
 *
 * The workspace sidebar used in the authenticated app shell. Fully
 * functional: collapse/expand (persisted in localStorage), mobile
 * overlay mode, active link detection, RBAC-aware link visibility.
 *
 * Receives `userRole` and `workspaceSlug` as props from the Server
 * Component shell (src/app/(app)/[workspaceSlug]/layout.tsx in Module
 * 3+) so this Client Component doesn't need to make its own auth calls.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Zap,
  BarChart2,
  Calendar,
  Users,
  Settings,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

/* -------------------------------------------------------------------------
 * Nav item types
 * ---------------------------------------------------------------------- */

interface NavItem {
  label: string;
  href: (slug: string) => string;
  icon: LucideIcon;
  badge?: string;
  /** Roles allowed to see this item. Omit to show to all roles. */
  allowedRoles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: (s) => `/${s}/dashboard`, icon: LayoutDashboard },
  { label: "AI Generate", href: (s) => `/${s}/generate`, icon: Zap },
  { label: "Projects", href: (s) => `/${s}/projects`, icon: FolderOpen },
  { label: "Analytics", href: (s) => `/${s}/analytics`, icon: BarChart2 },
  { label: "Calendar", href: (s) => `/${s}/calendar`, icon: Calendar },
  { label: "Team", href: (s) => `/${s}/team`, icon: Users, allowedRoles: ["ADMIN"] },
  { label: "Billing", href: (s) => `/${s}/billing`, icon: CreditCard, allowedRoles: ["ADMIN"] },
  { label: "Settings", href: (s) => `/${s}/settings`, icon: Settings },
];

/* -------------------------------------------------------------------------
 * Props
 * ---------------------------------------------------------------------- */

interface SidebarProps {
  workspaceSlug: string;
  workspaceName: string;
  workspaceLogoUrl?: string | null;
  userName: string;
  userAvatarUrl?: string | null;
  userRole: string;
}

/* -------------------------------------------------------------------------
 * Sidebar
 * ---------------------------------------------------------------------- */

function Sidebar({
  workspaceSlug,
  workspaceName,
  workspaceLogoUrl,
  userName,
  userAvatarUrl,
  userRole,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useLocalStorage("mm:sidebar:collapsed", false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(userRole)
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const SidebarContent = (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-base ease-standard",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar"
      )}
    >
      {/* Workspace header */}
      <div className={cn("flex h-topbar shrink-0 items-center gap-3 border-b border-border px-4")}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary text-xs font-bold text-primary-foreground">
          {workspaceLogoUrl ? (
            // Workspace logos are arbitrary user-uploaded URLs (any storage origin),
            // so next/image's static domain allowlist can't cover them ahead of time.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspaceLogoUrl} alt={workspaceName} className="size-7 rounded-md object-cover" />
          ) : (
            workspaceName[0]?.toUpperCase()
          )}
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold">{workspaceName}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4" aria-label="Workspace navigation">
        <ul className="space-y-0.5 px-2" role="list">
          {visibleItems.map((item) => {
            const href = item.href(workspaceSlug);
            const active = isActive(href);
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium",
                  "transition-colors duration-fast ease-standard",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.badge && (
                  <Badge variant="primary" className="ml-auto text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );

            return (
              <li key={item.label}>
                {collapsed ? (
                  <SimpleTooltip label={item.label} side="right">
                    {linkContent}
                  </SimpleTooltip>
                ) : (
                  linkContent
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-border p-3">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <UserAvatar name={userName} src={userAvatarUrl} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{userName}</p>
              <p className="truncate text-[10px] text-muted-foreground capitalize">
                {userRole.toLowerCase().replace("_", " ")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <SimpleTooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
        <button
          className={cn(
            "absolute -right-3 top-1/2 z-sticky flex size-6 -translate-y-1/2 items-center justify-center",
            "rounded-full border border-border bg-card shadow-xs",
            "transition-all duration-fast hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronLeft className="size-3" />
          )}
        </button>
      </SimpleTooltip>
    </div>
  );

  return (
    <>
      {/* Mobile overlay trigger — shown via topbar hamburger button */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-modal-backdrop bg-foreground/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-modal w-sidebar transition-transform duration-moderate ease-decelerate lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative h-full">
          {SidebarContent}
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Desktop sidebar — static, hidden on mobile */}
      <div className="relative hidden lg:flex lg:shrink-0">
        {SidebarContent}
      </div>

      {/* Mobile hamburger — passed back to Topbar via context in the full shell */}
      <button
        className="fixed left-4 top-4 z-sticky lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>
    </>
  );
}

export { Sidebar };
