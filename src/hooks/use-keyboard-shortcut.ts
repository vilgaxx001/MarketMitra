/**
 * src/hooks/use-keyboard-shortcut.ts
 *
 * Registers a keyboard shortcut that fires a callback while the
 * component that registered it is mounted.
 *
 * Shortcuts are de-duplicated globally — if two components register
 * the same key combo, the most-recently-mounted one wins (last-in-
 * priority, matching the natural stack layering of modals/drawers).
 *
 * USAGE:
 *   useKeyboardShortcut({ key: "n", meta: true }, () => setNewProjectOpen(true));
 *   useKeyboardShortcut({ key: "Escape" }, close, { preventDefault: true });
 *
 * NOTE: Ctrl+K is handled directly by CommandPaletteProvider, not here,
 * to avoid a circular dependency between the hook registry and the
 * palette that's mounted at the root.
 */
"use client";

import * as React from "react";

interface ShortcutOptions {
  key: string;
  /** Modifier keys. All specified modifiers must be held simultaneously. */
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Prevent default browser behaviour for this key combo. Default: true when modifiers are used. */
  preventDefault?: boolean;
  /** Only fire when focus is inside the document body (not in an input/textarea). Default: true. */
  ignoreInputs?: boolean;
}

export function useKeyboardShortcut(
  options: ShortcutOptions,
  callback: (event: KeyboardEvent) => void,
  deps: React.DependencyList = []
) {
  const { key, meta, ctrl, shift, alt, preventDefault, ignoreInputs = true } = options;
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Check modifiers
      if (meta && !e.metaKey) return;
      if (ctrl && !e.ctrlKey) return;
      if (shift && !e.shiftKey) return;
      if (alt && !e.altKey) return;

      // Key match (case-insensitive for letter keys)
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      // Skip when user is typing in an input unless explicitly opted-out
      if (ignoreInputs) {
        const target = e.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("[cmdk-input]");
        if (isInput) return;
      }

      const shouldPreventDefault = preventDefault ?? (meta || ctrl || alt);
      if (shouldPreventDefault) e.preventDefault();

      callbackRef.current(e);
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, meta, ctrl, shift, alt, preventDefault, ignoreInputs, ...deps]);
}

/**
 * Formats a shortcut combo for display in the UI (e.g. in a Tooltip or
 * Command Palette shortcut hint).
 */
export function formatShortcut(options: Omit<ShortcutOptions, "preventDefault" | "ignoreInputs">): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  if (options.ctrl) parts.push(isMac ? "⌃" : "Ctrl");
  if (options.meta) parts.push(isMac ? "⌘" : "Win");
  if (options.alt) parts.push(isMac ? "⌥" : "Alt");
  if (options.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(options.key.length === 1 ? options.key.toUpperCase() : options.key);
  return parts.join(isMac ? "" : "+");
}
