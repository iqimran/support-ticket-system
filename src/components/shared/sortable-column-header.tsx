"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type SortDirection = "asc" | "desc";

type SortableColumnHeaderProps = {
  label: string;
  sortKey: string;
  currentSortBy: string;
  currentSortDir: SortDirection;
};

// Generic URL-driven sort toggle for use as a DataTableColumn's `header`.
export function SortableColumnHeader({ label, sortKey, currentSortBy, currentSortDir }: SortableColumnHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = currentSortBy === sortKey;
  const nextDir: SortDirection = isActive && currentSortDir === "asc" ? "desc" : "asc";
  const Icon = isActive ? (currentSortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", sortKey);
    params.set("sortDir", nextDir);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-auto gap-1 px-2 py-1 font-medium"
      onClick={handleClick}
    >
      {label}
      <Icon aria-hidden="true" className="size-3.5" />
    </Button>
  );
}
