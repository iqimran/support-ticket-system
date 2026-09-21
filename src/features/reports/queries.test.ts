// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { getPaymentStats, getTicketStats } from "@/features/dashboard/repository";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { getCustomerReport, getDailyReport, getMonthlyReport, getTeamMemberReport } from "./queries";

const CREATOR_PHONE = "01900000501";
const MEMBER_PHONE = "01900000502";
const CUSTOMER_PHONE = "+8801911190501";

// A fixed, disjoint window (June 2027) — never used by any other test file
// or by prisma/seed.ts's own date ranges — so exact totals can be asserted
// directly instead of needing a baseline-delta against pre-existing data.
const JUNE_2027 = resolvePeriodRange({
  period: "custom",
  from: new Date("2027-06-01T12:00:00.000Z"),
  to: new Date("2027-06-30T12:00:00.000Z"),
});
const JUNE_15_2027 = resolvePeriodRange({
  period: "custom",
  from: new Date("2027-06-15T12:00:00.000Z"),
  to: new Date("2027-06-15T12:00:00.000Z"),
});

let creatorId: string;
let memberTeamId: string;
let customerId: string;
const cleanupTicketIds: string[] = [];

async function createTicket(opts: {
  key: string;
  createdAt: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  completedAt?: string;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-REPORTQ-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem: `Fixture ticket ${opts.key}`,
      createdBy: creatorId,
      status: opts.status,
      createdAt: new Date(opts.createdAt),
      completedAt: opts.completedAt ? new Date(opts.completedAt) : null,
    },
  });
  cleanupTicketIds.push(ticket.id);
  return ticket;
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");

  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Reports Query Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "ADMIN" },
  });
  creatorId = creator.id;

  const memberUser = await prisma.user.upsert({
    where: { phone: MEMBER_PHONE },
    update: {},
    create: { name: "Reports Query Fixture Member", phone: MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const member = await prisma.teamMember.upsert({
    where: { userId: memberUser.id },
    update: {},
    create: { userId: memberUser.id, name: "Reports Query Fixture Member", phone: MEMBER_PHONE },
  });
  memberTeamId = member.id;

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Reports Query Fixture Customer" } });
  customerId = customer.id;

  // June 15: one of each status, so the daily report has one of everything.
  await createTicket({ key: "D1", createdAt: "2027-06-15T08:00:00.000Z", status: "PENDING" });
  await createTicket({ key: "D2", createdAt: "2027-06-15T09:00:00.000Z", status: "IN_PROGRESS" });
  const d3 = await createTicket({
    key: "D3",
    createdAt: "2027-06-15T10:00:00.000Z",
    status: "COMPLETED",
    completedAt: "2027-06-15T11:00:00.000Z",
  });
  await createTicket({ key: "D4", createdAt: "2027-06-15T12:00:00.000Z", status: "CANCELLED" });

  await prisma.payment.create({
    data: { ticketId: d3.id, amount: "450.00", paymentMethod: "CASH", receivedBy: creatorId, receivedAt: new Date("2027-06-15T11:30:00.000Z") },
  });

  await prisma.ticketAssignment.create({
    data: { ticketId: d3.id, teamMemberId: memberTeamId, assignedBy: creatorId, assignedAt: new Date("2027-06-15T10:05:00.000Z") },
  });
});

afterAll(async () => {
  await prisma.paymentAuditLog.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.teamMember.deleteMany({ where: { id: memberTeamId } });
  await prisma.user.deleteMany({ where: { phone: { in: [CREATOR_PHONE, MEMBER_PHONE] } } });
});

describe("getDailyReport", () => {
  it("composes getDailySummary's fields with the resolved range, for a day with one ticket of each status", async () => {
    const report = await getDailyReport(JUNE_15_2027);

    expect(report.range).toEqual(JUNE_15_2027);
    expect(report.ticketsCreated).toBe(4); // D1, D2, D3, D4
    expect(report.ticketsPending).toBe(1); // D1
    expect(report.ticketsInProgress).toBe(1); // D2
    expect(report.ticketsCompleted).toBe(1); // D3
    expect(report.moneyReceived).toBe("450");
  });
});

describe("getMonthlyReport", () => {
  it("composes ticket stats and payment stats for the period, against a disjoint fixed month", async () => {
    // Cross-checked against the underlying dashboard functions directly,
    // rather than hardcoded numbers, so this test only proves getMonthlyReport
    // composes them correctly (their own correctness is covered by
    // features/dashboard/repository.test.ts).
    const [report, expectedTickets, expectedPayments] = await Promise.all([
      getMonthlyReport(JUNE_2027),
      getTicketStats(JUNE_2027),
      getPaymentStats(JUNE_2027),
    ]);

    expect(report.range).toEqual(JUNE_2027);
    expect(report.tickets).toEqual(expectedTickets);
    expect(report.payments).toEqual(expectedPayments);

    // Sanity check against this file's own fixtures, so the test isn't
    // vacuously true if both sides were wrong the same way.
    expect(report.tickets.total).toBeGreaterThanOrEqual(4);
    expect(report.tickets.pending).toBeGreaterThanOrEqual(1);
    expect(report.tickets.inProgress).toBeGreaterThanOrEqual(1);
    expect(report.tickets.cancelled).toBeGreaterThanOrEqual(1);
    expect(Number(report.payments.totalReceived)).toBeGreaterThanOrEqual(450);
  });
});

describe("getTeamMemberReport", () => {
  it("surfaces this fixture team member's assignment for the period", async () => {
    const report = await getTeamMemberReport(JUNE_2027);

    expect(report.range).toEqual(JUNE_2027);
    const row = report.members.find((member) => member.teamMemberId === memberTeamId);
    expect(row).toMatchObject({
      teamMemberName: "Reports Query Fixture Member",
      assignedCount: 1,
      completedCount: 1,
      pendingCount: 0,
      inProgressCount: 0,
    });
  });

  it("never includes a deactivated team member", async () => {
    await prisma.teamMember.update({ where: { id: memberTeamId }, data: { isActive: false } });
    try {
      const report = await getTeamMemberReport(JUNE_2027);
      expect(report.members.some((member) => member.teamMemberId === memberTeamId)).toBe(false);
    } finally {
      await prisma.teamMember.update({ where: { id: memberTeamId }, data: { isActive: true } });
    }
  });
});

describe("getCustomerReport", () => {
  it("combines the customer record with their report stats", async () => {
    const report = await getCustomerReport(customerId);

    expect(report).not.toBeNull();
    expect(report?.customer.id).toBe(customerId);
    expect(report?.totalTickets).toBe(4);
    expect(report?.totalPaymentsReceived).toBe("450");
  });

  it("returns null for a nonexistent customer", async () => {
    const report = await getCustomerReport("does-not-exist");
    expect(report).toBeNull();
  });
});
