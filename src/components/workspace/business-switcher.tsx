/**
 * src/components/workspace/business-switcher.tsx
 *
 * Unlike workspace switching (pure navigation), switching the active
 * business calls the server (POST .../switch-active) to set the
 * per-workspace cookie resolved by requireBusinessAccess/
 * resolveActiveBusiness — see src/lib/middleware/require-business.ts.
 * router.refresh() re-runs Server Components so the rest of the page
 * picks up the new active business immediately.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Store, Plus, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { BusinessSummary } from "@/modules/business/types";

export function BusinessSwitcher({
  workspaceSlug,
  current,
  businesses,
}: {
  workspaceSlug: string;
  current: { id: string; businessName: string } | null;
  businesses: BusinessSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  async function handleSwitch(businessId: string) {
    if (businessId === current?.id) return;
    setSwitchingTo(businessId);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/businesses/${businessId}/switch-active`, {
        method: "POST",
      });
      if (res.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setSwitchingTo(null);
    }
  }

  if (businesses.length === 0) {
    return (
      <Button variant="outline" size="sm" onClick={() => router.push(`/${workspaceSlug}/businesses/new`)}>
        <Plus className="size-4" aria-hidden="true" />
        Add a business
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[160px] truncate">{current?.businessName ?? "Select a business"}</span>
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Businesses in this workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {businesses.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => handleSwitch(b.id)} disabled={switchingTo === b.id}>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm">{b.businessName}</span>
                {b.industry && <span className="text-xs text-muted-foreground">{b.industry}</span>}
              </div>
              {switchingTo === b.id ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                b.id === current?.id && <Check className="size-4 text-primary" aria-hidden="true" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/${workspaceSlug}/businesses/new`)}>
          <Plus className="size-4" aria-hidden="true" />
          Add a business
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
