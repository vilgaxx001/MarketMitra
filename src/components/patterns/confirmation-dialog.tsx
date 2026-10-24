/**
 * src/components/patterns/confirmation-dialog.tsx
 *
 * Standard confirm-before-destructive-action pattern (delete project,
 * remove team member, cancel subscription). One component, used
 * everywhere an irreversible action needs a confirmation step, so the
 * interaction is consistent and accessible (focus trapped, Escape
 * cancels, Enter does NOT confirm by default for destructive actions —
 * see `requireTypedConfirmation` below for the highest-stakes case).
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  /**
   * For the highest-stakes actions (e.g. deleting a workspace), require
   * the user to type a confirmation phrase before the confirm button
   * enables — mirrors GitHub's "type the repo name to delete" pattern.
   */
  requireTypedConfirmation?: {
    phrase: string;
    label?: string;
  };
}

function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onConfirm,
  requireTypedConfirmation,
}: ConfirmationDialogProps) {
  const [typedValue, setTypedValue] = React.useState("");

  // Reset typed confirmation when the dialog closes, so reopening it
  // doesn't pre-fill a stale confirmation.
  React.useEffect(() => {
    if (!open) setTypedValue("");
  }, [open]);

  const isConfirmDisabled =
    isLoading || (requireTypedConfirmation ? typedValue !== requireTypedConfirmation.phrase : false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requireTypedConfirmation && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="confirm-phrase">
              {requireTypedConfirmation.label ??
                `Type "${requireTypedConfirmation.phrase}" to confirm`}
            </Label>
            <Input
              id="confirm-phrase"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={isConfirmDisabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmationDialog };
