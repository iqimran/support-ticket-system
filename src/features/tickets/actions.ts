"use server";

import { revalidatePath } from "next/cache";
import {
  addTicketNoteSchema,
  assignTeamMemberSchema,
  changeTicketStatusSchema,
  createTicketSchema,
} from "@/features/tickets/schemas";
import {
  addTicketNote,
  assignTeamMember,
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

export async function assignTeamMemberAction(input: unknown): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const parsed = assignTeamMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await assignTeamMember(parsed.data.ticketId, parsed.data.teamMemberId, user.id);

  if (result.status === "ticket_not_found") return { status: "error", message: "Ticket not found." };
  if (result.status === "team_member_not_found") return { status: "error", message: "Team member not found." };
  if (result.status === "already_assigned") return { status: "error", message: "This team member is already assigned to the ticket." };

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.assigned",
    entityType: "Ticket",
    entityId: parsed.data.ticketId,
    metadata: { teamMemberId: parsed.data.teamMemberId },
  });
  revalidatePath(`/tickets/${parsed.data.ticketId}`);

  return { status: "success" };
}

export async function assignSelfAction(ticketId: string): Promise<TicketActionResult> {
  const user = await requireTeamMember();

  const selfTeamMember = await findSelfTeamMember(user.id);
  if (!selfTeamMember) {
    return { status: "error", message: "Your account does not have a team member profile to assign." };
  }

  const result = await assignTeamMember(ticketId, selfTeamMember.id, user.id);

  if (result.status === "ticket_not_found") return { status: "error", message: "Ticket not found." };
  if (result.status === "team_member_not_found") return { status: "error", message: "Team member not found." };
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

  const result = await removeAssignment(assignmentId);
  if (result.status === "not_found") {
    return { status: "error", message: "Assignment not found." };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "ticket.assignment_removed",
    entityType: "Ticket",
    entityId: ticketId,
    metadata: { assignmentId },
  });
  revalidatePath(`/tickets/${ticketId}`);

  return { status: "success" };
}
