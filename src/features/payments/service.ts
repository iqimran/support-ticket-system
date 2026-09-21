import type { Payment } from "@/generated/prisma/client";
import type { RecordPaymentInput, UpdatePaymentInput } from "@/features/payments/schemas";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

export type RecordPaymentResult =
  | { status: "recorded"; payment: Payment }
  | { status: "ticket_not_found" }
  | { status: "ticket_not_completed" };

/**
 * Payments may only be recorded against a COMPLETED ticket (project
 * decision, matching the spec's "a completed ticket may have zero or more
 * payments" framing). Updating an existing payment is not gated on current
 * ticket status — see updatePayment — since correcting a historical record
 * shouldn't become impossible just because the ticket was later reopened.
 *
 * The Payment insert and its CREATED PaymentAuditLog entry are written in
 * one transaction: a payment must never exist without its audit trail.
 */
export async function recordPayment(input: RecordPaymentInput, receivedBy: string): Promise<RecordPaymentResult> {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) {
      return { status: "ticket_not_found" } as const;
    }
    if (ticket.status !== "COMPLETED") {
      return { status: "ticket_not_completed" } as const;
    }

    const payment = await tx.payment.create({
      data: {
        ticketId: input.ticketId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: input.note,
        receivedBy,
        receivedAt: input.receivedAt,
      },
    });

    await tx.paymentAuditLog.create({
      data: {
        paymentId: payment.id,
        ticketId: input.ticketId,
        action: "CREATED",
        newAmount: payment.amount,
        newPaymentMethod: payment.paymentMethod,
        newNote: payment.note,
        changedBy: receivedBy,
      },
    });

    return { status: "recorded", payment } as const;
  });

  if (result.status === "recorded") {
    logger.info("payment.recorded", {
      paymentId: result.payment.id,
      ticketId: result.payment.ticketId,
      amount: result.payment.amount.toString(),
      paymentMethod: result.payment.paymentMethod,
      receivedBy,
    });
  } else {
    logger.warn("payment.record_rejected", { ticketId: input.ticketId, reason: result.status, receivedBy });
  }

  return result;
}

export type UpdatePaymentResult = { status: "updated"; payment: Payment } | { status: "not_found" };

/**
 * Corrections go through UPDATE, never delete-and-recreate — payment rows
 * are never physically deleted (see prisma/schema.prisma). Every update
 * writes an UPDATED PaymentAuditLog row capturing the old and new values,
 * in the same transaction as the update itself.
 */
export async function updatePayment(
  paymentId: string,
  input: UpdatePaymentInput,
  changedBy: string,
): Promise<UpdatePaymentResult> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!existing) {
      return { status: "not_found" } as const;
    }

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        note: input.note ?? null,
        receivedAt: input.receivedAt,
      },
    });

    await tx.paymentAuditLog.create({
      data: {
        paymentId,
        ticketId: existing.ticketId,
        action: "UPDATED",
        oldAmount: existing.amount,
        newAmount: updated.amount,
        oldPaymentMethod: existing.paymentMethod,
        newPaymentMethod: updated.paymentMethod,
        oldNote: existing.note,
        newNote: updated.note,
        changedBy,
      },
    });

    return { status: "updated", payment: updated, oldAmount: existing.amount } as const;
  });

  if (result.status === "updated") {
    logger.info("payment.updated", {
      paymentId: result.payment.id,
      ticketId: result.payment.ticketId,
      oldAmount: result.oldAmount.toString(),
      newAmount: result.payment.amount.toString(),
      changedBy,
    });
  } else {
    logger.warn("payment.update_rejected", { paymentId, reason: result.status, changedBy });
  }

  return result;
}
