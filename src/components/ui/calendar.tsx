/**
 * src/components/ui/calendar.tsx
 *
 * Month-grid calendar, built directly on date-fns rather than pulling in
 * react-day-picker — the product's calendar needs (date picker popover,
 * content calendar's day-cell view in the Dashboard module) are simple
 * enough that a dependency-light implementation keeps bundle size down
 * and gives full control over day-cell content (Module 7's Content
 * Calendar needs to render post-count badges inside day cells, which
 * off-the-shelf calendar libraries make awkward).
 */
"use client";

import * as React from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CalendarProps {
  selected?: Date | null;
  onSelect?: (date: Date) => void;
  month?: Date;
  onMonthChange?: (month: Date) => void;
  disabled?: (date: Date) => boolean;
  /** Render custom content inside a day cell (e.g. a post-count badge for the Content Calendar feature). */
  renderDayContent?: (date: Date) => React.ReactNode;
  className?: string;
  weekStartsOn?: 0 | 1; // 0 = Sunday, 1 = Monday
}

function Calendar({
  selected,
  onSelect,
  month: controlledMonth,
  onMonthChange,
  disabled,
  renderDayContent,
  className,
  weekStartsOn = 1,
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState(controlledMonth ?? selected ?? new Date());
  const month = controlledMonth ?? internalMonth;

  const setMonth = (next: Date) => {
    if (!controlledMonth) setInternalMonth(next);
    onMonthChange?.(next);
  };

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn });
    return eachDayOfInterval({ start, end });
  }, [month, weekStartsOn]);

  const weekDayLabels = React.useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEEEE"));
  }, [weekStartsOn]);

  return (
    <div className={cn("w-full select-none", className)} role="application" aria-label="Calendar">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMonth(subMonths(month, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-semibold" aria-live="polite">
          {format(month, "MMMM yyyy")}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDayLabels.map((label, i) => (
          <div key={i} className="py-1 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const isSelected = selected && isSameDay(day, selected);
          const isDisabled = disabled?.(day) ?? false;
          const dayIsToday = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect?.(day)}
              aria-label={format(day, "PPPP")}
              aria-pressed={isSelected || undefined}
              aria-current={dayIsToday ? "date" : undefined}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-sm",
                "transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !inMonth && "text-muted-foreground/40",
                inMonth && !isSelected && "text-foreground hover:bg-muted",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                dayIsToday && !isSelected && "font-semibold text-primary",
                isDisabled && "pointer-events-none opacity-30"
              )}
            >
              <span>{format(day, "d")}</span>
              {renderDayContent?.(day)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export { Calendar };
