import { notFound, redirect } from "next/navigation";
import { getSessionTokenFromCookies } from "@/server/auth/cookies";
import { validateSessionToken } from "@/server/auth/session";
import type { AuthUser } from "@/server/auth/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionTokenFromCookies();
  return validateSessionToken(token);
}

/** Authoritative auth gate for pages/layouts/server actions. Never trust a client-side check instead of this. */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * ADMIN-only gate. Uses notFound() rather than a redirect so that a
 * non-admin hitting an admin route (including sensitive payment-audit
 * pages) can't tell the route exists at all.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    notFound();
  }
  return user;
}

/** Gate for any authenticated staff member (ADMIN has full access, so it also passes). */
export async function requireTeamMember(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== "TEAM_MEMBER" && user.role !== "ADMIN") {
    notFound();
  }
  return user;
}
