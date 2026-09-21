"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addTicketNoteAction } from "@/features/tickets/actions";

export function TicketNoteForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await addTicketNoteAction({ ticketId, note });

    setIsSubmitting(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    setNote("");
    toast.success("Note added");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        rows={3}
        placeholder="Add a work note..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
        aria-label="New note"
        aria-invalid={!!error}
        aria-describedby={error ? "note-error" : undefined}
        required
      />
      {error ? (
        <p id="note-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isSubmitting || !note.trim()}>
        {isSubmitting ? "Adding..." : "Add note"}
      </Button>
    </form>
  );
}
