"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/search-input";
import { CustomerFormDialog } from "@/features/customers/components/customer-form-dialog";

export function CustomerToolbar({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setQuery = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("query", value);
      } else {
        params.delete("query");
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by phone or name"
        aria-label="Search customers"
        className="sm:max-w-sm"
      />
      <CustomerFormDialog
        mode="create"
        trigger={
          <Button type="button">
            <Plus aria-hidden="true" />
            New customer
          </Button>
        }
      />
    </div>
  );
}
