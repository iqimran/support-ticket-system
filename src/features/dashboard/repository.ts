import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { DateRange } from "@/features/dashboard/periods";

/**
 * "Ticket counts should be calculated according to ticket creation/
 * completion dates" — total/pending/inProgress/cancelled are all scoped by
 * createdAt (they describe the cohort of tickets *created* in the period,
 * broken down by their current status); completed is scoped by
 * completedAt instead, since a ticket completed in this period may well
 * have been created in an earlier one. Because of that split, the four
 * status counts will not necessarily sum to `total` — that's intentional,
 * not a bug, and the UI labels each figure by its own date basis.
 */
export type TicketStats = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
};

export async function getTicketStats(range: DateRange): Promise<TicketStats> {
  const [total, byStatus, completed] = await Promise.all([
    prisma.ticket.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    prisma.ticket.count({ where: { status: "COMPLETED", completedAt: { gte: range.from, lte: range.to } } }),
  ]);

  const countByStatus = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));

  return {
    total,
    pending: countByStatus.PENDING ?? 0,
    inProgress: countByStatus.IN_PROGRESS ?? 0,
    completed,
    cancelled: countByStatus.CANCELLED ?? 0,
  };
}

/** Money figures come exclusively from Payment.receivedAt — never a ticket's own fields — per the spec's explicit warning against assuming a ticket carries "the" payment amount. */
export type PaymentStats = {
  totalReceived: string;
  transactionCount: number;
  averagePayment: string;
};

export async function getPaymentStats(range: DateRange): Promise<PaymentStats> {
  const result = await prisma.payment.aggregate({
    where: { receivedAt: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
    _avg: { amount: true },
    _count: { _all: true },
  });

  return {
    totalReceived: (result._sum.amount ?? new Prisma.Decimal(0)).toString(),
    transactionCount: result._count._all,
    averagePayment: (result._avg.amount ?? new Prisma.Decimal(0)).toString(),
  };
}

export type TeamMemberStat = {
  teamMemberId: string;
  teamMemberName: string;
  assignedCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  totalReceived: string;
};

type TeamActivityRow = {
  teamMemberId: string;
  teamMemberName: string;
  assignedCount: bigint;
  pendingCount: bigint;
  inProgressCount: bigint;
  completedCount: bigint;
};

type TeamPaymentRow = {
  teamMemberId: string;
  totalReceived: Prisma.Decimal | null;
};

/**
 * Per-team-member breakdown needs to group by a joined table's fields
 * (Ticket.status/createdAt/completedAt through TicketAssignment), which
 * Prisma's query builder can't express as a single groupBy — raw SQL is
 * the right tool here, not a correctness compromise. Two separate grouped
 * queries (assignment/status via one join path, payments via another) are
 * used instead of one big query so the two join fan-outs can't multiply
 * each other's rows and silently corrupt the counts/sums.
 */
export async function getTeamStats(range: DateRange): Promise<TeamMemberStat[]> {
  const [activityRows, paymentRows] = await Promise.all([
    prisma.$queryRaw<TeamActivityRow[]>`
      SELECT
        tm.id AS "teamMemberId",
        tm.name AS "teamMemberName",
        COUNT(DISTINCT CASE WHEN ta."assignedAt" BETWEEN ${range.from} AND ${range.to} THEN ta.id END) AS "assignedCount",
        COUNT(DISTINCT CASE WHEN t.status = 'PENDING' AND t."createdAt" BETWEEN ${range.from} AND ${range.to} THEN t.id END) AS "pendingCount",
        COUNT(DISTINCT CASE WHEN t.status = 'IN_PROGRESS' AND t."createdAt" BETWEEN ${range.from} AND ${range.to} THEN t.id END) AS "inProgressCount",
        COUNT(DISTINCT CASE WHEN t.status = 'COMPLETED' AND t."completedAt" BETWEEN ${range.from} AND ${range.to} THEN t.id END) AS "completedCount"
      FROM "TeamMember" tm
      LEFT JOIN "TicketAssignment" ta ON ta."teamMemberId" = tm.id
      LEFT JOIN "Ticket" t ON t.id = ta."ticketId"
      WHERE tm."isActive" = true
      GROUP BY tm.id, tm.name
      ORDER BY tm.name ASC
    `,
    prisma.$queryRaw<TeamPaymentRow[]>`
      SELECT
        tm.id AS "teamMemberId",
        SUM(p.amount) AS "totalReceived"
      FROM "TeamMember" tm
      LEFT JOIN "Payment" p ON p."receivedBy" = tm."userId" AND p."receivedAt" BETWEEN ${range.from} AND ${range.to}
      WHERE tm."isActive" = true
      GROUP BY tm.id
    `,
  ]);

  const paymentByMember = new Map(paymentRows.map((row) => [row.teamMemberId, row.totalReceived]));

  return activityRows.map((row) => ({
    teamMemberId: row.teamMemberId,
    teamMemberName: row.teamMemberName,
    assignedCount: Number(row.assignedCount),
    pendingCount: Number(row.pendingCount),
    inProgressCount: Number(row.inProgressCount),
    completedCount: Number(row.completedCount),
    totalReceived: (paymentByMember.get(row.teamMemberId) ?? new Prisma.Decimal(0)).toString(),
  }));
}

const RECENT_ACTIVITY_LIMIT = 5;

export async function getRecentActivity() {
  const [recentTickets, recentCompletedTickets, recentPayments] = await Promise.all([
    prisma.ticket.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        ticketNumber: true,
        problem: true,
        status: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { status: "COMPLETED", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        ticketNumber: true,
        problem: true,
        completedAt: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.payment.findMany({
      orderBy: { receivedAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        receivedAt: true,
        ticket: { select: { id: true, ticketNumber: true } },
        receiver: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { recentTickets, recentCompletedTickets, recentPayments };
}

export type DailySummary = {
  ticketsCreated: number;
  ticketsCompleted: number;
  ticketsPending: number;
  ticketsInProgress: number;
  moneyReceived: string;
};

/**
 * "Pending"/"in progress" for a single day are scoped to tickets *created*
 * that day, broken down by current status — the same creation-date cohort
 * logic as getTicketStats, applied to a one-day range. There's no reliable
 * way to reconstruct "how many tickets were sitting in PENDING as of that
 * historical day" without replaying TicketStatusHistory for tickets that
 * never transitioned (which have no history row by design — see
 * prisma/schema.prisma), so this is the honest, consistently-defined
 * alternative rather than a fragile historical reconstruction.
 */
export async function getDailySummary(day: DateRange): Promise<DailySummary> {
  const [ticketsCreated, ticketsCompleted, byStatus, paymentTotal] = await Promise.all([
    prisma.ticket.count({ where: { createdAt: { gte: day.from, lte: day.to } } }),
    prisma.ticket.count({ where: { status: "COMPLETED", completedAt: { gte: day.from, lte: day.to } } }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { createdAt: { gte: day.from, lte: day.to } },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({ where: { receivedAt: { gte: day.from, lte: day.to } }, _sum: { amount: true } }),
  ]);

  const countByStatus = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));

  return {
    ticketsCreated,
    ticketsCompleted,
    ticketsPending: countByStatus.PENDING ?? 0,
    ticketsInProgress: countByStatus.IN_PROGRESS ?? 0,
    moneyReceived: (paymentTotal._sum.amount ?? new Prisma.Decimal(0)).toString(),
  };
}
