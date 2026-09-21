import { describe, expect, it } from "vitest";
import { formatDurationMs } from "./format-duration";

describe("formatDurationMs", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatDurationMs(42_000)).toBe("42s");
    expect(formatDurationMs(0)).toBe("0s");
  });

  it("formats sub-hour durations as minutes and seconds", () => {
    expect(formatDurationMs(5 * 60_000 + 3_000)).toBe("5m 3s");
  });

  it("formats durations over an hour as hours and minutes", () => {
    expect(formatDurationMs(2 * 3_600_000 + 5 * 60_000)).toBe("2h 5m");
  });

  it("never goes negative for a slightly-off clock", () => {
    expect(formatDurationMs(-500)).toBe("0s");
  });
});
