import { z } from "zod";
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

const nameSchema = z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer");

export const createTeamMemberSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
});

export type CreateTeamMemberInput = { name: string; phone: string };

export const updateTeamMemberSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
});

export type UpdateTeamMemberInput = { name: string; phone: string };

export const teamMemberSearchSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "phone", "createdAt"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type TeamMemberSearchInput = z.infer<typeof teamMemberSearchSchema>;
