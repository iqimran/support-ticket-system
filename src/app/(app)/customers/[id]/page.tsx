import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination } from "@/components/shared/url-pagination";
import { CustomerFormDialog } from "@/features/customers/components/customer-form-dialog";
import { getCustomerDetail } from "@/features/customers/queries";
import type { TicketHistoryEntry } from "@/features/customers/ticket-history";
import { TicketFormDialog } from "@/features/tickets/components/ticket-form-dialog";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireTeamMember } from "@/server/authorization";

const HISTORY_PAGE_SIZE = 10;

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historyPage?: string }>;
};

export default async function CustomerDetailPage({ params, searchParams }: CustomerDetailPageProps) {
  await requireTeamMember();

  const { id } = await params;
  const { historyPage: historyPageRaw } = await searchParams;
  const historyPage = Math.max(Number(historyPageRaw) || 1, 1);

  const detail = await getCustomerDetail(id, { page: historyPage, pageSize: HISTORY_PAGE_SIZE });
  if (!detail) {
    notFound();
  }

  const { customer, stats, history } = detail;
  const totalHistoryPages = Math.max(Math.ceil(history.total / HISTORY_PAGE_SIZE), 1);

  const historyColumns: DataTableColumn<TicketHistoryEntry>[] = [
    {
      key: "ticketNumber",
      header: "Ticket #",
      render: (row) => (
        <Link href={`/tickets/${row.id}`} className="font-medium hover:underline">
          {row.ticketNumber}
        </Link>
      ),
    },
    { key: "problem", header: "Problem" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "createdAt", header: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name || formatBangladeshiPhoneForDisplay(customer.phone)}
        description={formatBangladeshiPhoneForDisplay(customer.phone)}
        actions={
          <>
            <TicketFormDialog
              fixedCustomer={{ id: customer.id, phone: customer.phone, name: customer.name }}
              trigger={
                <Button type="button">
                  <Plus aria-hidden="true" />
                  New ticket
                </Button>
              }
            />
            <CustomerFormDialog
              mode="edit"
              customer={customer}
              trigger={
                <Button type="button" variant="outline">
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total tickets" value={stats.totalTicketCount} />
        <StatCard label="Active tickets" value={stats.activeTicketCount} />
        <StatCard label="Completed tickets" value={stats.completedTicketCount} />
        <StatCard label="Total received" value={<MoneyDisplay amount={stats.totalReceivedPayment} />} />
      </div>

      <Card>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Address: </span>
            {customer.address || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Note: </span>
            {customer.note || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Customer since: </span>
            {new Date(customer.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Support history</h2>
        <p className="text-muted-foreground text-sm">
          Showing tickets in the active window. Archived history will appear here once the archive system is built.
        </p>
        <DataTable
          columns={historyColumns}
          data={history.items}
          getRowId={(row) => row.id}
          emptyState={<EmptyState title="No support history yet" description="This customer has no tickets yet." />}
        />
        {history.items.length > 0 ? (
          <UrlPagination page={historyPage} totalPages={totalHistoryPages} paramName="historyPage" />
        ) : null}
      </div>
    </div>
  );
}
