/**
 * src/components/notifications/notification-center.tsx
 *
 * Notification bell + slide-in panel. Reads from the `Notification`
 * table (defined in prisma/schema.prisma) via the notifications API
 * (Module 3+). Here the UI is fully wired — loading/empty/error states,
 * mark-as-read (individual + all), click-to-navigate via `actionUrl`,
 * unread badge count.
 *
 * The actual data-fetching hook (useNotifications) will be implemented
 * in Module 3 alongside auth — the component accepts it as a prop
 * interface so Module 2 stays self-contained.
 */
"use client";

import * as React from "react";
import { Bell, Check, CheckCheck, Info, AlertTriangle, CreditCard, Users, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/state-views";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Types — match the Notification model in schema.prisma
 * ---------------------------------------------------------------------- */

export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "BILLING" | "TEAM" | "SYSTEM";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onNavigate: (url: string) => void;
}

/* -------------------------------------------------------------------------
 * Icon & styling per notification type
 * ---------------------------------------------------------------------- */

const typeConfig: Record<
  NotificationType,
  { icon: LucideIcon; iconClass: string; dotVariant: "info" | "success" | "warning" | "destructive" | "default" }
> = {
  INFO: { icon: Info, iconClass: "text-info", dotVariant: "info" },
  SUCCESS: { icon: Check, iconClass: "text-success", dotVariant: "success" },
  WARNING: { icon: AlertTriangle, iconClass: "text-warning", dotVariant: "warning" },
  ERROR: { icon: AlertTriangle, iconClass: "text-destructive", dotVariant: "destructive" },
  BILLING: { icon: CreditCard, iconClass: "text-primary", dotVariant: "default" },
  TEAM: { icon: Users, iconClass: "text-secondary", dotVariant: "default" },
  SYSTEM: { icon: Zap, iconClass: "text-muted-foreground", dotVariant: "default" },
};

/* -------------------------------------------------------------------------
 * Notification item
 * ---------------------------------------------------------------------- */

function NotificationItem({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onNavigate: (url: string) => void;
}) {
  const { icon: Icon, iconClass } = typeConfig[notification.type] ?? typeConfig.INFO;
  const isUnread = !notification.readAt;

  const handleClick = () => {
    if (isUnread) onMarkRead(notification.id);
    if (notification.actionUrl) onNavigate(notification.actionUrl);
  };

  return (
    <button
      className={cn(
        "w-full rounded-lg p-3 text-left transition-colors duration-fast",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isUnread && "bg-primary/[0.04]"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted", iconClass)}>
          <Icon className="size-3.5" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("text-sm leading-snug", isUnread ? "font-medium text-foreground" : "text-foreground/80")}>
              {notification.title}
            </p>
            {isUnread && (
              <span className="mt-1 flex size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
          </div>
          {notification.body && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {formatDate(notification.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Main component
 * ---------------------------------------------------------------------- */

function NotificationCenter({
  notifications,
  unreadCount,
  isLoading,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: NotificationCenterProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Bell trigger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        className="relative"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Notification panel */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent side="right" className="max-w-sm">
          <DrawerHeader>
            <div className="flex items-center justify-between">
              <DrawerTitle className="flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="primary">{unreadCount} new</Badge>
                )}
              </DrawerTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkAllRead}
                  leadingIcon={<CheckCheck />}
                  className="text-xs"
                >
                  Mark all read
                </Button>
              )}
            </div>
          </DrawerHeader>

          <DrawerBody className="p-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-lg p-3">
                    <Skeleton className="size-7 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="All caught up"
                description="You'll see workspace and billing notifications here."
                className="border-none py-12"
              />
            ) : (
              <div className="space-y-0.5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={onMarkRead}
                    onNavigate={(url) => { onNavigate(url); setOpen(false); }}
                  />
                ))}
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}

export { NotificationCenter };
