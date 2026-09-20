// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createTeamMember,
  resetTeamMemberPassword,
  setTeamMemberActive,
  setTeamMemberLoginStatus,
  updateTeamMember,
} from "./service";
import { findTeamMemberById, getTeamMemberStats } from "./repository";

const EXISTING_ADMIN_PHONE = "01900000111";
const CUSTOMER_PHONE_FOR_TICKETS = "+8801911190050";

let existingAdminId: string;
let customerId: string;
const cleanupTeamMemberIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupTicketIds: string[] = [];

async function createFixtureTicket(teamMemberId: string, status: "PENDING" | "IN_PROGRESS" | "COMPLETED") {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem: "Fixture ticket",
      createdBy: existingAdminId,
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
  cleanupTicketIds.push(ticket.id);
  await prisma.ticketAssignment.create({ data: { ticketId: ticket.id, teamMemberId, assignedBy: existingAdminId } });
  return ticket;
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");
  const admin = await prisma.user.upsert({
    where: { phone: EXISTING_ADMIN_PHONE },
    update: {},
    create: { name: "Existing Admin", phone: EXISTING_ADMIN_PHONE, passwordHash, role: "ADMIN" },
  });
  existingAdminId = admin.id;
  cleanupUserIds.push(admin.id);

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE_FOR_TICKETS, name: "TM Fixture Customer" } });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: cleanupTicketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.teamMember.deleteMany({ where: { id: { in: cleanupTeamMemberIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
});

describe("createTeamMember", () => {
  it("creates linked User + TeamMember rows with a generated password that actually works", async () => {
    const result = await createTeamMember({ name: "New Member", phone: "01911190061" });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    cleanupTeamMemberIds.push(result.teamMember.id);
    cleanupUserIds.push(result.teamMember.userId);

    expect(result.generatedPassword).toHaveLength(12);
    expect(result.teamMember.isActive).toBe(true);
    expect(result.teamMember.loginActive).toBe(true);

    // The generated password must actually authenticate against the stored hash.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.teamMember.userId } });
    const { verifyPassword } = await import("@/server/auth/password");
    expect(await verifyPassword(result.generatedPassword, user.passwordHash)).toBe(true);
  });

  it("[no sensitive data exposure] the returned record never contains a passwordHash field", async () => {
    const result = await createTeamMember({ name: "No Leak Member", phone: "01911190062" });
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    cleanupTeamMemberIds.push(result.teamMember.id);
    cleanupUserIds.push(result.teamMember.userId);

    expect(Object.keys(result.teamMember)).not.toContain("passwordHash");
    expect(JSON.stringify(result.teamMember)).not.toContain("passwordHash");
  });

  it("rejects a duplicate phone — including one already used by an ADMIN account", async () => {
    const result = await createTeamMember({ name: "Clashing Name", phone: EXISTING_ADMIN_PHONE });
    expect(result.status).toBe("duplicate_phone");
  });

  it("rejects a duplicate phone already used by another team member", async () => {
    // Service functions expect already-normalized input (normalization
    // happens at the Zod/action boundary) — same convention as the
    // customers/tickets/payments service tests.
    const first = await createTeamMember({ name: "First", phone: "+8801911190063" });
    if (first.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(first.teamMember.id);
    cleanupUserIds.push(first.teamMember.userId);

    const second = await createTeamMember({ name: "Second", phone: "+8801911190063" });
    expect(second.status).toBe("duplicate_phone");

    const userCount = await prisma.user.count({ where: { phone: "+8801911190063" } });
    expect(userCount).toBe(1);
  });
});

describe("updateTeamMember", () => {
  it("keeps User and TeamMember name/phone in sync", async () => {
    const created = await createTeamMember({ name: "Before Name", phone: "+8801911190064" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    const updated = await updateTeamMember(created.teamMember.id, { name: "After Name", phone: "+8801911190065" });
    expect(updated.status).toBe("updated");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.teamMember.userId } });
    expect(user.name).toBe("After Name");
    expect(user.phone).toBe("+8801911190065");

    const teamMember = await prisma.teamMember.findUniqueOrThrow({ where: { id: created.teamMember.id } });
    expect(teamMember.name).toBe("After Name");
    expect(teamMember.phone).toBe("+8801911190065");
  });

  it("rejects renaming to a phone already used by someone else", async () => {
    const a = await createTeamMember({ name: "A", phone: "01911190066" });
    const b = await createTeamMember({ name: "B", phone: "01911190067" });
    if (a.status !== "created" || b.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(a.teamMember.id, b.teamMember.id);
    cleanupUserIds.push(a.teamMember.userId, b.teamMember.userId);

    const result = await updateTeamMember(b.teamMember.id, { name: "B", phone: "01911190066" });
    expect(result.status).toBe("duplicate_phone");
  });

  it("allows keeping one's own phone unchanged", async () => {
    const created = await createTeamMember({ name: "Same Phone", phone: "01911190068" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    const result = await updateTeamMember(created.teamMember.id, { name: "Same Phone Updated", phone: "01911190068" });
    expect(result.status).toBe("updated");
  });

  it("returns not_found for a nonexistent team member", async () => {
    const result = await updateTeamMember("does-not-exist", { name: "x", phone: "01911190069" });
    expect(result.status).toBe("not_found");
  });
});

describe("setTeamMemberActive (soft deactivation)", () => {
  it("deactivates without deleting the row, and historical assignments still resolve", async () => {
    const created = await createTeamMember({ name: "Deactivate Me", phone: "01911190070" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    const ticket = await createFixtureTicket(created.teamMember.id, "COMPLETED");

    const result = await setTeamMemberActive(created.teamMember.id, false);
    expect(result.status).toBe("updated");
    if (result.status === "updated") expect(result.teamMember.isActive).toBe(false);

    // The team member row still exists and the historical assignment still
    // resolves to them by name — nothing was deleted.
    const stillExists = await findTeamMemberById(created.teamMember.id);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.name).toBe("Deactivate Me");

    const assignment = await prisma.ticketAssignment.findFirst({
      where: { ticketId: ticket.id },
      include: { teamMember: { select: { name: true } } },
    });
    expect(assignment?.teamMember.name).toBe("Deactivate Me");
  });
});

describe("setTeamMemberLoginStatus", () => {
  it("disabling login invalidates existing sessions", async () => {
    const created = await createTeamMember({ name: "Session Test", phone: "01911190071" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    const { token } = await createSession(created.teamMember.userId);
    expect(await validateSessionToken(token)).not.toBeNull();

    const result = await setTeamMemberLoginStatus(created.teamMember.id, false);
    expect(result.status).toBe("updated");
    if (result.status === "updated") expect(result.teamMember.loginActive).toBe(false);

    expect(await validateSessionToken(token)).toBeNull();
  });

  it("does not deactivate the team member's assignment eligibility when only login is disabled", async () => {
    const created = await createTeamMember({ name: "Login Only", phone: "01911190072" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    await setTeamMemberLoginStatus(created.teamMember.id, false);

    const teamMember = await findTeamMemberById(created.teamMember.id);
    expect(teamMember?.isActive).toBe(true);
    expect(teamMember?.loginActive).toBe(false);
  });
});

describe("resetTeamMemberPassword", () => {
  it("generates a new working password and invalidates existing sessions", async () => {
    const created = await createTeamMember({ name: "Reset Me", phone: "01911190073" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    const { token: oldToken } = await createSession(created.teamMember.userId);

    const result = await resetTeamMemberPassword(created.teamMember.id);
    expect(result.status).toBe("reset");
    if (result.status !== "reset") return;

    expect(await validateSessionToken(oldToken)).toBeNull();

    const { verifyPassword } = await import("@/server/auth/password");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.teamMember.userId } });
    expect(await verifyPassword(result.generatedPassword, user.passwordHash)).toBe(true);
    expect(await verifyPassword(created.generatedPassword, user.passwordHash)).toBe(false);
  });
});

describe("getTeamMemberStats", () => {
  it("computes active assignments, pending, in-progress, and completed correctly", async () => {
    const created = await createTeamMember({ name: "Stats Member", phone: "01911190074" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    cleanupTeamMemberIds.push(created.teamMember.id);
    cleanupUserIds.push(created.teamMember.userId);

    await createFixtureTicket(created.teamMember.id, "PENDING");
    await createFixtureTicket(created.teamMember.id, "PENDING");
    await createFixtureTicket(created.teamMember.id, "IN_PROGRESS");
    await createFixtureTicket(created.teamMember.id, "COMPLETED");

    const stats = await getTeamMemberStats(created.teamMember.id);

    expect(stats.pendingTickets).toBe(2);
    expect(stats.inProgressTickets).toBe(1);
    expect(stats.completedTickets).toBe(1);
    expect(stats.activeAssignments).toBe(3); // pending + in-progress
  });
});
