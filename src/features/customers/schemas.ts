import { z } from "zod";
import { TICKET_STATUSES } from "@/features/tickets/schemas";
import { normalizeBangladeshiPhone } from "@/lib/phone";

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .transform((value, ctx) => {
    const normalized = normalizeBangladeshiPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid Bangladeshi mobile number (e.g. 01712345678)",
      });
      return z.NEVER;
    }
    return normalized;
  });

function optionalText(maxLength: number, fieldLabel: string) {
  return z
    .string()
    .trim()
    .max(maxLength, `${fieldLabel} must be ${maxLength} characters or fewer`)
    .optional()
    .transform((value) => (value ? value : undefined));
}

export const customerFormSchema = z.object({
  phone: phoneSchema,
  name: optionalText(200, "Name"),
  address: optionalText(500, "Address"),
  note: optionalText(2000, "Note"),
});

// Not `z.infer<typeof customerFormSchema>`: Zod's `.optional().transform()`
// infers required-but-possibly-undefined keys (`name: string | undefined`)
// rather than true optional keys (`name?: string`), which forces every
// caller to spell out `undefined` for fields they want to omit. This shape
// is what the schema actually produces at runtime — just a friendlier type.
export type CustomerFormInput = {
  phone: string;
  name?: string;
  address?: string;
  note?: string;
};

export const customerSearchSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "phone", "createdAt", "ticketCount"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CustomerSearchInput = z.infer<typeof customerSearchSchema>;

export const customerHistorySearchSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
  status: z.enum(TICKET_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["createdAt", "status"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CustomerHistorySearchInput = z.infer<typeof customerHistorySearchSchema>;
