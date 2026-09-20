import type { ReactNode } from "react";
import { AppHeader } from "@/components/shared/app-header";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { canViewPaymentAudit, requireAuth } from "@/server/authorization";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const showAdminNav = canViewPaymentAudit(user);

  return (
    <div className="flex min-h-svh">
      <AppSidebar showAdminNav={showAdminNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} showAdminNav={showAdminNav} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
