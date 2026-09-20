import { requireAuth } from "@/server/authorization";

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div>
      <h1 className="text-xl font-semibold">Welcome, {user.name}</h1>
      <p className="text-muted-foreground text-sm">
        Signed in as {user.role}. The full dashboard is not built yet.
      </p>
    </div>
  );
}
