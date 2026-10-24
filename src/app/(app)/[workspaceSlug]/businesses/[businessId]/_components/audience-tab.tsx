"use client";

import { useState } from "react";
import { Plus, Star, Archive, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { EmptyState } from "@/components/patterns/state-views";
import { toast } from "@/components/ui/toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { audienceSegmentSchema, type AudienceSegmentInput } from "@/modules/audience/validators";
import type { AudienceSegmentDTO } from "@/modules/audience/types";

export function AudienceTab({
  workspaceSlug,
  businessId,
  initialSegments,
}: {
  workspaceSlug: string;
  businessId: string;
  initialSegments: AudienceSegmentDTO[];
}) {
  const [segments, setSegments] = useState(initialSegments);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busySegmentId, setBusySegmentId] = useState<string | null>(null);

  const base = `/api/v1/workspaces/${workspaceSlug}/businesses/${businessId}/audience`;

  async function setPrimary(segmentId: string) {
    setBusySegmentId(segmentId);
    try {
      const res = await fetch(`${base}/${segmentId}/set-primary`, { method: "POST" });
      if (res.ok) {
        setSegments((prev) => prev.map((s) => ({ ...s, isPrimary: s.id === segmentId })));
        toast.success("Primary audience updated");
      }
    } finally {
      setBusySegmentId(null);
    }
  }

  async function archiveSegment(segmentId: string) {
    setBusySegmentId(segmentId);
    try {
      const res = await fetch(`${base}/${segmentId}`, { method: "DELETE" });
      if (res.ok) {
        setSegments((prev) => prev.filter((s) => s.id !== segmentId));
        toast.success("Segment archived");
      }
    } finally {
      setBusySegmentId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> Add segment
        </Button>
      </div>

      {segments.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No audience segments yet"
          description="Define who you're marketing to so generated content can speak to them directly."
          action={<Button onClick={() => setDialogOpen(true)}>Add your first segment</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {segments.map((s) => (
            <div key={s.id} className="glass rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="flex items-center gap-1.5 font-medium text-foreground">
                    {s.name}
                    {s.isPrimary && <Star className="size-3.5 fill-warning text-warning" aria-label="Primary audience" />}
                  </h3>
                  {s.ageRange && <p className="text-xs text-muted-foreground">{s.ageRange}{s.location ? ` · ${s.location}` : ""}</p>}
                </div>
                {busySegmentId === s.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </div>
              {s.interests.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.interests.slice(0, 4).map((i) => (
                    <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{i}</span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {!s.isPrimary && (
                  <Button size="sm" variant="outline" onClick={() => setPrimary(s.id)} disabled={busySegmentId === s.id}>
                    <Star className="size-3.5" /> Make primary
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => archiveSegment(s.id)} disabled={busySegmentId === s.id}>
                  <Archive className="size-3.5" /> Archive
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewSegmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(segment) => setSegments((prev) => [...prev, segment])}
        endpoint={base}
      />
    </div>
  );
}

function NewSegmentDialog({
  open,
  onOpenChange,
  onCreated,
  endpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (segment: AudienceSegmentDTO) => void;
  endpoint: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<AudienceSegmentInput>({ resolver: zodResolver(audienceSegmentSchema) });

  async function onSubmit(data: AudienceSegmentInput) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (res.ok) {
      onCreated(json.data);
      toast.success("Segment created");
      reset();
      onOpenChange(false);
    } else {
      toast.error(json.error?.message ?? "Couldn't create segment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New audience segment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="segment-name">Name</Label>
            <Input id="segment-name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="segment-age">Age range</Label>
              <Input id="segment-age" placeholder="25-34" {...register("ageRange")} />
            </div>
            <div>
              <Label htmlFor="segment-location">Location</Label>
              <Input id="segment-location" {...register("location")} />
            </div>
          </div>
          <div>
            <Label>Interests</Label>
            <Controller control={control} name="interests" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add an interest" />} />
          </div>
          <div>
            <Label>Pain points</Label>
            <Controller control={control} name="painPoints" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a pain point" />} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Create segment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
