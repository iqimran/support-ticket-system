// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import type { AuthUser } from "@/server/auth/types";

let mockedCookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mockedCookieValue === undefined ? undefined : { name, value: mockedCookieValue },
    set: () => {},
    delete: () => {},
  }),
}));

// Imported after the mock so requireAuth/requireAdmin/requireTeamMember pick
// up the mocked next/headers instead of the real request-scoped cookies().
const { requireAuth, requireAdmin, requireTeamMember } = await import("./require");
const { canAccessTicket, canRemoveTicketAssignment, canViewPaymentAudit } = await import("./permissions");

const FIXTURE_ADMIN_PHONE = "01900000001";
const FIXTURE_TEAM_MEMBER_PHONE = "01900000002";

let adminUserId: string;
let teamMemberUserId: string;
let adminToken: string;
let teamMemberToken: string;

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
    where: { phone: FIXTURE_ADMIN_PHONE },
    update: { isActive: true, role: "ADMIN" },
    create: { name: "Fixture Admin", phone: FIXTURE_ADMIN_PHONE, passwordHash, role: "ADMIN" },
  });
  const teamMember = await prisma.user.upsert({
    where: { phone: FIXTURE_TEAM_MEMBER_PHONE },
    update: { isActive: true, role: "TEAM_MEMBER" },
    create: { name: "Fixture Team Member", phone: FIXTURE_TEAM_MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });

  adminUserId = admin.id;
  teamMemberUserId = teamMember.id;
  adminToken = (await createSession(admin.id)).token;
  teamMemberToken = (await createSession(teamMember.id)).token;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, teamMemberUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, teamMemberUserId] } } });
});

describe("requireAuth", () => {
  it("redirects to /login when there is no session cookie", async () => {
    mockedCookieValue = undefined;

    const error = await expectThrows(() => requireAuth());

    expect(error.digest).toContain("NEXT_REDIRECT");
    expect(error.digest).toContain("/login");
  });

  it("redirects to /login for a forged/garbage token that matches no session", async () => {
    mockedCookieValue = "this-is-not-a-real-session-token";

    const error = await expectThrows(() => requireAuth());

    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("resolves with the user for a valid session", async () => {
    mockedCookieValue = teamMemberToken;

    const user = await requireAuth();

    expect(user.id).toBe(teamMemberUserId);
    expect(user.role).toBe("TEAM_MEMBER");
  });
});

describe("requireAdmin", () => {
  it("blocks a TEAM_MEMBER with a 404, not a redirect (proves scenario: team members cannot access payment audit pages)", async () => {
    mockedCookieValue = teamMemberToken;

    const error = await expectThrows(() => requireAdmin());

    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows ADMIN through (proves scenario: admin can access payment audit pages)", async () => {
    mockedCookieValue = adminToken;

    const user = await requireAdmin();

    expect(user.id).toBe(adminUserId);
    expect(user.role).toBe("ADMIN");
  });

  it("blocks unauthenticated requests before any role check runs", async () => {
    mockedCookieValue = undefined;

    const error = await expectThrows(() => requireAdmin());

    expect(error.digest).toContain("NEXT_REDIRECT");
  });
});

describe("requireTeamMember", () => {
  it("allows TEAM_MEMBER through (proves scenario: team members can access normal ticket pages)", async () => {
    mockedCookieValue = teamMemberToken;

    const user = await requireTeamMember();

    expect(user.id).toBe(teamMemberUserId);
  });

  it("allows ADMIN through too, since ADMIN has full system access", async () => {
    mockedCookieValue = adminToken;

    const user = await requireTeamMember();

    expect(user.id).toBe(adminUserId);
  });
});

describe("canViewPaymentAudit / canAccessTicket (pure permission functions)", () => {
  const admin: AuthUser = { id: "x", name: "x", phone: "x", role: "ADMIN", isActive: true };
  const teamMember: AuthUser = { id: "y", name: "y", phone: "y", role: "TEAM_MEMBER", isActive: true };

  it("only ADMIN can view payment audit logs", () => {
    expect(canViewPaymentAudit(admin)).toBe(true);
    expect(canViewPaymentAudit(teamMember)).toBe(false);
  });

  it("any active staff member can access tickets", () => {
    expect(canAccessTicket(admin)).toBe(true);
    expect(canAccessTicket(teamMember)).toBe(true);
    expect(canAccessTicket({ ...teamMember, isActive: false })).toBe(false);
  });
});

describe("canRemoveTicketAssignment (pure permission function)", () => {
  const admin: AuthUser = { id: "admin-x", name: "x", phone: "x", role: "ADMIN", isActive: true };
  const teamMember: AuthUser = { id: "member-y", name: "y", phone: "y", role: "TEAM_MEMBER", isActive: true };
  const ownAssignment = { teamMember: { userId: teamMember.id } };
  const othersAssignment = { teamMember: { userId: "someone-else" } };

  it("ADMIN can remove any assignment", () => {
    expect(canRemoveTicketAssignment(admin, ownAssignment)).toBe(true);
    expect(canRemoveTicketAssignment(admin, othersAssignment)).toBe(true);
  });

  it("TEAM_MEMBER can only remove their own assignment", () => {
    expect(canRemoveTicketAssignment(teamMember, ownAssignment)).toBe(true);
    expect(canRemoveTicketAssignment(teamMember, othersAssignment)).toBe(false);
  });
});
