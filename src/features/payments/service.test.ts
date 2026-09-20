// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { getTicketPaymentTotal } from "./repository";
import { recordPayment, updatePayment } from "./service";

const RECEIVER_PHONE = "01900000071";
const CUSTOMER_PHONE = "+8801911190010";

let receiverId: string;
let customerId: string;
const cleanupTicketIds: string[] = [];

async function createCompletedTicket(problem: string) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem,
      createdBy: receiverId,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
  cleanupTicketIds.push(ticket.id);
  return ticket;
}

async function createOpenTicket(problem: string) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem,
      createdBy: receiverId,
      status: "PENDING",
    },
  });
  cleanupTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");
  const receiver = await prisma.user.upsert({
    where: { phone: RECEIVER_PHONE },
    update: {},
    create: { name: "Fixture Receiver", phone: RECEIVER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  receiverId = receiver.id;

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Payment Fixture Customer" } });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.paymentAuditLog.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.user.delete({ where: { id: receiverId } });
});

describe("recordPayment", () => {
  it("rejects recording a payment on a ticket that is not COMPLETED", async () => {
    const ticket = await createOpenTicket("Not yet completed");

    const result = await recordPayment(
      { ticketId: ticket.id, amount: "500", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );

    expect(result.status).toBe("ticket_not_completed");
    const paymentCount = await prisma.payment.count({ where: { ticketId: ticket.id } });
    expect(paymentCount).toBe(0);
  });

  it("returns ticket_not_found for a nonexistent ticket", async () => {
    const result = await recordPayment(
      { ticketId: "does-not-exist", amount: "500", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );
    expect(result.status).toBe("ticket_not_found");
  });

  it("[zero payment] a completed ticket with no payments has a total of 0", async () => {
    const ticket = await createCompletedTicket("No payments yet");

    const total = await getTicketPaymentTotal(ticket.id);

    expect(total).toBe("0");
  });

  it("[normal payment] records a single payment with all fields", async () => {
    const ticket = await createCompletedTicket("Standard job");

    const result = await recordPayment(
      {
        ticketId: ticket.id,
        amount: "1500.50",
        paymentMethod: "BANK",
        note: "Paid via bank transfer",
        receivedAt: new Date("2026-01-15T10:00:00Z"),
      },
      receiverId,
    );

    expect(result.status).toBe("recorded");
    if (result.status === "recorded") {
      expect(result.payment.amount.toString()).toBe("1500.5");
      expect(result.payment.paymentMethod).toBe("BANK");
      expect(result.payment.note).toBe("Paid via bank transfer");
      expect(result.payment.receivedBy).toBe(receiverId);
    }

    const total = await getTicketPaymentTotal(ticket.id);
    expect(total).toBe("1500.5");
  });

  it("[multiple payments] sums several payments on the same ticket with exact decimal precision", async () => {
    const ticket = await createCompletedTicket("Multi-payment job");

    await recordPayment({ ticketId: ticket.id, amount: "0.10", paymentMethod: "CASH", receivedAt: new Date() }, receiverId);
    await recordPayment({ ticketId: ticket.id, amount: "0.20", paymentMethod: "CASH", receivedAt: new Date() }, receiverId);
    await recordPayment({ ticketId: ticket.id, amount: "999.70", paymentMethod: "CASH", receivedAt: new Date() }, receiverId);

    // Naive JS float arithmetic gives 0.1 + 0.2 + 999.7 = 999.9999999999999.
    // The DB-aggregated Decimal sum must be exact.
    const total = await getTicketPaymentTotal(ticket.id);
    expect(total).toBe("1000");

    const paymentCount = await prisma.payment.count({ where: { ticketId: ticket.id } });
    expect(paymentCount).toBe(3);
  });

  it("[decimal accuracy] aggregates many small amounts without floating-point drift", async () => {
    const ticket = await createCompletedTicket("Precision stress test");

    // 0.01 * 100 = 1.00 exactly. In naive float arithmetic, summing 0.01
    // one hundred times drifts away from 1 (e.g. 0.9999999999999999).
    for (let i = 0; i < 100; i++) {
      await recordPayment({ ticketId: ticket.id, amount: "0.01", paymentMethod: "CASH", receivedAt: new Date() }, receiverId);
    }

    const total = await getTicketPaymentTotal(ticket.id);
    expect(total).toBe("1");
  });
});

describe("updatePayment", () => {
  it("[payment update] persists corrected amount, method, and note", async () => {
    const ticket = await createCompletedTicket("Needs correction");
    const created = await recordPayment(
      { ticketId: ticket.id, amount: "100", paymentMethod: "CASH", note: "Original", receivedAt: new Date() },
      receiverId,
    );
    if (created.status !== "recorded") throw new Error("fixture setup failed");

    const updated = await updatePayment(
      created.payment.id,
      { amount: "150.25", paymentMethod: "MOBILE_BANKING", note: "Corrected amount", receivedAt: new Date() },
      receiverId,
    );

    expect(updated.status).toBe("updated");
    if (updated.status === "updated") {
      expect(updated.payment.amount.toString()).toBe("150.25");
      expect(updated.payment.paymentMethod).toBe("MOBILE_BANKING");
      expect(updated.payment.note).toBe("Corrected amount");
    }

    const total = await getTicketPaymentTotal(ticket.id);
    expect(total).toBe("150.25");
  });

  it("does not physically delete or replace the row on update — same payment id persists", async () => {
    const ticket = await createCompletedTicket("Same row check");
    const created = await recordPayment(
      { ticketId: ticket.id, amount: "100", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );
    if (created.status !== "recorded") throw new Error("fixture setup failed");

    await updatePayment(
      created.payment.id,
      { amount: "200", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );

    const stillExists = await prisma.payment.findUnique({ where: { id: created.payment.id } });
    expect(stillExists).not.toBeNull();
    expect(await prisma.payment.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it("returns not_found for a nonexistent payment", async () => {
    const result = await updatePayment(
      "does-not-exist",
      { amount: "100", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );
    expect(result.status).toBe("not_found");
  });
});

describe("[audit generation] PaymentAuditLog", () => {
  it("creates a CREATED audit entry with only new values populated", async () => {
    const ticket = await createCompletedTicket("Audit on create");

    const result = await recordPayment(
      { ticketId: ticket.id, amount: "300", paymentMethod: "OTHER", note: "Test note", receivedAt: new Date() },
      receiverId,
    );
    if (result.status !== "recorded") throw new Error("fixture setup failed");

    const auditLogs = await prisma.paymentAuditLog.findMany({ where: { paymentId: result.payment.id } });

    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0]!;
    expect(log.action).toBe("CREATED");
    expect(log.oldAmount).toBeNull();
    expect(log.oldPaymentMethod).toBeNull();
    expect(log.oldNote).toBeNull();
    expect(log.newAmount?.toString()).toBe("300");
    expect(log.newPaymentMethod).toBe("OTHER");
    expect(log.newNote).toBe("Test note");
    expect(log.changedBy).toBe(receiverId);
    expect(log.createdAt).toBeInstanceOf(Date);
  });

  it("creates an UPDATED audit entry capturing both old and new values", async () => {
    const ticket = await createCompletedTicket("Audit on update");
    const created = await recordPayment(
      { ticketId: ticket.id, amount: "100", paymentMethod: "CASH", note: "Before", receivedAt: new Date() },
      receiverId,
    );
    if (created.status !== "recorded") throw new Error("fixture setup failed");

    await updatePayment(
      created.payment.id,
      { amount: "175", paymentMethod: "BANK", note: "After", receivedAt: new Date() },
      receiverId,
    );

    const updateLog = await prisma.paymentAuditLog.findFirst({
      where: { paymentId: created.payment.id, action: "UPDATED" },
    });

    expect(updateLog).not.toBeNull();
    expect(updateLog?.oldAmount?.toString()).toBe("100");
    expect(updateLog?.newAmount?.toString()).toBe("175");
    expect(updateLog?.oldPaymentMethod).toBe("CASH");
    expect(updateLog?.newPaymentMethod).toBe("BANK");
    expect(updateLog?.oldNote).toBe("Before");
    expect(updateLog?.newNote).toBe("After");
  });

  it("every payment has at least a CREATED audit entry, and count matches operations performed", async () => {
    const ticket = await createCompletedTicket("Audit count check");
    const created = await recordPayment(
      { ticketId: ticket.id, amount: "50", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );
    if (created.status !== "recorded") throw new Error("fixture setup failed");

    await updatePayment(
      created.payment.id,
      { amount: "60", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );
    await updatePayment(
      created.payment.id,
      { amount: "70", paymentMethod: "CASH", receivedAt: new Date() },
      receiverId,
    );

    const auditLogs = await prisma.paymentAuditLog.findMany({
      where: { paymentId: created.payment.id },
      orderBy: { createdAt: "asc" },
    });

    expect(auditLogs.map((log) => log.action)).toEqual(["CREATED", "UPDATED", "UPDATED"]);
  });
});
