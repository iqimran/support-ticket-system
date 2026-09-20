import { Prisma } from "@/generated/prisma/client";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { extractPhoneSearchDigits } from "@/lib/phone";
import { prisma } from "@/server/db/prisma";
import type { TicketSearchInput } from "@/features/tickets/schemas";

/**
 * Atomically reserves the next ticket number from a Postgres sequence
 * (see migration 20260920173213_add_ticket_number_sequence). Sequences are
 * lock-free and non-transactional in Postgres, so concurrent callers always
 * get distinct values — this is what makes ticket number generation safe
 * under concurrent requests.
 */
export async function generateTicketNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('ticket_number_seq') AS nextval`;
  const value = rows[0]?.nextval ?? BigInt(0);
  return `TKT-${value.toString().padStart(6, "0")}`;
}

export type CreateTicketRecordInput = {
  ticketNumber: string;
  customerId: string;
  problem: string;
  priority: TicketPriority;
  createdBy: string;
};

export function createTicketRecord(data: CreateTicketRecordInput) {
  return prisma.ticket.create({ data });
}

export function findTicketById(id: string) {
  return prisma.ticket.findUnique({ where: { id } });
}

const ticketDetailInclude = {
  customer: true,
  creator: { select: { id: true, name: true } },
  assignments: {
    orderBy: { assignedAt: "asc" as const },
    include: {
      teamMember: { select: { id: true, name: true, phone: true, isActive: true } },
      assigner: { select: { id: true, name: true } },
    },
  },
  notes: {
    orderBy: { createdAt: "desc" as const },
    include: { creator: { select: { id: true, name: true } } },
  },
  statusHistory: {
    orderBy: { createdAt: "desc" as const },
    include: { changedByUser: { select: { id: true, name: true } } },
  },
  payments: {
    orderBy: { receivedAt: "desc" as const },
    include: { receiver: { select: { id: true, name: true } } },
  },
} satisfies Prisma.TicketInclude;

export type TicketDetail = Prisma.TicketGetPayload<{ include: typeof ticketDetailInclude }>;

export function findTicketDetailById(id: string): Promise<TicketDetail | null> {
  return prisma.ticket.findUnique({ where: { id }, include: ticketDetailInclude });
}

function buildTicketSearchWhere(params: TicketSearchInput): Prisma.TicketWhereInput {
  const conditions: Prisma.TicketWhereInput[] = [{ archivedAt: null }];

  const trimmedQuery = params.query.trim();
  if (trimmedQuery) {
    const orConditions: Prisma.TicketWhereInput[] = [
      { ticketNumber: { contains: trimmedQuery, mode: "insensitive" } },
      { customer: { name: { contains: trimmedQuery, mode: "insensitive" } } },
    ];
    const phoneDigits = extractPhoneSearchDigits(trimmedQuery);
    if (phoneDigits.length > 0) {
      orConditions.push({ customer: { phone: { contains: phoneDigits } } });
    }
    conditions.push({ OR: orConditions });
  }

  if (params.status) conditions.push({ status: params.status });
  if (params.priority) conditions.push({ priority: params.priority });
  if (params.dateFrom || params.dateTo) {
    conditions.push({
      createdAt: {
        ...(params.dateFrom ? { gte: params.dateFrom } : {}),
        ...(params.dateTo ? { lte: params.dateTo } : {}),
      },
    });
  }

  return { AND: conditions };
}

export type TicketListItem = {
  id: string;
  ticketNumber: string;
  problem: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string | null; phone: string };
  assignedMembers: { id: string; name: string }[];
};

export async function listTickets(params: TicketSearchInput): Promise<{ items: TicketListItem[]; total: number }> {
  const where = buildTicketSearchWhere(params);

  // Postgres native enums sort by declaration order, not alphabetically —
  // TicketPriority is declared LOW < MEDIUM < HIGH < URGENT in
  // schema.prisma, so ORDER BY priority already gives the natural severity
  // order for free.
  const orderBy: Prisma.TicketOrderByWithRelationInput = { [params.sortBy]: params.sortDir };

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        ticketNumber: true,
        problem: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, phone: true } },
        assignments: { select: { teamMember: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return {
    total,
    items: tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      problem: ticket.problem,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      customer: ticket.customer,
      assignedMembers: ticket.assignments.map((assignment) => assignment.teamMember),
    })),
  };
}

export function addTicketNoteRecord(ticketId: string, createdBy: string, note: string) {
  return prisma.ticketNote.create({
    data: { ticketId, createdBy, note },
    include: { creator: { select: { id: true, name: true } } },
  });
}

export function createTicketAssignmentRecord(ticketId: string, teamMemberId: string, assignedBy: string) {
  return prisma.ticketAssignment.create({
    data: { ticketId, teamMemberId, assignedBy },
    include: {
      teamMember: { select: { id: true, name: true, phone: true, isActive: true } },
      assigner: { select: { id: true, name: true } },
    },
  });
}

export function deleteTicketAssignmentRecord(assignmentId: string) {
  return prisma.ticketAssignment.deleteMany({ where: { id: assignmentId } });
}

export function findTeamMemberByUserId(userId: string) {
  return prisma.teamMember.findUnique({ where: { userId } });
}

export function findTeamMemberById(id: string) {
  return prisma.teamMember.findUnique({ where: { id } });
}

export function findTicketAssignment(ticketId: string, teamMemberId: string) {
  return prisma.ticketAssignment.findUnique({
    where: { ticketId_teamMemberId: { ticketId, teamMemberId } },
  });
}

export function searchActiveTeamMembers(query: string, take = 10) {
  const trimmed = query.trim();
  const phoneDigits = extractPhoneSearchDigits(trimmed);

  return prisma.teamMember.findMany({
    where: {
      isActive: true,
      ...(trimmed
        ? {
            OR: [
              { name: { contains: trimmed, mode: "insensitive" } },
              ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
            ],
          }
        : {}),
    },
    select: { id: true, name: true, phone: true },
    take,
  });
}
