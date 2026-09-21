import { Prisma } from "@/generated/prisma/client";
import type {
  Customer,
  PaymentArchive,
  PaymentAuditLogArchive,
  TicketArchive,
  TicketAssignmentArchive,
  TicketNoteArchive,
  TicketStatusHistoryArchive,
} from "@/generated/prisma/client";
import type { ArchiveBatchStatus, TicketStatus } from "@/generated/prisma/enums";
import type { ArchiveSearchInput } from "@/features/archive/schemas";
import { extractPhoneSearchDigits } from "@/lib/phone";
import { prisma } from "@/server/db/prisma";

/**
 * One page of archive candidates, oldest-first, bounded by `take` — never
 * loads the whole active-window backlog into memory at once. `excludeIds`
 * lets a single run skip past tickets that already failed earlier in that
 * same run (see runArchiveJob), so one bad ticket can't wedge every
 * subsequent page into re-selecting it forever.
 */
export function findArchivableTicketIds(
  cutoffDate: Date,
  take: number,
  excludeIds: string[] = [],
): Promise<{ id: string }[]> {
  return prisma.ticket.findMany({
    where: {
      createdAt: { lt: cutoffDate },
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export function updateArchiveBatch(
  id: string,
  data: {
    status: ArchiveBatchStatus;
    ticketsFound?: number;
    ticketsProcessed?: number;
    completedAt?: Date;
    errorMessage?: string | null;
  },
) {
  return prisma.archiveBatch.update({ where: { id }, data });
}

export type ArchivedTicketListItem = {
  id: string;
  ticketNumber: string;
  problem: string;
  status: TicketStatus;
  createdAt: Date;
  archivedAt: Date;
  customer: { id: string; name: string | null; phone: string };
};

/**
 * TicketArchive has no FK relation to Customer (see the schema doc comment
 * on TicketArchive — Customer is a live table archiving never touches, so
 * the id alone is a sufficient pointer). Searching "by customer phone/name"
 * therefore resolves matching customer ids first, then filters
 * TicketArchive by customerId — same net effect as a nested relation
 * filter, without adding one.
 */
function resolveMatchingCustomerIds(query: string): Promise<string[]> {
  const phoneDigits = extractPhoneSearchDigits(query);

  return prisma.customer
    .findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          ...(phoneDigits.length > 0 ? [{ phone: { contains: phoneDigits } }] : []),
        ],
      },
      select: { id: true },
    })
    .then((rows) => rows.map((row) => row.id));
}

function buildArchiveSearchWhere(
  params: ArchiveSearchInput,
  matchingCustomerIds: string[],
): Prisma.TicketArchiveWhereInput {
  const conditions: Prisma.TicketArchiveWhereInput[] = [];

  const trimmedQuery = params.query.trim();
  if (trimmedQuery) {
    const orConditions: Prisma.TicketArchiveWhereInput[] = [
      { ticketNumber: { contains: trimmedQuery, mode: "insensitive" } },
    ];
    if (matchingCustomerIds.length > 0) {
      orConditions.push({ customerId: { in: matchingCustomerIds } });
    }
    conditions.push({ OR: orConditions });
  }

  if (params.status) conditions.push({ status: params.status });
  if (params.dateFrom || params.dateTo) {
    conditions.push({
      createdAt: {
        ...(params.dateFrom ? { gte: params.dateFrom } : {}),
        ...(params.dateTo ? { lte: params.dateTo } : {}),
      },
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

/**
 * Paginated at the database level (skip/take + a separate count query) —
 * never fetches the whole archive to filter or count it in memory, however
 * large it grows.
 */
export async function searchArchivedTickets(
  params: ArchiveSearchInput,
): Promise<{ items: ArchivedTicketListItem[]; total: number }> {
  const trimmedQuery = params.query.trim();
  const matchingCustomerIds = trimmedQuery ? await resolveMatchingCustomerIds(trimmedQuery) : [];
  const where = buildArchiveSearchWhere(params, matchingCustomerIds);

  const [total, rows] = await Promise.all([
    prisma.ticketArchive.count({ where }),
    prisma.ticketArchive.findMany({
      where,
      orderBy: { [params.sortBy]: params.sortDir },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        ticketNumber: true,
        problem: true,
        status: true,
        customerId: true,
        createdAt: true,
        archivedAt: true,
      },
    }),
  ]);

  if (rows.length === 0) return { items: [], total };

  const customerIds = [...new Set(rows.map((row) => row.customerId))];
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true, phone: true },
  });
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const items = rows.map((row) => ({
    id: row.id,
    ticketNumber: row.ticketNumber,
    problem: row.problem,
    status: row.status,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    customer: customerById.get(row.customerId) ?? { id: row.customerId, name: null, phone: "" },
  }));

  return { items, total };
}

