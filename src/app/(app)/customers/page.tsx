import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireTeamMember } from "@/server/authorization";

export default async function CustomersPage() {
  await requireTeamMember();

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Customer records and support history." />
      <EmptyState title="Customer management is not built yet" description="This is a UI shell placeholder." />
    </div>
  );
}
