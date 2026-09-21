import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableColumnHeader } from "@/components/shared/sortable-column-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination } from "@/components/shared/url-pagination";
import { ArchiveFilters } from "@/features/archive/components/archive-filters";
import { searchArchivedTickets } from "@/features/archive/queries";
import type { ArchivedTicketListItem } from "@/features/archive/repository";
import { archiveSearchSchema } from "@/features/archive/schemas";
import { formatDate } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireTeamMember } from "@/server/authorization";

type ArchivePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Empty-string search params (e.g. a cleared filter) must not be coerced
// into z.coerce.date() etc. — strip them before validating.
function cleanParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) result[key] = single;
  }
  return result;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  await requireTeamMember();

  const rawParams = await searchParams;
  const parsed = archiveSearchSchema.parse(cleanParams(rawParams));

  const { items, total } = await searchArchivedTickets(parsed);
  const totalPages = Math.max(Math.ceil(total / parsed.pageSize), 1);

  const sortHeader = (label: string, sortKey: string) => (
    <SortableColumnHeader label={label} sortKey={sortKey} currentSortBy={parsed.sortBy} currentSortDir={parsed.sortDir} />
  );

  const columns: DataTableColumn<ArchivedTicketListItem>[] = [
    {
      key: "ticketNumber",
      header: sortHeader("Ticket #", "ticketNumber"),
      render: (row) => (
        <Link href={`/archive/${row.id}`} className="font-medium hover:underline">
          {row.ticketNumber}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div>
          <p>{row.customer.name ?? <span className="text-muted-foreground">Unnamed</span>}</p>
          <p className="text-muted-foreground text-xs">{formatBangladeshiPhoneForDisplay(row.customer.phone)}</p>
        </div>
      ),
    },
    {
      key: "problem",
      header: "Problem",
      render: (row) => <span className="line-clamp-2 max-w-[38vw] sm:max-w-xs">{row.problem}</span>,
      className: "whitespace-normal",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
      // Same width math as the active tickets list: Ticket #, Customer, and
      // Problem alone already fill a 390px screen — status is one tap into
      // the record and already filterable from the dropdown above.
      hideBelow: "sm",
    },
    {
      key: "createdAt",
      header: sortHeader("Original creation date", "createdAt"),
      render: (row) => formatDate(row.createdAt),
      hideBelow: "sm",
    },
    {
      key: "archivedAt",
      header: sortHeader("Archived date", "archivedAt"),
      render: (row) => formatDate(row.archivedAt),
      hideBelow: "md",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archive"
        description="Search tickets and support history beyond the active 3-month window."
        actions={
          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
            Historical records
          </Badge>
        }
      />
      <ArchiveFilters
        query={parsed.query}
        status={parsed.status}
        dateFrom={rawParams.dateFrom as string | undefined}
        dateTo={rawParams.dateTo as string | undefined}
      />
      <DataTable
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            title={parsed.query || parsed.status ? "No matching archived tickets" : "No archived tickets yet"}
            description={
              parsed.query || parsed.status
                ? "Try adjusting your search or filters."
                : "Tickets older than 3 months will appear here once archived."
            }
          />
        }
      />
      {items.length > 0 ? <UrlPagination page={parsed.page} totalPages={totalPages} /> : null}
    </div>
  );
}
