import { z } from "zod";
import { DASHBOARD_PERIODS } from "@/features/dashboard/periods";

export const dashboardPeriodSchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default("current_month"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type DashboardPeriodInput = z.infer<typeof dashboardPeriodSchema>;

export const dailySummarySchema = z.object({
  date: z.coerce.date(),
});

export type DailySummaryInput = z.infer<typeof dailySummarySchema>;
