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
  createTeamMemberAction,
  updateTeamMemberAction,
  setTeamMemberActiveAction,
  setTeamMemberLoginStatusAction,
  resetTeamMemberPasswordAction,
} = await import("./actions");

const ADMIN_PHONE = "01900000121";
const TEAM_MEMBER_PHONE = "01900000122";
const TARGET_PHONE = "+8801911190080";

let adminUserId: string;
let teamMemberUserId: string;
let adminToken: string;
let teamMemberToken: string;
let targetTeamMemberId: string;
let targetUserId: string;
const cleanupTeamMemberIds: string[] = [];
const cleanupUserIds: string[] = [];

async function expectThrows(fn: () => Promise<unknown>): Promise<{ digest?: string }> {
  try {
    await fn();
  } catch (error) {
    return error as { digest?: string };
  }
  throw new Error("expected function to throw");
}

async function createTargetFixture() {
  const passwordHash = await hashPassword("Fixture-Pass-123!");
  const user = await prisma.user.create({
    data: { name: "Target Member", phone: TARGET_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const teamMember = await prisma.teamMember.create({
    data: { userId: user.id, name: "Target Member", phone: TARGET_PHONE },
  });
  targetUserId = user.id;
  targetTeamMemberId = teamMember.id;
  cleanupUserIds.push(user.id);
  cleanupTeamMemberIds.push(teamMember.id);
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

  adminUserId = admin.id;
  teamMemberUserId = teamMember.id;
  adminToken = (await createSession(admin.id)).token;
  teamMemberToken = (await createSession(teamMember.id)).token;

  await createTargetFixture();
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, teamMemberUserId, targetUserId] } } });
  await prisma.teamMember.deleteMany({ where: { id: { in: cleanupTeamMemberIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, teamMemberUserId, ...cleanupUserIds] } } });
});

describe("createTeamMemberAction — ADMIN only", () => {
  it("redirects an unauthenticated caller to /login", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() => createTeamMemberAction({ name: "x", phone: "01911190090" }));
    expect(error.digest).toContain("NEXT_REDIRECT");
    expect(error.digest).toContain("/login");
  });

  it("blocks a TEAM_MEMBER with a 404, not the data", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() => createTeamMemberAction({ name: "x", phone: "01911190090" }));
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows an ADMIN to create a team member", async () => {
    mockedCookieValue = adminToken;
    const result = await createTeamMemberAction({ name: "Admin Created", phone: "01911190091" });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      cleanupTeamMemberIds.push(result.teamMemberId);
      const tm = await prisma.teamMember.findUniqueOrThrow({ where: { id: result.teamMemberId } });
      cleanupUserIds.push(tm.userId);
    }
  });
});

describe("updateTeamMemberAction — ADMIN only", () => {
  it("redirects an unauthenticated caller", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() =>
      updateTeamMemberAction(targetTeamMemberId, { name: "x", phone: "01911190080" }),
    );
    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("blocks a TEAM_MEMBER with a 404", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() =>
      updateTeamMemberAction(targetTeamMemberId, { name: "x", phone: "01911190080" }),
    );
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows an ADMIN to update", async () => {
    mockedCookieValue = adminToken;
    const result = await updateTeamMemberAction(targetTeamMemberId, { name: "Renamed", phone: "01911190080" });
    expect(result.status).toBe("success");
  });
});

describe("setTeamMemberActiveAction / setTeamMemberLoginStatusAction — ADMIN only", () => {
  it("blocks a TEAM_MEMBER from deactivating a colleague", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() => setTeamMemberActiveAction(targetTeamMemberId, false));
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("blocks a TEAM_MEMBER from disabling a colleague's login", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() => setTeamMemberLoginStatusAction(targetTeamMemberId, false));
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows an ADMIN to toggle both", async () => {
    mockedCookieValue = adminToken;
    const activeResult = await setTeamMemberActiveAction(targetTeamMemberId, false);
    expect(activeResult.status).toBe("success");
    const loginResult = await setTeamMemberLoginStatusAction(targetTeamMemberId, false);
    expect(loginResult.status).toBe("success");

    // restore for subsequent tests
    await setTeamMemberActiveAction(targetTeamMemberId, true);
    await setTeamMemberLoginStatusAction(targetTeamMemberId, true);
  });
});

describe("resetTeamMemberPasswordAction — ADMIN only", () => {
  it("redirects an unauthenticated caller", async () => {
    mockedCookieValue = undefined;
    const error = await expectThrows(() => resetTeamMemberPasswordAction(targetTeamMemberId));
    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("blocks a TEAM_MEMBER — password reset is sensitive credential material", async () => {
    mockedCookieValue = teamMemberToken;
    const error = await expectThrows(() => resetTeamMemberPasswordAction(targetTeamMemberId));
    expect(error.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("allows an ADMIN to reset a password and returns only the new plaintext password, nothing else sensitive", async () => {
    mockedCookieValue = adminToken;
    const result = await resetTeamMemberPasswordAction(targetTeamMemberId);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(typeof result.generatedPassword).toBe("string");
      expect(JSON.stringify(result)).not.toContain("passwordHash");
    }
  });
});
