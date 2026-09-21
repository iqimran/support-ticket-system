import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodSelector } from "@/features/dashboard/components/period-selector";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { TeamStatsTable } from "@/features/dashboard/components/team-stats-table";
import { getTeamMemberReport } from "@/features/reports/queries";
import { periodReportSchema } from "@/features/reports/schemas";
import { formatDate } from "@/lib/format-date";
import { requireAdmin } from "@/server/authorization";

type TeamMemberReportPageProps = {
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

export default async function TeamMemberReportPage({ searchParams }: TeamMemberReportPageProps) {
  await requireAdmin();

  const rawParams = await searchParams;
  const parsed = periodReportSchema.parse(cleanParams(rawParams));
  const range = resolvePeriodRange(parsed);
  const report = await getTeamMemberReport(range);

  const exportParams = new URLSearchParams({ period: parsed.period });
  if (parsed.from) exportParams.set("from", parsed.from.toISOString());
  if (parsed.to) exportParams.set("to", parsed.to.toISOString());

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground text-sm hover:underline">
        ← Back to Reports
      </Link>
      <PageHeader
        title="Team member report"
        description={`Admin-only. Showing ${formatDate(range.from)} – ${formatDate(range.to)}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector period={parsed.period} from={parsed.from?.toISOString()} to={parsed.to?.toISOString()} />
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/team-members/csv?${exportParams.toString()}`}>
                <Download aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          </div>
        }
      />

      <TeamStatsTable stats={report.members} />
    </div>
  );
}
