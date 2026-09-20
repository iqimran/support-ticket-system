import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

export type PaymentRecordInput = {
  ticketId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  note?: string;
  receivedBy: string;
  receivedAt: Date;
};

export function createPaymentRecord(data: PaymentRecordInput) {
  return prisma.payment.create({ data });
}

export type PaymentUpdateInput = {
  amount: string;
  paymentMethod: PaymentMethod;
  note: string | null;
  receivedAt: Date;
};

export function updatePaymentRecord(id: string, data: PaymentUpdateInput) {
  return prisma.payment.update({ where: { id }, data });
}

export function findPaymentById(id: string) {
  return prisma.payment.findUnique({ where: { id } });
}

export function listPaymentsForTicket(ticketId: string) {
  return prisma.payment.findMany({
    where: { ticketId },
    orderBy: { receivedAt: "desc" },
    include: { receiver: { select: { id: true, name: true } } },
  });
}

/** ADMIN-only data — enforced by callers (the action/page layer), not here. */
export async function listPaymentAuditLogs(params: { page: number; pageSize: number }) {
  const [total, items] = await Promise.all([
    prisma.paymentAuditLog.count(),
    prisma.paymentAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        changedByUser: { select: { id: true, name: true } },
        ticket: { select: { id: true, ticketNumber: true } },
      },
    }),
  ]);

  return { total, items };
}

function toTotalString(sum: Prisma.Decimal | null): string {
  return (sum ?? new Prisma.Decimal(0)).toString();
}

export async function getTicketPaymentTotal(ticketId: string): Promise<string> {
  const result = await prisma.payment.aggregate({ where: { ticketId }, _sum: { amount: true } });
  return toTotalString(result._sum.amount);
}

export async function getCustomerPaymentTotal(customerId: string): Promise<string> {
  const result = await prisma.payment.aggregate({ where: { ticket: { customerId } }, _sum: { amount: true } });
  return toTotalString(result._sum.amount);
}

export async function getPaymentTotalForDateRange(from: Date, to: Date): Promise<string> {
  const result = await prisma.payment.aggregate({
    where: { receivedAt: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return toTotalString(result._sum.amount);
}

export function getDailyPaymentTotal(date: Date): Promise<string> {
  return getPaymentTotalForDateRange(startOfDay(date), endOfDay(date));
}

export function getMonthlyPaymentTotal(date: Date): Promise<string> {
  return getPaymentTotalForDateRange(startOfMonth(date), endOfMonth(date));
}
