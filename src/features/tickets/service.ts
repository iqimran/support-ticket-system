import type { Ticket, TicketAssignment, TicketNote } from "@/generated/prisma/client";
import type { TicketStatus } from "@/generated/prisma/enums";
import type { CreateTicketInput } from "@/features/tickets/schemas";
import {
  createTicketRecord,
  deleteTicketAssignmentRecord,
  findTicketAssignmentById,
  findTeamMemberByUserId,
  generateTicketNumber,
  addTicketNoteRecord,
} from "@/features/tickets/repository";
import { canRemoveTicketAssignment } from "@/server/authorization";
import type { AuthUser } from "@/server/auth/types";
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

export type InvalidTeamMember = { teamMemberId: string; reason: "not_found" | "inactive" };

export type AssignTeamMembersResult =
  | { status: "assigned"; assignments: TicketAssignment[] }
  | { status: "ticket_not_found" }
  | { status: "no_team_members" }
  | { status: "invalid_team_members"; invalid: InvalidTeamMember[] }
  | { status: "already_assigned"; teamMemberIds: string[] };

/**
 * Assigns one or more team members to a ticket atomically: either every
 * requested id is created as a TicketAssignment row, or none are. Deactivated
 * team members (TeamMember.isActive = false) can never be *newly* assigned —
 * this is checked here so it applies uniformly regardless of caller (admin,
 * self-assign, or assigning someone else), not just at the UI picker level.
 */
export async function assignTeamMembers(
  ticketId: string,
  teamMemberIds: string[],
  assignedBy: string,
): Promise<AssignTeamMembersResult> {
  const uniqueIds = Array.from(new Set(teamMemberIds));
  if (uniqueIds.length === 0) return { status: "no_team_members" };

  try {
    return await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) return { status: "ticket_not_found" };

      const teamMembers = await tx.teamMember.findMany({ where: { id: { in: uniqueIds } } });
      const teamMemberById = new Map(teamMembers.map((teamMember) => [teamMember.id, teamMember]));

      const invalid: InvalidTeamMember[] = uniqueIds.flatMap((teamMemberId): InvalidTeamMember[] => {
        const teamMember = teamMemberById.get(teamMemberId);
        if (!teamMember) return [{ teamMemberId, reason: "not_found" }];
        if (!teamMember.isActive) return [{ teamMemberId, reason: "inactive" }];
        return [];
      });
      if (invalid.length > 0) return { status: "invalid_team_members", invalid };

      const existing = await tx.ticketAssignment.findMany({
        where: { ticketId, teamMemberId: { in: uniqueIds } },
        select: { teamMemberId: true },
      });
      if (existing.length > 0) {
        return { status: "already_assigned", teamMemberIds: existing.map((row) => row.teamMemberId) };
      }

      const assignments: TicketAssignment[] = [];
      for (const teamMemberId of uniqueIds) {
        assignments.push(await tx.ticketAssignment.create({ data: { ticketId, teamMemberId, assignedBy } }));
      }

      return { status: "assigned", assignments };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // A concurrent request won the race between our check and insert.
      return { status: "already_assigned", teamMemberIds: uniqueIds };
    }
    throw error;
  }
}

export type RemoveAssignmentResult =
  | { status: "removed"; teamMemberId: string }
  | { status: "not_found" }
  | { status: "forbidden" };

/**
 * `ticketId` is required (not just the assignmentId) so an assignment can
 * only be removed via the ticket it actually belongs to, and `actor` enforces
 * canRemoveTicketAssignment: ADMIN can remove any assignment, a TEAM_MEMBER
 * only their own.
 */
export async function removeAssignment(
  assignmentId: string,
  ticketId: string,
  actor: AuthUser,
): Promise<RemoveAssignmentResult> {
  const assignment = await findTicketAssignmentById(assignmentId);
  if (!assignment || assignment.ticketId !== ticketId) return { status: "not_found" };

  if (!canRemoveTicketAssignment(actor, assignment)) return { status: "forbidden" };

  const result = await deleteTicketAssignmentRecord(assignmentId);
  if (result.count === 0) return { status: "not_found" };

  return { status: "removed", teamMemberId: assignment.teamMemberId };
}

/** Resolves the TeamMember profile for "assign self" — null if the caller (e.g. an ADMIN with no team profile) has none. */
export function findSelfTeamMember(userId: string) {
  return findTeamMemberByUserId(userId);
}
