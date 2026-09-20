"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/shared/pagination";

type UrlPaginationProps = {
  page: number;
  totalPages: number;
  /** Query param name to update — lets multiple paginated sections coexist on one page (e.g. list page vs. a detail page's history section). */
  paramName?: string;
};

// Generic enough to reuse across any server-rendered, URL-driven paginated
// list (tickets, archive search, etc.) — not customer-specific.
export function UrlPagination({ page, totalPages, paramName = "page" }: UrlPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handlePageChange(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, String(nextPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  return <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />;
}
