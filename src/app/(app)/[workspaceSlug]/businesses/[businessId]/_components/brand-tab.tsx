"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/ui/tag-input";
import { FileUpload } from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { updateBrandIdentitySchema, type UpdateBrandIdentityInput } from "@/modules/brand/validators";
import type { BrandIdentityDTO } from "@/modules/brand/types";
import type { FileAssetDTO } from "@/modules/assets/types";
import { useAssetUpload } from "./use-asset-upload";

export function BrandTab({
  workspaceSlug,
  businessId,
  brand,
  assets,
}: {
  workspaceSlug: string;
  businessId: string;
  brand: BrandIdentityDTO | null;
  assets: FileAssetDTO[];
}) {
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? null);
  const { upload, progress, error } = useAssetUpload(workspaceSlug);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { isSubmitting, isDirty },
  } = useForm<UpdateBrandIdentityInput>({
    resolver: zodResolver(updateBrandIdentitySchema),
    defaultValues: {
      brandName: brand?.brandName ?? "",
      logoAssetId: brand?.logoAssetId ?? undefined,
      primaryColor: brand?.primaryColor ?? "",
      secondaryColor: brand?.secondaryColor ?? "",
      accentColor: brand?.accentColor ?? "",
      typographyPreference: brand?.typographyPreference ?? "",
      personality: brand?.personality ?? [],
      tone: brand?.tone ?? "",
      toneOfVoice: brand?.toneOfVoice ?? "",
      wordsToUse: brand?.wordsToUse ?? [],
      wordsToAvoid: brand?.wordsToAvoid ?? [],
      brandValues: brand?.brandValues ?? [],
      mission: brand?.mission ?? "",
      positioning: brand?.positioning ?? "",
      tagline: brand?.tagline ?? "",
      communicationStyle: brand?.communicationStyle ?? "",
    },
  });

  async function handleLogoSelected(files: File[]) {
    const file = files[0];
    if (!file) return;
    const result = await upload(file, { category: "LOGO", name: `${file.name} (logo)`, businessId });
    if (result?.currentVersion) {
      setValue("logoAssetId", result.id, { shouldDirty: true });
      setLogoUrl(result.downloadUrl);
      toast.success("Logo uploaded");
    } else if (error) {
      toast.error(error);
    }
  }

  async function onSubmit(data: UpdateBrandIdentityInput) {
    const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/businesses/${businessId}/brand`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Brand identity updated");
    } else {
      const json = await res.json();
      toast.error(json.error?.message ?? "Couldn't save changes");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label>Logo</Label>
        <div className="mt-2 flex items-center gap-4">
          {logoUrl && (
            <Image src={logoUrl} alt="Brand logo" width={56} height={56} className="rounded-lg border border-border object-contain" unoptimized />
          )}
          <div className="flex-1">
            <FileUpload accept="image/png,image/jpeg,image/webp,image/svg+xml" maxSizeMB={5} onFilesSelected={handleLogoSelected} hint="PNG, JPG, WEBP or SVG up to 5MB" />
            {progress !== null && <Progress value={progress} className="mt-2" />}
          </div>
        </div>
        {assets.filter((a) => a.category === "LOGO").length > 1 && (
          <p className="mt-1 text-xs text-muted-foreground">{assets.filter((a) => a.category === "LOGO").length} logo versions on file.</p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="brandName">Brand name</Label>
          <Input id="brandName" {...register("brandName")} />
        </div>
        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input id="tagline" {...register("tagline")} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="primaryColor">Primary color</Label>
          <Input id="primaryColor" type="text" placeholder="#2563EB" {...register("primaryColor")} />
        </div>
        <div>
          <Label htmlFor="secondaryColor">Secondary color</Label>
          <Input id="secondaryColor" type="text" placeholder="#06B6D4" {...register("secondaryColor")} />
        </div>
        <div>
          <Label htmlFor="accentColor">Accent color</Label>
          <Input id="accentColor" type="text" placeholder="#10B981" {...register("accentColor")} />
        </div>
      </div>

      <div>
        <Label htmlFor="typographyPreference">Typography preference</Label>
        <Input id="typographyPreference" placeholder="e.g. Inter, sans-serif" {...register("typographyPreference")} />
      </div>

      <div>
        <Label>Brand personality</Label>
        <Controller control={control} name="personality" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Bold, Modern" />} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="tone">Tone</Label>
          <Input id="tone" {...register("tone")} />
        </div>
        <div>
          <Label htmlFor="communicationStyle">Communication style</Label>
          <Input id="communicationStyle" {...register("communicationStyle")} />
        </div>
      </div>

      <div>
        <Label htmlFor="toneOfVoice">Tone of voice</Label>
        <Textarea id="toneOfVoice" rows={2} {...register("toneOfVoice")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label>Words to use</Label>
          <Controller control={control} name="wordsToUse" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a word" />} />
        </div>
        <div>
          <Label>Words to avoid</Label>
          <Controller control={control} name="wordsToAvoid" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a word" />} />
        </div>
      </div>

      <div>
        <Label>Brand values</Label>
        <Controller control={control} name="brandValues" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Transparency" />} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="mission">Mission</Label>
          <Textarea id="mission" rows={2} {...register("mission")} />
        </div>
        <div>
          <Label htmlFor="positioning">Positioning</Label>
          <Textarea id="positioning" rows={2} {...register("positioning")} />
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Save changes
      </Button>
    </form>
  );
}
