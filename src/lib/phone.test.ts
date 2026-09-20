import { describe, expect, it } from "vitest";
import { extractPhoneSearchDigits, formatBangladeshiPhoneForDisplay, normalizeBangladeshiPhone } from "./phone";

describe("normalizeBangladeshiPhone", () => {
  it("normalizes the 11-digit local form", () => {
    expect(normalizeBangladeshiPhone("01712345678")).toBe("+8801712345678");
  });

  it("normalizes the 10-digit form without the leading 0", () => {
    expect(normalizeBangladeshiPhone("1712345678")).toBe("+8801712345678");
  });

  it("normalizes the country-code-without-plus form", () => {
    expect(normalizeBangladeshiPhone("8801712345678")).toBe("+8801712345678");
  });

  it("normalizes E.164 input to itself", () => {
    expect(normalizeBangladeshiPhone("+8801712345678")).toBe("+8801712345678");
  });

  it("strips spaces, dashes, and parens before normalizing", () => {
    expect(normalizeBangladeshiPhone("+880 (17) 1234-5678")).toBe("+8801712345678");
  });

  it.each(["013", "014", "015", "016", "017", "018", "019"])(
    "accepts every valid mobile operator prefix (%s)",
    (prefix) => {
      expect(normalizeBangladeshiPhone(`${prefix}12345678`)).toBe(`+880${prefix.slice(1)}12345678`);
    },
  );

  it("rejects a landline-style prefix (02...)", () => {
    expect(normalizeBangladeshiPhone("0212345678")).toBeNull();
  });

  it("rejects numbers that are too short", () => {
    expect(normalizeBangladeshiPhone("017123")).toBeNull();
  });

  it("rejects numbers that are too long", () => {
    expect(normalizeBangladeshiPhone("017123456789")).toBeNull();
  });

  it("rejects non-Bangladeshi international numbers rather than guessing", () => {
    expect(normalizeBangladeshiPhone("+14155552671")).toBeNull();
  });

  it("rejects input containing letters", () => {
    expect(normalizeBangladeshiPhone("01712abc678")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeBangladeshiPhone("")).toBeNull();
  });
});

describe("formatBangladeshiPhoneForDisplay", () => {
  it("converts E.164 back to local display form", () => {
    expect(formatBangladeshiPhoneForDisplay("+8801712345678")).toBe("01712345678");
  });

  it("returns the input unchanged if it isn't recognized E.164", () => {
    expect(formatBangladeshiPhoneForDisplay("not-a-phone")).toBe("not-a-phone");
  });
});

describe("extractPhoneSearchDigits", () => {
  it("strips a leading +880", () => {
    expect(extractPhoneSearchDigits("+8801712345678")).toBe("1712345678");
  });

  it("strips a leading 880 without plus", () => {
    expect(extractPhoneSearchDigits("8801712345678")).toBe("1712345678");
  });

  it("strips a single leading 0", () => {
    expect(extractPhoneSearchDigits("01712345678")).toBe("1712345678");
  });

  it("supports partial digit search with no prefix", () => {
    expect(extractPhoneSearchDigits("5678")).toBe("5678");
  });

  it("returns empty string for a pure name query", () => {
    expect(extractPhoneSearchDigits("John Doe")).toBe("");
  });
});
