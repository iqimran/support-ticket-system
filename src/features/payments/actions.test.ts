// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

let mockedCookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mockedCookieValue === undefined ? undefined : { name, value: mockedCookieValue }),
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { recordPaymentAction, updatePaymentAction, getPaymentAuditLogsAction, getDateRangePaymentTotalAction } =
  await import("./actions");

const ADMIN_PHONE = "01900000081";
const TEAM_MEMBER_PHONE = "01900000082";
const CUSTOMER_PHONE = "+8801911190020";

let adminUserId: string;
let teamMemberUserId: string;
let customerId: string;
let ticketId: string;
let adminToken: string;
let teamMemberToken: string;
const cleanupTicketIds: string[] = [];

async function expectThrows(fn: () => Promise<unknown>): Promise<{ digest?: string }> {
  try {
    await fn();
  } catch (error) {
    return error as { digest?: string };
  }
  throw new Error("expected function to throw");
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");

  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { isActive: true, role: "ADMIN" },
    create: { name: "Fixture Admin", phone: ADMIN_PHONE, passwordHash, role: "ADMIN" },
  });
  const teamMember = await prisma.user.upsert({
    where: { phone: TEAM_MEMBER_PHONE },
    update: { isActive: true, role: "TEAM_MEMBER" },
    create: { name: "Fixture Team Member", phone: TEAM_MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Payment Actions Customer" } });
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId: customer.id,
      problem: "Actions test ticket",
      createdBy: admin.id,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  adminUserId = admin.id;
  teamMemberUserId = teamMember.id;
  customerId = customer.id;
  ticketId = ticket.id;
  cleanupTicketIds.push(ticket.id);
  adminToken = (await createSession(admin.id)).token;
  teamMemberToken = (await createSession(teamMember.id)).token;
});

afterAll(async () => {
  await prisma.paymentAuditLog.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, teamMemberUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, teamMemberUserId] } } });
});

describe("recordPaymentAction / updatePaymentAction authorization", () => {
  it("redirects to /login for an unauthenticated caller recording a payment", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() =>
      recordPaymentAction({ ticketId, amount: "100", paymentMethod: "CASH", receivedAt: new Date().toISOString() }),
    );
    expect(error.digest).toContain("NEXT_REDIRECT");
    expect(error.digest).toContain("/login");
  });

  it("allows a TEAM_MEMBER to record a payment", async () => {
    mockedCookieValue = teamMemberToken;
    const result = await recordPaymentAction({
      ticketId,
      amount: "250",
      paymentMethod: "CASH",
      receivedAt: new Date().toISOString(),
    });
    expect(result.status).toBe("success");
  });

  it("allows an ADMIN to record a payment", async () => {
    mockedCookieValue = adminToken;
    const result = await recordPaymentAction({
      ticketId,
      amount: "350",
      paymentMethod: "BANK",
      receivedAt: new Date().toISOString(),
    });
    expect(result.status).toBe("success");
  });

  it("allows a TEAM_MEMBER to update a payment created by anyone", async () => {
    mockedCookieValue = adminToken;
    const created = await recordPaymentAction({
      ticketId,
      amount: "400",
      paymentMethod: "CASH",
      receivedAt: new Date().toISOString(),
    });
    if (created.status !== "success" || !("paymentId" in created)) throw new Error("fixture setup failed");

    mockedCookieValue = teamMemberToken;
    const updated = await updatePaymentAction(created.paymentId, {
      amount: "425",
      paymentMethod: "BANK",
      receivedAt: new Date().toISOString(),
    });
    expect(updated.status).toBe("success");
  });
});

describe("payment audit log access — ADMIN only", () => {
  it("redirects unauthenticated callers to /login", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() => getPaymentAuditLogsAction({}));
    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("blocks a TEAM_MEMBER with a 404, not the data", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() => getPaymentAuditLogsAction({}));
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows an ADMIN to read the audit log", async () => {
    mockedCookieValue = adminToken;
    const result = await getPaymentAuditLogsAction({});
    expect(result.total).toBeGreaterThan(0);
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("blocks a TEAM_MEMBER from the date-range total (also financial audit data)", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() =>
      getDateRangePaymentTotalAction({ from: "2020-01-01", to: "2030-01-01" }),
    );
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows an ADMIN to compute a date-range total", async () => {
    mockedCookieValue = adminToken;
    const result = await getDateRangePaymentTotalAction({ from: "2020-01-01", to: "2030-01-01" });
    expect("total" in result).toBe(true);
  });
});
