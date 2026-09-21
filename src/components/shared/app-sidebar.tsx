"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS, NAV_ITEMS, type NavItem } from "@/components/shared/nav-items";
import { ORG_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  // A boolean (not the item array) crosses the server/client boundary here
  // because NavItem.icon is a component reference — React can't serialize
  // function props from a Server Component into a Client Component. The
  // icon-bearing NAV_ITEMS/ADMIN_NAV_ITEMS are imported directly below instead.
  showAdminNav: boolean;
};

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        isActive
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {item.label}
    </Link>
  );
}

export function AppSidebar({ showAdminNav }: AppSidebarProps) {
  const pathname = usePathname();

  const isActivePath = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="bg-background hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">{ORG_NAME}</span>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActivePath(item.href)} />
        ))}
        {showAdminNav ? (
          <>
            <div role="separator" aria-orientation="horizontal" className="my-2 border-t" />
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} isActive={isActivePath(item.href)} />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
