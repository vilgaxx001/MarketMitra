/**
 * src/components/ui/chart.tsx
 *
 * Thin theming wrapper around Recharts so every chart in Analytics/Admin
 * uses the same color tokens, tooltip styling, and responsive container
 * config — individual chart components (LineChart, BarChart, etc. from
 * recharts) are composed inside <ChartContainer>, not reimplemented.
 */
"use client";

import * as React from "react";
import { ResponsiveContainer, Tooltip, type TooltipProps } from "recharts";
import { cn } from "@/lib/utils";

/** Brand-aligned categorical palette for multi-series charts, in priority order. */
export const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
] as const;

export interface ChartContainerProps {
  children: React.ReactElement;
  className?: string;
  /** Fixed height in px — Recharts' ResponsiveContainer requires an explicit parent height. */
  height?: number;
}

function ChartContainer({ children, className, height = 280 }: ChartContainerProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Themed tooltip content — pass as <Tooltip content={<ChartTooltip />} /> inside any recharts chart. */
function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{entry.value?.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empty/loading-aware wrapper — most analytics widgets want this rather than raw ChartContainer. */
function ChartCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5 shadow-xs", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartCard, Tooltip as RechartsTooltip };
