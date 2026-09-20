import { Prisma } from "@/generated/prisma/client";
import { extractPhoneSearchDigits } from "@/lib/phone";
import { prisma } from "@/server/db/prisma";
import type { CustomerSearchInput } from "@/features/customers/schemas";

export type CustomerRecordInput = {
  phone: string;
  name?: string;
  address?: string;
  note?: string;
};

// Unlike create, update always writes the full record: Prisma treats an
// `undefined` field as "leave unchanged", so a cleared form field must be
// sent as `null` here or it would silently fail to clear.
export type CustomerUpdateInput = {
  phone: string;
  name: string | null;
  address: string | null;
  note: string | null;
};

export function findCustomerByPhone(phone: string) {
  return prisma.customer.findUnique({ where: { phone } });
}

export function findCustomerById(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

export function createCustomerRecord(data: CustomerRecordInput) {
  return prisma.customer.create({ data });
}

export function updateCustomerRecord(id: string, data: CustomerUpdateInput) {
  return prisma.customer.update({ where: { id }, data });
}

/** True for a Prisma unique-constraint violation (P2002) — used to catch the create/update race on Customer.phone. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function buildCustomerSearchWhere(query: string): Prisma.CustomerWhereInput | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  const conditions: Prisma.CustomerWhereInput[] = [{ name: { contains: trimmed, mode: "insensitive" } }];

  const phoneDigits = extractPhoneSearchDigits(trimmed);
  if (phoneDigits.length > 0) {
    conditions.push({ phone: { contains: phoneDigits } });
  }

  return { OR: conditions };
}

export type CustomerListItem = {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  createdAt: Date;
  ticketCount: number;
  lastSupportAt: Date | null;
};

export async function listCustomers(
  params: CustomerSearchInput,
): Promise<{ items: CustomerListItem[]; total: number }> {
  const { query, page, pageSize, sortBy, sortDir } = params;
  const where = buildCustomerSearchWhere(query);

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sortBy === "ticketCount" ? { tickets: { _count: sortDir } } : { [sortBy]: sortDir };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { tickets: true } },
        tickets: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  return {
    total,
    items: customers.map((customer) => ({
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      address: customer.address,
      createdAt: customer.createdAt,
      ticketCount: customer._count.tickets,
      lastSupportAt: customer.tickets[0]?.createdAt ?? null,
    })),
  };
}

export type CustomerTicketStats = {
  totalTicketCount: number;
  activeTicketCount: number;
  completedTicketCount: number;
  totalReceivedPayment: string;
};

export async function getCustomerTicketStats(customerId: string): Promise<CustomerTicketStats> {
  const [totalTicketCount, activeTicketCount, completedTicketCount, paymentTotal] = await Promise.all([
    prisma.ticket.count({ where: { customerId } }),
    prisma.ticket.count({ where: { customerId, archivedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    prisma.ticket.count({ where: { customerId, status: "COMPLETED" } }),
    prisma.payment.aggregate({ where: { ticket: { customerId } }, _sum: { amount: true } }),
  ]);

  return {
    totalTicketCount,
    activeTicketCount,
    completedTicketCount,
    totalReceivedPayment: (paymentTotal._sum.amount ?? new Prisma.Decimal(0)).toString(),
  };
}
