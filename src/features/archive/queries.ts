import type { ArchiveBatch } from "@/generated/prisma/client";
import {
  findArchivedTicketBundle,
  searchArchivedTickets as searchArchivedTicketsRepo,
  type ArchivedTicketListItem,
} from "@/features/archive/repository";
import type { ArchiveSearchInput } from "@/features/archive/schemas";
import type { TicketTimelineEntry } from "@/features/tickets/queries";
import { prisma } from "@/server/db/prisma";

// Read-side only. Callers (pages) are responsible for calling
// requireTeamMember() first, and for deciding includePaymentAudit via
// canViewPaymentAudit(user) before calling getArchivedTicketDetail.

export function searchArchivedTickets(
  params: ArchiveSearchInput,
): Promise<{ items: ArchivedTicketListItem[]; total: number }> {
  return searchArchivedTicketsRepo(params);
}

/**
 * Same shape as tickets/queries.ts's getTicketDetail — including reusing
 * TicketTimelineEntry so the historical view can reuse the same
 * <TicketTimeline> component the live ticket page uses.
 */
export async function getArchivedTicketDetail(id: string, options: { includePaymentAudit: boolean }) {
  const bundle = await findArchivedTicketBundle(id, options);
  if (!bundle) return null;

  const timeline: TicketTimelineEntry[] = [
    { type: "created" as const, at: bundle.ticket.createdAt, actorName: bundle.creatorName },
    ...bundle.statusHistory.map(
      (h): TicketTimelineEntry => ({
        type: "status_change",
        at: h.createdAt,
        actorName: h.changedByName,
        from: h.oldStatus,
        to: h.newStatus,
        note: h.note,
      }),
    ),
    ...bundle.notes.map((n): TicketTimelineEntry => ({ type: "note", at: n.createdAt, actorName: n.creatorName, note: n.note })),
    ...bundle.assignments.map(
      (a): TicketTimelineEntry => ({
        type: "assignment",
        at: a.assignedAt,
        actorName: a.assignerName,
        teamMemberName: a.teamMemberName,
      }),
    ),
    ...bundle.payments.map(
      (p): TicketTimelineEntry => ({
        type: "payment",
        at: p.receivedAt,
        actorName: p.receiverName,
        amount: p.amount.toString(),
        method: p.paymentMethod,
      }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { ...bundle, timeline };
}

export type ArchivedTicketDetail = NonNullable<Awaited<ReturnType<typeof getArchivedTicketDetail>>>;

export type ArchiveRunSummary = ArchiveBatch & { durationMs: number | null };

function toSummary(batch: ArchiveBatch): ArchiveRunSummary {
  return {
    ...batch,
    durationMs: batch.completedAt ? batch.completedAt.getTime() - batch.startedAt.getTime() : null,
  };
}

/** Most recent archive run, regardless of outcome — what the monitoring page's "last run" panel shows. */
export async function getLatestArchiveRun(): Promise<ArchiveRunSummary | null> {
  const batch = await prisma.archiveBatch.findFirst({ orderBy: { startedAt: "desc" } });
  return batch ? toSummary(batch) : null;
}

/** Recent run history for the monitoring page's table. */
export async function listRecentArchiveRuns(limit = 20): Promise<ArchiveRunSummary[]> {
  const batches = await prisma.archiveBatch.findMany({ orderBy: { startedAt: "desc" }, take: limit });
  return batches.map(toSummary);
}
