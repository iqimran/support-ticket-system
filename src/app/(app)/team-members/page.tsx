import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableColumnHeader } from "@/components/shared/sortable-column-header";
import { UrlPagination } from "@/components/shared/url-pagination";
import { TeamMemberFilters } from "@/features/team-members/components/team-member-filters";
import { searchTeamMembers } from "@/features/team-members/queries";
import type { TeamMemberListItem } from "@/features/team-members/repository";
import { teamMemberSearchSchema } from "@/features/team-members/schemas";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireAdmin } from "@/server/authorization";

type TeamMembersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeamMembersPage({ searchParams }: TeamMembersPageProps) {
  await requireAdmin();

  const rawParams = await searchParams;
  const parsed = teamMemberSearchSchema.parse(rawParams);

  const { items, total } = await searchTeamMembers(parsed);
  const totalPages = Math.max(Math.ceil(total / parsed.pageSize), 1);

  const sortHeader = (label: string, sortKey: string) => (
    <SortableColumnHeader label={label} sortKey={sortKey} currentSortBy={parsed.sortBy} currentSortDir={parsed.sortDir} />
  );

  const columns: DataTableColumn<TeamMemberListItem>[] = [
    {
      key: "name",
      header: sortHeader("Name", "name"),
      render: (row) => (
        <Link href={`/team-members/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      key: "phone",
      header: sortHeader("Phone", "phone"),
      render: (row) => formatBangladeshiPhoneForDisplay(row.phone),
    },
    {
      key: "isActive",
      header: "Active status",
      render: (row) => <Badge variant={row.isActive ? "default" : "outline"}>{row.isActive ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "loginActive",
      header: "Login status",
      render: (row) => <Badge variant={row.loginActive ? "default" : "outline"}>{row.loginActive ? "Enabled" : "Disabled"}</Badge>,
    },
    { key: "activeAssignmentCount", header: "Active assignments" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Team Members" description="Support staff, assignment availability, and login access." />
      <TeamMemberFilters query={parsed.query} status={parsed.status} />
      <DataTable
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            title={parsed.query || parsed.status !== "all" ? "No matching team members" : "No team members yet"}
            description={
              parsed.query || parsed.status !== "all"
                ? "Try a different search or filter."
                : "Create your first team member to get started."
            }
          />
        }
      />
      {items.length > 0 ? <UrlPagination page={parsed.page} totalPages={totalPages} /> : null}
    </div>
  );
}
