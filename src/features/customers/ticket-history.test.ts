// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { getCustomerSupportHistory } from "./ticket-history";

const CREATOR_PHONE = "01900000101";
const MEMBER_PHONE = "01900000102";
const CUSTOMER_PHONE = "+8801911190040";

let creatorId: string;
let memberTeamId: string;
let customerId: string;
const ticketIds: Record<string, string> = {};

const baseFilters = { sortBy: "createdAt" as const, sortDir: "desc" as const };

async function createTicket(opts: {
  key: string;
  createdAt: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  archivedAt?: string;
  problem?: string;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem: opts.problem ?? `Fixture ticket ${opts.key}`,
      createdBy: creatorId,
      status: opts.status,
      createdAt: new Date(opts.createdAt),
      archivedAt: opts.archivedAt ? new Date(opts.archivedAt) : null,
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
    create: { name: "History Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "ADMIN" },
  });
  creatorId = creator.id;

  const memberUser = await prisma.user.upsert({
    where: { phone: MEMBER_PHONE },
    update: {},
    create: { name: "History Fixture Member", phone: MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const member = await prisma.teamMember.upsert({
    where: { userId: memberUser.id },
    update: {},
    create: { userId: memberUser.id, name: "History Fixture Member", phone: MEMBER_PHONE },
  });
  memberTeamId = member.id;

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "History Fixture Customer" } });
  customerId = customer.id;

  // Active tickets (archivedAt: null).
  await createTicket({ key: "A1", createdAt: "2026-01-03T12:00:00.000Z", status: "PENDING" });
  await createTicket({ key: "A2", createdAt: "2026-01-09T12:00:00.000Z", status: "IN_PROGRESS" });
  await createTicket({ key: "A3", createdAt: "2026-01-21T12:00:00.000Z", status: "COMPLETED" });

  // Archived tickets (archivedAt set) — interleaved by date with the active ones.
  await createTicket({ key: "R1", createdAt: "2026-01-05T12:00:00.000Z", status: "COMPLETED", archivedAt: "2026-05-01T00:00:00.000Z" });
  await createTicket({
    key: "R2",
    createdAt: "2026-01-15T12:00:00.000Z",
    status: "COMPLETED",
    archivedAt: "2026-05-01T00:00:00.000Z",
    problem: "Camera issue unique-marker-xyz",
  });
  await createTicket({ key: "R3", createdAt: "2026-01-27T12:00:00.000Z", status: "CANCELLED", archivedAt: "2026-05-01T00:00:00.000Z" });

  await prisma.payment.create({
    data: {
      ticketId: ticketIds.R2!,
      amount: "450.00",
      paymentMethod: "CASH",
      receivedBy: creatorId,
      receivedAt: new Date("2026-01-16T00:00:00.000Z"),
    },
  });

  await prisma.ticketAssignment.create({
    data: { ticketId: ticketIds.A2!, teamMemberId: memberTeamId, assignedBy: creatorId },
  });
});

afterAll(async () => {
  const ids = Object.values(ticketIds);
  await prisma.paymentAuditLog.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.teamMember.deleteMany({ where: { id: memberTeamId } });
  await prisma.user.deleteMany({ where: { phone: { in: [CREATOR_PHONE, MEMBER_PHONE] } } });
});

describe("getCustomerSupportHistory — merging active and archived", () => {
  it("reports the combined total across both sources", async () => {
    const page = await getCustomerSupportHistory(customerId, baseFilters, { page: 1, pageSize: 10 });
    expect(page.total).toBe(6);
  });

  it("does not duplicate any ticket across pages, and returns every ticket exactly once", async () => {
    const pageSize = 2;
    const seen = new Set<string>();

    for (let pageNumber = 1; pageNumber <= 3; pageNumber++) {
      const page = await getCustomerSupportHistory(customerId, baseFilters, { page: pageNumber, pageSize });
      expect(page.items).toHaveLength(pageSize);
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false); // no duplicate across pages
        seen.add(item.id);
      }
    }

    expect(seen.size).toBe(6);
    expect(seen).toEqual(new Set(Object.values(ticketIds)));
  });

  it("interleaves active and archived tickets correctly in descending date order", async () => {
    const page = await getCustomerSupportHistory(customerId, baseFilters, { page: 1, pageSize: 6 });

    // Full descending order by createdAt: R3, A3, R2, A2, R1, A1.
    expect(page.items.map((item) => item.id)).toEqual([
      ticketIds.R3,
      ticketIds.A3,
      ticketIds.R2,
      ticketIds.A2,
      ticketIds.R1,
      ticketIds.A1,
    ]);
    expect(page.items.map((item) => item.source)).toEqual([
      "archived",
      "active",
      "archived",
      "active",
      "archived",
      "active",
    ]);
  });

  it("paginates correctly across the active/archived boundary within a single page", async () => {
    // Page 2 of size 2 should be [R2 (archived), A2 (active)] — proving a
    // page can mix both sources without dropping or repeating rows.
    const page = await getCustomerSupportHistory(customerId, baseFilters, { page: 2, pageSize: 2 });
    expect(page.items.map((item) => item.id)).toEqual([ticketIds.R2, ticketIds.A2]);
    expect(page.items.map((item) => item.source)).toEqual(["archived", "active"]);
  });

  it("applies a status filter across both sources", async () => {
    const page = await getCustomerSupportHistory(
      customerId,
      { ...baseFilters, status: "COMPLETED" },
      { page: 1, pageSize: 10 },
    );
    // A3 (active, COMPLETED), R1 + R2 (archived, COMPLETED).
    expect(page.total).toBe(3);
    expect(new Set(page.items.map((item) => item.id))).toEqual(new Set([ticketIds.A3, ticketIds.R1, ticketIds.R2]));
  });

  it("applies a date range filter across both sources", async () => {
    const page = await getCustomerSupportHistory(
      customerId,
      { ...baseFilters, dateFrom: new Date("2026-01-10T00:00:00.000Z"), dateTo: new Date("2026-01-31T23:59:59.000Z") },
      { page: 1, pageSize: 10 },
    );
    // A3 (Jan 21, active), R2 (Jan 15, archived), R3 (Jan 27, archived).
    expect(page.total).toBe(3);
    expect(new Set(page.items.map((item) => item.id))).toEqual(new Set([ticketIds.A3, ticketIds.R2, ticketIds.R3]));
  });

  it("applies a text search across both sources, including archived tickets", async () => {
    const page = await getCustomerSupportHistory(
      customerId,
      { ...baseFilters, query: "unique-marker-xyz" },
      { page: 1, pageSize: 10 },
    );
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(ticketIds.R2);
    expect(page.items[0]?.source).toBe("archived");
  });

  it("enriches each row with assigned members and payment received, regardless of source", async () => {
    const page = await getCustomerSupportHistory(customerId, baseFilters, { page: 1, pageSize: 10 });

    const archivedWithPayment = page.items.find((item) => item.id === ticketIds.R2);
    expect(archivedWithPayment?.paymentReceived).toBe("450");

    const activeWithAssignment = page.items.find((item) => item.id === ticketIds.A2);
    expect(activeWithAssignment?.assignedMembers).toEqual([{ id: memberTeamId, name: "History Fixture Member" }]);

    const unpaidTicket = page.items.find((item) => item.id === ticketIds.A1);
    expect(unpaidTicket?.paymentReceived).toBe("0");
    expect(unpaidTicket?.assignedMembers).toEqual([]);
  });
});
