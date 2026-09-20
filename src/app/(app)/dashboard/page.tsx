import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { MoneyDisplay } from "@/components/shared/money-display";
import { DailySummaryPanel } from "@/features/dashboard/components/daily-summary-panel";
import { PeriodSelector } from "@/features/dashboard/components/period-selector";
import { RecentActivity } from "@/features/dashboard/components/recent-activity";
import { TeamStatsTable } from "@/features/dashboard/components/team-stats-table";
import { getDailySummaryForDate, getDashboardData } from "@/features/dashboard/queries";
import { dashboardPeriodSchema } from "@/features/dashboard/schemas";
import { formatDate } from "@/lib/format-date";
import type { AuthUser } from "@/server/auth/types";
import { canViewPaymentAudit, requireAuth } from "@/server/authorization";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireAuth();

  if (!canViewPaymentAudit(user)) {
    return <TeamMemberDashboard user={user} />;
  }

  const rawParams = await searchParams;
  const parsed = dashboardPeriodSchema.parse(rawParams);
  const today = new Date();

  const [dashboard, dailySummary] = await Promise.all([
    getDashboardData(parsed),
    getDailySummaryForDate(today),
  ]);

  const { ticketStats, paymentStats, teamStats, recentActivity } = dashboard;
  const periodLabel = `${formatDate(dashboard.range.from)} – ${formatDate(dashboard.range.to)}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={`Showing ${periodLabel}`}
        actions={
          <PeriodSelector period={parsed.period} from={parsed.from?.toISOString()} to={parsed.to?.toISOString()} />
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ticket statistics</h2>
        <p className="text-muted-foreground text-sm">
          Total, pending, in progress, and cancelled are counted by ticket creation date; completed is counted by
          completion date — a ticket completed this period may have been created earlier.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total (created)" value={ticketStats.total} />
          <StatCard label="Pending" value={ticketStats.pending} />
          <StatCard label="In progress" value={ticketStats.inProgress} />
          <StatCard label="Completed" value={ticketStats.completed} description="By completion date" />
          <StatCard label="Cancelled" value={ticketStats.cancelled} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payment statistics</h2>
        <p className="text-muted-foreground text-sm">Calculated from when payments were received, not ticket creation.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total received" value={<MoneyDisplay amount={paymentStats.totalReceived} />} />
          <StatCard label="Transactions" value={paymentStats.transactionCount} />
          <StatCard label="Average payment" value={<MoneyDisplay amount={paymentStats.averagePayment} />} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Team statistics</h2>
        <TeamStatsTable stats={teamStats} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <RecentActivity {...recentActivity} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Daily summary</h2>
        <DailySummaryPanel initialDate={today} initialSummary={dailySummary} />
      </section>
    </div>
  );
}

function TeamMemberDashboard({ user }: { user: Pick<AuthUser, "name" | "role"> }) {
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name}`} description={`Signed in as ${user.role}.`} />
      <p className="text-muted-foreground text-sm">The full dashboard is not built yet.</p>
    </div>
  );
}
