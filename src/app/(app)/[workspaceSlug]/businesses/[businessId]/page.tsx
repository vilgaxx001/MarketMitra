import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { getBusiness } from "@/modules/business/service";
import { getBrandIdentity } from "@/modules/brand/service";
import { listSegments } from "@/modules/audience/service";
import { listAssets } from "@/modules/assets/service";
import { ApiException } from "@/lib/api-response";
import { BusinessDetailTabs } from "./_components/business-detail-tabs";

export const metadata: Metadata = { title: "Business Settings" };

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; businessId: string }>;
}) {
  const { workspaceSlug, businessId } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);

  try {
    const [business, brand, segments, assets] = await Promise.all([
      getBusiness(businessId, workspaceUser.workspaceId),
      getBrandIdentity(businessId, workspaceUser.workspaceId),
      listSegments(businessId, workspaceUser.workspaceId),
      listAssets(workspaceUser.workspaceId, { businessId }),
    ]);

    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{business.businessName}</h1>
            <p className="text-sm text-muted-foreground">Profile completion: {business.profileCompletionScore}%</p>
          </div>
        </div>
        <BusinessDetailTabs
          workspaceSlug={workspaceSlug}
          businessId={businessId}
          business={business}
          brand={brand}
          segments={segments}
          assets={assets}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiException && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}
