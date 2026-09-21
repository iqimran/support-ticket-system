import { z } from "zod";

export const TICKET_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const createTicketSchema = z.object({
  customerId: z.string().trim().min(1, "Customer is required"),
  problem: z.string().trim().min(1, "Problem description is required").max(5000),
  priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
});

// Not `z.infer<typeof createTicketSchema>`: Zod's `.default()` makes the
// *output* type's field required (it's always filled in after parsing),
// which forces every caller to pass `priority` explicitly even though the
// whole point of the default is that they don't have to. See the identical
// note on CustomerFormInput in features/customers/schemas.ts.
export type CreateTicketInput = {
  customerId: string;
  problem: string;
  priority?: (typeof TICKET_PRIORITIES)[number];
};

// `note` is validated for length only here; whether it's *required* depends
// on the transition (reopening a completed ticket) and is enforced in the
// service layer, which has the current status available.
export const changeTicketStatusSchema = z.object({
  ticketId: z.string().trim().min(1),
  newStatus: z.enum(TICKET_STATUSES),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusSchema>;

export const addTicketNoteSchema = z.object({
  ticketId: z.string().trim().min(1),
  note: z.string().trim().min(1, "Note cannot be empty").max(2000),
});

export type AddTicketNoteInput = z.infer<typeof addTicketNoteSchema>;

export const assignTeamMembersSchema = z.object({
  ticketId: z.string().trim().min(1),
  teamMemberIds: z.array(z.string().trim().min(1)).min(1, "Select at least one team member"),
});

export type AssignTeamMembersInput = z.infer<typeof assignTeamMembersSchema>;

export const ticketSearchSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["ticketNumber", "createdAt", "updatedAt", "status", "priority"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type TicketSearchInput = z.infer<typeof ticketSearchSchema>;
