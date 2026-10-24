"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { updateWorkspaceSchema, type UpdateWorkspaceInput } from "@/modules/workspace/validators";
import type { WorkspaceDTO } from "@/modules/workspace/types";

export function WorkspaceSettingsForm({
  workspace,
  canEdit,
  canArchive,
}: {
  workspace: WorkspaceDTO;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isDirty, errors },
  } = useForm<UpdateWorkspaceInput>({ resolver: zodResolver(updateWorkspaceSchema), defaultValues: { name: workspace.name } });

  async function onSubmit(data: UpdateWorkspaceInput) {
    const res = await fetch(`/api/v1/workspaces/${workspace.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Workspace updated");
    } else {
      const json = await res.json();
      toast.error(json.error?.message ?? "Couldn't save changes");
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.slug}/archive`, { method: "POST" });
      if (res.ok) {
        toast.success("Workspace archived");
        router.push("/onboarding");
      } else {
        const json = await res.json();
        toast.error(json.error?.message ?? "Couldn't archive workspace");
      }
    } finally {
      setArchiving(false);
      setArchiveOpen(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="name">Workspace name</Label>
          <Input id="name" disabled={!canEdit} {...register("name")} aria-invalid={!!errors.name} />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
        </div>
        {canEdit && (
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        )}
      </form>

      {canArchive && (
        <div className="border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Archiving hides this workspace for all members. It can be restored later by contacting support.
          </p>
          <Button variant="destructive" size="sm" className="mt-3" onClick={() => setArchiveOpen(true)}>
            Archive workspace
          </Button>
        </div>
      )}

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this workspace?</DialogTitle>
            <DialogDescription>
              {workspace.name} will be hidden from every member. This can be undone later, but content and
              settings won&apos;t be accessible until it is.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive} isLoading={archiving}>
              Archive workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
