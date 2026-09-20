import { requireAdmin } from "@/server/authorization";

export default async function PaymentAuditPage() {
  await requireAdmin();

  return (
    <div>
      <h1 className="text-xl font-semibold">Payment Audit Log</h1>
      <p className="text-muted-foreground text-sm">
        Admin-only. The audit log viewer is not built yet.
      </p>
    </div>
  );
}
