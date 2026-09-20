// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { findTeamMemberById, listTeamMembers } from "./repository";

const PHONE = "+8801911190099";
let userId: string;
let teamMemberId: string;

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");
  const user = await prisma.user.create({
    data: { name: "Repo Safety Check", phone: PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const teamMember = await prisma.teamMember.create({
    data: { userId: user.id, name: "Repo Safety Check", phone: PHONE },
  });
  userId = user.id;
  teamMemberId = teamMember.id;
});

afterAll(async () => {
  await prisma.teamMember.delete({ where: { id: teamMemberId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("[no sensitive data exposure] repository queries never return passwordHash", () => {
  it("findTeamMemberById", async () => {
    const result = await findTeamMemberById(teamMemberId);
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(Object.keys(result!)).not.toContain("passwordHash");
  });

  it("listTeamMembers", async () => {
    const { items } = await listTeamMembers({
      query: "Repo Safety Check",
      status: "all",
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortDir: "asc",
    });
    expect(items.length).toBeGreaterThan(0);
    expect(JSON.stringify(items)).not.toContain("passwordHash");
  });
});
