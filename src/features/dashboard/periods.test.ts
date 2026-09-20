import { describe, expect, it } from "vitest";
import { resolvePeriodRange } from "./periods";

// Wednesday, March 18, 2026, mid-afternoon UTC (= 20:30 in Asia/Dhaka,
// UTC+6 — still March 18 locally). resolvePeriodRange returns TZDate
// instances anchored to Asia/Dhaka, whose toISOString() preserves the
// local wall-clock time with a "+06:00" suffix (rather than normalizing to
// "Z"/UTC) — that suffix is exactly what proves the boundary was computed
// in the business's timezone, not the server's.
const NOW = new Date("2026-03-18T14:30:00.000Z");

describe("resolvePeriodRange", () => {
  it("today: the current calendar day in Asia/Dhaka", () => {
    const { from, to } = resolvePeriodRange({ period: "today" }, NOW);
    expect(from.toISOString()).toBe("2026-03-18T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-03-18T23:59:59.999+06:00");
  });

  it("yesterday: the prior calendar day in Asia/Dhaka", () => {
    const { from, to } = resolvePeriodRange({ period: "yesterday" }, NOW);
    expect(from.toISOString()).toBe("2026-03-17T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-03-17T23:59:59.999+06:00");
  });

  it("current_month: the full calendar month containing now, in Asia/Dhaka", () => {
    const { from, to } = resolvePeriodRange({ period: "current_month" }, NOW);
    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-03-31T23:59:59.999+06:00");
  });

  it("previous_month: the full calendar month before now's month, in Asia/Dhaka", () => {
    const { from, to } = resolvePeriodRange({ period: "previous_month" }, NOW);
    expect(from.toISOString()).toBe("2026-02-01T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-02-28T23:59:59.999+06:00");
  });

  it("last_3_months: a rolling window from 3 months ago through today, in Asia/Dhaka", () => {
    const { from, to } = resolvePeriodRange({ period: "last_3_months" }, NOW);
    expect(from.toISOString()).toBe("2025-12-18T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-03-18T23:59:59.999+06:00");
  });

  it("custom: uses the provided from/to, normalized to Asia/Dhaka day boundaries", () => {
    const { from, to } = resolvePeriodRange(
      { period: "custom", from: new Date("2026-01-05T04:00:00.000Z"), to: new Date("2026-01-10T10:00:00.000Z") },
      NOW,
    );
    expect(from.toISOString()).toBe("2026-01-05T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-01-10T23:59:59.999+06:00");
  });

  it("custom: falls back to the current month if from/to are missing", () => {
    const { from, to } = resolvePeriodRange({ period: "custom" }, NOW);
    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2026-03-31T23:59:59.999+06:00");
  });

  it("handles a leap-year February correctly for previous_month", () => {
    const marchInLeapYear = new Date("2028-03-05T00:00:00.000Z");
    const { from, to } = resolvePeriodRange({ period: "previous_month" }, marchInLeapYear);
    expect(from.toISOString()).toBe("2028-02-01T00:00:00.000+06:00");
    expect(to.toISOString()).toBe("2028-02-29T23:59:59.999+06:00");
  });

  it("the returned range represents the correct absolute instants regardless of string format", () => {
    // Cross-check against plain-UTC math independent of TZDate's
    // formatting: local Dhaka midnight (UTC+6) is 18:00 UTC the previous day.
    const { from } = resolvePeriodRange({ period: "today" }, NOW);
    expect(from.getTime()).toBe(new Date("2026-03-17T18:00:00.000Z").getTime());
  });
});
