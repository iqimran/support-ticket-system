import { TZDate } from "@date-fns/tz";
import { startOfDay, subMonths } from "date-fns";
import { BUSINESS_TIMEZONE } from "@/lib/timezone";

/**
 * The business rule is "operate on the most recent three months; anything
 * older gets archived" — a rolling trailing window ending now, anchored to
 * BUSINESS_TIMEZONE so the boundary agrees with what a human in that
 * timezone means by "three months ago" regardless of server TZ (mirrors
 * features/dashboard/periods.ts's "last_3_months" boundary).
 *
 * Pure and deterministic given `now` so tests can pass a fixed clock rather
 * than depending on the real one.
 */
export function resolveArchiveCutoff(now: Date = new Date()): Date {
  return startOfDay(subMonths(new TZDate(now, BUSINESS_TIMEZONE), 3));
}
