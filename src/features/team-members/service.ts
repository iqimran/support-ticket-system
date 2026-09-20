import { randomBytes } from "node:crypto";
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from "@/features/team-members/schemas";
import {
  createTeamMemberWithAccount,
  findTeamMemberById,
  findUserByPhone,
  invalidateAllSessionsForUser,
  setTeamMemberActiveStatus,
  setUserLoginStatus,
  updateTeamMemberAndUser,
  updateUserPasswordHash,
  type TeamMemberRecord,
} from "@/features/team-members/repository";
import { hashPassword } from "@/server/auth/password";
import { isUniqueConstraintError } from "@/server/db/errors";

/**
 * Admin never chooses a password — one is always generated here and
 * returned in plaintext exactly once (by createTeamMember/resetPassword),
 * never persisted or logged anywhere. This is the "secure flow": strong,
 * unguessable, and there is no code path that can retrieve it again after
 * this call returns.
 */
function generatePassword(): string {
  return randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

export type CreateTeamMemberResult =
  | { status: "created"; teamMember: TeamMemberRecord; generatedPassword: string }
  | { status: "duplicate_phone" };

export async function createTeamMember(input: CreateTeamMemberInput): Promise<CreateTeamMemberResult> {
  const existing = await findUserByPhone(input.phone);
  if (existing) {
    return { status: "duplicate_phone" };
  }

  const generatedPassword = generatePassword();
  const passwordHash = await hashPassword(generatedPassword);

  try {
    const teamMember = await createTeamMemberWithAccount({ name: input.name, phone: input.phone, passwordHash });
    return { status: "created", teamMember, generatedPassword };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "duplicate_phone" };
    }
    throw error;
  }
}

export type UpdateTeamMemberResult =
  | { status: "updated"; teamMember: TeamMemberRecord }
  | { status: "not_found" }
  | { status: "duplicate_phone" };

export async function updateTeamMember(id: string, input: UpdateTeamMemberInput): Promise<UpdateTeamMemberResult> {
  const current = await findTeamMemberById(id);
  if (!current) {
    return { status: "not_found" };
  }

  if (input.phone !== current.phone) {
    const conflicting = await findUserByPhone(input.phone);
    if (conflicting && conflicting.id !== current.userId) {
      return { status: "duplicate_phone" };
    }
  }

  try {
    const teamMember = await updateTeamMemberAndUser(id, current.userId, input);
    return { status: "updated", teamMember };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "duplicate_phone" };
    }
    throw error;
  }
}

export type SetActiveStatusResult = { status: "updated"; teamMember: TeamMemberRecord } | { status: "not_found" };

export async function setTeamMemberActive(id: string, isActive: boolean): Promise<SetActiveStatusResult> {
  const current = await findTeamMemberById(id);
  if (!current) return { status: "not_found" };

  const teamMember = await setTeamMemberActiveStatus(id, isActive);
  return { status: "updated", teamMember };
}

export type SetLoginStatusResult = { status: "updated"; teamMember: TeamMemberRecord } | { status: "not_found" };

export async function setTeamMemberLoginStatus(id: string, isActive: boolean): Promise<SetLoginStatusResult> {
  const current = await findTeamMemberById(id);
  if (!current) return { status: "not_found" };

  await setUserLoginStatus(current.userId, isActive);
  // Disabling login should end any session they're already in, not just
  // block future ones.
  if (!isActive) {
    await invalidateAllSessionsForUser(current.userId);
  }

  const updated = await findTeamMemberById(id);
  return { status: "updated", teamMember: updated! };
}

export type ResetPasswordResult =
  | { status: "reset"; generatedPassword: string }
  | { status: "not_found" };

export async function resetTeamMemberPassword(id: string): Promise<ResetPasswordResult> {
  const current = await findTeamMemberById(id);
  if (!current) return { status: "not_found" };

  const generatedPassword = generatePassword();
  const passwordHash = await hashPassword(generatedPassword);

  await updateUserPasswordHash(current.userId, passwordHash);
  // A password reset should invalidate any session established under the
  // old credentials — otherwise a compromised/old session survives the reset.
  await invalidateAllSessionsForUser(current.userId);

  return { status: "reset", generatedPassword };
}
