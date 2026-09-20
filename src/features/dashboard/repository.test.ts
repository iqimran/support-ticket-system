// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { resolvePeriodRange } from "./periods";
import { getDailySummary, getPaymentStats, getRecentActivity, getTeamStats, getTicketStats } from "./repository";

// Known seed data for January 2026 (Asia/Dhaka). Every date below is at
// T12:00:00Z, safely mid-day so it lands on the same calendar day in both
// UTC and Dhaka (UTC+6) — no boundary ambiguity in the fixtures themselves.
const JANUARY_2026 = resolvePeriodRange({
  period: "custom",
  from: new Date("2026-01-01T12:00:00.000Z"),
  to: new Date("2026-01-31T12:00:00.000Z"),
});

const CREATOR_PHONE = "01900000091";
const MEMBER_ALPHA_PHONE = "01900000092";
const MEMBER_BETA_PHONE = "01900000093";
const CUSTOMER_PHONE = "+8801911190030";

let creatorId: string;
let customerId: string;
let alphaTeamMemberId: string;
let alphaUserId: string;
let betaTeamMemberId: string;
let betaUserId: string;
const ticketIds: Record<string, string> = {};
const cleanupUserIds: string[] = [];

async function createTicket(opts: {
  key: string;
  createdAt: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  completedAt?: string;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem: `Fixture ticket ${opts.key}`,
      createdBy: creatorId,
      status: opts.status,
      createdAt: new Date(opts.createdAt),
      completedAt: opts.completedAt ? new Date(opts.completedAt) : null,
    },
  });
  ticketIds[opts.key] = ticket.id;
  return ticket;
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");

  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Dashboard Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "ADMIN" },
  });
  creatorId = creator.id;
  cleanupUserIds.push(creator.id);

  const alphaUser = await prisma.user.upsert({
    where: { phone: MEMBER_ALPHA_PHONE },
    update: {},
    create: { name: "Alpha Member", phone: MEMBER_ALPHA_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const alpha = await prisma.teamMember.upsert({
    where: { userId: alphaUser.id },
    update: {},
    create: { userId: alphaUser.id, name: "Alpha Member", phone: MEMBER_ALPHA_PHONE },
  });
  alphaUserId = alphaUser.id;
  alphaTeamMemberId = alpha.id;
  cleanupUserIds.push(alphaUser.id);

  const betaUser = await prisma.user.upsert({
    where: { phone: MEMBER_BETA_PHONE },
    update: {},
    create: { name: "Beta Member", phone: MEMBER_BETA_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const beta = await prisma.teamMember.upsert({
    where: { userId: betaUser.id },
    update: {},
    create: { userId: betaUser.id, name: "Beta Member", phone: MEMBER_BETA_PHONE },
  });
  betaUserId = betaUser.id;
  betaTeamMemberId = beta.id;
  cleanupUserIds.push(betaUser.id);

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Dashboard Fixture Customer" } });
  customerId = customer.id;

  // T1: created in range, still PENDING.
  await createTicket({ key: "T1", createdAt: "2026-01-05T12:00:00.000Z", status: "PENDING" });
  // T2: created in range, still IN_PROGRESS.
  await createTicket({ key: "T2", createdAt: "2026-01-10T12:00:00.000Z", status: "IN_PROGRESS" });
  // T3: created AND completed in range.
  await createTicket({
    key: "T3",
    createdAt: "2026-01-15T12:00:00.000Z",
    status: "COMPLETED",
    completedAt: "2026-01-20T12:00:00.000Z",
  });
  // T4: created BEFORE the range (December), but completed INSIDE it —
  // the exact scenario the creation/completion date distinction covers.
  await createTicket({
    key: "T4",
    createdAt: "2025-12-20T12:00:00.000Z",
    status: "COMPLETED",
    completedAt: "2026-01-08T12:00:00.000Z",
  });
  // T5: created in range, CANCELLED.
  await createTicket({ key: "T5", createdAt: "2026-01-25T12:00:00.000Z", status: "CANCELLED" });
  // T6: created AFTER the range (February) — must be excluded entirely.
  await createTicket({ key: "T6", createdAt: "2026-02-05T12:00:00.000Z", status: "PENDING" });
  // T7: created in range on the same day used for the daily-summary test.
  await createTicket({ key: "T7", createdAt: "2026-01-20T12:00:00.000Z", status: "PENDING" });

  await prisma.payment.createMany({
    data: [
      // In range.
      { ticketId: ticketIds.T3!, amount: "100.00", paymentMethod: "CASH", receivedBy: alphaUserId, receivedAt: new Date("2026-01-12T12:00:00.000Z") },
      { ticketId: ticketIds.T3!, amount: "200.00", paymentMethod: "BANK", receivedBy: betaUserId, receivedAt: new Date("2026-01-20T12:00:00.000Z") },
      { ticketId: ticketIds.T1!, amount: "300.00", paymentMethod: "CASH", receivedBy: alphaUserId, receivedAt: new Date("2026-01-28T12:00:00.000Z") },
      // Outside range (December) — must be excluded.
      { ticketId: ticketIds.T4!, amount: "1000.00", paymentMethod: "CASH", receivedBy: alphaUserId, receivedAt: new Date("2025-12-25T12:00:00.000Z") },
    ],
  });

  await prisma.ticketAssignment.createMany({
    data: [
      { ticketId: ticketIds.T1!, teamMemberId: alphaTeamMemberId, assignedBy: creatorId, assignedAt: new Date("2026-01-06T12:00:00.000Z") },
      { ticketId: ticketIds.T2!, teamMemberId: alphaTeamMemberId, assignedBy: creatorId, assignedAt: new Date("2026-01-11T12:00:00.000Z") },
      { ticketId: ticketIds.T3!, teamMemberId: alphaTeamMemberId, assignedBy: creatorId, assignedAt: new Date("2026-01-17T12:00:00.000Z") },
      { ticketId: ticketIds.T3!, teamMemberId: betaTeamMemberId, assignedBy: creatorId, assignedAt: new Date("2026-01-16T12:00:00.000Z") },
      { ticketId: ticketIds.T5!, teamMemberId: betaTeamMemberId, assignedBy: creatorId, assignedAt: new Date("2026-01-26T12:00:00.000Z") },
      // Assigned in December (outside range) but the ticket was completed
      // inside it — should still count toward Alpha's completedCount.
      { ticketId: ticketIds.T4!, teamMemberId: alphaTeamMemberId, assignedBy: creatorId, assignedAt: new Date("2025-12-22T12:00:00.000Z") },
    ],
  });
});

afterAll(async () => {
  const ids = Object.values(ticketIds);
  await prisma.paymentAuditLog.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.teamMember.deleteMany({ where: { userId: { in: [alphaUserId, betaUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
});

describe("getTicketStats — known seed data for January 2026", () => {
  it("counts total/pending/in-progress/cancelled by creation date, and completed by completion date", async () => {
    const stats = await getTicketStats(JANUARY_2026);

    expect(stats.total).toBe(5); // T1, T2, T3, T5, T7 (T4 created Dec, T6 created Feb — excluded)
    expect(stats.pending).toBe(2); // T1, T7
    expect(stats.inProgress).toBe(1); // T2
    expect(stats.cancelled).toBe(1); // T5
    // T3 (created+completed in Jan) AND T4 (created Dec, completed Jan) —
    // proves completed uses completedAt, not createdAt.
    expect(stats.completed).toBe(2);
  });
});

describe("getPaymentStats — known seed data for January 2026", () => {
  it("sums/counts/averages only payments whose receivedAt falls in range", async () => {
    const stats = await getPaymentStats(JANUARY_2026);

    expect(stats.totalReceived).toBe("600"); // 100 + 200 + 300; the 1000 in December is excluded
    expect(stats.transactionCount).toBe(3);
    expect(stats.averagePayment).toBe("200"); // 600 / 3, exactly
  });
});

describe("getTeamStats — known seed data for January 2026", () => {
  it("computes a correct per-member breakdown, ordered by name", async () => {
    const stats = await getTeamStats(JANUARY_2026);

    const alpha = stats.find((row) => row.teamMemberId === alphaTeamMemberId);
    const beta = stats.find((row) => row.teamMemberId === betaTeamMemberId);
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();

    // Alpha's assignedCount excludes the December assignment (T4) even
    // though T4 still counts toward completedCount below — assignedCount
    // is scoped by assignedAt, completedCount by the ticket's completedAt.
    expect(alpha!.assignedCount).toBe(3); // T1, T2, T3
    expect(alpha!.pendingCount).toBe(1); // T1
    expect(alpha!.inProgressCount).toBe(1); // T2
    expect(alpha!.completedCount).toBe(2); // T3 (completed Jan) + T4 (assigned Dec, completed Jan)
    expect(alpha!.totalReceived).toBe("400"); // 100 + 300

    expect(beta!.assignedCount).toBe(2); // T3, T5
    expect(beta!.pendingCount).toBe(0);
    expect(beta!.inProgressCount).toBe(0);
    expect(beta!.completedCount).toBe(1); // T3
    expect(beta!.totalReceived).toBe("200");

    const alphaIndex = stats.findIndex((row) => row.teamMemberId === alphaTeamMemberId);
    const betaIndex = stats.findIndex((row) => row.teamMemberId === betaTeamMemberId);
    expect(alphaIndex).toBeLessThan(betaIndex); // ordered by name ascending
  });

  it("does not double-count a ticket assigned to only one of two members", async () => {
    // T1/T2 are only assigned to Alpha — Beta's pending/in-progress counts
    // must not pick them up via the join.
    const stats = await getTeamStats(JANUARY_2026);
    const beta = stats.find((row) => row.teamMemberId === betaTeamMemberId)!;
    expect(beta.pendingCount).toBe(0);
    expect(beta.inProgressCount).toBe(0);
  });
});

describe("getDailySummary — known seed data for January 20, 2026", () => {
  it("scopes each figure to its own date field for that single day", async () => {
    const day = resolvePeriodRange({
      period: "custom",
      from: new Date("2026-01-20T12:00:00.000Z"),
      to: new Date("2026-01-20T12:00:00.000Z"),
    });

    const summary = await getDailySummary(day);

    expect(summary.ticketsCreated).toBe(1); // T7
    expect(summary.ticketsCompleted).toBe(1); // T3 (completedAt Jan 20)
    expect(summary.ticketsPending).toBe(1); // T7, created that day, still pending
    expect(summary.ticketsInProgress).toBe(0);
    expect(summary.moneyReceived).toBe("200"); // the Beta payment received Jan 20
  });

  it("[zero case] a day with no activity returns all zeros, not an error", async () => {
    const emptyDay = resolvePeriodRange({
      period: "custom",
      from: new Date("2026-01-31T12:00:00.000Z"),
      to: new Date("2026-01-31T12:00:00.000Z"),
    });

    const summary = await getDailySummary(emptyDay);

    expect(summary.ticketsCreated).toBe(0);
    expect(summary.ticketsCompleted).toBe(0);
    expect(summary.ticketsPending).toBe(0);
    expect(summary.ticketsInProgress).toBe(0);
    expect(summary.moneyReceived).toBe("0");
  });
});

describe("getRecentActivity", () => {
  it("returns bounded, correctly-shaped lists without loading the full tables", async () => {
    const activity = await getRecentActivity();

    expect(activity.recentTickets.length).toBeLessThanOrEqual(5);
    expect(activity.recentCompletedTickets.length).toBeLessThanOrEqual(5);
    expect(activity.recentPayments.length).toBeLessThanOrEqual(5);
    for (const ticket of activity.recentCompletedTickets) {
      expect(ticket.completedAt).not.toBeNull();
    }
  });
});
