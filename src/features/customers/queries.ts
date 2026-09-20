import { findCustomerById, getCustomerTicketStats, listCustomers, type CustomerListItem } from "@/features/customers/repository";
import type { CustomerHistorySearchInput, CustomerSearchInput } from "@/features/customers/schemas";
import { getCustomerSupportHistory, type TicketHistoryPagination } from "@/features/customers/ticket-history";

// Read-side only. Callers (pages) are responsible for calling
// requireAuth()/requireTeamMember()/requireAdmin() first — these functions
// are not server actions and can't be invoked directly from the client.

export function searchCustomers(params: CustomerSearchInput): Promise<{ items: CustomerListItem[]; total: number }> {
  return listCustomers(params);
}

export async function getCustomerDetail(id: string, historySearch: CustomerHistorySearchInput) {
  const pagination: TicketHistoryPagination = { page: historySearch.page, pageSize: historySearch.pageSize };

  const [customer, stats, history] = await Promise.all([
    findCustomerById(id),
    getCustomerTicketStats(id),
    getCustomerSupportHistory(
      id,
      {
        query: historySearch.query,
        status: historySearch.status,
        dateFrom: historySearch.dateFrom,
        dateTo: historySearch.dateTo,
        sortBy: historySearch.sortBy,
        sortDir: historySearch.sortDir,
      },
      pagination,
    ),
  ]);

  if (!customer) return null;

  return { customer, stats, history };
}
