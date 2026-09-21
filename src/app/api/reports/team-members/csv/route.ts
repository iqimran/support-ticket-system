import type { NextRequest } from "next/server";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { getTeamMemberReport } from "@/features/reports/queries";
import { periodReportSchema } from "@/features/reports/schemas";
import { toCsv } from "@/lib/csv";
import { requireAdmin } from "@/server/authorization";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const parsed = periodReportSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const range = resolvePeriodRange(parsed);
  const report = await getTeamMemberReport(range);

  const csv = toCsv(report.members, [
    { header: "Team Member", value: (row) => row.teamMemberName },
    { header: "Assigned Tickets", value: (row) => row.assignedCount },
    { header: "Completed Tickets", value: (row) => row.completedCount },
    { header: "Pending Tickets", value: (row) => row.pendingCount },
    { header: "In Progress Tickets", value: (row) => row.inProgressCount },
    { header: "Total Payments Recorded", value: (row) => row.totalReceived },
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="team-member-report-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
