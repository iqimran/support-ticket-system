import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { canViewPaymentAudit, requireAuth } from "@/server/authorization";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/tickets">Tickets</Link>
          {canViewPaymentAudit(user) ? <Link href="/admin/payment-audit">Payment Audit</Link> : null}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.name} &middot; {user.role}
          </span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
