/**
 * src/components/ui/pagination.tsx
 *
 * Matches the `meta.pagination` shape defined in src/lib/api-response.ts
 * exactly (page, pageSize, totalCount, totalPages), so any paginated API
 * response can drive this component without a mapping layer.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Optional total-count label, e.g. "Showing 21-40 of 134 results". */
  summary?: string;
}

function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages: (number | "ellipsis")[] = [1];
  if (page > 3) pages.push("ellipsis");

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);

  return pages;
}

function Pagination({ page, totalPages, onPageChange, className, summary }: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}
    >
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>

        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`ellipsis-${i}`} className="flex size-8 items-center justify-center text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "primary" : "ghost"}
              size="icon-sm"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

export { Pagination };
