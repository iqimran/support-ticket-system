"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { SearchInput } from "@/components/shared/search-input";
import { TICKET_STATUSES } from "@/features/tickets/schemas";

type ArchiveFiltersProps = {
  query: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

const ALL = "ALL";

export function ArchiveFilters({ query, status, dateFrom, dateTo }: ArchiveFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const dateRange: DateRange | undefined =
    dateFrom || dateTo
      ? { from: dateFrom ? new Date(dateFrom) : undefined, to: dateTo ? new Date(dateTo) : undefined }
      : undefined;

  return (
    <div className="space-y-3">
      <SearchInput
        value={query}
        onChange={(value) => updateParams({ query: value })}
        placeholder="Search by ticket #, phone, or customer name"
        aria-label="Search archived tickets"
        className="sm:max-w-sm"
      />

      <div className="flex flex-wrap gap-2">
        <Select value={status ?? ALL} onValueChange={(value) => updateParams({ status: value === ALL ? undefined : value })}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TICKET_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {option.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangePicker
          value={dateRange}
          onChange={(range) =>
            updateParams({
              dateFrom: range?.from ? range.from.toISOString() : undefined,
              dateTo: range?.to ? range.to.toISOString() : undefined,
            })
          }
          placeholder="Filter by original creation date"
        />
      </div>
    </div>
  );
}
