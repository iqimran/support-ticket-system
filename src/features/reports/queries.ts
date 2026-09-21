import { findCustomerById } from "@/features/customers/repository";
import type { DateRange } from "@/features/dashboard/periods";
import {
  getDailySummary,
  getPaymentStats,
  getTeamStats,
  getTicketStats,
  type DailySummary,
  type PaymentStats,
  type TeamMemberStat,
  type TicketStats,
} from "@/features/dashboard/repository";
import { getCustomerReportStats } from "@/features/reports/repository";

// Read-side only. Callers (pages, CSV export routes) are responsible for
// calling requireAdmin() first — every report here is admin-only.

export type DailyReport = { range: DateRange } & DailySummary;

export async function getDailyReport(range: DateRange): Promise<DailyReport> {
  const summary = await getDailySummary(range);
  return { range, ...summary };
}

export type MonthlyReport = { range: DateRange; tickets: TicketStats; payments: PaymentStats };

export async function getMonthlyReport(range: DateRange): Promise<MonthlyReport> {
  const [tickets, payments] = await Promise.all([getTicketStats(range), getPaymentStats(range)]);
  return { range, tickets, payments };
}

export type TeamMemberReport = { range: DateRange; members: TeamMemberStat[] };

export async function getTeamMemberReport(range: DateRange): Promise<TeamMemberReport> {
  const members = await getTeamStats(range);
  return { range, members };
}

export type CustomerReport = {
  customer: { id: string; phone: string; name: string | null; address: string | null };
  totalTickets: number;
  totalPaymentsReceived: string;
  firstSupportDate: Date | null;
  latestSupportDate: Date | null;
};

export async function getCustomerReport(customerId: string): Promise<CustomerReport | null> {
  const [customer, stats] = await Promise.all([findCustomerById(customerId), getCustomerReportStats(customerId)]);
  if (!customer) return null;
  return { customer, ...stats };
}
