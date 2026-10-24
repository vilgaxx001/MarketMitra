/**
 * src/components/ui/search-input.tsx
 *
 * Debounced search field — used for the global search bar, project list
 * filtering, and table search. Debouncing lives here (not duplicated per
 * feature) so every search experience in the product has the same feel.
 */
"use client";

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  value?: string;
  defaultValue?: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  isSearching?: boolean;
  className?: string;
  autoFocus?: boolean;
}

function SearchInput({
  value: controlledValue,
  defaultValue = "",
  onSearch,
  placeholder = "Search…",
  debounceMs = 300,
  isSearching = false,
  className,
  autoFocus,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = React.useState(controlledValue ?? defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleChange = (next: string) => {
    if (!isControlled) setInternalValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(next), debounceMs);
  };

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isControlled) setInternalValue("");
    onSearch("");
  };

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      startIcon={<Search />}
      endIcon={
        isSearching ? (
          <Loader2 className="animate-spin" />
        ) : value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="pointer-events-auto rounded-sm hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : undefined
      }
      className={cn("[&::-webkit-search-cancel-button]:hidden", className)}
    />
  );
}

export { SearchInput };
