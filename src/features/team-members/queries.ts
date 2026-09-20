import { findTeamMemberById, getTeamMemberStats, listTeamMembers } from "@/features/team-members/repository";
import type { TeamMemberSearchInput } from "@/features/team-members/schemas";

// Read-side only. Callers (pages) are responsible for calling requireAdmin() first.

export function searchTeamMembers(params: TeamMemberSearchInput) {
  return listTeamMembers(params);
}

export async function getTeamMemberDetail(id: string) {
  const [teamMember, stats] = await Promise.all([findTeamMemberById(id), getTeamMemberStats(id)]);
  if (!teamMember) return null;
  return { teamMember, stats };
}
