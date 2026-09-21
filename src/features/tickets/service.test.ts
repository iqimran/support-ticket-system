// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import type { AuthUser } from "@/server/auth/types";
import { addTicketNote, assignTeamMembers, changeTicketStatus, createTicket, removeAssignment } from "./service";

const CREATOR_PHONE = "01900000031";
const CUSTOMER_PHONE = "+8801911190001";
const MEMBER_A_PHONE = "01900000041";
const MEMBER_B_PHONE = "01900000042";
const MEMBER_INACTIVE_PHONE = "01900000043";
const ADMIN_PHONE = "01900000044";

let creatorId: string;
let customerId: string;
let teamMemberAId: string;
let teamMemberBId: string;
let teamMemberInactiveId: string;
let memberAUserId: string;
let memberBUserId: string;
let adminActor: AuthUser;
let memberAActor: AuthUser;
let memberBActor: AuthUser;
const cleanupUserIds: string[] = [];
const cleanupCustomerIds: string[] = [];
const cleanupTicketIds: string[] = [];

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");

  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  creatorId = creator.id;
  cleanupUserIds.push(creator.id);

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Ticket Fixture Customer" } });
  customerId = customer.id;
  cleanupCustomerIds.push(customer.id);

  const memberAUser = await prisma.user.upsert({
    where: { phone: MEMBER_A_PHONE },
    update: {},
    create: { name: "Member A", phone: MEMBER_A_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const memberA = await prisma.teamMember.upsert({
    where: { userId: memberAUser.id },
    update: {},
    create: { userId: memberAUser.id, name: "Member A", phone: MEMBER_A_PHONE },
  });
  teamMemberAId = memberA.id;
  memberAUserId = memberAUser.id;
  cleanupUserIds.push(memberAUser.id);

  const memberBUser = await prisma.user.upsert({
    where: { phone: MEMBER_B_PHONE },
    update: {},
    create: { name: "Member B", phone: MEMBER_B_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const memberB = await prisma.teamMember.upsert({
    where: { userId: memberBUser.id },
    update: {},
    create: { userId: memberBUser.id, name: "Member B", phone: MEMBER_B_PHONE },
  });
  teamMemberBId = memberB.id;
  memberBUserId = memberBUser.id;
  cleanupUserIds.push(memberBUser.id);

  const memberInactiveUser = await prisma.user.upsert({
    where: { phone: MEMBER_INACTIVE_PHONE },
    update: {},
    create: { name: "Member Inactive", phone: MEMBER_INACTIVE_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const memberInactive = await prisma.teamMember.upsert({
    where: { userId: memberInactiveUser.id },
    update: { isActive: false },
    create: { userId: memberInactiveUser.id, name: "Member Inactive", phone: MEMBER_INACTIVE_PHONE, isActive: false },
  });
  teamMemberInactiveId = memberInactive.id;
  cleanupUserIds.push(memberInactiveUser.id);

  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: {},
    create: { name: "Fixture Admin", phone: ADMIN_PHONE, passwordHash, role: "ADMIN" },
  });
  cleanupUserIds.push(admin.id);

  adminActor = { id: admin.id, name: admin.name, phone: admin.phone, role: "ADMIN", isActive: true };
  memberAActor = { id: memberAUserId, name: "Member A", phone: MEMBER_A_PHONE, role: "TEAM_MEMBER", isActive: true };
  memberBActor = { id: memberBUserId, name: "Member B", phone: MEMBER_B_PHONE, role: "TEAM_MEMBER", isActive: true };
});

afterAll(async () => {
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticketNote.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: cleanupCustomerIds } } });
  await prisma.teamMember.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
});

describe("createTicket", () => {
  it("creates a ticket with a generated ticket number and PENDING status", async () => {
    const ticket = await createTicket({ customerId, problem: "Camera 3 offline", priority: "HIGH" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    expect(ticket.ticketNumber).toMatch(/^TKT-\d{6}$/);
    expect(ticket.status).toBe("PENDING");
    expect(ticket.priority).toBe("HIGH");
    expect(ticket.createdBy).toBe(creatorId);
    expect(ticket.customerId).toBe(customerId);
  });

  it("generates a unique ticket number for each ticket", async () => {
    const first = await createTicket({ customerId, problem: "First issue" }, creatorId);
    const second = await createTicket({ customerId, problem: "Second issue" }, creatorId);
    cleanupTicketIds.push(first.id, second.id);

    expect(first.ticketNumber).not.toBe(second.ticketNumber);
  });
});

describe("changeTicketStatus", () => {
  it("moves PENDING -> IN_PROGRESS and records status history in the same transaction", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await changeTicketStatus(ticket.id, { newStatus: "IN_PROGRESS", changedBy: creatorId });

    expect(result.status).toBe("changed");
    if (result.status === "changed") {
      expect(result.ticket.status).toBe("IN_PROGRESS");
    }

    const history = await prisma.ticketStatusHistory.findMany({ where: { ticketId: ticket.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldStatus: "PENDING", newStatus: "IN_PROGRESS", changedBy: creatorId });
  });

  it("sets completedAt when moving to COMPLETED", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);
    await changeTicketStatus(ticket.id, { newStatus: "IN_PROGRESS", changedBy: creatorId });

    const result = await changeTicketStatus(ticket.id, { newStatus: "COMPLETED", changedBy: creatorId });

    expect(result.status).toBe("changed");
    if (result.status === "changed") {
      expect(result.ticket.completedAt).not.toBeNull();
    }
  });

  it("rejects an invalid transition (PENDING -> COMPLETED)", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await changeTicketStatus(ticket.id, { newStatus: "COMPLETED", changedBy: creatorId });

    expect(result.status).toBe("invalid_transition");
    const history = await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } });
    expect(history).toBe(0);
  });

  it("rejects reopening a completed ticket without a reason", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);
    await changeTicketStatus(ticket.id, { newStatus: "IN_PROGRESS", changedBy: creatorId });
    await changeTicketStatus(ticket.id, { newStatus: "COMPLETED", changedBy: creatorId });

    const result = await changeTicketStatus(ticket.id, { newStatus: "IN_PROGRESS", changedBy: creatorId });

    expect(result.status).toBe("reason_required");
    const historyCount = await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } });
    expect(historyCount).toBe(2); // only the two prior valid transitions
  });

  it("allows reopening a completed ticket with a reason, clearing completedAt", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);
    await changeTicketStatus(ticket.id, { newStatus: "IN_PROGRESS", changedBy: creatorId });
    await changeTicketStatus(ticket.id, { newStatus: "COMPLETED", changedBy: creatorId });

    const result = await changeTicketStatus(ticket.id, {
      newStatus: "IN_PROGRESS",
      changedBy: creatorId,
      note: "Customer reported the same issue again",
    });

    expect(result.status).toBe("changed");
    if (result.status === "changed") {
      expect(result.ticket.status).toBe("IN_PROGRESS");
      expect(result.ticket.completedAt).toBeNull();
    }

    const history = await prisma.ticketStatusHistory.findFirst({
      where: { ticketId: ticket.id, oldStatus: "COMPLETED", newStatus: "IN_PROGRESS" },
    });
    expect(history?.note).toBe("Customer reported the same issue again");
  });

  it("allows CANCELLED from PENDING and treats CANCELLED as terminal", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const cancelled = await changeTicketStatus(ticket.id, { newStatus: "CANCELLED", changedBy: creatorId });
    expect(cancelled.status).toBe("changed");

    const reopenAttempt = await changeTicketStatus(ticket.id, { newStatus: "IN_PROGRESS", changedBy: creatorId });
    expect(reopenAttempt.status).toBe("invalid_transition");
  });

  it("returns not_found for a nonexistent ticket", async () => {
    const result = await changeTicketStatus("does-not-exist", { newStatus: "IN_PROGRESS", changedBy: creatorId });
    expect(result.status).toBe("not_found");
  });
});

