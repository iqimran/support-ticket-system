import type { AuthUser } from "@/server/auth/types";

/**
 * No per-assignment ticket restrictions exist yet — any active staff member
 * (ADMIN or TEAM_MEMBER) may access any ticket. The ticket param is accepted
 * now so call sites are already in place if row-level rules are added later.
 */
export function canAccessTicket(user: AuthUser, _ticket?: { id: string }): boolean {
  return user.isActive;
}

export function canViewPaymentAudit(user: AuthUser): boolean {
  return user.role === "ADMIN";
}

/**
 * ADMIN may remove any ticket assignment. A TEAM_MEMBER may only remove
 * their own — the assignment's teamMember must belong to that same user.
 */
export function canRemoveTicketAssignment(user: AuthUser, assignment: { teamMember: { userId: string } }): boolean {
  return user.role === "ADMIN" || assignment.teamMember.userId === user.id;
}
