"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { SearchInput } from "@/components/shared/search-input";
import { TicketFormDialog } from "@/features/tickets/components/ticket-form-dialog";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/features/tickets/schemas";

type TicketFiltersProps = {
  query: string;
  status?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
};

const ALL = "ALL";

export function TicketFilters({ query, status, priority, dateFrom, dateTo }: TicketFiltersProps) {
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={query}
          onChange={(value) => updateParams({ query: value })}
          placeholder="Search by ticket #, phone, or name"
          aria-label="Search tickets"
          className="sm:max-w-sm"
        />
        <TicketFormDialog
          trigger={
            <Button type="button">
              <Plus aria-hidden="true" />
              New ticket
            </Button>
          }
        />
      </div>

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

        <Select value={priority ?? ALL} onValueChange={(value) => updateParams({ priority: value === ALL ? undefined : value })}>
          <SelectTrigger className="w-44" aria-label="Filter by priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {TICKET_PRIORITIES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
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
          placeholder="Filter by date"
        />
      </div>
    </div>
  );
}
