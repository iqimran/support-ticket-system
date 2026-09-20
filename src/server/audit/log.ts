import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

type RecordAuditLogInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/** Append-only general audit trail. See prisma/schema.prisma AuditLog for the action-naming convention. */
export function recordAuditLog(input: RecordAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    },
  });
}
