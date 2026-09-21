"use server";

import { revalidatePath } from "next/cache";
import {
  addTicketNoteSchema,
  assignTeamMembersSchema,
  changeTicketStatusSchema,
  createTicketSchema,
} from "@/features/tickets/schemas";
import {
  addTicketNote,
  assignTeamMembers,
  changeTicketStatus,
  createTicket,
  findSelfTeamMember,
  removeAssignment,
} from "@/features/tickets/service";
import { searchActiveTeamMembers } from "@/features/tickets/repository";
import { recordAuditLog } from "@/server/audit/log";
import { requireTeamMember } from "@/server/authorization";

export type TeamMemberPickerResult = { id: string; name: string; phone: string };

/** Small, trimmed active-team-member search for the assignment combobox. */
export async function searchTeamMembersForPickerAction(query: string): Promise<TeamMemberPickerResult[]> {
  await requireTeamMember();
  return searchActiveTeamMembers(query);
}

export type TicketActionResult<TExtra extends object = object> =
  | ({ status: "success" } & TExtra)
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export async function createTicketAction(input: unknown): Promise<TicketActionResult<{ ticketId: string }>> {
  const user = await requireTeamMember();

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ticket = await createTicket(parsed.data, user.id);

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.created",
    entityType: "Ticket",
    entityId: ticket.id,
    metadata: { ticketNumber: ticket.ticketNumber },
  });
  revalidatePath("/tickets");

  return { status: "success", ticketId: ticket.id };
}

export async function changeTicketStatusAction(input: unknown): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const parsed = changeTicketStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await changeTicketStatus(parsed.data.ticketId, {
    newStatus: parsed.data.newStatus,
    note: parsed.data.note,
    changedBy: user.id,
  });

  if (result.status === "not_found") {
    return { status: "error", message: "Ticket not found." };
  }
  if (result.status === "invalid_transition") {
    return { status: "error", message: `Cannot move a ticket from ${result.from} to ${result.to}.` };
  }
  if (result.status === "reason_required") {
    return { status: "error", message: "A reason is required to reopen a completed ticket.", fieldErrors: { note: ["A reason is required to reopen a completed ticket."] } };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.status_changed",
    entityType: "Ticket",
    entityId: parsed.data.ticketId,
    metadata: { newStatus: parsed.data.newStatus },
  });
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/tickets");

  return { status: "success" };
}

export async function addTicketNoteAction(input: unknown): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const parsed = addTicketNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  await addTicketNote(parsed.data.ticketId, user.id, parsed.data.note);

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.note_added",
    entityType: "Ticket",
    entityId: parsed.data.ticketId,
  });
  revalidatePath(`/tickets/${parsed.data.ticketId}`);

  return { status: "success" };
}

/** Renders the same error for both reasons why a set of ids can't be assigned: unknown ids and inactive-team-member ids. */
function describeInvalidTeamMembers(invalid: { reason: "not_found" | "inactive" }[]): string {
  const inactiveCount = invalid.filter((entry) => entry.reason === "inactive").length;
  const notFoundCount = invalid.length - inactiveCount;

  const parts: string[] = [];
  if (inactiveCount > 0) parts.push(`${inactiveCount} inactive team member${inactiveCount > 1 ? "s" : ""}`);
  if (notFoundCount > 0) parts.push(`${notFoundCount} team member${notFoundCount > 1 ? "s" : ""} not found`);

  return `Cannot assign: ${parts.join(" and ")}.`;
}

export async function assignTeamMembersAction(input: unknown): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const parsed = assignTeamMembersSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await assignTeamMembers(parsed.data.ticketId, parsed.data.teamMemberIds, user.id);

  if (result.status === "ticket_not_found") return { status: "error", message: "Ticket not found." };
  if (result.status === "no_team_members") return { status: "error", message: "Select at least one team member." };
  if (result.status === "invalid_team_members") {
    return { status: "error", message: describeInvalidTeamMembers(result.invalid) };
  }
  if (result.status === "already_assigned") {
    return { status: "error", message: "One or more selected team members are already assigned to this ticket." };
  }

  for (const assignment of result.assignments) {
    await recordAuditLog({
      actorId: user.id,
      action: "ticket.assigned",
      entityType: "Ticket",
      entityId: parsed.data.ticketId,
      metadata: { teamMemberId: assignment.teamMemberId },
    });
  }
  revalidatePath(`/tickets/${parsed.data.ticketId}`);

  return { status: "success" };
}

export async function assignSelfAction(ticketId: string): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const selfTeamMember = await findSelfTeamMember(user.id);
  if (!selfTeamMember) {
    return { status: "error", message: "Your account does not have a team member profile to assign." };
  }

  const result = await assignTeamMembers(ticketId, [selfTeamMember.id], user.id);

  if (result.status === "ticket_not_found") return { status: "error", message: "Ticket not found." };
  if (result.status === "no_team_members") return { status: "error", message: "Ticket not found." };
  if (result.status === "invalid_team_members") {
    return { status: "error", message: "Your team member profile is inactive and cannot be assigned to tickets." };
  }
  if (result.status === "already_assigned") return { status: "error", message: "You are already assigned to this ticket." };

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.assigned",
    entityType: "Ticket",
    entityId: ticketId,
    metadata: { teamMemberId: selfTeamMember.id, self: true },
  });
  revalidatePath(`/tickets/${ticketId}`);

  return { status: "success" };
}

export async function removeAssignmentAction(assignmentId: string, ticketId: string): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const result = await removeAssignment(assignmentId, ticketId, user);
  if (result.status === "not_found") {
    return { status: "error", message: "Assignment not found." };
  }
  if (result.status === "forbidden") {
    return { status: "error", message: "You can only remove your own assignment." };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.assignment_removed",
    entityType: "Ticket",
    entityId: ticketId,
    metadata: { assignmentId, teamMemberId: result.teamMemberId },
  });
  revalidatePath(`/tickets/${ticketId}`);

  return { status: "success" };
}
