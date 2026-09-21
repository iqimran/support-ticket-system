import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { CustomerReportPicker } from "@/features/reports/components/customer-report-picker";
import { getCustomerReport } from "@/features/reports/queries";
import { customerReportSchema } from "@/features/reports/schemas";
import { formatDate } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireAdmin } from "@/server/authorization";

type CustomerReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerReportPage({ searchParams }: CustomerReportPageProps) {
  await requireAdmin();

  const rawParams = await searchParams;
  const rawCustomerId = Array.isArray(rawParams.customerId) ? rawParams.customerId[0] : rawParams.customerId;
  const parsed = customerReportSchema.safeParse(rawCustomerId ? { customerId: rawCustomerId } : {});

  const report = parsed.success ? await getCustomerReport(parsed.data.customerId) : null;

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground text-sm hover:underline">
        ← Back to Reports
      </Link>
      <PageHeader
        title="Customer report"
        description="Admin-only. Total support tickets, total payments received, and first/latest support dates for one customer."
      />

      <CustomerReportPicker initialCustomer={report ? report.customer : null} />

      {!parsed.success ? (
        <EmptyState title="Select a customer" description="Pick a customer above to see their support history summary." />
      ) : !report ? (
        <EmptyState title="Customer not found" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{report.customer.name ?? "Unnamed customer"}</p>
              <p className="text-muted-foreground text-sm">{formatBangladeshiPhoneForDisplay(report.customer.phone)}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/customer/csv?customerId=${report.customer.id}`}>
                <Download aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total support tickets" value={report.totalTickets} />
            <StatCard label="Total payments received" value={<MoneyDisplay amount={report.totalPaymentsReceived} />} />
            <StatCard
              label="First support date"
              value={report.firstSupportDate ? formatDate(report.firstSupportDate) : "—"}
            />
            <StatCard
              label="Latest support date"
              value={report.latestSupportDate ? formatDate(report.latestSupportDate) : "—"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
