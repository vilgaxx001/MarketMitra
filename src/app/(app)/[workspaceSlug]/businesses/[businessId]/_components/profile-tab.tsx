"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { updateBusinessSchema, type UpdateBusinessInput } from "@/modules/business/validators";
import type { BusinessProfileDTO } from "@/modules/business/types";

export function ProfileTab({
  workspaceSlug,
  businessId,
  business,
}: {
  workspaceSlug: string;
  businessId: string;
  business: BusinessProfileDTO;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
  } = useForm<UpdateBusinessInput>({
    resolver: zodResolver(updateBusinessSchema),
    defaultValues: {
      businessName: business.businessName,
      description: business.description ?? "",
      industry: business.industry ?? "",
      category: business.category ?? "",
      businessType: business.businessType ?? undefined,
      website: business.website ?? "",
      country: business.country ?? "",
      state: business.state ?? "",
      city: business.city ?? "",
      timeZone: business.timeZone ?? "",
      preferredLanguage: business.preferredLanguage ?? "",
      currency: business.currency ?? "",
      targetMarket: business.targetMarket ?? "",
      businessGoals: business.businessGoals,
      primaryOfferings: business.primaryOfferings,
      usp: business.usp ?? "",
      marketingChallenges: business.marketingChallenges,
      competitors: business.competitors,
    },
  });

  async function onSubmit(data: UpdateBusinessInput) {
    const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/businesses/${businessId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Business profile updated");
    } else {
      const json = await res.json();
      toast.error(json.error?.message ?? "Couldn't save changes");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" {...register("businessName")} />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input id="website" {...register("website")} />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} {...register("description")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" {...register("industry")} />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" {...register("category")} />
        </div>
        <div>
          <Label>Business type</Label>
          <Controller
            control={control}
            name="businessType"
            render={({ field }) => (
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCT">Product</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="HYBRID">Both</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" {...register("country")} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register("state")} />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register("city")} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="timeZone">Time zone</Label>
          <Input id="timeZone" placeholder="Asia/Kolkata" {...register("timeZone")} />
        </div>
        <div>
          <Label htmlFor="preferredLanguage">Preferred language</Label>
          <Input id="preferredLanguage" {...register("preferredLanguage")} />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" placeholder="INR" {...register("currency")} />
        </div>
      </div>

      <div>
        <Label htmlFor="targetMarket">Target market</Label>
        <Textarea id="targetMarket" rows={2} {...register("targetMarket")} />
      </div>

      <div>
        <Label>Products / services</Label>
        <Controller
          control={control}
          name="primaryOfferings"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add an offering" />}
        />
      </div>

      <div>
        <Label htmlFor="usp">Unique selling proposition</Label>
        <Textarea id="usp" rows={2} {...register("usp")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label>Business goals</Label>
          <Controller
            control={control}
            name="businessGoals"
            render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a goal" />}
          />
        </div>
        <div>
          <Label>Marketing challenges</Label>
          <Controller
            control={control}
            name="marketingChallenges"
            render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a challenge" />}
          />
        </div>
      </div>

      <div>
        <Label>Competitors</Label>
        <Controller
          control={control}
          name="competitors"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a competitor" />}
        />
      </div>

      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Save changes
      </Button>
    </form>
  );
}
