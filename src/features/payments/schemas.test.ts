import { describe, expect, it } from "vitest";
import { recordPaymentSchema } from "./schemas";

function parse(amount: string) {
  return recordPaymentSchema.safeParse({
    ticketId: "t1",
    amount,
    paymentMethod: "CASH",
    receivedAt: new Date().toISOString(),
  });
}

describe("recordPaymentSchema amount validation", () => {
  it("accepts a whole-number amount", () => {
    expect(parse("500").success).toBe(true);
  });

  it("accepts an amount with two decimal places", () => {
    expect(parse("199.99").success).toBe(true);
  });

  it("accepts an amount with one decimal place", () => {
    expect(parse("199.9").success).toBe(true);
  });

  it("rejects an amount with more than two decimal places", () => {
    expect(parse("199.999").success).toBe(false);
  });

  it("rejects a zero amount", () => {
    expect(parse("0").success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(parse("-50").success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(parse("fifty").success).toBe(false);
  });

  it("rejects more than 10 integer digits (exceeds Decimal(12,2))", () => {
    expect(parse("12345678901").success).toBe(false);
  });

  it("accepts exactly 10 integer digits", () => {
    expect(parse("1234567890.12").success).toBe(true);
  });

  it("rejects scientific notation", () => {
    expect(parse("1e10").success).toBe(false);
  });

  it("rejects a comma-formatted amount", () => {
    expect(parse("1,000.00").success).toBe(false);
  });
});

describe("recordPaymentSchema paymentMethod", () => {
  it("accepts all four payment methods", () => {
    for (const method of ["CASH", "BANK", "MOBILE_BANKING", "OTHER"]) {
      const result = recordPaymentSchema.safeParse({
        ticketId: "t1",
        amount: "100",
        paymentMethod: method,
        receivedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown payment method", () => {
    const result = recordPaymentSchema.safeParse({
      ticketId: "t1",
      amount: "100",
      paymentMethod: "CREDIT_CARD",
      receivedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

describe("recordPaymentSchema note", () => {
  it("treats an empty note as undefined", () => {
    const result = recordPaymentSchema.safeParse({
      ticketId: "t1",
      amount: "100",
      paymentMethod: "CASH",
      note: "",
      receivedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeUndefined();
  });
});
