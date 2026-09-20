"use server";

import { getDailySummaryForDate } from "@/features/dashboard/queries";
import { dailySummarySchema } from "@/features/dashboard/schemas";
import { requireAdmin } from "@/server/authorization";

export async function getDailySummaryAction(input: unknown) {
  await requireAdmin();

  const parsed = dailySummarySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid date");
  }

  return getDailySummaryForDate(parsed.data.date);
}
