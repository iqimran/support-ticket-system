import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, maskPhone } from "./logger";

describe("maskPhone", () => {
  it("masks the middle digits of an E.164 Bangladeshi number", () => {
    expect(maskPhone("+8801712345678")).toBe("+880******5678");
  });

  it("fully redacts values too short to safely mask", () => {
    expect(maskPhone("12345")).toBe("[REDACTED]");
  });
});

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes info events to console.log as a single JSON line", () => {
    logger.info("auth.login_succeeded", { userId: "u1" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ level: "info", event: "auth.login_succeeded", userId: "u1" });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("writes warn events to console.warn", () => {
    logger.warn("auth.login_failed", { reason: "wrong_password" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("writes error events to console.error", () => {
    logger.error("archive.job_failed", { batchId: "b1" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("redacts fields whose key names indicate a credential, regardless of case", () => {
    logger.info("debug.whatever", { password: "hunter2", Token: "abc", safe: "ok" });

    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.Token).toBe("[REDACTED]");
    expect(parsed.safe).toBe("ok");
  });
});
