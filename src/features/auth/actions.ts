"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/features/auth/schemas";
import { clearSessionCookie, getSessionTokenFromCookies, setSessionCookie } from "@/server/auth/cookies";
import { verifyPassword } from "@/server/auth/password";
import { clearLoginAttempts, isLoginRateLimited, recordFailedLoginAttempt } from "@/server/auth/rate-limit";
import { createSession, invalidateSessionToken, validateSessionToken } from "@/server/auth/session";
import { recordAuditLog } from "@/server/audit/log";
import { prisma } from "@/server/db/prisma";
import { logger, maskPhone } from "@/server/observability/logger";

// Intentionally identical for "no such user" and "wrong password" to avoid
// leaking which phone numbers have accounts.
const INVALID_CREDENTIALS_MESSAGE = "Invalid phone or password.";
const RATE_LIMITED_MESSAGE = "Too many failed attempts. Try again in a few minutes.";

export type LoginFormState = { error: string } | undefined;

export async function login(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    logger.warn("auth.login_failed", { reason: "invalid_input" });
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const maskedPhone = maskPhone(parsed.data.phone);

  if (isLoginRateLimited(parsed.data.phone)) {
    logger.warn("auth.login_rate_limited", { phone: maskedPhone });
    return { error: RATE_LIMITED_MESSAGE };
  }

  const user = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
  if (!user || !user.isActive) {
    recordFailedLoginAttempt(parsed.data.phone);
    logger.warn("auth.login_failed", { reason: user ? "inactive_account" : "no_such_account", phone: maskedPhone });
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    recordFailedLoginAttempt(parsed.data.phone);
    logger.warn("auth.login_failed", { reason: "wrong_password", phone: maskedPhone, userId: user.id });
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  clearLoginAttempts(parsed.data.phone);
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  await recordAuditLog({
    actorId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
  });
  logger.info("auth.login_succeeded", { userId: user.id, phone: maskedPhone, role: user.role });

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
      logger.info("auth.logout", { userId: user.id });
    }
  }

  await clearSessionCookie();
  redirect("/login");
}
