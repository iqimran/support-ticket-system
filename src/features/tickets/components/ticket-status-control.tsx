"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changeTicketStatusAction } from "@/features/tickets/actions";
import type { TicketStatus } from "@/generated/prisma/enums";

// Client-side mirror of service.ts's VALID_TRANSITIONS, for UX only (which
// options to show). The server re-validates every transition regardless —
// see changeTicketStatus() in src/features/tickets/service.ts.
const NEXT_STATUS_OPTIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: [],
};

type TicketStatusControlProps = {
  ticketId: string;
  currentStatus: TicketStatus;
};

export function TicketStatusControl({ ticketId, currentStatus }: TicketStatusControlProps) {
  const router = useRouter();
  const nextOptions = NEXT_STATUS_OPTIONS[currentStatus];
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus | "">(nextOptions[0] ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReopen = currentStatus === "COMPLETED" && selectedStatus === "IN_PROGRESS";

  if (nextOptions.length === 0) {
    return <p className="text-muted-foreground text-sm">This ticket is cancelled and cannot be reopened.</p>;
  }

  async function handleConfirm() {
    if (!selectedStatus) return;
    setIsSubmitting(true);
    setError(null);

    const result = await changeTicketStatusAction({ ticketId, newStatus: selectedStatus, note: note || undefined });

    setIsSubmitting(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    toast.success("Status updated");
    setDialogOpen(false);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as TicketStatus)}>
        <SelectTrigger className="w-44" aria-label="New status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {nextOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "IN_PROGRESS" && currentStatus === "COMPLETED" ? "Reopen (In Progress)" : option.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" onClick={() => setDialogOpen(true)} disabled={!selectedStatus}>
        Change status
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isReopen ? "Reopen ticket" : "Change status"}</DialogTitle>
            <DialogDescription>
              {isReopen
                ? "Reopening a completed ticket requires a reason."
                : `Move this ticket to ${selectedStatus?.replace("_", " ")}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="status-note">{isReopen ? "Reason (required)" : "Note (optional)"}</Label>
            <Textarea id="status-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isSubmitting || (isReopen && !note.trim())}>
              {isSubmitting ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
