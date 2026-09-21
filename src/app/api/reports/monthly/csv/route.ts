import type { NextRequest } from "next/server";
import { resolvePeriodRange } from "@/features/dashboard/periods";
import { getMonthlyReport } from "@/features/reports/queries";
import { periodReportSchema } from "@/features/reports/schemas";
import { toCsv } from "@/lib/csv";
import { requireAdmin } from "@/server/authorization";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const parsed = periodReportSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const range = resolvePeriodRange(parsed);
  const report = await getMonthlyReport(range);

  const csv = toCsv([report], [
    { header: "From", value: (row) => row.range.from.toISOString().slice(0, 10) },
    { header: "To", value: (row) => row.range.to.toISOString().slice(0, 10) },
    { header: "Total Tickets", value: (row) => row.tickets.total },
    { header: "Completed", value: (row) => row.tickets.completed },
    { header: "Pending", value: (row) => row.tickets.pending },
    { header: "In Progress", value: (row) => row.tickets.inProgress },
    { header: "Cancelled", value: (row) => row.tickets.cancelled },
    { header: "Total Money Received", value: (row) => row.payments.totalReceived },
    { header: "Number Of Payments", value: (row) => row.payments.transactionCount },
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-report-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
