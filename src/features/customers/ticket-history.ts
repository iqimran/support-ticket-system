import { Prisma } from "@/generated/prisma/client";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { TICKET_STATUSES } from "@/features/tickets/schemas";
import { extractPhoneSearchDigits } from "@/lib/phone";
import { prisma } from "@/server/db/prisma";

export type TicketHistorySort = "createdAt" | "status";
export type SortDirection = "asc" | "desc";

export type TicketHistoryFilters = {
  query?: string;
  status?: TicketStatus;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy: TicketHistorySort;
  sortDir: SortDirection;
};

export type TicketHistorySource = "active" | "archived";

export type TicketHistoryEntry = {
  id: string;
  ticketNumber: string;
  problem: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  source: TicketHistorySource;
  assignedMembers: { id: string; name: string }[];
  paymentReceived: string;
};

export type TicketHistoryPage = {
  items: TicketHistoryEntry[];
  total: number;
};

export type TicketHistoryPagination = { page: number; pageSize: number };

type LightweightEntry = Omit<TicketHistoryEntry, "assignedMembers" | "paymentReceived">;

// Postgres sorts native enums by declaration order (see
// features/tickets/repository.ts), not alphabetically — this mirrors that
// order so merging two already-correctly-sorted sources stays consistent.
const STATUS_ORDER: Record<TicketStatus, number> = Object.fromEntries(
  TICKET_STATUSES.map((status, index) => [status, index]),
) as Record<TicketStatus, number>;

function compareEntries(a: LightweightEntry, b: LightweightEntry, sortBy: TicketHistorySort, sortDir: SortDirection): number {
  const direction = sortDir === "asc" ? 1 : -1;
  if (sortBy === "status") {
    return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * direction;
  }
  return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
}

function buildWhere(customerId: string, filters: TicketHistoryFilters, archived: boolean): Prisma.TicketWhereInput {
  const conditions: Prisma.TicketWhereInput[] = [
    { customerId },
    archived ? { archivedAt: { not: null } } : { archivedAt: null },
  ];

  const trimmedQuery = filters.query?.trim();
  if (trimmedQuery) {
    const orConditions: Prisma.TicketWhereInput[] = [
      { ticketNumber: { contains: trimmedQuery, mode: "insensitive" } },
      { problem: { contains: trimmedQuery, mode: "insensitive" } },
    ];
    const phoneDigits = extractPhoneSearchDigits(trimmedQuery);
    if (phoneDigits.length > 0) {
      orConditions.push({ customer: { phone: { contains: phoneDigits } } });
    }
    conditions.push({ OR: orConditions });
  }

  if (filters.status) conditions.push({ status: filters.status });
  if (filters.dateFrom || filters.dateTo) {
    conditions.push({
      createdAt: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    });
  }

  return { AND: conditions };
}

/**
 * One source of ticket history — either the active window or the archive.
 * `getTopN` deliberately has no offset: the combiner (below) always asks
 * for "the first N matching rows" from each source and merges the two
 * pre-sorted arrays itself, which is what makes correct pagination across
 * two independently-stored sources possible without ever loading a whole
 * source into memory.
 */
interface TicketHistorySourceProvider {
  count(customerId: string, filters: TicketHistoryFilters): Promise<number>;
  getTopN(customerId: string, filters: TicketHistoryFilters, limit: number): Promise<LightweightEntry[]>;
}

function makeSourceProvider(source: TicketHistorySource): TicketHistorySourceProvider {
  const archived = source === "archived";

  return {
    count(customerId, filters) {
      return prisma.ticket.count({ where: buildWhere(customerId, filters, archived) });
    },
    async getTopN(customerId, filters, limit) {
      const tickets = await prisma.ticket.findMany({
        where: buildWhere(customerId, filters, archived),
        orderBy: { [filters.sortBy]: filters.sortDir },
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          problem: true,
          status: true,
          priority: true,
          createdAt: true,
          completedAt: true,
          archivedAt: true,
        },
      });
      return tickets.map((ticket) => ({ ...ticket, source }));
    },
  };
}

/** Fetches assignedMembers + paymentReceived only for the exact rows that will be displayed — never for overfetched-then-discarded merge candidates. */
async function enrichPage(entries: LightweightEntry[]): Promise<TicketHistoryEntry[]> {
  if (entries.length === 0) return [];

  const ticketIds = entries.map((entry) => entry.id);

  const [assignments, paymentTotals] = await Promise.all([
    prisma.ticketAssignment.findMany({
      where: { ticketId: { in: ticketIds } },
      select: { ticketId: true, teamMember: { select: { id: true, name: true } } },
    }),
    prisma.payment.groupBy({ by: ["ticketId"], where: { ticketId: { in: ticketIds } }, _sum: { amount: true } }),
  ]);

  const assignedByTicket = new Map<string, { id: string; name: string }[]>();
  for (const assignment of assignments) {
    const list = assignedByTicket.get(assignment.ticketId) ?? [];
    list.push(assignment.teamMember);
    assignedByTicket.set(assignment.ticketId, list);
  }

  const paymentByTicket = new Map(paymentTotals.map((row) => [row.ticketId, row._sum.amount]));

  return entries.map((entry) => ({
    ...entry,
    assignedMembers: assignedByTicket.get(entry.id) ?? [],
    paymentReceived: (paymentByTicket.get(entry.id) ?? new Prisma.Decimal(0)).toString(),
  }));
}

/**
 * Unified, paginated support history spanning both the active window and
 * the archive — the UI never needs to know which source a ticket came
 * from. `archivedAt` is either null or not, a strict partition of the same
 * underlying data, so a ticket can never be counted by both sources at
 * once: duplication during the merge is structurally impossible as long as
 * both sources use the shared buildWhere() (which they do).
 */
export async function getCustomerSupportHistory(
  customerId: string,
  filters: TicketHistoryFilters,
  pagination: TicketHistoryPagination,
): Promise<TicketHistoryPage> {
  const active = makeSourceProvider("active");
  const archived = makeSourceProvider("archived");

  const { page, pageSize } = pagination;
  const upTo = page * pageSize;

  const [activeCount, archivedCount, activeRows, archivedRows] = await Promise.all([
    active.count(customerId, filters),
    archived.count(customerId, filters),
    active.getTopN(customerId, filters, upTo),
    archived.getTopN(customerId, filters, upTo),
  ]);

  // Both arrays are already individually sorted by the DB — a standard
  // two-pointer merge combines them in O(n) without re-sorting.
  const merged: LightweightEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < activeRows.length && j < archivedRows.length) {
    if (compareEntries(activeRows[i]!, archivedRows[j]!, filters.sortBy, filters.sortDir) <= 0) {
      merged.push(activeRows[i]!);
      i++;
    } else {
      merged.push(archivedRows[j]!);
      j++;
    }
  }
  merged.push(...activeRows.slice(i), ...archivedRows.slice(j));

  const pageEntries = merged.slice((page - 1) * pageSize, page * pageSize);
  const items = await enrichPage(pageEntries);

  return { items, total: activeCount + archivedCount };
}
