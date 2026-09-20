import type { Ticket, TicketAssignment, TicketNote } from "@/generated/prisma/client";
import type { TicketStatus } from "@/generated/prisma/enums";
import type { CreateTicketInput } from "@/features/tickets/schemas";
import {
  createTicketAssignmentRecord,
  createTicketRecord,
  deleteTicketAssignmentRecord,
  findTeamMemberById,
  findTicketAssignment,
  findTicketById,
  findTeamMemberByUserId,
  generateTicketNumber,
  addTicketNoteRecord,
} from "@/features/tickets/repository";
import { isUniqueConstraintError } from "@/server/db/errors";
import { prisma } from "@/server/db/prisma";

const MAX_TICKET_NUMBER_RETRIES = 3;

/**
 * The Postgres sequence backing generateTicketNumber() already guarantees
 * uniqueness under concurrency (see the migration). This retry loop is
 * defense-in-depth for the theoretical case of the DB unique constraint
 * still rejecting an insert (e.g. a manually inserted row collided with a
 * future sequence value) rather than a load-bearing concurrency mechanism.
 */
export async function createTicket(input: CreateTicketInput, createdBy: string): Promise<Ticket> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TICKET_NUMBER_RETRIES; attempt++) {
    const ticketNumber = await generateTicketNumber();
    try {
      return await createTicketRecord({
        ticketNumber,
        customerId: input.customerId,
        problem: input.problem,
        priority: input.priority ?? "MEDIUM",
        createdBy,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

// PENDING -> IN_PROGRESS -> COMPLETED is the main flow. CANCELLED is a
// terminal off-ramp from either open state. COMPLETED -> IN_PROGRESS is the
// only reopen path, and requires a reason (enforced below, not here).
const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: [],
};

export type ChangeTicketStatusResult =
  | { status: "changed"; ticket: Ticket }
  | { status: "not_found" }
  | { status: "invalid_transition"; from: TicketStatus; to: TicketStatus }
  | { status: "reason_required" };

export async function changeTicketStatus(
  ticketId: string,
  input: { newStatus: TicketStatus; note?: string; changedBy: string },
): Promise<ChangeTicketStatusResult> {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return { status: "not_found" };
    }

    if (ticket.status === input.newStatus) {
      return { status: "invalid_transition", from: ticket.status, to: input.newStatus };
    }

    if (!VALID_TRANSITIONS[ticket.status].includes(input.newStatus)) {
      return { status: "invalid_transition", from: ticket.status, to: input.newStatus };
    }

    const isReopen = ticket.status === "COMPLETED" && input.newStatus === "IN_PROGRESS";
    if (isReopen && !input.note) {
      return { status: "reason_required" };
    }

    const updatedTicket = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: input.newStatus,
        completedAt: input.newStatus === "COMPLETED" ? new Date() : isReopen ? null : undefined,
      },
    });

    await tx.ticketStatusHistory.create({
      data: {
        ticketId,
        oldStatus: ticket.status,
        newStatus: input.newStatus,
        changedBy: input.changedBy,
        note: input.note,
      },
    });

    return { status: "changed", ticket: updatedTicket };
  });
}

export function addTicketNote(ticketId: string, createdBy: string, note: string): Promise<TicketNote> {
  return addTicketNoteRecord(ticketId, createdBy, note);
}

export type AssignTeamMemberResult =
  | { status: "assigned"; assignment: TicketAssignment }
  | { status: "ticket_not_found" }
  | { status: "team_member_not_found" }
  | { status: "already_assigned" };

export async function assignTeamMember(
  ticketId: string,
  teamMemberId: string,
  assignedBy: string,
): Promise<AssignTeamMemberResult> {
  const [ticket, teamMember] = await Promise.all([findTicketById(ticketId), findTeamMemberById(teamMemberId)]);

  if (!ticket) return { status: "ticket_not_found" };
  if (!teamMember) return { status: "team_member_not_found" };

  const existing = await findTicketAssignment(ticketId, teamMemberId);
  if (existing) return { status: "already_assigned" };

  try {
    const assignment = await createTicketAssignmentRecord(ticketId, teamMemberId, assignedBy);
    return { status: "assigned", assignment };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "already_assigned" };
    }
    throw error;
  }
}

export type RemoveAssignmentResult = { status: "removed" } | { status: "not_found" };

export async function removeAssignment(assignmentId: string): Promise<RemoveAssignmentResult> {
  const result = await deleteTicketAssignmentRecord(assignmentId);
  return result.count > 0 ? { status: "removed" } : { status: "not_found" };
}

/** Resolves the TeamMember profile for "assign self" — null if the caller (e.g. an ADMIN with no team profile) has none. */
export function findSelfTeamMember(userId: string) {
  return findTeamMemberByUserId(userId);
}
