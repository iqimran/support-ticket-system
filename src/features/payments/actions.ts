"use server";

import { revalidatePath } from "next/cache";
import {
  getDailyPaymentTotal,
  getMonthlyPaymentTotal,
  getPaymentAuditLogs,
  getPaymentTotalForDateRange,
} from "@/features/payments/queries";
import { dateRangeTotalSchema, paymentAuditLogSearchSchema, recordPaymentSchema, updatePaymentSchema } from "@/features/payments/schemas";
import { recordPayment, updatePayment } from "@/features/payments/service";
import { recordAuditLog } from "@/server/audit/log";
import { canViewPaymentAudit, requireAdmin, requireTeamMember } from "@/server/authorization";

export type PaymentActionResult<TExtra extends object = object> =
  | ({ status: "success" } & TExtra)
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

// Both ADMIN and TEAM_MEMBER may record/update payments — Prompt 3 lists
// "Record received payments" as a general TEAM_MEMBER capability with no
// stated restriction, and this mirrors ticket notes/assignment/status
// changes, which are similarly open to both roles.

export async function recordPaymentAction(input: unknown): Promise<PaymentActionResult<{ paymentId: string }>> {
  const user = await requireTeamMember();

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await recordPayment(parsed.data, user.id);

  if (result.status === "ticket_not_found") {
    return { status: "error", message: "Ticket not found." };
  }
  if (result.status === "ticket_not_completed") {
    return { status: "error", message: "Payments can only be recorded on a completed ticket." };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "payment.created",
    entityType: "Payment",
    entityId: result.payment.id,
    metadata: { ticketId: parsed.data.ticketId },
  });
  revalidatePath(`/tickets/${parsed.data.ticketId}`);

  return { status: "success", paymentId: result.payment.id };
}

export async function updatePaymentAction(paymentId: string, input: unknown): Promise<PaymentActionResult> {
  const user = await requireTeamMember();

  const parsed = updatePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await updatePayment(paymentId, parsed.data, user.id);

  if (result.status === "not_found") {
    return { status: "error", message: "Payment not found." };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "payment.updated",
    entityType: "Payment",
    entityId: paymentId,
  });
  revalidatePath(`/tickets/${result.payment.ticketId}`);

  return { status: "success" };
}

// --- ADMIN-only: payment audit log access ---
// This is the critical authorization boundary for the whole feature: team
// members can see payment amounts on a ticket (via getPaymentsForTicket,
// called straight from the ticket detail page), but never this data.

export async function getPaymentAuditLogsAction(input: unknown) {
  await requireAdmin();

  const parsed = paymentAuditLogSearchSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid input");
  }

  return getPaymentAuditLogs(parsed.data);
}

export async function getDateRangePaymentTotalAction(input: unknown): Promise<{ total: string } | { error: string }> {
  await requireAdmin();

  const parsed = dateRangeTotalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid date range" };
  }

  const total = await getPaymentTotalForDateRange(parsed.data.from, parsed.data.to);
  return { total };
}

export async function getPaymentTotalsSummaryAction() {
  const user = await requireAdmin();
  if (!canViewPaymentAudit(user)) {
    // Unreachable given requireAdmin() above, but keeps this function
    // honest about the permission it depends on if that ever changes.
    throw new Error("Forbidden");
  }

  const now = new Date();
  const [today, thisMonth] = await Promise.all([getDailyPaymentTotal(now), getMonthlyPaymentTotal(now)]);

  return { today, thisMonth };
}
