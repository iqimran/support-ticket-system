import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export type CustomerReportStats = {
  totalTickets: number;
  totalPaymentsReceived: string;
  firstSupportDate: Date | null;
  latestSupportDate: Date | null;
};

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * A customer's full support history spans both the live Ticket/Payment
 * tables and their *_archive counterparts (see prisma/schema.prisma) —
 * a long-standing customer's earliest tickets are very likely archived by
 * now. Both sides are aggregated in the database (count/sum/min/max), never
 * loaded row-by-row, and combined here rather than in two separate report
 * fields, since "total support tickets" means the customer's whole history,
 * not just what's still in the active window.
 */
export async function getCustomerReportStats(customerId: string): Promise<CustomerReportStats> {
  const [liveTickets, archivedTickets, livePayments, archivedPayments] = await Promise.all([
    prisma.ticket.aggregate({
      where: { customerId },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.ticketArchive.aggregate({
      where: { customerId },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.payment.aggregate({ where: { ticket: { customerId } }, _sum: { amount: true } }),
    // PaymentArchive -> TicketArchive is a real relation (unlike TicketArchive -> Customer,
    // which is a plain column — see schema comments), so this nested filter works the same way.
    prisma.paymentArchive.aggregate({ where: { ticket: { customerId } }, _sum: { amount: true } }),
  ]);

  const totalTickets = liveTickets._count._all + archivedTickets._count._all;
  const totalPaymentsReceived = new Prisma.Decimal(livePayments._sum.amount ?? 0)
    .plus(archivedPayments._sum.amount ?? 0)
    .toString();

  return {
    totalTickets,
    totalPaymentsReceived,
    firstSupportDate: earliest(liveTickets._min.createdAt, archivedTickets._min.createdAt),
    latestSupportDate: latest(liveTickets._max.createdAt, archivedTickets._max.createdAt),
  };
}
