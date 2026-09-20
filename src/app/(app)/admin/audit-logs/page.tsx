import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/server/authorization";

export default async function AuditLogsPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader title="System Audit Logs" description="Admin-only." />
      <EmptyState title="The audit log viewer is not built yet" description="This is a UI shell placeholder." />
    </div>
  );
}
