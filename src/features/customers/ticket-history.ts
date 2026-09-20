import type { TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export type TicketHistoryEntry = {
  id: string;
  ticketNumber: string;
  problem: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
};

export type TicketHistorySource = "active" | "archive";

export type TicketHistoryPage = {
  items: TicketHistoryEntry[];
  total: number;
  source: TicketHistorySource;
};

export type TicketHistoryPagination = { page: number; pageSize: number };

/**
 * A customer's support history will eventually span two sources: tickets
 * still in the 3-month active window, and tickets that have been archived
 * out of it. Both need to be searchable through the same interface once the
 * archive system exists (see prisma/schema.prisma's note on Ticket.archivedAt).
 *
 * Only the active-window provider is implemented for now. When the archive
 * system lands, add an ArchiveTicketHistoryProvider with the same interface
 * and a CombinedTicketHistoryProvider that merges/paginates across both —
 * callers of getCustomerSupportHistory() won't need to change.
 */
export interface TicketHistoryProvider {
  getHistory(customerId: string, pagination: TicketHistoryPagination): Promise<TicketHistoryPage>;
}

export class ActiveTicketHistoryProvider implements TicketHistoryProvider {
  async getHistory(customerId: string, { page, pageSize }: TicketHistoryPagination): Promise<TicketHistoryPage> {
    const where = { customerId, archivedAt: null };

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
    ]);

    return { items: tickets, total, source: "active" };
  }
}

export function getCustomerSupportHistory(
  customerId: string,
  pagination: TicketHistoryPagination,
  provider: TicketHistoryProvider = new ActiveTicketHistoryProvider(),
): Promise<TicketHistoryPage> {
  return provider.getHistory(customerId, pagination);
}
