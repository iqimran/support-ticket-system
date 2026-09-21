// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { getCustomerReportStats } from "./repository";

const CREATOR_PHONE = "01900000401";
const CUSTOMER_LIVE_PHONE = "+8801911190401";
const CUSTOMER_ARCHIVED_PHONE = "+8801911190402";
const CUSTOMER_MIXED_PHONE = "+8801911190403";
const CUSTOMER_EMPTY_PHONE = "+8801911190404";

let creatorId: string;
let batchId: string;
const cleanupTicketIds: string[] = [];
const cleanupCustomerIds: string[] = [];

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");
  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Reports Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "ADMIN" },
  });
  creatorId = creator.id;

  const batch = await prisma.archiveBatch.create({ data: { cutoffDate: new Date("2025-06-01") } });
  batchId = batch.id;
});

afterAll(async () => {
  await prisma.paymentAuditLogArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.paymentArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketArchive.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.archiveBatch.delete({ where: { id: batchId } });
  await prisma.customer.deleteMany({ where: { id: { in: cleanupCustomerIds } } });
  await prisma.user.deleteMany({ where: { phone: CREATOR_PHONE } });
});

async function createLiveTicket(customerId: string, createdAt: string, suffix: string) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-REPORTTEST-${suffix}`,
      customerId,
      problem: "Fixture ticket",
      createdBy: creatorId,
      status: "COMPLETED",
      createdAt: new Date(createdAt),
      completedAt: new Date(createdAt),
    },
  });
  cleanupTicketIds.push(ticket.id);
  return ticket;
}

async function createLivePayment(ticketId: string, amount: string, receivedAt: string) {
  await prisma.payment.create({
    data: { ticketId, amount, paymentMethod: "CASH", receivedBy: creatorId, receivedAt: new Date(receivedAt) },
  });
}

async function createArchivedTicket(customerId: string, createdAt: string, suffix: string) {
  const ticket = await prisma.ticketArchive.create({
    data: {
      id: `reporttestarchive${suffix}`,
      ticketNumber: `TKT-REPORTTEST-ARCH-${suffix}`,
      customerId,
      problem: "Fixture archived ticket",
      status: "COMPLETED",
      priority: "MEDIUM",
      createdBy: creatorId,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
      archiveBatchId: batchId,
    },
  });
  cleanupTicketIds.push(ticket.id);
  return ticket;
}

async function createArchivedPayment(ticketId: string, id: string, amount: string, receivedAt: string) {
  await prisma.paymentArchive.create({
    data: {
      id,
      ticketId,
      amount,
      paymentMethod: "CASH",
      receivedBy: creatorId,
      receivedAt: new Date(receivedAt),
      createdAt: new Date(receivedAt),
      updatedAt: new Date(receivedAt),
    },
  });
}

describe("getCustomerReportStats", () => {
  it("counts only live tickets/payments for a customer with no archived history", async () => {
    const customer = await prisma.customer.create({ data: { phone: CUSTOMER_LIVE_PHONE, name: "Live Only" } });
    cleanupCustomerIds.push(customer.id);

    const t1 = await createLiveTicket(customer.id, "2026-03-01T00:00:00.000Z", "LIVE1");
    const t2 = await createLiveTicket(customer.id, "2026-03-10T00:00:00.000Z", "LIVE2");
    await createLivePayment(t1.id, "500.00", "2026-03-01T00:00:00.000Z");
    await createLivePayment(t2.id, "300.00", "2026-03-10T00:00:00.000Z");

    const stats = await getCustomerReportStats(customer.id);

    expect(stats.totalTickets).toBe(2);
    expect(stats.totalPaymentsReceived).toBe("800");
    expect(stats.firstSupportDate?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(stats.latestSupportDate?.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("counts only archived tickets/payments for a customer with no live history", async () => {
    const customer = await prisma.customer.create({ data: { phone: CUSTOMER_ARCHIVED_PHONE, name: "Archived Only" } });
    cleanupCustomerIds.push(customer.id);

    const t1 = await createArchivedTicket(customer.id, "2025-01-05T00:00:00.000Z", "A1");
    const t2 = await createArchivedTicket(customer.id, "2025-02-15T00:00:00.000Z", "A2");
    await createArchivedPayment(t1.id, "reporttestpayA1", "400.00", "2025-01-05T00:00:00.000Z");
    await createArchivedPayment(t2.id, "reporttestpayA2", "600.00", "2025-02-15T00:00:00.000Z");

    const stats = await getCustomerReportStats(customer.id);

    expect(stats.totalTickets).toBe(2);
    expect(stats.totalPaymentsReceived).toBe("1000");
    expect(stats.firstSupportDate?.toISOString()).toBe("2025-01-05T00:00:00.000Z");
    expect(stats.latestSupportDate?.toISOString()).toBe("2025-02-15T00:00:00.000Z");
  });

  it("combines live and archived history for a long-standing customer", async () => {
    const customer = await prisma.customer.create({ data: { phone: CUSTOMER_MIXED_PHONE, name: "Mixed History" } });
    cleanupCustomerIds.push(customer.id);

    // Archived: the customer's oldest ticket.
    const archived = await createArchivedTicket(customer.id, "2024-06-01T00:00:00.000Z", "M1");
    await createArchivedPayment(archived.id, "reporttestpayM1", "150.00", "2024-06-01T00:00:00.000Z");
    // Live: the customer's most recent ticket.
    const live = await createLiveTicket(customer.id, "2026-05-01T00:00:00.000Z", "M2");
    await createLivePayment(live.id, "250.00", "2026-05-01T00:00:00.000Z");

    const stats = await getCustomerReportStats(customer.id);

    expect(stats.totalTickets).toBe(2); // 1 live + 1 archived
    expect(stats.totalPaymentsReceived).toBe("400"); // 150 (archived) + 250 (live)
    // First/latest span across both sources — not just whichever table happens to be queried first.
    expect(stats.firstSupportDate?.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(stats.latestSupportDate?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("returns zeros and null dates for a customer with no support history at all", async () => {
    const customer = await prisma.customer.create({ data: { phone: CUSTOMER_EMPTY_PHONE, name: "No History" } });
    cleanupCustomerIds.push(customer.id);

    const stats = await getCustomerReportStats(customer.id);

    expect(stats.totalTickets).toBe(0);
    expect(stats.totalPaymentsReceived).toBe("0");
    expect(stats.firstSupportDate).toBeNull();
    expect(stats.latestSupportDate).toBeNull();
  });
});
