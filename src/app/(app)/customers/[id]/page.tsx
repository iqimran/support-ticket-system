import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PageHeader } from "@/components/shared/page-header";
import { SortableColumnHeader } from "@/components/shared/sortable-column-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination } from "@/components/shared/url-pagination";
import { CustomerFormDialog } from "@/features/customers/components/customer-form-dialog";
import { CustomerHistoryFilters } from "@/features/customers/components/customer-history-filters";
import { getCustomerDetail } from "@/features/customers/queries";
import { customerHistorySearchSchema } from "@/features/customers/schemas";
import type { TicketHistoryEntry } from "@/features/customers/ticket-history";
import { TicketFormDialog } from "@/features/tickets/components/ticket-form-dialog";
import { formatDate } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireTeamMember } from "@/server/authorization";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Empty-string search params (a cleared filter) must not be coerced by
// z.coerce.date() etc. — strip them before validating.
function cleanParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) result[key] = single;
  }
  return result;
}

export default async function CustomerDetailPage({ params, searchParams }: CustomerDetailPageProps) {
  await requireTeamMember();

  const { id } = await params;
  const rawParams = await searchParams;
  const cleaned = cleanParams(rawParams);

  const historySearch = customerHistorySearchSchema.parse({
    query: cleaned.historyQuery,
    status: cleaned.historyStatus,
    dateFrom: cleaned.historyDateFrom,
    dateTo: cleaned.historyDateTo,
    page: cleaned.historyPage,
    sortBy: cleaned.historySortBy,
    sortDir: cleaned.historySortDir,
  });

  const detail = await getCustomerDetail(id, historySearch);
  if (!detail) {
    notFound();
  }

  const { customer, stats, history } = detail;
  const totalHistoryPages = Math.max(Math.ceil(history.total / historySearch.pageSize), 1);

  const sortHeader = (label: string, sortKey: string) => (
    <SortableColumnHeader
      label={label}
      sortKey={sortKey}
      currentSortBy={historySearch.sortBy}
      currentSortDir={historySearch.sortDir}
      sortByParam="historySortBy"
      sortDirParam="historySortDir"
      pageParam="historyPage"
    />
  );

  const historyColumns: DataTableColumn<TicketHistoryEntry>[] = [
    {
      key: "ticketNumber",
      header: "Ticket #",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link href={`/tickets/${row.id}`} className="font-medium hover:underline">
            {row.ticketNumber}
          </Link>
          {row.source === "archived" ? (
            <Badge variant="outline" className="text-muted-foreground">
              Archived
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "problem",
      header: "Problem",
      render: (row) => <span className="line-clamp-2 max-w-[38vw] sm:max-w-xs">{row.problem}</span>,
      className: "whitespace-normal",
    },
    { key: "status", header: sortHeader("Status", "status"), render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "createdAt",
      header: sortHeader("Date", "createdAt"),
      render: (row) => formatDate(row.createdAt),
      hideBelow: "sm",
    },
    {
      key: "assignedMembers",
      header: "Assigned",
      render: (row) =>
        row.assignedMembers.length > 0 ? (
          row.assignedMembers.map((member) => member.name).join(", ")
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
      hideBelow: "sm",
    },
    {
      key: "paymentReceived",
      header: "Payment received",
      render: (row) => <MoneyDisplay amount={row.paymentReceived} />,
      hideBelow: "md",
    },
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total historical tickets" value={stats.totalTicketCount} />
        <StatCard label="Active tickets" value={stats.activeTicketCount} />
        <StatCard label="Completed tickets" value={stats.completedTicketCount} />
        <StatCard label="Total received historically" value={<MoneyDisplay amount={stats.totalReceivedPayment} />} />
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
            {formatDate(customer.createdAt)}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Support history</h2>
        <p className="text-muted-foreground text-sm">
          Combines active and archived tickets into one unified, paginated view.
        </p>
        <CustomerHistoryFilters
          query={historySearch.query}
          status={historySearch.status}
          dateFrom={cleaned.historyDateFrom}
          dateTo={cleaned.historyDateTo}
        />
        <DataTable
          columns={historyColumns}
          data={history.items}
          getRowId={(row) => row.id}
          emptyState={
            <EmptyState
              title={historySearch.query || historySearch.status ? "No matching tickets" : "No support history yet"}
              description={
                historySearch.query || historySearch.status
                  ? "Try a different search or filter."
                  : "This customer has no tickets yet."
              }
            />
          }
        />
        {history.items.length > 0 ? (
          <UrlPagination page={historySearch.page} totalPages={totalHistoryPages} paramName="historyPage" />
        ) : null}
      </div>
    </div>
  );
}
