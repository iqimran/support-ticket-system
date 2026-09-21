import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { DailyReportPanel } from "@/features/reports/components/daily-report-panel";
import { getDailyReport } from "@/features/reports/queries";
import { dailyReportSchema } from "@/features/reports/schemas";
import { requireAdmin } from "@/server/authorization";

type DailyReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DailyReportPage({ searchParams }: DailyReportPageProps) {
  await requireAdmin();

  const rawParams = await searchParams;
  const rawDate = Array.isArray(rawParams.date) ? rawParams.date[0] : rawParams.date;
  const parsed = dailyReportSchema.parse(rawDate ? { date: rawDate } : {});
  const date = parsed.date ?? new Date();

  const range = resolvePeriodRange({ period: "custom", from: date, to: date });
  const report = await getDailyReport(range);

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground text-sm hover:underline">
        ← Back to Reports
      </Link>
      <PageHeader
        title="Daily report"
        description="Admin-only. Tickets created, completed, pending, and in progress, plus money received, for one date."
      />
      <DailyReportPanel initialDate={date} initialSummary={report} />
    </div>
  );
}
