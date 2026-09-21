import type { NextRequest } from "next/server";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { getDailyReport } from "@/features/reports/queries";
import { dailyReportSchema } from "@/features/reports/schemas";
import { toCsv } from "@/lib/csv";
import { requireAdmin } from "@/server/authorization";

export const runtime = "nodejs";

/** Admin-only, session-cookie authenticated (requireAdmin) — this is a browser download, not a machine-to-machine endpoint like /api/cron/archive. */
export async function GET(request: NextRequest) {
  await requireAdmin();

  const parsed = dailyReportSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const date = parsed.date ?? new Date();
  const range = resolvePeriodRange({ period: "custom", from: date, to: date });
  const report = await getDailyReport(range);

  const csv = toCsv([report], [
    { header: "Date", value: (row) => row.range.from.toISOString().slice(0, 10) },
    { header: "Tickets Created", value: (row) => row.ticketsCreated },
    { header: "Tickets Completed", value: (row) => row.ticketsCompleted },
    { header: "Tickets Pending", value: (row) => row.ticketsPending },
    { header: "Tickets In Progress", value: (row) => row.ticketsInProgress },
    { header: "Money Received", value: (row) => row.moneyReceived },
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-report-${date.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
