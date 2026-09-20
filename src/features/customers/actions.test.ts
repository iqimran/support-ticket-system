// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

let mockedCookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mockedCookieValue === undefined ? undefined : { name, value: mockedCookieValue },
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { createCustomerAction, updateCustomerAction } = await import("./actions");

const FIXTURE_ADMIN_PHONE = "01900000021";
const FIXTURE_TEAM_MEMBER_PHONE = "01900000022";

let adminUserId: string;
let teamMemberUserId: string;
let adminToken: string;
let teamMemberToken: string;

const createdCustomerIds: string[] = [];

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
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
});

describe("createCustomerAction authorization", () => {
  it("redirects to /login for an unauthenticated caller", async () => {
    mockedCookieValue = undefined;

    const error = await expectThrows(() => createCustomerAction({ phone: "+8801911182001" }));

    expect(error.digest).toContain("NEXT_REDIRECT");
    expect(error.digest).toContain("/login");
  });

  it("allows a TEAM_MEMBER to create a customer", async () => {
    mockedCookieValue = teamMemberToken;

    const result = await createCustomerAction({ phone: "01911182002", name: "Created by team member" });

    expect(result.status).toBe("success");
    if (result.status === "success") createdCustomerIds.push(result.customerId);
  });

  it("allows an ADMIN to create a customer", async () => {
    mockedCookieValue = adminToken;

    const result = await createCustomerAction({ phone: "01911182003", name: "Created by admin" });

    expect(result.status).toBe("success");
    if (result.status === "success") createdCustomerIds.push(result.customerId);
  });
});

describe("createCustomerAction validation and duplicate handling", () => {
  it("returns a field error for an invalid phone", async () => {
    mockedCookieValue = teamMemberToken;

    const result = await createCustomerAction({ phone: "not-a-phone" });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors?.phone?.[0]).toMatch(/valid Bangladeshi/i);
    }
  });

  it("reports duplicate instead of creating a second row for the same phone", async () => {
    mockedCookieValue = teamMemberToken;

    const first = await createCustomerAction({ phone: "01911182010" });
    expect(first.status).toBe("success");
    if (first.status === "success") createdCustomerIds.push(first.customerId);

    const second = await createCustomerAction({ phone: "01911182010" });

    expect(second.status).toBe("duplicate");
    if (second.status === "duplicate" && first.status === "success") {
      expect(second.customerId).toBe(first.customerId);
    }
  });
});

describe("updateCustomerAction authorization", () => {
  it("redirects to /login for an unauthenticated caller", async () => {
    mockedCookieValue = undefined;

    const error = await expectThrows(() => updateCustomerAction("some-id", { phone: "+8801911182001" }));

    expect(error.digest).toContain("NEXT_REDIRECT");
  });

  it("allows a TEAM_MEMBER to update a customer created by anyone", async () => {
    mockedCookieValue = adminToken;
    const created = await createCustomerAction({ phone: "01911182020", name: "Before" });
    if (created.status !== "success") throw new Error("fixture setup failed");
    createdCustomerIds.push(created.customerId);

    mockedCookieValue = teamMemberToken;
    const result = await updateCustomerAction(created.customerId, { phone: "01911182020", name: "After" });

    expect(result.status).toBe("success");
  });
});
