import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { PeriodSelector } from "@/features/dashboard/components/period-selector";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { getMonthlyReport } from "@/features/reports/queries";
import { periodReportSchema } from "@/features/reports/schemas";
import { formatDate } from "@/lib/format-date";
import { requireAdmin } from "@/server/authorization";

type MonthlyReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function cleanParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) result[key] = single;
  }
  return result;
}

export default async function MonthlyReportPage({ searchParams }: MonthlyReportPageProps) {
  await requireAdmin();

  const rawParams = await searchParams;
  const parsed = periodReportSchema.parse(cleanParams(rawParams));
  const range = resolvePeriodRange(parsed);
  const report = await getMonthlyReport(range);

  const exportParams = new URLSearchParams({ period: parsed.period });
  if (parsed.from) exportParams.set("from", parsed.from.toISOString());
  if (parsed.to) exportParams.set("to", parsed.to.toISOString());

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground text-sm hover:underline">
        ← Back to Reports
      </Link>
      <PageHeader
        title="Monthly report"
        description={`Admin-only. Showing ${formatDate(range.from)} – ${formatDate(range.to)}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector period={parsed.period} from={parsed.from?.toISOString()} to={parsed.to?.toISOString()} />
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/monthly/csv?${exportParams.toString()}`}>
                <Download aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          </div>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tickets</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total" value={report.tickets.total} />
          <StatCard label="Completed" value={report.tickets.completed} />
          <StatCard label="Pending" value={report.tickets.pending} />
          <StatCard label="In progress" value={report.tickets.inProgress} />
          <StatCard label="Cancelled" value={report.tickets.cancelled} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payments</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total money received" value={<MoneyDisplay amount={report.payments.totalReceived} />} />
          <StatCard label="Number of payments" value={report.payments.transactionCount} />
        </div>
      </section>
    </div>
  );
}