describe("addTicketNote", () => {
  it("records the author, timestamp, and content", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const note = await addTicketNote(ticket.id, creatorId, "Called customer, scheduling a visit");

    expect(note.createdBy).toBe(creatorId);
    expect(note.note).toBe("Called customer, scheduling a visit");
    expect(note.createdAt).toBeInstanceOf(Date);
  });
});

describe("assignTeamMembers", () => {
  it("assigns a single team member and records who made the assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0]!.teamMemberId).toBe(teamMemberAId);
      expect(result.assignments[0]!.assignedBy).toBe(creatorId);
    }
  });

  it("assigns multiple different team members to one ticket in a single call (admin: assign multiple members)", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, [teamMemberAId, teamMemberBId], adminActor.id);

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.assignments.map((a) => a.teamMemberId).sort()).toEqual([teamMemberAId, teamMemberBId].sort());
    }

    const assignments = await prisma.ticketAssignment.findMany({ where: { ticketId: ticket.id } });
    expect(assignments).toHaveLength(2);
  });

  it("dedupes a repeated id within the same call instead of creating duplicate rows", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, [teamMemberAId, teamMemberAId], creatorId);

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.assignments).toHaveLength(1);
    }
  });

  it("prevents assigning the same team member to the same ticket twice", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const first = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    expect(first.status).toBe("assigned");

    const second = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    expect(second.status).toBe("already_assigned");
    if (second.status === "already_assigned") {
      expect(second.teamMemberIds).toEqual([teamMemberAId]);
    }

    const assignments = await prisma.ticketAssignment.count({ where: { ticketId: ticket.id, teamMemberId: teamMemberAId } });
    expect(assignments).toBe(1);
  });

  it("rolls back the whole batch (uses a transaction) when one of several ids is already assigned", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);

    const result = await assignTeamMembers(ticket.id, [teamMemberAId, teamMemberBId], creatorId);
    expect(result.status).toBe("already_assigned");

    const bAssigned = await prisma.ticketAssignment.findUnique({
      where: { ticketId_teamMemberId: { ticketId: ticket.id, teamMemberId: teamMemberBId } },
    });
    expect(bAssigned).toBeNull();
  });

  it("returns invalid_team_members (not_found) for a nonexistent team member", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, ["does-not-exist"], creatorId);
    expect(result.status).toBe("invalid_team_members");
    if (result.status === "invalid_team_members") {
      expect(result.invalid).toEqual([{ teamMemberId: "does-not-exist", reason: "not_found" }]);
    }
  });

  it("does not allow a deactivated team member to be newly assigned", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, [teamMemberInactiveId], creatorId);
    expect(result.status).toBe("invalid_team_members");
    if (result.status === "invalid_team_members") {
      expect(result.invalid).toEqual([{ teamMemberId: teamMemberInactiveId, reason: "inactive" }]);
    }

    const assigned = await prisma.ticketAssignment.findUnique({
      where: { ticketId_teamMemberId: { ticketId: ticket.id, teamMemberId: teamMemberInactiveId } },
    });
    expect(assigned).toBeNull();
  });

  it("rejects the entire batch (no partial assignment) when one of several ids is inactive", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, [teamMemberAId, teamMemberInactiveId], creatorId);
    expect(result.status).toBe("invalid_team_members");

    const aAssigned = await prisma.ticketAssignment.findUnique({
      where: { ticketId_teamMemberId: { ticketId: ticket.id, teamMemberId: teamMemberAId } },
    });
    expect(aAssigned).toBeNull();
  });

  it("returns ticket_not_found for a nonexistent ticket", async () => {
    const result = await assignTeamMembers("does-not-exist", [teamMemberAId], creatorId);
    expect(result.status).toBe("ticket_not_found");
  });

  it("returns no_team_members for an empty selection", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMembers(ticket.id, [], creatorId);
    expect(result.status).toBe("no_team_members");
  });
});

