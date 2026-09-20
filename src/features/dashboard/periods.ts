import { TZDate } from "@date-fns/tz";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { BUSINESS_TIMEZONE } from "@/lib/timezone";

// "Today", "this month", etc. must mean the business's actual calendar
// day/month, not whatever timezone happens to be configured on the server
// — most hosting defaults to UTC, which would silently misclassify
// anything within ~6 hours of local midnight. All boundary math below is
// anchored to BUSINESS_TIMEZONE explicitly via @date-fns/tz's TZDate,
// regardless of the server's own TZ setting.

export const DASHBOARD_PERIODS = [
  "today",
  "yesterday",
  "current_month",
  "previous_month",
  "last_3_months",
  "custom",
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export type DateRange = { from: Date; to: Date };

function toBusinessTime(date: Date): TZDate {
  return new TZDate(date, BUSINESS_TIMEZONE);
}

/**
 * Pure and deterministic given `now` — never reads the real clock directly
 * — so period boundaries are exactly reproducible in tests against known
 * seed data. "last_3_months" is a rolling trailing window ending now (not
 * "this calendar month + the 2 before it").
 */
export function resolvePeriodRange(
  input: { period: DashboardPeriod; from?: Date; to?: Date },
  now: Date = new Date(),
): DateRange {
  const businessNow = toBusinessTime(now);

  switch (input.period) {
    case "today":
      return { from: startOfDay(businessNow), to: endOfDay(businessNow) };
    case "yesterday": {
      const yesterday = subDays(businessNow, 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "current_month":
      return { from: startOfMonth(businessNow), to: endOfMonth(businessNow) };
    case "previous_month": {
      const previousMonth = subMonths(businessNow, 1);
      return { from: startOfMonth(previousMonth), to: endOfMonth(previousMonth) };
    }
    case "last_3_months":
      return { from: startOfDay(subMonths(businessNow, 3)), to: endOfDay(businessNow) };
    case "custom":
      return {
        from: input.from ? startOfDay(toBusinessTime(input.from)) : startOfMonth(businessNow),
        to: input.to ? endOfDay(toBusinessTime(input.to)) : endOfMonth(businessNow),
      };
  }
}
