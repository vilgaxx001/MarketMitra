"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { BusinessProfileDTO } from "@/modules/business/types";
import type { BrandIdentityDTO } from "@/modules/brand/types";
import type { AudienceSegmentDTO } from "@/modules/audience/types";
import type { FileAssetDTO } from "@/modules/assets/types";
import { ProfileTab } from "./profile-tab";
import { BrandTab } from "./brand-tab";
import { AudienceTab } from "./audience-tab";
import { AssetsTab } from "./assets-tab";

export function BusinessDetailTabs({
  workspaceSlug,
  businessId,
  business,
  brand,
  segments,
  assets,
}: {
  workspaceSlug: string;
  businessId: string;
  business: BusinessProfileDTO;
  brand: BrandIdentityDTO | null;
  segments: AudienceSegmentDTO[];
  assets: FileAssetDTO[];
}) {
  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="brand">Brand Identity</TabsTrigger>
        <TabsTrigger value="audience">Target Audience</TabsTrigger>
        <TabsTrigger value="assets">Brand Assets</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="mt-6">
        <ProfileTab workspaceSlug={workspaceSlug} businessId={businessId} business={business} />
      </TabsContent>
      <TabsContent value="brand" className="mt-6">
        <BrandTab workspaceSlug={workspaceSlug} businessId={businessId} brand={brand} assets={assets} />
      </TabsContent>
      <TabsContent value="audience" className="mt-6">
        <AudienceTab workspaceSlug={workspaceSlug} businessId={businessId} initialSegments={segments} />
      </TabsContent>
      <TabsContent value="assets" className="mt-6">
        <AssetsTab workspaceSlug={workspaceSlug} businessId={businessId} initialAssets={assets} />
      </TabsContent>
    </Tabs>
  );
}
