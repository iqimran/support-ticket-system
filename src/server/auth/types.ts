import type { UserRole } from "@/generated/prisma/enums";

/** Session-safe user projection — never include passwordHash. */
export type AuthUser = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
};
