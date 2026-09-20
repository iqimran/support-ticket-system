import type { TicketPriority } from "@/generated/prisma/enums";

/** Maps ticket priority to a StatusBadge tone (reuses the same badge component for status and priority). */
export const PRIORITY_TONES: Record<TicketPriority, "neutral" | "info" | "warning" | "danger"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};
