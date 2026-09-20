import { describe, expect, it } from "vitest";
import { dailySummarySchema, dashboardPeriodSchema } from "./schemas";

describe("dashboardPeriodSchema", () => {
  it("defaults to current_month", () => {
    const result = dashboardPeriodSchema.parse({});
    expect(result.period).toBe("current_month");
  });

  it("accepts a custom range with from/to", () => {
    const result = dashboardPeriodSchema.parse({ period: "custom", from: "2026-01-01", to: "2026-01-31" });
    expect(result.period).toBe("custom");
    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
  });

  it("rejects an unknown period", () => {
    const result = dashboardPeriodSchema.safeParse({ period: "last_week" });
    expect(result.success).toBe(false);
  });
});

describe("dailySummarySchema", () => {
  it("requires a date", () => {
    const result = dailySummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("coerces a date string", () => {
    const result = dailySummarySchema.parse({ date: "2026-01-20" });
    expect(result.date).toBeInstanceOf(Date);
  });
});
