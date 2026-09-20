"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { SearchInput } from "@/components/shared/search-input";
import { TICKET_STATUSES } from "@/features/tickets/schemas";

const ALL = "ALL";

type CustomerHistoryFiltersProps = {
  query: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function CustomerHistoryFilters({ query, status, dateFrom, dateTo }: CustomerHistoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.set("historyPage", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  const dateRange: DateRange | undefined =
    dateFrom || dateTo
      ? { from: dateFrom ? new Date(dateFrom) : undefined, to: dateTo ? new Date(dateTo) : undefined }
      : undefined;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchInput
        value={query}
        onChange={(value) => updateParams({ historyQuery: value })}
        placeholder="Search ticket # or problem"
        aria-label="Search support history"
        className="sm:max-w-xs"
      />

      <Select
        value={status ?? ALL}
        onValueChange={(value) => updateParams({ historyStatus: value === ALL ? undefined : value })}
      >
        <SelectTrigger className="w-40" aria-label="Filter by status">
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
            historyDateFrom: range?.from ? range.from.toISOString() : undefined,
            historyDateTo: range?.to ? range.to.toISOString() : undefined,
          })
        }
        placeholder="Filter by date"
      />
    </div>
  );
}
