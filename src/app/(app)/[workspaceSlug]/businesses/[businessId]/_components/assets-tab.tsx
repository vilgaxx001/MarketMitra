"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, Archive, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/state-views";
import { toast } from "@/components/ui/toast";
import type { FileAssetCategory } from "@prisma/client";
import type { FileAssetDTO } from "@/modules/assets/types";
import { useAssetUpload } from "./use-asset-upload";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetsTab({
  workspaceSlug,
  businessId,
  initialAssets,
}: {
  workspaceSlug: string;
  businessId: string;
  initialAssets: FileAssetDTO[];
}) {
  const [assets, setAssets] = useState(initialAssets.filter((a) => a.category !== "LOGO"));
  const [category, setCategory] = useState<FileAssetCategory>("BRAND_ASSET");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { upload, progress, error } = useAssetUpload(workspaceSlug);

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    const result = await upload(file, { category, name: file.name, businessId });
    if (result) {
      setAssets((prev) => [result, ...prev]);
      toast.success("File uploaded");
    } else if (error) {
      toast.error(error);
    }
  }

  async function handleArchive(assetId: string) {
    setBusyId(assetId);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/assets/${assetId}/archive`, { method: "POST" });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
        toast.success("Asset archived");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Select value={category} onValueChange={(v) => setCategory(v as FileAssetCategory)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BRAND_ASSET">Brand asset</SelectItem>
            <SelectItem value="DOCUMENT">Document</SelectItem>
            <SelectItem value="IMAGE">Image</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1">
          <FileUpload
            accept="image/png,image/jpeg,image/webp,application/pdf,.docx,.xlsx,.csv"
            maxSizeMB={20}
            onFilesSelected={handleUpload}
            hint="Images, PDF, DOCX, XLSX, or CSV up to 20MB"
          />
        </div>
      </div>
      {progress !== null && <Progress value={progress} className="mb-4" />}

      {assets.length === 0 ? (
        <EmptyState icon={FileText} title="No brand assets yet" description="Upload guidelines, reference documents, or images for this business." />
      ) : (
        <div className="space-y-2">
          {assets.map((a) => (
            <div key={a.id} className="glass flex items-center justify-between rounded-lg p-3">
              <div className="flex items-center gap-3">
                {a.currentVersion?.mimeType.startsWith("image/") ? (
                  <ImageIcon className="size-5 text-secondary" aria-hidden="true" />
                ) : (
                  <FileText className="size-5 text-secondary" aria-hidden="true" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.currentVersion ? formatBytes(a.currentVersion.sizeBytes) : ""} · v{a.currentVersion?.versionNumber ?? 1}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {a.downloadUrl && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="size-3.5" />
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => handleArchive(a.id)} disabled={busyId === a.id}>
                  {busyId === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
