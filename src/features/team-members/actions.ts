"use server";

import { revalidatePath } from "next/cache";
import {
  createTeamMemberSchema,
  updateTeamMemberSchema,
} from "@/features/team-members/schemas";
import {
  createTeamMember,
  resetTeamMemberPassword,
  setTeamMemberActive,
  setTeamMemberLoginStatus,
  updateTeamMember,
} from "@/features/team-members/service";
import { recordAuditLog } from "@/server/audit/log";
import { requireAdmin } from "@/server/authorization";

// Every action here requires ADMIN — see prompt 3's permission matrix
// ("Manage team members" is ADMIN-only, with no team-member-side
// equivalent) and this prompt's explicit "Admin-only functionality"
// framing. None of these return a passwordHash or any other credential
// material except the one-time generated plaintext password from create/
// reset, which the client must display once and never persist.

export type TeamMemberActionResult<TExtra extends object = object> =
  | ({ status: "success" } & TExtra)
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

export async function createTeamMemberAction(
  input: unknown,
): Promise<TeamMemberActionResult<{ teamMemberId: string; generatedPassword: string }>> {
  const admin = await requireAdmin();

  const parsed = createTeamMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await createTeamMember(parsed.data);
  if (result.status === "duplicate_phone") {
    return {
      status: "error",
      message: "A user with this phone number already exists.",
      fieldErrors: { phone: ["A user with this phone number already exists."] },
    };
  }

  await recordAuditLog({
    actorId: admin.id,
    action: "team_member.created",
    entityType: "TeamMember",
    entityId: result.teamMember.id,
  });
  revalidatePath("/team-members");

  return { status: "success", teamMemberId: result.teamMember.id, generatedPassword: result.generatedPassword };
}

export async function updateTeamMemberAction(id: string, input: unknown): Promise<TeamMemberActionResult> {
  const admin = await requireAdmin();

  const parsed = updateTeamMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await updateTeamMember(id, parsed.data);
  if (result.status === "not_found") {
    return { status: "error", message: "Team member not found." };
  }
  if (result.status === "duplicate_phone") {
    return {
      status: "error",
      message: "Another user already uses this phone number.",
      fieldErrors: { phone: ["Another user already uses this phone number."] },
    };
  }

  await recordAuditLog({ actorId: admin.id, action: "team_member.updated", entityType: "TeamMember", entityId: id });
  revalidatePath("/team-members");
  revalidatePath(`/team-members/${id}`);

  return { status: "success" };
}

export async function setTeamMemberActiveAction(id: string, isActive: boolean): Promise<TeamMemberActionResult> {
  const admin = await requireAdmin();

  const result = await setTeamMemberActive(id, isActive);
  if (result.status === "not_found") {
    return { status: "error", message: "Team member not found." };
  }

  await recordAuditLog({
    actorId: admin.id,
    action: isActive ? "team_member.activated" : "team_member.deactivated",
    entityType: "TeamMember",
    entityId: id,
  });
  revalidatePath("/team-members");
  revalidatePath(`/team-members/${id}`);

  return { status: "success" };
}

export async function setTeamMemberLoginStatusAction(id: string, isActive: boolean): Promise<TeamMemberActionResult> {
  const admin = await requireAdmin();

  const result = await setTeamMemberLoginStatus(id, isActive);
  if (result.status === "not_found") {
    return { status: "error", message: "Team member not found." };
  }

  await recordAuditLog({
    actorId: admin.id,
    action: isActive ? "team_member.login_enabled" : "team_member.login_disabled",
    entityType: "TeamMember",
    entityId: id,
  });
  revalidatePath("/team-members");
  revalidatePath(`/team-members/${id}`);

  return { status: "success" };
}

export async function resetTeamMemberPasswordAction(
  id: string,
): Promise<TeamMemberActionResult<{ generatedPassword: string }>> {
  const admin = await requireAdmin();

  const result = await resetTeamMemberPassword(id);
  if (result.status === "not_found") {
    return { status: "error", message: "Team member not found." };
  }

  // Deliberately no password material in the audit log metadata.
  await recordAuditLog({
    actorId: admin.id,
    action: "team_member.password_reset",
    entityType: "TeamMember",
    entityId: id,
  });

  return { status: "success", generatedPassword: result.generatedPassword };
}
