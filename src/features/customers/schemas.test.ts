import { describe, expect, it } from "vitest";
import { customerFormSchema, customerSearchSchema } from "./schemas";

describe("customerFormSchema (validation)", () => {
  it("accepts a minimal valid input (phone only) and normalizes the phone", () => {
    const result = customerFormSchema.safeParse({ phone: "01712345678" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+8801712345678");
      expect(result.data.name).toBeUndefined();
      expect(result.data.address).toBeUndefined();
      expect(result.data.note).toBeUndefined();
    }
  });

  it("rejects a missing phone", () => {
    const result = customerFormSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an invalid phone number", () => {
    const result = customerFormSchema.safeParse({ phone: "12345" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.phone?.[0]).toMatch(/valid Bangladeshi/i);
    }
  });

  it("treats empty optional fields as undefined rather than empty strings", () => {
    const result = customerFormSchema.safeParse({ phone: "01712345678", name: "", address: "", note: "" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBeUndefined();
      expect(result.data.address).toBeUndefined();
      expect(result.data.note).toBeUndefined();
    }
  });

  it("accepts optional fields when provided", () => {
    const result = customerFormSchema.safeParse({
      phone: "01712345678",
      name: "Rahim Uddin",
      address: "House 12, Road 5, Dhaka",
      note: "Prefers evening visits",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Rahim Uddin");
      expect(result.data.address).toBe("House 12, Road 5, Dhaka");
      expect(result.data.note).toBe("Prefers evening visits");
    }
  });

  it("rejects a name longer than 200 characters", () => {
    const result = customerFormSchema.safeParse({ phone: "01712345678", name: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects a note longer than 2000 characters", () => {
    const result = customerFormSchema.safeParse({ phone: "01712345678", note: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe("customerSearchSchema", () => {
  it("applies sensible defaults", () => {
    const result = customerSearchSchema.parse({});
    expect(result).toEqual({ query: "", page: 1, pageSize: 20, sortBy: "createdAt", sortDir: "desc" });
  });

  it("coerces page/pageSize from string query params", () => {
    const result = customerSearchSchema.parse({ page: "3", pageSize: "50" });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("rejects an unknown sort key", () => {
    const result = customerSearchSchema.safeParse({ sortBy: "notAField" });
    expect(result.success).toBe(false);
  });

  it("caps pageSize at 100", () => {
    const result = customerSearchSchema.safeParse({ pageSize: "1000" });
    expect(result.success).toBe(false);
  });
});
