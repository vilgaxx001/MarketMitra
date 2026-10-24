/**
 * src/components/patterns/unsaved-changes-dialog.tsx
 *
 * Pairs with the `useUnsavedChangesGuard` hook below: any form that can
 * lose user work (business profile editor, generated-content editor,
 * settings forms) calls the hook with its dirty state, and renders this
 * dialog when the hook reports a blocked navigation attempt.
 */
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function UnsavedChangesDialog({
  open,
  onDiscard,
  onCancel,
  onSaveAndContinue,
  isSaving = false,
}: {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
  /** Omit if the form has no quick-save action available from this context. */
  onSaveAndContinue?: () => void | Promise<void>;
  isSaving?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You have unsaved changes</DialogTitle>
          <DialogDescription>
            Leaving now will discard your changes. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={onDiscard} disabled={isSaving}>
            Discard changes
          </Button>
          {onSaveAndContinue && (
            <Button onClick={onSaveAndContinue} isLoading={isSaving}>
              Save and continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Guards in-app navigation (Next.js Link clicks / router.push calls
 * within the app shell) while `isDirty` is true. Note: this does NOT
 * cover hard browser navigation (tab close, URL bar entry, refresh) —
 * that requires the separate native `beforeunload` handler below, which
 * has a fixed, non-customizable browser dialog (per spec, no browser
 * lets you replace it with custom UI like this component).
 *
 * USAGE:
 *   const { showDialog, confirmDiscard, cancelNavigation, attemptNavigation } =
 *     useUnsavedChangesGuard(isDirty);
 *   <Button onClick={() => attemptNavigation(() => router.push("/elsewhere"))}>
 *     Leave page
 *   </Button>
 *   <UnsavedChangesDialog open={showDialog} onDiscard={confirmDiscard} onCancel={cancelNavigation} />
 */
function useUnsavedChangesGuard(isDirty: boolean) {
  const [showDialog, setShowDialog] = React.useState(false);
  const pendingActionRef = React.useRef<(() => void) | null>(null);

  // Native browser-level guard for hard navigation (refresh/close tab/URL bar).
  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const attemptNavigation = React.useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setShowDialog(true);
    },
    [isDirty]
  );

  const confirmDiscard = React.useCallback(() => {
    setShowDialog(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []);

  const cancelNavigation = React.useCallback(() => {
    setShowDialog(false);
    pendingActionRef.current = null;
  }, []);

  return { showDialog, attemptNavigation, confirmDiscard, cancelNavigation };
}

export { UnsavedChangesDialog, useUnsavedChangesGuard };
