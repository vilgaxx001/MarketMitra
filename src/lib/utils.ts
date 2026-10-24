/**
 * src/lib/utils.ts
 *
 * Small, framework-level utilities used across the app. Anything here must
 * be generic — domain logic belongs in src/modules/*, not here.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class names safely, resolving conflicts (e.g.
 * `cn("p-2", isLarge && "p-4")` correctly yields "p-4", not "p-2 p-4").
 * Used by every component in src/components/ui.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats smallest-currency-unit integers (paise/cents) as a display string. */
export function formatCurrency(amountInSmallestUnit: number, currency: "INR" | "USD") {
  const amount = amountInSmallestUnit / 100;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formats a date consistently across the app (server and client render the same string). */
export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...opts,
  }).format(d);
}

/** Generates a URL-safe slug from a workspace/business name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/** Type-safe assertion helper for narrowing in switch statements over enums. */
export function assertNever(value: never, message = "Unhandled case"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/** Truncates text to a maximum length with an ellipsis, respecting word boundaries. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

/** Simple sleep helper, mainly used for controlled retry/backoff logic. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
