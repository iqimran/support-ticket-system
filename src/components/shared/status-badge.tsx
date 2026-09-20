import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

// Known ticket statuses get a sensible default tone; anything unrecognized
// (or a future status from another entity) falls back to neutral, or can
// be overridden explicitly via the `tone` prop.
const DEFAULT_STATUS_TONES: Record<string, StatusTone> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  danger: "bg-destructive/10 text-destructive",
};

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type StatusBadgeProps = {
  status: string;
  tone?: StatusTone;
  className?: string;
};

export function StatusBadge({ status, tone, className }: StatusBadgeProps) {
  const resolvedTone = tone ?? DEFAULT_STATUS_TONES[status] ?? "neutral";

  return (
    <Badge variant="outline" className={cn("border-transparent", TONE_CLASSES[resolvedTone], className)}>
      {formatStatusLabel(status)}
    </Badge>
  );
}
