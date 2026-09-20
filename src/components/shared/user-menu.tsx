"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/features/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { AuthUser } from "@/server/auth/types";

type UserMenuProps = {
  user: Pick<AuthUser, "name" | "role">;
};

function formatRole(role: AuthUser["role"]): string {
  return role === "ADMIN" ? "Admin" : "Team Member";
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <UserAvatar name={user.name} />
          <span className="hidden text-sm sm:inline">
            <span className="font-medium">{user.name}</span>
            <span className="text-muted-foreground"> &middot; {formatRole(user.role)}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="sm:hidden">
          {user.name}
          <span className="text-muted-foreground block text-xs font-normal">{formatRole(user.role)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="sm:hidden" />
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOut aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
