import { CheckCircle2, MessageSquare, UserPlus, Wallet, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { MoneyDisplay } from "@/components/shared/money-display";
import { EmptyState } from "@/components/shared/empty-state";
import type { TicketTimelineEntry } from "@/features/tickets/queries";
import { formatDateTime } from "@/lib/format-date";

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function describeEntry(entry: TicketTimelineEntry): { icon: ReactNode; text: ReactNode } {
  switch (entry.type) {
    case "created":
      return { icon: <Workflow aria-hidden="true" className="size-4" />, text: <>{entry.actorName} created this ticket</> };
    case "status_change":
      return {
        icon: <CheckCircle2 aria-hidden="true" className="size-4" />,
        text: (
          <>
            {entry.actorName} changed status from {formatStatus(entry.from)} to {formatStatus(entry.to)}
            {entry.note ? <span className="text-muted-foreground block">“{entry.note}”</span> : null}
          </>
        ),
      };
    case "note":
      return {
        icon: <MessageSquare aria-hidden="true" className="size-4" />,
        text: (
          <>
            {entry.actorName} added a note<span className="text-muted-foreground block">“{entry.note}”</span>
          </>
        ),
      };
    case "assignment":
      return {
        icon: <UserPlus aria-hidden="true" className="size-4" />,
        text: (
          <>
            {entry.actorName} assigned {entry.teamMemberName}
          </>
        ),
      };
    case "payment":
      return {
        icon: <Wallet aria-hidden="true" className="size-4" />,
        text: (
          <>
            {entry.actorName} recorded a payment of <MoneyDisplay amount={entry.amount} /> ({entry.method})
          </>
        ),
      };
  }
}

export function TicketTimeline({ entries }: { entries: TicketTimelineEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No activity yet" />;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => {
        const { icon, text } = describeEntry(entry);
        return (
          <li key={index} className="flex gap-3 text-sm">
            <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
              {icon}
            </span>
            <div className="space-y-0.5">
              <p>{text}</p>
              <p className="text-muted-foreground text-xs">{formatDateTime(entry.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
