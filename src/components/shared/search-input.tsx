"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  "aria-label"?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
  "aria-label": ariaLabel = "Search",
  className,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  // Tracks the last `value` we synced from, so an external reset (e.g. a
  // "clear filters" action) can update `draft` during render instead of an
  // effect — see https://react.dev/learn/you-might-not-need-an-effect.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timeout = setTimeout(() => onChange(draft), debounceMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-debounce when the draft itself changes
  }, [draft, debounceMs]);

  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="pl-8 pr-8"
      />
      {draft ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setDraft("")}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
