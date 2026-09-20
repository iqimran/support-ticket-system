import { describe, expect, it } from "vitest";
import { changeTicketStatusSchema, createTicketSchema, ticketSearchSchema } from "./schemas";

describe("createTicketSchema", () => {
  it("accepts a valid ticket with default priority", () => {
    const result = createTicketSchema.safeParse({ customerId: "cust_1", problem: "Camera offline" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("MEDIUM");
    }
  });

  it("rejects a missing customerId", () => {
    const result = createTicketSchema.safeParse({ problem: "Camera offline" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty problem description", () => {
    const result = createTicketSchema.safeParse({ customerId: "cust_1", problem: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid priority", () => {
    const result = createTicketSchema.safeParse({ customerId: "cust_1", problem: "x", priority: "SUPER_URGENT" });
    expect(result.success).toBe(false);
  });
});

describe("changeTicketStatusSchema", () => {
  it("accepts a status change with no note", () => {
    const result = changeTicketStatusSchema.safeParse({ ticketId: "t1", newStatus: "IN_PROGRESS" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeUndefined();
  });

  it("treats an empty note as undefined", () => {
    const result = changeTicketStatusSchema.safeParse({ ticketId: "t1", newStatus: "IN_PROGRESS", note: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeUndefined();
  });

  it("rejects an invalid status value", () => {
    const result = changeTicketStatusSchema.safeParse({ ticketId: "t1", newStatus: "DONE" });
    expect(result.success).toBe(false);
  });
});

describe("ticketSearchSchema", () => {
  it("applies defaults", () => {
    const result = ticketSearchSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.sortBy).toBe("createdAt");
    expect(result.sortDir).toBe("desc");
    expect(result.status).toBeUndefined();
    expect(result.priority).toBeUndefined();
  });

  it("coerces date filter strings", () => {
    const result = ticketSearchSchema.parse({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });
    expect(result.dateFrom).toBeInstanceOf(Date);
    expect(result.dateTo).toBeInstanceOf(Date);
  });

  it("rejects an unknown status filter", () => {
    const result = ticketSearchSchema.safeParse({ status: "DONE" });
    expect(result.success).toBe(false);
  });
});
