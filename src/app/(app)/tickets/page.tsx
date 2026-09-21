import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableColumnHeader } from "@/components/shared/sortable-column-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination } from "@/components/shared/url-pagination";
import { TicketFilters } from "@/features/tickets/components/ticket-filters";
import { PRIORITY_TONES } from "@/features/tickets/priority-tone";
import { searchTickets } from "@/features/tickets/queries";
import type { TicketListItem } from "@/features/tickets/repository";
import { ticketSearchSchema } from "@/features/tickets/schemas";
import { formatDate } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireTeamMember } from "@/server/authorization";

type TicketsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Empty-string search params (e.g. a cleared filter) must not be coerced
// into `z.coerce.date()` etc. — strip them before validating.
function cleanParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) result[key] = single;
  }
  return result;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  await requireTeamMember();

  const rawParams = await searchParams;
  const parsed = ticketSearchSchema.parse(cleanParams(rawParams));

  const { items, total } = await searchTickets(parsed);
  const totalPages = Math.max(Math.ceil(total / parsed.pageSize), 1);

  const sortHeader = (label: string, sortKey: string) => (
    <SortableColumnHeader label={label} sortKey={sortKey} currentSortBy={parsed.sortBy} currentSortDir={parsed.sortDir} />
  );

  const columns: DataTableColumn<TicketListItem>[] = [
    {
      key: "ticketNumber",
      header: sortHeader("Ticket #", "ticketNumber"),
      render: (row) => (
        <Link href={`/tickets/${row.id}`} className="font-medium hover:underline">
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
      render: (row) => <span className="line-clamp-2 max-w-[32vw] sm:max-w-xs">{row.problem}</span>,
      // whitespace-nowrap is TableCell's default (keeps most columns tidy on
      // one line); Problem needs to wrap for line-clamp-2 to actually clamp
      // instead of just clipping mid-word at the cell edge.
      className: "whitespace-normal",
    },
    {
      key: "status",
      header: sortHeader("Status", "status"),
      render: (row) => <StatusBadge status={row.status} />,
      // Ticket #, Customer, and Problem are this list's job on a phone (see
      // it, find it); status is one tap away on the ticket, and already
      // filterable from the dropdown above — the three base columns alone
      // already use nearly all of a 390px screen's width without it.
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
      key: "priority",
      header: sortHeader("Priority", "priority"),
      render: (row) => <StatusBadge status={row.priority} tone={PRIORITY_TONES[row.priority]} />,
      hideBelow: "sm",
    },
    {
      key: "createdAt",
      header: sortHeader("Created", "createdAt"),
      render: (row) => formatDate(row.createdAt),
      hideBelow: "md",
    },
    {
      key: "updatedAt",
      header: sortHeader("Updated", "updatedAt"),
      render: (row) => formatDate(row.updatedAt),
      hideBelow: "md",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Tickets" description="Support tickets in the active window." />
      <TicketFilters
        query={parsed.query}
        status={parsed.status}
        priority={parsed.priority}
        dateFrom={rawParams.dateFrom as string | undefined}
        dateTo={rawParams.dateTo as string | undefined}
      />
      <DataTable
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            title={parsed.query || parsed.status || parsed.priority ? "No matching tickets" : "No tickets yet"}
            description={
              parsed.query || parsed.status || parsed.priority
                ? "Try adjusting your search or filters."
                : "Create your first ticket to get started."
            }
          />
        }
      />
      {items.length > 0 ? <UrlPagination page={parsed.page} totalPages={totalPages} /> : null}
    </div>
  );
}
