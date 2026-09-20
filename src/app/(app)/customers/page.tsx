import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableColumnHeader } from "@/components/shared/sortable-column-header";
import { UrlPagination } from "@/components/shared/url-pagination";
import { CustomerToolbar } from "@/features/customers/components/customer-toolbar";
import { searchCustomers } from "@/features/customers/queries";
import type { CustomerListItem } from "@/features/customers/repository";
import { customerSearchSchema } from "@/features/customers/schemas";
import { formatDate } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireTeamMember } from "@/server/authorization";

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await requireTeamMember();

  const rawParams = await searchParams;
  const parsed = customerSearchSchema.parse(rawParams);

  const { items, total } = await searchCustomers(parsed);
  const totalPages = Math.max(Math.ceil(total / parsed.pageSize), 1);

  const sortHeader = (label: string, sortKey: string) => (
    <SortableColumnHeader label={label} sortKey={sortKey} currentSortBy={parsed.sortBy} currentSortDir={parsed.sortDir} />
  );

  const columns: DataTableColumn<CustomerListItem>[] = [
    {
      key: "phone",
      header: sortHeader("Phone", "phone"),
      render: (row) => (
        <Link href={`/customers/${row.id}`} className="font-medium hover:underline">
          {formatBangladeshiPhoneForDisplay(row.phone)}
        </Link>
      ),
    },
    {
      key: "name",
      header: sortHeader("Name", "name"),
      render: (row) => row.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "address",
      header: "Address",
      render: (row) => row.address ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "ticketCount",
      header: sortHeader("Tickets", "ticketCount"),
    },
    {
      key: "lastSupportAt",
      header: "Last support",
      render: (row) =>
        row.lastSupportAt ? (
          formatDate(row.lastSupportAt)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "createdAt",
      header: sortHeader("Created", "createdAt"),
      render: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Customer records and support history." />
      <CustomerToolbar query={parsed.query} />
      <DataTable
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            title={parsed.query ? "No matching customers" : "No customers yet"}
            description={parsed.query ? "Try a different phone number or name." : "Create your first customer to get started."}
          />
        }
      />
      {items.length > 0 ? <UrlPagination page={parsed.page} totalPages={totalPages} /> : null}
    </div>
  );
}
