import type { Prisma } from "@/generated/prisma/client";
import { extractPhoneSearchDigits } from "@/lib/phone";
import { prisma } from "@/server/db/prisma";
import type { TeamMemberSearchInput } from "@/features/team-members/schemas";

// Every select/include touching User below is explicit and limited to
// {id, phone, name, isActive} — passwordHash must never appear in a query
// result that could reach a client component or action response.
const SAFE_USER_SELECT = { id: true, isActive: true } satisfies Prisma.UserSelect;

export type TeamMemberRecord = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  loginActive: boolean;
};

function toRecord(row: {
  id: string;
  userId: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; isActive: boolean };
}): TeamMemberRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    loginActive: row.user.isActive,
  };
}

const teamMemberWithUser = {
  id: true,
  userId: true,
  name: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  user: { select: SAFE_USER_SELECT },
} satisfies Prisma.TeamMemberSelect;

export async function findTeamMemberById(id: string): Promise<TeamMemberRecord | null> {
  const row = await prisma.teamMember.findUnique({ where: { id }, select: teamMemberWithUser });
  return row ? toRecord(row) : null;
}

/** For duplicate-phone checks during create/update — id/phone only, never passwordHash. */
export function findUserByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone }, select: { id: true, phone: true } });
}

export async function createTeamMemberWithAccount(data: {
  name: string;
  phone: string;
  passwordHash: string;
}): Promise<TeamMemberRecord> {
  const row = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: data.name, phone: data.phone, passwordHash: data.passwordHash, role: "TEAM_MEMBER" },
    });
    return tx.teamMember.create({
      data: { userId: user.id, name: data.name, phone: data.phone },
      select: teamMemberWithUser,
    });
  });
  return toRecord(row);
}

export async function updateTeamMemberAndUser(
  teamMemberId: string,
  userId: string,
  data: { name: string; phone: string },
): Promise<TeamMemberRecord> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { name: data.name, phone: data.phone } });
    return tx.teamMember.update({ where: { id: teamMemberId }, data, select: teamMemberWithUser });
  });
  return toRecord(row);
}

export async function setTeamMemberActiveStatus(id: string, isActive: boolean): Promise<TeamMemberRecord> {
  const row = await prisma.teamMember.update({ where: { id }, data: { isActive }, select: teamMemberWithUser });
  return toRecord(row);
}

export async function setUserLoginStatus(userId: string, isActive: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
}

export async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function invalidateAllSessionsForUser(userId: string) {
  return prisma.session.deleteMany({ where: { userId } });
}

function buildTeamMemberWhere(params: TeamMemberSearchInput): Prisma.TeamMemberWhereInput {
  const conditions: Prisma.TeamMemberWhereInput[] = [];

  const trimmed = params.query.trim();
  if (trimmed) {
    const orConditions: Prisma.TeamMemberWhereInput[] = [{ name: { contains: trimmed, mode: "insensitive" } }];
    const phoneDigits = extractPhoneSearchDigits(trimmed);
    if (phoneDigits.length > 0) {
      orConditions.push({ phone: { contains: phoneDigits } });
    }
    conditions.push({ OR: orConditions });
  }

  if (params.status === "active") conditions.push({ isActive: true });
  if (params.status === "inactive") conditions.push({ isActive: false });

  return conditions.length > 0 ? { AND: conditions } : {};
}

export type TeamMemberListItem = TeamMemberRecord & { activeAssignmentCount: number };

export async function listTeamMembers(
  params: TeamMemberSearchInput,
): Promise<{ items: TeamMemberListItem[]; total: number }> {
  const where = buildTeamMemberWhere(params);

  const [total, rows] = await Promise.all([
    prisma.teamMember.count({ where }),
    prisma.teamMember.findMany({
      where,
      orderBy: { [params.sortBy]: params.sortDir },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        ...teamMemberWithUser,
        _count: {
          select: {
            assignments: { where: { ticket: { status: { in: ["PENDING", "IN_PROGRESS"] } } } },
          },
        },
      },
    }),
  ]);

  return {
    total,
    items: rows.map((row) => ({ ...toRecord(row), activeAssignmentCount: row._count.assignments })),
  };
}

export type TeamMemberStats = {
  activeAssignments: number;
  pendingTickets: number;
  inProgressTickets: number;
  completedTickets: number;
};

export async function getTeamMemberStats(teamMemberId: string): Promise<TeamMemberStats> {
  const [pendingTickets, inProgressTickets, completedTickets] = await Promise.all([
    prisma.ticketAssignment.count({ where: { teamMemberId, ticket: { status: "PENDING" } } }),
    prisma.ticketAssignment.count({ where: { teamMemberId, ticket: { status: "IN_PROGRESS" } } }),
    prisma.ticketAssignment.count({ where: { teamMemberId, ticket: { status: "COMPLETED" } } }),
  ]);

  return {
    activeAssignments: pendingTickets + inProgressTickets,
    pendingTickets,
    inProgressTickets,
    completedTickets,
  };
}
