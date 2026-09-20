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

const { createTicketAction, changeTicketStatusAction, addTicketNoteAction, assignTeamMemberAction } = await import(
  "./actions"
);

const ADMIN_PHONE = "01900000061";
const TEAM_MEMBER_PHONE = "01900000062";
const CUSTOMER_PHONE = "+8801911190003";

let adminUserId: string;
let teamMemberUserId: string;
let teamMemberProfileId: string;
let customerId: string;
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
  const teamMemberUser = await prisma.user.upsert({
    where: { phone: TEAM_MEMBER_PHONE },
    update: { isActive: true, role: "TEAM_MEMBER" },
    create: { name: "Fixture Team Member", phone: TEAM_MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const teamMemberProfile = await prisma.teamMember.upsert({
    where: { userId: teamMemberUser.id },
    update: {},
    create: { userId: teamMemberUser.id, name: "Fixture Team Member", phone: TEAM_MEMBER_PHONE },
  });
  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Actions Fixture Customer" } });

  adminUserId = admin.id;
  teamMemberUserId = teamMemberUser.id;
  teamMemberProfileId = teamMemberProfile.id;
  customerId = customer.id;
  adminToken = (await createSession(admin.id)).token;
  teamMemberToken = (await createSession(teamMemberUser.id)).token;
});

afterAll(async () => {
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketNote.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, teamMemberUserId] } } });
  await prisma.teamMember.deleteMany({ where: { userId: teamMemberUserId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, teamMemberUserId] } } });
});

describe("createTicketAction authorization", () => {
  it("redirects to /login for an unauthenticated caller", async () => {
    mockedCookieValue = undefined;

    const error = await expectThrows(() => createTicketAction({ customerId, problem: "x" }));

    expect(error.digest).toContain("NEXT_REDIRECT");
    expect(error.digest).toContain("/login");
  });

  it("allows a TEAM_MEMBER to create a ticket", async () => {
    mockedCookieValue = teamMemberToken;

    const result = await createTicketAction({ customerId, problem: "Team member created this" });

    expect(result.status).toBe("success");
    if (result.status === "success") cleanupTicketIds.push(result.ticketId);
  });

  it("allows an ADMIN to create a ticket", async () => {
    mockedCookieValue = adminToken;

    const result = await createTicketAction({ customerId, problem: "Admin created this" });

    expect(result.status).toBe("success");
    if (result.status === "success") cleanupTicketIds.push(result.ticketId);
  });

  it("returns a field error for an empty problem description", async () => {
    mockedCookieValue = teamMemberToken;

    const result = await createTicketAction({ customerId, problem: "" });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors?.problem?.[0]).toBeDefined();
    }
  });
});

describe("changeTicketStatusAction / addTicketNoteAction / assignTeamMemberAction authorization", () => {
  it("requires authentication for status changes", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() =>
      changeTicketStatusAction({ ticketId: "irrelevant", newStatus: "IN_PROGRESS" }),
    );
    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("lets a TEAM_MEMBER change status, add a note, and assign another team member", async () => {
    mockedCookieValue = adminToken;
    const created = await createTicketAction({ customerId, problem: "Full workflow test" });
    if (created.status !== "success") throw new Error("fixture setup failed");
    cleanupTicketIds.push(created.ticketId);

    mockedCookieValue = teamMemberToken;

    const statusResult = await changeTicketStatusAction({ ticketId: created.ticketId, newStatus: "IN_PROGRESS" });
    expect(statusResult.status).toBe("success");

    const noteResult = await addTicketNoteAction({ ticketId: created.ticketId, note: "Investigating" });
    expect(noteResult.status).toBe("success");

    const assignResult = await assignTeamMemberAction({ ticketId: created.ticketId, teamMemberId: teamMemberProfileId });
    expect(assignResult.status).toBe("success");
  });
});
