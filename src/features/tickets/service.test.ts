// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { addTicketNote, assignTeamMember, changeTicketStatus, createTicket, removeAssignment } from "./service";

const CREATOR_PHONE = "01900000031";
const CUSTOMER_PHONE = "+8801911190001";
const MEMBER_A_PHONE = "01900000041";
const MEMBER_B_PHONE = "01900000042";

let creatorId: string;
let customerId: string;
let teamMemberAId: string;
let teamMemberBId: string;
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
  cleanupUserIds.push(memberBUser.id);
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

describe("assignTeamMember / removeAssignment", () => {
  it("assigns a team member and records who made the assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMember(ticket.id, teamMemberAId, creatorId);

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.assignment.teamMemberId).toBe(teamMemberAId);
      expect(result.assignment.assignedBy).toBe(creatorId);
    }
  });

  it("supports multiple different team members on one ticket", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    await assignTeamMember(ticket.id, teamMemberAId, creatorId);
    await assignTeamMember(ticket.id, teamMemberBId, creatorId);

    const assignments = await prisma.ticketAssignment.findMany({ where: { ticketId: ticket.id } });
    expect(assignments).toHaveLength(2);
  });

  it("prevents assigning the same team member to the same ticket twice", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const first = await assignTeamMember(ticket.id, teamMemberAId, creatorId);
    expect(first.status).toBe("assigned");

    const second = await assignTeamMember(ticket.id, teamMemberAId, creatorId);
    expect(second.status).toBe("already_assigned");

    const assignments = await prisma.ticketAssignment.count({ where: { ticketId: ticket.id, teamMemberId: teamMemberAId } });
    expect(assignments).toBe(1);
  });

  it("returns team_member_not_found for a nonexistent team member", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const result = await assignTeamMember(ticket.id, "does-not-exist", creatorId);
    expect(result.status).toBe("team_member_not_found");
  });

  it("removes an assignment", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const assigned = await assignTeamMember(ticket.id, teamMemberAId, creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");

    const removed = await removeAssignment(assigned.assignment.id);
    expect(removed.status).toBe("removed");

    const stillThere = await prisma.ticketAssignment.findUnique({ where: { id: assigned.assignment.id } });
    expect(stillThere).toBeNull();
  });

  it("allows re-assigning a team member after their prior assignment was removed", async () => {
    const ticket = await createTicket({ customerId, problem: "Issue" }, creatorId);
    cleanupTicketIds.push(ticket.id);

    const assigned = await assignTeamMember(ticket.id, teamMemberAId, creatorId);
    if (assigned.status !== "assigned") throw new Error("fixture setup failed");
    await removeAssignment(assigned.assignment.id);

    const reassigned = await assignTeamMember(ticket.id, teamMemberAId, creatorId);
    expect(reassigned.status).toBe("assigned");
  });
});
