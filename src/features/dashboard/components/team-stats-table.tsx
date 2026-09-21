import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import type { TeamMemberStat } from "@/features/dashboard/repository";

export function TeamStatsTable({ stats }: { stats: TeamMemberStat[] }) {
  const columns: DataTableColumn<TeamMemberStat>[] = [
    { key: "teamMemberName", header: "Team member" },
    { key: "completedCount", header: "Completed" },
    {
      key: "totalReceived",
      header: "Payments recorded",
      render: (row) => <MoneyDisplay amount={row.totalReceived} />,
    },
    { key: "assignedCount", header: "Assigned", hideBelow: "sm" },
    { key: "pendingCount", header: "Pending", hideBelow: "sm" },
    { key: "inProgressCount", header: "In progress", hideBelow: "sm" },
  ];

  return (
    <DataTable
      columns={columns}
      data={stats}
      getRowId={(row) => row.teamMemberId}
      emptyState={<EmptyState title="No active team members" />}
    />
  );
}
