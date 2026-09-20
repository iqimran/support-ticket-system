"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchInput } from "@/components/shared/search-input";
import { TeamMemberFormDialog } from "@/features/team-members/components/team-member-form-dialog";

type TeamMemberFiltersProps = {
  query: string;
  status: "all" | "active" | "inactive";
};

export function TeamMemberFilters({ query, status }: TeamMemberFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={(value) => updateParams({ query: value })}
          placeholder="Search by name or phone"
          aria-label="Search team members"
          className="sm:max-w-xs"
        />
        <Select value={status} onValueChange={(value) => updateParams({ status: value })}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TeamMemberFormDialog
        mode="create"
        trigger={
          <Button type="button">
            <Plus aria-hidden="true" />
            New team member
          </Button>
        }
      />
    </div>
  );
}
