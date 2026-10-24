/**
 * src/hooks/use-autosave.ts
 *
 * Debounced autosave for any form that should persist changes without
 * requiring the user to click "Save" — the generated-content editor,
 * the business profile form, the project description field.
 *
 * HOW IT WORKS:
 *   1. Caller provides `data` (the current form values), `onSave` (the
 *      async function that persists them), and a `debounceMs` delay.
 *   2. Every time `data` changes, the debounce timer resets.
 *   3. After `debounceMs` of no further changes, `onSave(data)` is called.
 *   4. The returned `status` gives the caller material to show an
 *      autosave indicator ("Saving…" / "Saved" / error) in the UI.
 *
 * USAGE:
 *   const { status, lastSavedAt } = useAutosave({
 *     data: watch(),            // React Hook Form's watch() output
 *     onSave: async (values) => {
 *       await updateContent(contentId, values);
 *     },
 *   });
 *
 * NOTE: `onSave` should be wrapped in useCallback by the caller to
 * prevent the debounce re-triggering on every render.
 */
"use client";

import * as React from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface UseAutosaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  debounceMs?: number;
  /** Don't start autosaving until at least one user interaction has occurred — prevents saving the initial/default form state on mount. */
  enabled?: boolean;
}

interface UseAutosaveReturn {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  /** Trigger an immediate save (e.g. before the user navigates away). */
  saveNow: () => Promise<void>;
}

export function useAutosave<T>({
  data,
  onSave,
  debounceMs = 1500,
  enabled = true,
}: UseAutosaveOptions<T>): UseAutosaveReturn {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSaveRef = React.useRef(onSave);
  const dataRef = React.useRef(data);
  const isFirstRender = React.useRef(true);

  // Keep refs current without causing the debounce effect to re-run
  onSaveRef.current = onSave;
  dataRef.current = data;

  const doSave = React.useCallback(async () => {
    setStatus("saving");
    try {
      await onSaveRef.current(dataRef.current);
      setStatus("saved");
      setLastSavedAt(new Date());
      // Reset to idle after 2s so the "Saved" indicator fades away
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }, []);

  // Debounce whenever `data` changes, but not on the very first render
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!enabled) return;

    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, enabled, debounceMs, doSave]);

  // Flush any pending debounced save immediately
  const saveNow = React.useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (status === "pending" || status === "idle") {
      await doSave();
    }
  }, [doSave, status]);

  return { status, lastSavedAt, saveNow };
}

/**
 * UI indicator component for the autosave status — rendered in the
 * toolbar of any autosaving editor.
 *
 * USAGE: <AutosaveIndicator status={status} lastSavedAt={lastSavedAt} />
 */
export function autosaveStatusLabel(
  status: AutosaveStatus,
  lastSavedAt: Date | null
): string {
  switch (status) {
    case "pending": return "Unsaved changes";
    case "saving": return "Saving…";
    case "saved": return lastSavedAt
      ? `Saved at ${lastSavedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
      : "Saved";
    case "error": return "Save failed — changes not saved";
    case "idle": return lastSavedAt ? "All changes saved" : "";
  }
}
