// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { archiveSearchSchema } from "./schemas";
import { findArchivedTicketBundle, searchArchivedTickets } from "./repository";
import { getArchivedTicketDetail } from "./queries";

const CREATOR_PHONE = "01900000301";
const MEMBER_PHONE = "01900000302";
const CUSTOMER_A_PHONE = "+8801911190301";
const CUSTOMER_B_PHONE = "+8801911190302";

let creatorId: string;
let memberTeamId: string;
let customerAId: string;
let customerBId: string;
let batchId: string;
const cleanupTicketIds: string[] = [];

const baseSearch = archiveSearchSchema.parse({});

function ticketData(overrides: {
  id: string;
  ticketNumber: string;
  customerId: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
}) {
  return {
    id: overrides.id,
    ticketNumber: overrides.ticketNumber,
    customerId: overrides.customerId,
    problem: "Fixture archived ticket",
    status: overrides.status,
    priority: "MEDIUM" as const,
    createdBy: creatorId,
    createdAt: overrides.createdAt,
    updatedAt: overrides.createdAt,
    archiveBatchId: batchId,
  };
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");

  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Archive Search Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "ADMIN" },
  });
  creatorId = creator.id;

  const memberUser = await prisma.user.upsert({
    where: { phone: MEMBER_PHONE },
    update: {},
    create: { name: "Archive Search Fixture Member", phone: MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const member = await prisma.teamMember.upsert({
    where: { userId: memberUser.id },
    update: {},
    create: { userId: memberUser.id, name: "Archive Search Fixture Member", phone: MEMBER_PHONE },
  });
  memberTeamId = member.id;

  // Names deliberately outside the dev-seed script's realistic Bengali name
  // pools (prisma/seed/data.ts) — this shared dev database always carries
  // ~120 seeded customers, so a fixture named e.g. "Karim ..." risks
  // colliding with a real seeded "Karim" and inflating search results.
  const customerA = await prisma.customer.create({ data: { phone: CUSTOMER_A_PHONE, name: "Zyxatest Alphaperson" } });
  customerAId = customerA.id;
  const customerB = await prisma.customer.create({ data: { phone: CUSTOMER_B_PHONE, name: "Zyxatest Betaperson" } });
  customerBId = customerB.id;

  const batch = await prisma.archiveBatch.create({ data: { cutoffDate: new Date("2025-06-01") } });
  batchId = batch.id;

  // Ticket numbers use a distinctive "ZYXATEST" marker with long (6-digit)
  // numeric tags — short digit fragments (e.g. "001") risk coincidentally
  // matching a substring of one of the ~120 seeded customers' random
  // 8-digit phone numbers, inflating "search by ticket number" results.
  // Ticket 1: customer A, COMPLETED, Jan 2025, full related-record history.
  const ticket1 = await prisma.ticketArchive.create({
    data: ticketData({
      id: "archivesearchfixture01",
      ticketNumber: "TKT-ZYXATEST-100001",
      customerId: customerAId,
      status: "COMPLETED",
      createdAt: new Date("2025-01-05T00:00:00.000Z"),
    }),
  });
  cleanupTicketIds.push(ticket1.id);

  await prisma.ticketAssignmentArchive.create({
    data: { id: "archsearchassign01", ticketId: ticket1.id, teamMemberId: memberTeamId, assignedBy: creatorId, assignedAt: ticket1.createdAt },
  });
  await prisma.ticketStatusHistoryArchive.create({
    data: {
      id: "archsearchhistory01",
      ticketId: ticket1.id,
      oldStatus: "PENDING",
      newStatus: "COMPLETED",
      changedBy: creatorId,
      note: "Resolved",
      createdAt: ticket1.createdAt,
    },
  });
  await prisma.ticketNoteArchive.create({
    data: { id: "archsearchnote01", ticketId: ticket1.id, createdBy: creatorId, note: "Fixture note", createdAt: ticket1.createdAt, updatedAt: ticket1.createdAt },
  });
  const payment1 = await prisma.paymentArchive.create({
    data: {
      id: "archsearchpayment01",
      ticketId: ticket1.id,
      amount: "1000.00",
      paymentMethod: "CASH",
      receivedBy: creatorId,
      receivedAt: ticket1.createdAt,
      createdAt: ticket1.createdAt,
      updatedAt: ticket1.createdAt,
    },
  });
  await prisma.paymentAuditLogArchive.create({
    data: {
      id: "archsearchauditlog01",
      paymentId: payment1.id,
      ticketId: ticket1.id,
      action: "CREATED",
      newAmount: "1000.00",
      changedBy: creatorId,
      createdAt: ticket1.createdAt,
    },
  });

  // Ticket 2: customer B, PENDING, Feb 2025, no related records.
  const ticket2 = await prisma.ticketArchive.create({
    data: ticketData({
      id: "archivesearchfixture02",
      ticketNumber: "TKT-ZYXATEST-100002",
      customerId: customerBId,
      status: "PENDING",
      createdAt: new Date("2025-02-10T00:00:00.000Z"),
    }),
  });
  cleanupTicketIds.push(ticket2.id);

  // Ticket 3: customer A, CANCELLED, March 2025, no related records.
  const ticket3 = await prisma.ticketArchive.create({
    data: ticketData({
      id: "archivesearchfixture03",
      ticketNumber: "TKT-ZYXATEST-100003",
      customerId: customerAId,
      status: "CANCELLED",
      createdAt: new Date("2025-03-15T00:00:00.000Z"),
    }),
  });
  cleanupTicketIds.push(ticket3.id);
});

afterAll(async () => {
  await prisma.paymentAuditLogArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.paymentArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketNoteArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketStatusHistoryArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketAssignmentArchive.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketArchive.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.archiveBatch.delete({ where: { id: batchId } });
  await prisma.customer.deleteMany({ where: { id: { in: [customerAId, customerBId] } } });
  await prisma.teamMember.deleteMany({ where: { id: memberTeamId } });
  await prisma.user.deleteMany({ where: { phone: { in: [CREATOR_PHONE, MEMBER_PHONE] } } });
});

describe("searchArchivedTickets", () => {
  // This shared dev database always carries ~520 seeded archived tickets
  // (see prisma/seed.ts) alongside these 3 fixtures, so every assertion
  // below is scoped to "ZYXATEST" and/or these fixtures' own ids —
  // asserting an exact global `total` would be broken by design (and was,
  // before this file was updated for the seed script).
  it("finds a ticket by (partial) ticket number", async () => {
    const result = await searchArchivedTickets({ ...baseSearch, query: "ZYXATEST-100002" });
    expect(result.total).toBe(1);
    expect(result.items[0]?.ticketNumber).toBe("TKT-ZYXATEST-100002");
  });

  it("finds every ticket for a customer by phone", async () => {
    const phoneDigits = CUSTOMER_A_PHONE.replace(/\D/g, "").slice(-10);
    const result = await searchArchivedTickets({ ...baseSearch, query: phoneDigits });
    expect(result.total).toBe(2);
    expect(new Set(result.items.map((item) => item.ticketNumber))).toEqual(
      new Set(["TKT-ZYXATEST-100001", "TKT-ZYXATEST-100003"]),
    );
  });

  it("finds a ticket by (partial) customer name", async () => {
    const result = await searchArchivedTickets({ ...baseSearch, query: "Zyxatest Betaperson" });
    expect(result.total).toBe(1);
    expect(result.items[0]?.customer.name).toBe("Zyxatest Betaperson");
  });

  it("filters by status", async () => {
    // "ZYXATEST" alone (no digits) matches only these 3 fixtures via
    // ticketNumber — it can't also match a customer name/phone — so
    // combining it with the status filter safely scopes to just this set.
    const result = await searchArchivedTickets({ ...baseSearch, query: "ZYXATEST", status: "COMPLETED" });
    expect(result.total).toBe(1);
    expect(result.items[0]?.ticketNumber).toBe("TKT-ZYXATEST-100001");
  });

  it("filters by original creation date range", async () => {
    const result = await searchArchivedTickets({
      ...baseSearch,
      query: "ZYXATEST",
      dateFrom: new Date("2025-02-01T00:00:00.000Z"),
      dateTo: new Date("2025-02-28T23:59:59.000Z"),
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.ticketNumber).toBe("TKT-ZYXATEST-100002");
  });

  it("returns no results for a query that matches nothing", async () => {
    const result = await searchArchivedTickets({ ...baseSearch, query: "no-such-ticket-or-customer-xyz" });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("paginates at the database level: each page is a distinct, correctly-ordered slice", async () => {
    const params = { ...baseSearch, query: "ZYXATEST", sortBy: "createdAt" as const, sortDir: "asc" as const, pageSize: 1 };

    const page1 = await searchArchivedTickets({ ...params, page: 1 });
    const page2 = await searchArchivedTickets({ ...params, page: 2 });
    const page3 = await searchArchivedTickets({ ...params, page: 3 });

    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page3.total).toBe(3);
    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page3.items).toHaveLength(1);
    expect([page1, page2, page3].map((p) => p.items[0]?.ticketNumber)).toEqual([
      "TKT-ZYXATEST-100001",
      "TKT-ZYXATEST-100002",
      "TKT-ZYXATEST-100003",
    ]);
  });

  it("returns results shaped for display: ticket number, customer, problem, status, original creation date, archived date", async () => {
    const result = await searchArchivedTickets({ ...baseSearch, query: "ZYXATEST-100001" });
    const item = result.items[0];
    expect(item).toMatchObject({
      ticketNumber: "TKT-ZYXATEST-100001",
      problem: "Fixture archived ticket",
      status: "COMPLETED",
      customer: { name: "Zyxatest Alphaperson" },
    });
    expect(item?.createdAt).toBeInstanceOf(Date);
    expect(item?.archivedAt).toBeInstanceOf(Date);
  });
});

describe("findArchivedTicketBundle — permissions", () => {
  it("excludes payment audit logs entirely when includePaymentAudit is false (team member)", async () => {
    const bundle = await findArchivedTicketBundle("archivesearchfixture01", { includePaymentAudit: false });
    expect(bundle).not.toBeNull();
    expect(bundle?.paymentAuditLogs).toBeNull();
    // Regular payments (not the audit trail) are still visible to everyone.
    expect(bundle?.payments).toHaveLength(1);
    expect(bundle?.payments[0]?.amount.toString()).toBe("1000");
  });

  it("includes payment audit logs when includePaymentAudit is true (admin)", async () => {
    const bundle = await findArchivedTicketBundle("archivesearchfixture01", { includePaymentAudit: true });
    expect(bundle?.paymentAuditLogs).toHaveLength(1);
    expect(bundle?.paymentAuditLogs?.[0]).toMatchObject({ action: "CREATED", changedByName: "Archive Search Fixture Creator" });
  });

  it("resolves names for every related record type", async () => {
    const bundle = await findArchivedTicketBundle("archivesearchfixture01", { includePaymentAudit: true });
    expect(bundle?.creatorName).toBe("Archive Search Fixture Creator");
    expect(bundle?.assignments[0]).toMatchObject({
      teamMemberName: "Archive Search Fixture Member",
      assignerName: "Archive Search Fixture Creator",
    });
    expect(bundle?.statusHistory[0]?.changedByName).toBe("Archive Search Fixture Creator");
    expect(bundle?.notes[0]?.creatorName).toBe("Archive Search Fixture Creator");
    expect(bundle?.payments[0]?.receiverName).toBe("Archive Search Fixture Creator");
    expect(bundle?.customer?.name).toBe("Zyxatest Alphaperson");
  });

  it("returns empty (not missing) related-record arrays for a ticket with no history", async () => {
    const bundle = await findArchivedTicketBundle("archivesearchfixture02", { includePaymentAudit: true });
    expect(bundle?.assignments).toEqual([]);
    expect(bundle?.statusHistory).toEqual([]);
    expect(bundle?.notes).toEqual([]);
    expect(bundle?.payments).toEqual([]);
    expect(bundle?.paymentAuditLogs).toEqual([]);
  });

  it("returns null for a nonexistent archived ticket", async () => {
    const bundle = await findArchivedTicketBundle("does-not-exist", { includePaymentAudit: true });
    expect(bundle).toBeNull();
  });
});

describe("getArchivedTicketDetail — timeline", () => {
  it("builds a timeline covering creation, status change, note, assignment, and payment", async () => {
    const detail = await getArchivedTicketDetail("archivesearchfixture01", { includePaymentAudit: false });
    expect(detail).not.toBeNull();
    const types = detail?.timeline.map((entry) => entry.type).sort();
    expect(types).toEqual(["assignment", "created", "note", "payment", "status_change"]);
  });

  it("returns null for a nonexistent archived ticket", async () => {
    const detail = await getArchivedTicketDetail("does-not-exist", { includePaymentAudit: false });
    expect(detail).toBeNull();
  });
});
