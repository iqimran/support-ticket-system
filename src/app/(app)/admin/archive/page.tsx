import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDurationMs } from "@/features/archive/format-duration";
import { getLatestArchiveRun, listRecentArchiveRuns, type ArchiveRunSummary } from "@/features/archive/queries";
import { formatDateTime } from "@/lib/format-date";
import { requireAdmin } from "@/server/authorization";

const STATUS_TONES = { RUNNING: "info", SUCCEEDED: "success", FAILED: "danger" } as const;

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export default async function ArchiveMonitorPage() {
  await requireAdmin();

  const [latest, recent] = await Promise.all([getLatestArchiveRun(), listRecentArchiveRuns(20)]);

  const columns: DataTableColumn<ArchiveRunSummary>[] = [
    { key: "startedAt", header: "Started", render: (row) => formatDateTime(row.startedAt) },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} tone={STATUS_TONES[row.status]} /> },
    { key: "ticketsFound", header: "Found" },
    { key: "ticketsProcessed", header: "Archived" },
    {
      key: "durationMs",
      header: "Duration",
      render: (row) => (row.durationMs !== null ? formatDurationMs(row.durationMs) : "—"),
    },
    {
      key: "errorMessage",
      header: "Error",
      render: (row) => row.errorMessage ?? <span className="text-muted-foreground">—</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archive Job Monitor"
        description="Admin-only. Status of the daily ticket-archive job — never shows infrastructure details, only what the job itself did."
      />

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-semibold">Last run</h2>
          {latest ? (
            <div className="grid gap-4 sm:grid-cols-5">
              <SummaryStat label="Started" value={formatDateTime(latest.startedAt)} />
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <StatusBadge status={latest.status} tone={STATUS_TONES[latest.status]} className="mt-1" />
              </div>
              <SummaryStat label="Tickets archived" value={`${latest.ticketsProcessed} / ${latest.ticketsFound}`} />
              <SummaryStat label="Duration" value={latest.durationMs !== null ? formatDurationMs(latest.durationMs) : "In progress"} />
              <SummaryStat label="Cutoff date" value={formatDateTime(latest.cutoffDate)} />
              {latest.errorMessage ? (
                <div className="sm:col-span-5">
                  <p className="text-muted-foreground text-xs">Error</p>
                  <p className="text-destructive text-sm">{latest.errorMessage}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">The archive job has not run yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold">Recent runs</h2>
        <DataTable
          columns={columns}
          data={recent}
          getRowId={(row) => row.id}
          emptyState={<EmptyState title="No archive runs yet" />}
        />
      </div>
    </div>
  );
}
