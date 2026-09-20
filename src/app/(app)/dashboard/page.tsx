import { PageHeader } from "@/components/shared/page-header";
import { requireAuth } from "@/server/authorization";

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name}`} description={`Signed in as ${user.role}.`} />
      <p className="text-muted-foreground text-sm">The full dashboard is not built yet.</p>
    </div>
  );
}
