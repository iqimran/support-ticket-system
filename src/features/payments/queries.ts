import {
  getCustomerPaymentTotal,
  getDailyPaymentTotal,
  getMonthlyPaymentTotal,
  getPaymentTotalForDateRange,
  getTicketPaymentTotal,
  listPaymentAuditLogs,
  listPaymentsForTicket,
} from "@/features/payments/repository";
import type { PaymentAuditLogSearchInput } from "@/features/payments/schemas";

// Read-side only. Callers (pages/actions) are responsible for
// requireAuth()/requireTeamMember()/requireAdmin() as appropriate. In
// particular, everything audit-log-related here must only ever be reached
// through a requireAdmin() gate — see features/payments/actions.ts.

export function getPaymentsForTicket(ticketId: string) {
  return listPaymentsForTicket(ticketId);
}

export function getPaymentAuditLogs(params: PaymentAuditLogSearchInput) {
  return listPaymentAuditLogs(params);
}

export {
  getCustomerPaymentTotal,
  getDailyPaymentTotal,
  getMonthlyPaymentTotal,
  getPaymentTotalForDateRange,
  getTicketPaymentTotal,
};
