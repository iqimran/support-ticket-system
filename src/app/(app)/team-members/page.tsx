import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireTeamMember } from "@/server/authorization";

export default async function TeamMembersPage() {
  await requireTeamMember();

  return (
    <div className="space-y-6">
      <PageHeader title="Team Members" description="Support staff and assignment availability." />
      <EmptyState title="Team member management is not built yet" description="This is a UI shell placeholder." />
    </div>
  );
}
