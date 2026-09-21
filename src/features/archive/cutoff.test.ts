// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveArchiveCutoff } from "./cutoff";

describe("resolveArchiveCutoff", () => {
  it("returns the start of the day exactly three months before now, in business time", () => {
    // 2026-06-15 12:34:56 UTC is 2026-06-15 18:34:56 in Asia/Dhaka (+06:00).
    const now = new Date("2026-06-15T12:34:56.000Z");

    const cutoff = resolveArchiveCutoff(now);

    // Three months back from 2026-06-15 (Dhaka) is 2026-03-15, start of day
    // Dhaka time (+06:00) == 2026-03-14T18:00:00.000Z.
    expect(cutoff.getTime()).toBe(new Date("2026-03-14T18:00:00.000Z").getTime());
  });

  it("is pure and deterministic for the same input", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(resolveArchiveCutoff(now).getTime()).toBe(resolveArchiveCutoff(now).getTime());
  });

  it("moves back exactly three calendar months given a different date", () => {
    const now = new Date("2026-09-21T10:00:00.000Z");
    const cutoff = resolveArchiveCutoff(now);
    // 2026-09-21 (Dhaka, +06:00) - 3 months = 2026-06-21, start of day Dhaka
    // == 2026-06-20T18:00:00.000Z.
    expect(cutoff.getTime()).toBe(new Date("2026-06-20T18:00:00.000Z").getTime());
  });
});
