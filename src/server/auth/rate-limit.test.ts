import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoginAttempts, isLoginRateLimited, recordFailedLoginAttempt } from "./rate-limit";

const KEY = "+8801712345678";

describe("login rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLoginAttempts(KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not rate limited before any failures", () => {
    expect(isLoginRateLimited(KEY)).toBe(false);
  });

  it("is not rate limited under the failure threshold", () => {
    for (let i = 0; i < 4; i++) recordFailedLoginAttempt(KEY);
    expect(isLoginRateLimited(KEY)).toBe(false);
  });

  it("locks out once the failure threshold is reached", () => {
    for (let i = 0; i < 5; i++) recordFailedLoginAttempt(KEY);
    expect(isLoginRateLimited(KEY)).toBe(true);
  });

  it("tracks each key independently", () => {
    for (let i = 0; i < 5; i++) recordFailedLoginAttempt(KEY);
    expect(isLoginRateLimited("+8801799999999")).toBe(false);
  });

  it("clears on a successful login", () => {
    for (let i = 0; i < 5; i++) recordFailedLoginAttempt(KEY);
    clearLoginAttempts(KEY);
    expect(isLoginRateLimited(KEY)).toBe(false);
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < 5; i++) recordFailedLoginAttempt(KEY);
    expect(isLoginRateLimited(KEY)).toBe(true);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(isLoginRateLimited(KEY)).toBe(false);
  });
});
