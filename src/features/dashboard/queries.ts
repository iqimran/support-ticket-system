import {
  getDailySummary,
  getPaymentStats,
  getRecentActivity,
  getTeamStats,
  getTicketStats,
} from "@/features/dashboard/repository";
import { resolvePeriodRange, type DashboardPeriod } from "@/features/dashboard/periods";

// Read-side only. The page calling this is responsible for requireAdmin().

export async function getDashboardData(input: { period: DashboardPeriod; from?: Date; to?: Date }) {
  const range = resolvePeriodRange(input);

  const [ticketStats, paymentStats, teamStats, recentActivity] = await Promise.all([
    getTicketStats(range),
    getPaymentStats(range),
    getTeamStats(range),
    getRecentActivity(),
  ]);

  return { range, ticketStats, paymentStats, teamStats, recentActivity };
}

export function getDailySummaryForDate(date: Date) {
  const range = resolvePeriodRange({ period: "custom", from: date, to: date });
  return getDailySummary(range);
}
