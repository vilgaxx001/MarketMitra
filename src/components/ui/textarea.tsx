/**
 * src/components/ui/textarea.tsx
 *
 * Multi-line text input. Supports optional autosize (grows with content,
 * up to maxRows) — used by the AI Chat module's prompt box and project
 * description fields so users aren't stuck in a tiny fixed box.
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** When true, height grows automatically with content instead of scrolling internally. */
  autoResize?: boolean;
  /** Maximum rows before autoResize stops growing and scrolls instead. */
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, maxRows = 12, onInput, rows, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref]
    );

    const handleInput = React.useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        if (autoResize && internalRef.current) {
          const el = internalRef.current;
          el.style.height = "auto";
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
          const maxHeight = lineHeight * maxRows;
          el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
        }
        onInput?.(e);
      },
      [autoResize, maxRows, onInput]
    );

    return (
      <textarea
        ref={setRefs}
        rows={rows ?? 3}
        onInput={handleInput}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs",
          "transition-colors duration-fast ease-standard resize-y",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
          autoResize && "resize-none overflow-hidden",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
