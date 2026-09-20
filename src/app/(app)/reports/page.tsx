import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireTeamMember } from "@/server/authorization";

// NOTE: shown to both roles per this prompt's nav spec, but the Prompt 3
// permission matrix listed "View reports" as ADMIN-only. Flagged in the
// build report — tighten to requireAdmin() here if that matrix is authoritative.
export default async function ReportsPage() {
  await requireTeamMember();

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Operational and financial reporting." />
      <EmptyState title="Reports are not built yet" description="This is a UI shell placeholder." />
    </div>
  );
}
