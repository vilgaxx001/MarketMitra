/**
 * src/components/workspace/workspace-switcher.tsx
 *
 * Receives the initial workspace list as a prop from the Server
 * Component layout (no client-side fetch-on-mount flash). Switching
 * workspaces is just navigation — there's no "current workspace" to
 * mutate server-side, since workspace context is resolved from the URL
 * slug on every request (see requireWorkspaceAccess).
 */
"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Building2, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { WorkspaceSummary } from "@/modules/workspace/types";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: { name: string; slug: string };
  workspaces: WorkspaceSummary[];
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2" aria-label="Switch workspace">
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[140px] truncate text-sm font-medium">{current.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onClick={() => router.push(`/${ws.slug}/dashboard`)}>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm">{ws.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ws.memberCount} member{ws.memberCount === 1 ? "" : "s"} · {ws.businessCount} business
                  {ws.businessCount === 1 ? "" : "es"}
                </span>
              </div>
              {ws.slug === current.slug && <Check className="size-4 text-primary" aria-hidden="true" />}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/onboarding")}>
          <Plus className="size-4" aria-hidden="true" />
          Create new workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
