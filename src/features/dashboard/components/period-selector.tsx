"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { DASHBOARD_PERIODS, type DashboardPeriod } from "@/features/dashboard/periods";

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  current_month: "Current month",
  previous_month: "Previous month",
  last_3_months: "Last 3 months",
  custom: "Custom range",
};

type PeriodSelectorProps = {
  period: DashboardPeriod;
  from?: string;
  to?: string;
};

export function PeriodSelector({ period, from, to }: PeriodSelectorProps) {
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
    router.push(`${pathname}?${params.toString()}`);
  }

  const customRange: DateRange | undefined =
    period === "custom" && (from || to)
      ? { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }
      : undefined;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select
        value={period}
        onValueChange={(value) => updateParams({ period: value, from: undefined, to: undefined })}
      >
        <SelectTrigger className="w-48" aria-label="Dashboard period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DASHBOARD_PERIODS.map((option) => (
            <SelectItem key={option} value={option}>
              {PERIOD_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {period === "custom" ? (
        <DateRangePicker
          value={customRange}
          onChange={(range) =>
            updateParams({
              from: range?.from ? range.from.toISOString() : undefined,
              to: range?.to ? range.to.toISOString() : undefined,
            })
          }
          placeholder="Pick a date range"
        />
      ) : null}
    </div>
  );
}
