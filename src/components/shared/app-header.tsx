import { MobileNavigation } from "@/components/shared/mobile-navigation";
import { UserMenu } from "@/components/shared/user-menu";
import { ORG_NAME } from "@/lib/constants";
import type { AuthUser } from "@/server/auth/types";

type AppHeaderProps = {
  user: Pick<AuthUser, "name" | "role">;
  showAdminNav: boolean;
};

export function AppHeader({ user, showAdminNav }: AppHeaderProps) {
  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b px-4 md:px-6">
      <MobileNavigation showAdminNav={showAdminNav} />
      <span className="text-sm font-semibold tracking-tight md:hidden">{ORG_NAME}</span>
      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
