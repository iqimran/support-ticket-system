import type { PaymentMethod, TicketStatus } from "@/generated/prisma/enums";
import { findTicketDetailById, listTickets, type TicketListItem } from "@/features/tickets/repository";
import type { TicketSearchInput } from "@/features/tickets/schemas";

// Read-side only. Callers (pages) are responsible for calling
// requireAuth()/requireTeamMember() first.

export function searchTickets(params: TicketSearchInput): Promise<{ items: TicketListItem[]; total: number }> {
  return listTickets(params);
}

export type TicketTimelineEntry =
  | { type: "created"; at: Date; actorName: string }
  | { type: "status_change"; at: Date; actorName: string; from: TicketStatus; to: TicketStatus; note: string | null }
  | { type: "note"; at: Date; actorName: string; note: string }
  | { type: "assignment"; at: Date; actorName: string; teamMemberName: string }
  | { type: "payment"; at: Date; actorName: string; amount: string; method: PaymentMethod };

export async function getTicketDetail(id: string) {
  const ticket = await findTicketDetailById(id);
  if (!ticket) return null;

  const timeline: TicketTimelineEntry[] = [
    { type: "created" as const, at: ticket.createdAt, actorName: ticket.creator.name },
    ...ticket.statusHistory.map(
      (entry): TicketTimelineEntry => ({
        type: "status_change",
        at: entry.createdAt,
        actorName: entry.changedByUser.name,
        from: entry.oldStatus,
        to: entry.newStatus,
        note: entry.note,
      }),
    ),
    ...ticket.notes.map(
      (note): TicketTimelineEntry => ({
        type: "note",
        at: note.createdAt,
        actorName: note.creator.name,
        note: note.note,
      }),
    ),
    ...ticket.assignments.map(
      (assignment): TicketTimelineEntry => ({
        type: "assignment",
        at: assignment.assignedAt,
        actorName: assignment.assigner.name,
        teamMemberName: assignment.teamMember.name,
      }),
    ),
    ...ticket.payments.map(
      (payment): TicketTimelineEntry => ({
        type: "payment",
        at: payment.receivedAt,
        actorName: payment.receiver.name,
        amount: payment.amount.toString(),
        method: payment.paymentMethod,
      }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { ticket, timeline };
}

export type { TicketListItem };