describe("removeAssignment", () => {
  it("allows an ADMIN to remove any team member's assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);
    const assigned = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");

    const removed = await removeAssignment(assigned.assignments[0]!.id, ticket.id, adminActor);
    expect(removed.status).toBe("removed");

    const stillThere = await prisma.ticketAssignment.findUnique({ where: { id: assigned.assignments[0]!.id } });
    expect(stillThere).toBeNull();
  });

  it("allows a TEAM_MEMBER to remove their own assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);
    const assigned = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");

    const removed = await removeAssignment(assigned.assignments[0]!.id, ticket.id, memberAActor);
    expect(removed.status).toBe("removed");
  });

  it("forbids a TEAM_MEMBER from removing a different team member's assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);
    const assigned = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");

    const result = await removeAssignment(assigned.assignments[0]!.id, ticket.id, memberBActor);
    expect(result.status).toBe("forbidden");

    const stillThere = await prisma.ticketAssignment.findUnique({ where: { id: assigned.assignments[0]!.id } });
    expect(stillThere).not.toBeNull();
  });

  it("returns not_found when the assignment does not belong to the given ticket", async () => {
    const ticketOne = await createTicket({ customerId, problem: "Issue 1" }, creatorId);
    const ticketTwo = await createTicket({ customerId, problem: "Issue 2" }, creatorId);
    cleanupTicketIds.push(ticketOne.id, ticketTwo.id);
    const assigned = await assignTeamMembers(ticketOne.id, [teamMemberAId], creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");

    const result = await removeAssignment(assigned.assignments[0]!.id, ticketTwo.id, adminActor);
    expect(result.status).toBe("not_found");

    const stillThere = await prisma.ticketAssignment.findUnique({ where: { id: assigned.assignments[0]!.id } });
    expect(stillThere).not.toBeNull();
  });

  it("returns not_found for a nonexistent assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await removeAssignment("does-not-exist", ticket.id, adminActor);
    expect(result.status).toBe("not_found");
  });

  it("allows re-assigning a team member after their prior assignment was removed", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const assigned = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");
    await removeAssignment(assigned.assignments[0]!.id, ticket.id, adminActor);

    const reassigned = await assignTeamMembers(ticket.id, [teamMemberAId], creatorId);
    expect(reassigned.status).toBe("assigned");
  });
});
