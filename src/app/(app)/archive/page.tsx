import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireTeamMember } from "@/server/authorization";

export default async function ArchivePage() {
  await requireTeamMember();

  return (
    <div className="space-y-6">
      <PageHeader title="Archive" description="Search tickets and support history beyond the active window." />
      <EmptyState title="Archive search is not built yet" description="This is a UI shell placeholder." />
    </div>
  );
}
