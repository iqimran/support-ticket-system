import { z } from "zod";
import { TICKET_STATUSES } from "@/features/tickets/schemas";

export const archiveSearchSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
  status: z.enum(TICKET_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["ticketNumber", "createdAt", "archivedAt"]).default("archivedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ArchiveSearchInput = z.infer<typeof archiveSearchSchema>;
