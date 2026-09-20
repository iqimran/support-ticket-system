"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/features/auth/schemas";
import { clearSessionCookie, getSessionTokenFromCookies, setSessionCookie } from "@/server/auth/cookies";
import { verifyPassword } from "@/server/auth/password";
import { createSession, invalidateSessionToken, validateSessionToken } from "@/server/auth/session";
import { recordAuditLog } from "@/server/audit/log";
import { prisma } from "@/server/db/prisma";

// Intentionally identical for "no such user" and "wrong password" to avoid
// leaking which phone numbers have accounts.
const INVALID_CREDENTIALS_MESSAGE = "Invalid phone or password.";

export type LoginFormState = { error: string } | undefined;

export async function login(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const user = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
  if (!user || !user.isActive) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  await recordAuditLog({
    actorId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
  });

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const token = await getSessionTokenFromCookies();

  if (token) {
    const user = await validateSessionToken(token);
    await invalidateSessionToken(token);
    if (user) {
      await recordAuditLog({
        actorId: user.id,
        action: "auth.logout",
        entityType: "User",
        entityId: user.id,
      });
    }
  }

  await clearSessionCookie();
  redirect("/login");
}