export type ArchivedTicketBundle = {
  ticket: TicketArchive;
  customer: Customer | null;
  creatorName: string;
  assignments: (TicketAssignmentArchive & { teamMemberName: string; assignerName: string })[];
  statusHistory: (TicketStatusHistoryArchive & { changedByName: string })[];
  notes: (TicketNoteArchive & { creatorName: string })[];
  payments: (PaymentArchive & { receiverName: string })[];
  /** null (not just empty) when the caller isn't permitted to see payment audit data — see canViewPaymentAudit. */
  paymentAuditLogs: (PaymentAuditLogArchive & { changedByName: string })[] | null;
};

/**
 * Full read-only bundle for the historical ticket view: the archived
 * ticket plus every related record type, with names resolved for display.
 * TicketArchive's related tables store plain user/team-member ids (no FK —
 * see the schema doc comments), so names are resolved via a couple of
 * batched lookups rather than a Prisma `include`.
 *
 * `includePaymentAudit` is decided by the caller (canViewPaymentAudit) —
 * when false, payment audit rows are never even fetched, not just hidden.
 */
export async function findArchivedTicketBundle(
  id: string,
  options: { includePaymentAudit: boolean },
): Promise<ArchivedTicketBundle | null> {
  const ticket = await prisma.ticketArchive.findUnique({ where: { id } });
  if (!ticket) return null;

  const [assignments, statusHistory, notes, payments] = await Promise.all([
    prisma.ticketAssignmentArchive.findMany({ where: { ticketId: id }, orderBy: { assignedAt: "asc" } }),
    prisma.ticketStatusHistoryArchive.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } }),
    prisma.ticketNoteArchive.findMany({ where: { ticketId: id }, orderBy: { createdAt: "desc" } }),
    prisma.paymentArchive.findMany({ where: { ticketId: id }, orderBy: { receivedAt: "desc" } }),
  ]);

  const paymentIds = payments.map((payment) => payment.id);
  const paymentAuditLogs =
    options.includePaymentAudit && paymentIds.length > 0
      ? await prisma.paymentAuditLogArchive.findMany({
          where: { paymentId: { in: paymentIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const userIds = new Set<string>([ticket.createdBy]);
  for (const a of assignments) userIds.add(a.assignedBy);
  for (const h of statusHistory) userIds.add(h.changedBy);
  for (const n of notes) userIds.add(n.createdBy);
  for (const p of payments) userIds.add(p.receivedBy);
  for (const l of paymentAuditLogs) userIds.add(l.changedBy);
  const teamMemberIds = new Set(assignments.map((a) => a.teamMemberId));

  const [customer, users, teamMembers] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ticket.customerId } }),
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }),
    prisma.teamMember.findMany({ where: { id: { in: [...teamMemberIds] } }, select: { id: true, name: true } }),
  ]);

  const userNameById = new Map(users.map((u) => [u.id, u.name]));
  const teamMemberNameById = new Map(teamMembers.map((t) => [t.id, t.name]));
  const nameOfUser = (userId: string) => userNameById.get(userId) ?? "Unknown";

  return {
    ticket,
    customer,
    creatorName: nameOfUser(ticket.createdBy),
    assignments: assignments.map((a) => ({
      ...a,
      teamMemberName: teamMemberNameById.get(a.teamMemberId) ?? "Unknown",
      assignerName: nameOfUser(a.assignedBy),
    })),
    statusHistory: statusHistory.map((h) => ({ ...h, changedByName: nameOfUser(h.changedBy) })),
    notes: notes.map((n) => ({ ...n, creatorName: nameOfUser(n.createdBy) })),
    payments: payments.map((p) => ({ ...p, receiverName: nameOfUser(p.receivedBy) })),
    paymentAuditLogs: options.includePaymentAudit
      ? paymentAuditLogs.map((l) => ({ ...l, changedByName: nameOfUser(l.changedBy) }))
      : null,
  };
}
