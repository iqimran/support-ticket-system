import { z } from "zod";
import { DASHBOARD_PERIODS } from "@/features/dashboard/periods";

/** Shared by the Monthly and Team Member reports — both are "pick a period" reports. */
export const periodReportSchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default("current_month"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type PeriodReportInput = z.infer<typeof periodReportSchema>;

export const dailyReportSchema = z.object({
  date: z.coerce.date().optional(),
});

export type DailyReportInput = z.infer<typeof dailyReportSchema>;

export const customerReportSchema = z.object({
  customerId: z.string().trim().min(1, "Select a customer"),
});

export type CustomerReportInput = z.infer<typeof customerReportSchema>;
