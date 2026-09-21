import { NextResponse, type NextRequest } from "next/server";
import { getCustomerReport } from "@/features/reports/queries";
import { customerReportSchema } from "@/features/reports/schemas";
import { toCsv } from "@/lib/csv";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireAdmin } from "@/server/authorization";

export const runtime = "nodejs";

// Aggregate totals only (ticket/payment counts and sums) — this never
// includes individual PaymentAuditLog entries (old/new value corrections),
// which stay confined to the dedicated admin payment-audit feature. Gated
// by requireAdmin() regardless, since the whole reports module is
// admin-only, but scoping the data itself this way means there's nothing
// audit-related to leak even if that gate were ever loosened.
export async function GET(request: NextRequest) {
  await requireAdmin();

  const parsed = customerReportSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "A customerId is required." }, { status: 400 });
  }

  const report = await getCustomerReport(parsed.data.customerId);
  if (!report) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const csv = toCsv([report], [
    { header: "Customer Name", value: (row) => row.customer.name ?? "" },
    { header: "Customer Phone", value: (row) => formatBangladeshiPhoneForDisplay(row.customer.phone) },
    { header: "Total Support Tickets", value: (row) => row.totalTickets },
    { header: "Total Payments Received", value: (row) => row.totalPaymentsReceived },
    { header: "First Support Date", value: (row) => row.firstSupportDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Latest Support Date", value: (row) => row.latestSupportDate?.toISOString().slice(0, 10) ?? "" },
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-report-${parsed.data.customerId}.csv"`,
    },
  });
}
