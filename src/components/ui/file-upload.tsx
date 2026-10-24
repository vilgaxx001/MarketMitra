/**
 * src/components/ui/file-upload.tsx
 *
 * Drag-and-drop + click-to-browse file upload. Purely a UI primitive —
 * it validates file type/size client-side and surfaces selected files to
 * the caller via onFilesSelected; the actual upload request (e.g. to
 * S3 via a presigned URL) is the caller's responsibility, implemented in
 * the owning module (e.g. src/modules/workspace/service.ts for logo
 * uploads in Module 4).
 */
"use client";

import * as React from "react";
import { Upload, X, FileIcon, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface FileUploadProps {
  accept?: string;
  maxSizeMB?: number;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  /** Rejected-file reasons surfaced back to the caller for toast/inline error display. */
  onRejected?: (rejections: { file: File; reason: string }[]) => void;
  disabled?: boolean;
  className?: string;
  /** Label describing accepted formats, shown in the dropzone (e.g. "PNG, JPG up to 5MB"). */
  hint?: string;
}

function FileUpload({
  accept,
  maxSizeMB = 10,
  multiple = false,
  onFilesSelected,
  onRejected,
  disabled,
  className,
  hint,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const processFiles = React.useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files = Array.from(fileList);
      const accepted: File[] = [];
      const rejected: { file: File; reason: string }[] = [];

      for (const file of files) {
        if (file.size > maxSizeMB * 1024 * 1024) {
          rejected.push({ file, reason: `Exceeds ${maxSizeMB}MB limit` });
          continue;
        }
        if (accept) {
          const acceptedTypes = accept.split(",").map((t) => t.trim());
          const matches = acceptedTypes.some((type) => {
            if (type.startsWith(".")) return file.name.toLowerCase().endsWith(type.toLowerCase());
            if (type.endsWith("/*")) return file.type.startsWith(type.replace("/*", "/"));
            return file.type === type;
          });
          if (!matches) {
            rejected.push({ file, reason: `File type not accepted (expected ${accept})` });
            continue;
          }
        }
        accepted.push(file);
      }

      if (accepted.length > 0) onFilesSelected(multiple ? accepted : [accepted[0]!]);
      if (rejected.length > 0) onRejected?.(rejected);
    },
    [accept, maxSizeMB, multiple, onFilesSelected, onRejected]
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center",
        "transition-colors duration-fast",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        processFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload file"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => processFiles(e.target.files)}
      />
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">
        <span className="text-primary">Click to upload</span> or drag and drop
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Row representing a single file mid-upload or completed — used inside a
 * list below FileUpload to show per-file progress, matching the brief's
 * "Upload logo" / "Upload brand assets" flows.
 */
function FileUploadItem({
  file,
  progress,
  status,
  onRemove,
  errorMessage,
}: {
  file: File;
  progress?: number;
  status: "uploading" | "success" | "error";
  onRemove?: () => void;
  errorMessage?: string;
}) {
  const isImage = file.type.startsWith("image/");

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
        {isImage ? (
          <ImageIcon className="size-4 text-muted-foreground" />
        ) : (
          <FileIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        {status === "uploading" && (
          <Progress value={progress ?? 0} className="h-1.5" />
        )}
        {status === "error" && (
          <p className="text-xs text-destructive">{errorMessage ?? "Upload failed"}</p>
        )}
        {status === "success" && <p className="text-xs text-success">Uploaded</p>}
      </div>
      {onRemove && (
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${file.name}`}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

export { FileUpload, FileUploadItem };
