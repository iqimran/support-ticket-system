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

const {
  createTicketAction,
  changeTicketStatusAction,
  addTicketNoteAction,
  assignTeamMembersAction,
  assignSelfAction,
  removeAssignmentAction,
} = await import("./actions");

const ADMIN_PHONE = "01900000061";
const TEAM_MEMBER_PHONE = "01900000062";
const TEAM_MEMBER_B_PHONE = "01900000063";
const INACTIVE_MEMBER_PHONE = "01900000064";
const CUSTOMER_PHONE = "+8801911190003";

let adminUserId: string;
let teamMemberUserId: string;
let teamMemberProfileId: string;
let teamMemberBUserId: string;
let teamMemberBProfileId: string;
let inactiveMemberUserId: string;
let inactiveMemberProfileId: string;
let customerId: string;
let adminToken: string;
let teamMemberToken: string;
let teamMemberBToken: string;
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

  const teamMemberBUser = await prisma.user.upsert({
    where: { phone: TEAM_MEMBER_B_PHONE },
    update: { isActive: true, role: "TEAM_MEMBER" },
    create: { name: "Fixture Team Member B", phone: TEAM_MEMBER_B_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const teamMemberBProfile = await prisma.teamMember.upsert({
    where: { userId: teamMemberBUser.id },
    update: {},
    create: { userId: teamMemberBUser.id, name: "Fixture Team Member B", phone: TEAM_MEMBER_B_PHONE },
  });

  const inactiveMemberUser = await prisma.user.upsert({
    where: { phone: INACTIVE_MEMBER_PHONE },
    update: { isActive: true, role: "TEAM_MEMBER" },
    create: { name: "Fixture Inactive Member", phone: INACTIVE_MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const inactiveMemberProfile = await prisma.teamMember.upsert({
    where: { userId: inactiveMemberUser.id },
    update: { isActive: false },
    create: {
      userId: inactiveMemberUser.id,
      name: "Fixture Inactive Member",
      phone: INACTIVE_MEMBER_PHONE,
      isActive: false,
    },
  });

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Actions Fixture Customer" } });

  adminUserId = admin.id;
  teamMemberUserId = teamMemberUser.id;
  teamMemberProfileId = teamMemberProfile.id;
  teamMemberBUserId = teamMemberBUser.id;
  teamMemberBProfileId = teamMemberBProfile.id;
  inactiveMemberUserId = inactiveMemberUser.id;
  inactiveMemberProfileId = inactiveMemberProfile.id;
  customerId = customer.id;
  adminToken = (await createSession(admin.id)).token;
  teamMemberToken = (await createSession(teamMemberUser.id)).token;
  teamMemberBToken = (await createSession(teamMemberBUser.id)).token;
});

afterAll(async () => {
  const allUserIds = [adminUserId, teamMemberUserId, teamMemberBUserId, inactiveMemberUserId];
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketNote.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.session.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.teamMember.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
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

describe("changeTicketStatusAction / addTicketNoteAction authorization", () => {
  it("requires authentication for status changes", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() =>
      changeTicketStatusAction({ ticketId: "irrelevant", newStatus: "IN_PROGRESS" }),
    );
    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("lets a TEAM_MEMBER change status and add a note", async () => {
    mockedCookieValue = adminToken;
    const created = await createTicketAction({ customerId, problem: "Full workflow test" });
    if (created.status !== "success") throw new Error("fixture setup failed");
    cleanupTicketIds.push(created.ticketId);

    mockedCookieValue = teamMemberToken;

    const statusResult = await changeTicketStatusAction({ ticketId: created.ticketId, newStatus: "IN_PROGRESS" });
    expect(statusResult.status).toBe("success");

    const noteResult = await addTicketNoteAction({ ticketId: created.ticketId, note: "Investigating" });
    expect(noteResult.status).toBe("success");
  });
});

describe("assignment workflow", () => {
  async function createFixtureTicket(): Promise<string> {
    mockedCookieValue = adminToken;
    const created = await createTicketAction({ customerId, problem: "Assignment workflow test" });
    if (created.status !== "success") throw new Error("fixture setup failed");
    cleanupTicketIds.push(created.ticketId);
    return created.ticketId;
  }

  it("requires authentication", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() =>
      assignTeamMembersAction({ ticketId: "irrelevant", teamMemberIds: [teamMemberProfileId] }),
    );
    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("lets an ADMIN assign one team member", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = adminToken;

    const result = await assignTeamMembersAction({ ticketId, teamMemberIds: [teamMemberProfileId] });
    expect(result.status).toBe("success");
  });

  it("lets an ADMIN assign multiple team members in one call", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = adminToken;

    const result = await assignTeamMembersAction({
      ticketId,
      teamMemberIds: [teamMemberProfileId, teamMemberBProfileId],
    });
    expect(result.status).toBe("success");

    const assignments = await prisma.ticketAssignment.findMany({ where: { ticketId } });
    expect(assignments).toHaveLength(2);
  });

  it("lets a TEAM_MEMBER assign themselves", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = teamMemberToken;

    const result = await assignSelfAction(ticketId);
    expect(result.status).toBe("success");

    const assignment = await prisma.ticketAssignment.findUnique({
      where: { ticketId_teamMemberId: { ticketId, teamMemberId: teamMemberProfileId } },
    });
    expect(assignment).not.toBeNull();
  });

  it("lets a TEAM_MEMBER assign another active team member", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = teamMemberToken;

    const result = await assignTeamMembersAction({ ticketId, teamMemberIds: [teamMemberBProfileId] });
    expect(result.status).toBe("success");
  });

  it("does not allow assigning an inactive team member", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = teamMemberToken;

    const result = await assignTeamMembersAction({ ticketId, teamMemberIds: [inactiveMemberProfileId] });
    expect(result.status).toBe("error");

    const assignment = await prisma.ticketAssignment.findUnique({
      where: { ticketId_teamMemberId: { ticketId, teamMemberId: inactiveMemberProfileId } },
    });
    expect(assignment).toBeNull();
  });

  it("records an audit log entry for each assignment created in a batch", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = adminToken;

    await assignTeamMembersAction({ ticketId, teamMemberIds: [teamMemberProfileId, teamMemberBProfileId] });

    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Ticket", entityId: ticketId, action: "ticket.assigned" },
    });
    expect(entries).toHaveLength(2);
  });

  it("lets an ADMIN remove any team member's assignment", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = teamMemberToken;
    await assignSelfAction(ticketId);
    const assignment = await prisma.ticketAssignment.findUniqueOrThrow({
      where: { ticketId_teamMemberId: { ticketId, teamMemberId: teamMemberProfileId } },
    });

    mockedCookieValue = adminToken;
    const result = await removeAssignmentAction(assignment.id, ticketId);
    expect(result.status).toBe("success");

    const auditEntry = await prisma.auditLog.findFirst({
      where: { entityType: "Ticket", entityId: ticketId, action: "ticket.assignment_removed" },
    });
    expect(auditEntry).not.toBeNull();
  });

  it("lets a TEAM_MEMBER remove their own assignment", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = teamMemberToken;
    await assignSelfAction(ticketId);
    const assignment = await prisma.ticketAssignment.findUniqueOrThrow({
      where: { ticketId_teamMemberId: { ticketId, teamMemberId: teamMemberProfileId } },
    });

    const result = await removeAssignmentAction(assignment.id, ticketId);
    expect(result.status).toBe("success");
  });

  it("forbids a TEAM_MEMBER from removing a different team member's assignment", async () => {
    const ticketId = await createFixtureTicket();
    mockedCookieValue = teamMemberToken;
    await assignSelfAction(ticketId);
    const assignment = await prisma.ticketAssignment.findUniqueOrThrow({
      where: { ticketId_teamMemberId: { ticketId, teamMemberId: teamMemberProfileId } },
    });

    mockedCookieValue = teamMemberBToken;
    const result = await removeAssignmentAction(assignment.id, ticketId);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("your own assignment");
    }

    const stillThere = await prisma.ticketAssignment.findUnique({ where: { id: assignment.id } });
    expect(stillThere).not.toBeNull();
  });
});
