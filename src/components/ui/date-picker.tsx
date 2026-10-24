/**
 * src/components/ui/date-picker.tsx
 *
 * Calendar + Popover composed into the standard "click a field, pick a
 * date" pattern — used for billing date filters, content calendar
 * scheduling, and any form field needing a single date.
 */
"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  className?: string;
  /** aria-invalid pass-through so this composes with form validation state like every other input. */
  "aria-invalid"?: boolean;
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-invalid={ariaInvalid}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            "aria-[invalid=true]:border-destructive",
            className
          )}
          leadingIcon={<CalendarIcon />}
        >
          {value ? format(value, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <Calendar
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
