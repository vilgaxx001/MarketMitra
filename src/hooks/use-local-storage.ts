/**
 * src/hooks/use-local-storage.ts
 *
 * Type-safe localStorage hook with SSR safety (doesn't crash during
 * Next.js server rendering), JSON serialization, and cross-tab
 * synchronization via the native "storage" event.
 *
 * USAGE:
 *   const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
 *     "mm:sidebar:collapsed",
 *     false
 *   );
 */
"use client";

import * as React from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = React.useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = React.useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Ignore write errors (storage full, private mode, etc.)
        }
        return next;
      });
    },
    [key]
  );

  // Sync across tabs
  React.useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== key || e.storageArea !== window.localStorage) return;
      try {
        if (e.newValue !== null) {
          setStoredValue(JSON.parse(e.newValue) as T);
        }
      } catch {
        // Ignore malformed values from other tabs
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key]);

  return [storedValue, setValue];
}
