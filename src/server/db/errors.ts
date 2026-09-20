import { Prisma } from "@/generated/prisma/client";

/** True for a Prisma unique-constraint violation (P2002). */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
