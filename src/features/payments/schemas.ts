import { z } from "zod";

export const PAYMENT_METHODS = ["CASH", "BANK", "MOBILE_BANKING", "OTHER"] as const;

/**
 * Amount is validated as a string and passed straight through to Prisma's
 * Decimal(12,2) column — never parsed into a JS `number`, which would risk
 * floating-point rounding for money. Decimal(12,2) allows up to 10 integer
 * digits + 2 decimal places (12 significant digits total).
 */
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a valid amount (up to 2 decimal places)")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");

const noteSchema = z
  .string()
  .trim()
  .max(2000, "Note must be 2000 characters or fewer")
  .optional()
  .transform((value) => (value ? value : undefined));

export const recordPaymentSchema = z.object({
  ticketId: z.string().trim().min(1),
  amount: amountSchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  note: noteSchema,
  receivedAt: z.coerce.date(),
});

// Hand-declared rather than z.infer — see the note in
// features/customers/schemas.ts on why `.optional().transform()` infers a
// required-but-possibly-undefined key instead of a true optional key.
export type RecordPaymentInput = {
  ticketId: string;
  amount: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  note?: string;
  receivedAt: Date;
};

// paymentId is not part of this schema — it's always passed as a separate
// argument to updatePaymentAction()/updatePayment(), never inside the form
// payload, so there's no redundant field for the two to fall out of sync on.
export const updatePaymentSchema = z.object({
  amount: amountSchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  note: noteSchema,
  receivedAt: z.coerce.date(),
});

export type UpdatePaymentInput = {
  amount: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  note?: string;
  receivedAt: Date;
};

export const dateRangeTotalSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const paymentAuditLogSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaymentAuditLogSearchInput = z.infer<typeof paymentAuditLogSearchSchema>;
