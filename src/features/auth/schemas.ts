import { z } from "zod";
import { normalizeBangladeshiPhone } from "@/lib/phone";

export const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .transform((value, ctx) => {
      const normalized = normalizeBangladeshiPhone(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Enter a valid Bangladeshi mobile number (e.g. 01712345678)" });
        return z.NEVER;
      }
      return normalized;
    }),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
