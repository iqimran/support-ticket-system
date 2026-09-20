import Link from "next/link";
import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UrlPagination } from "@/components/shared/url-pagination";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PaymentTotalsWidget } from "@/features/payments/components/payment-totals-widget";
import { getDailyPaymentTotal, getMonthlyPaymentTotal, getPaymentAuditLogs } from "@/features/payments/queries";
import { paymentAuditLogSearchSchema } from "@/features/payments/schemas";
import { formatDateTime } from "@/lib/format-date";
import { requireAdmin } from "@/server/authorization";

type PaymentAuditLogRow = Awaited<ReturnType<typeof getPaymentAuditLogs>>["items"][number];

type PaymentAuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function AmountChange({ row }: { row: PaymentAuditLogRow }) {
  const oldValue = row.oldAmount ? <MoneyDisplay amount={row.oldAmount.toString()} /> : null;
  const newValue = row.newAmount ? <MoneyDisplay amount={row.newAmount.toString()} /> : null;
  if (oldValue && newValue) {
    return (
      <span>
        {oldValue} → {newValue}
      </span>
    );
  }
  return newValue ?? oldValue ?? <span className="text-muted-foreground">—</span>;
}

function FieldChange({ oldValue, newValue }: { oldValue: ReactNode; newValue: ReactNode }) {
  if (oldValue && newValue) {
    return (
      <span>
        {oldValue} → {newValue}
      </span>
    );
  }
  return newValue ?? oldValue ?? <span className="text-muted-foreground">—</span>;
}

export default async function PaymentAuditPage({ searchParams }: PaymentAuditPageProps) {
  await requireAdmin();

  const rawParams = await searchParams;
  const parsed = paymentAuditLogSearchSchema.parse(rawParams);

  const [{ items, total }, todayTotal, monthTotal] = await Promise.all([
    getPaymentAuditLogs(parsed),
    getDailyPaymentTotal(new Date()),
    getMonthlyPaymentTotal(new Date()),
  ]);

  const totalPages = Math.max(Math.ceil(total / parsed.pageSize), 1);

  const columns: DataTableColumn<PaymentAuditLogRow>[] = [
    { key: "action", header: "Action" },
    {
      key: "ticket",
      header: "Ticket",
      render: (row) => (
        <Link href={`/tickets/${row.ticket.id}`} className="hover:underline">
          {row.ticket.ticketNumber}
        </Link>
      ),
    },
    { key: "id", header: "Amount", render: (row) => <AmountChange row={row} /> },
    {
      key: "oldPaymentMethod",
      header: "Method",
      render: (row) => (
        <FieldChange
          oldValue={row.oldPaymentMethod}
          newValue={row.newPaymentMethod}
        />
      ),
    },
    {
      key: "oldNote",
      header: "Note",
      render: (row) => <FieldChange oldValue={row.oldNote} newValue={row.newNote} />,
    },
    { key: "changedByUser", header: "Changed by", render: (row) => row.changedByUser.name },
    { key: "createdAt", header: "When", render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Payment Audit Log" description="Admin-only. Every payment creation and correction, in full." />

      <PaymentTotalsWidget todayTotal={todayTotal} monthTotal={monthTotal} />

      <DataTable
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        emptyState={<EmptyState title="No payment activity yet" />}
      />
      {items.length > 0 ? <UrlPagination page={parsed.page} totalPages={totalPages} /> : null}
    </div>
  );
}
