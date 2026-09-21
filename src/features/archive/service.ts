import type { ArchiveBatch } from "@/generated/prisma/client";
import { resolveArchiveCutoff } from "@/features/archive/cutoff";
import { findArchivableTicketIds, updateArchiveBatch } from "@/features/archive/repository";
import { recordAuditLog } from "@/server/audit/log";
import { prisma } from "@/server/db/prisma";

const DEFAULT_BATCH_SIZE = 100;

// Arbitrary fixed key for a Postgres advisory lock. This app only ever
// takes one advisory lock — "is an archive job already running" — so any
// constant works; it doesn't need to mean anything.
const ARCHIVE_JOB_LOCK_KEY = 7_726_154_930;

/**
 * Copies one ticket and every related record (assignments, status history,
 * notes, payments, payment audit logs) into the *_archive tables, verifies
 * the copy is complete, and only then deletes the live originals — all in
 * one transaction. Any failure (a thrown error, or the verification check
 * below) rolls back the entire transaction: the live ticket is either fully
 * archived and removed, or left completely untouched. This is what makes
 * "never archive half of a ticket's related records" and "do not delete
 * until verification succeeds" true by construction rather than by
 * afterthought.
 *
 * Live-table deletes go child-to-parent because every FK back to Ticket
 * (and Payment, for PaymentAuditLog) is onDelete: Restrict.
 */
export async function archiveOneTicket(ticketId: string, archiveBatchId: string): Promise<void> {
  try {
    await archiveOneTicketTransaction(ticketId, archiveBatchId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to archive ticket ${ticketId}: ${reason}`);
  }
}

async function archiveOneTicketTransaction(ticketId: string, archiveBatchId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });

    const [assignments, statusHistory, notes, payments] = await Promise.all([
      tx.ticketAssignment.findMany({ where: { ticketId } }),
      tx.ticketStatusHistory.findMany({ where: { ticketId } }),
      tx.ticketNote.findMany({ where: { ticketId } }),
      tx.payment.findMany({ where: { ticketId } }),
    ]);
    const paymentIds = payments.map((payment) => payment.id);
    const paymentAuditLogs =
      paymentIds.length > 0 ? await tx.paymentAuditLog.findMany({ where: { paymentId: { in: paymentIds } } }) : [];

    await tx.ticketArchive.create({
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        customerId: ticket.customerId,
        problem: ticket.problem,
        status: ticket.status,
        priority: ticket.priority,
        createdBy: ticket.createdBy,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        completedAt: ticket.completedAt,
        archiveBatchId,
      },
    });

    if (assignments.length > 0) {
      await tx.ticketAssignmentArchive.createMany({
        data: assignments.map((a) => ({
          id: a.id,
          ticketId: a.ticketId,
          teamMemberId: a.teamMemberId,
          assignedBy: a.assignedBy,
          assignedAt: a.assignedAt,
        })),
      });
    }

    if (statusHistory.length > 0) {
      await tx.ticketStatusHistoryArchive.createMany({
        data: statusHistory.map((h) => ({
          id: h.id,
          ticketId: h.ticketId,
          oldStatus: h.oldStatus,
          newStatus: h.newStatus,
          changedBy: h.changedBy,
          note: h.note,
          createdAt: h.createdAt,
        })),
      });
    }

    if (notes.length > 0) {
      await tx.ticketNoteArchive.createMany({
        data: notes.map((n) => ({
          id: n.id,
          ticketId: n.ticketId,
          createdBy: n.createdBy,
          note: n.note,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        })),
      });
    }

    if (payments.length > 0) {
      await tx.paymentArchive.createMany({
        data: payments.map((p) => ({
          id: p.id,
          ticketId: p.ticketId,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          note: p.note,
          receivedBy: p.receivedBy,
          receivedAt: p.receivedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      });
    }

    if (paymentAuditLogs.length > 0) {
      await tx.paymentAuditLogArchive.createMany({
        data: paymentAuditLogs.map((log) => ({
          id: log.id,
          paymentId: log.paymentId,
          ticketId: log.ticketId,
          action: log.action,
          oldAmount: log.oldAmount,
          newAmount: log.newAmount,
          oldPaymentMethod: log.oldPaymentMethod,
          newPaymentMethod: log.newPaymentMethod,
          oldNote: log.oldNote,
          newNote: log.newNote,
          changedBy: log.changedBy,
          createdAt: log.createdAt,
        })),
      });
    }

    // Archive verification: row counts copied must match row counts read
    // from the live tables above. This catches a silent under-copy bug
    // (e.g. a bad filter) that wouldn't otherwise throw — createMany only
    // throws on an actual constraint violation, not on "copied fewer rows
    // than expected". Only once this passes do we touch the live originals.
    const [archivedAssignments, archivedStatusHistory, archivedNotes, archivedPayments, archivedPaymentAuditLogs] =
      await Promise.all([
        tx.ticketAssignmentArchive.count({ where: { ticketId } }),
        tx.ticketStatusHistoryArchive.count({ where: { ticketId } }),
        tx.ticketNoteArchive.count({ where: { ticketId } }),
        tx.paymentArchive.count({ where: { ticketId } }),
        tx.paymentAuditLogArchive.count({ where: { ticketId } }),
      ]);

    if (
      archivedAssignments !== assignments.length ||
      archivedStatusHistory !== statusHistory.length ||
      archivedNotes !== notes.length ||
      archivedPayments !== payments.length ||
      archivedPaymentAuditLogs !== paymentAuditLogs.length
    ) {
      throw new Error(`Archive verification failed for ticket ${ticketId}: copied row counts do not match source`);
    }

    await tx.paymentAuditLog.deleteMany({ where: { ticketId } });
    await tx.payment.deleteMany({ where: { ticketId } });
    await tx.ticketNote.deleteMany({ where: { ticketId } });
    await tx.ticketStatusHistory.deleteMany({ where: { ticketId } });
    await tx.ticketAssignment.deleteMany({ where: { ticketId } });
    await tx.ticket.delete({ where: { id: ticketId } });
  });
}

export type RunArchiveJobResult = ArchiveBatch | { status: "SKIPPED_ALREADY_RUNNING" };

/**
 * Atomically checks "is another archive job already running" and, if not,
 * creates the RUNNING ArchiveBatch row for this run — both inside one short
 * transaction guarded by a Postgres transaction-scoped advisory lock
 * (pg_try_advisory_xact_lock). Two callers racing to start a job at the same
 * instant can never both pass: the lock is non-blocking (returns false
 * immediately rather than queueing if another transaction holds it), so at
 * most one caller ever sees `locked = true` and reaches the RUNNING-row
 * check/insert.
 *
 * The lock itself only needs to be held for this brief check-then-insert —
 * it's released automatically the moment the transaction commits, which
 * also sidesteps the usual advisory-lock-vs-connection-pooling pitfall
 * (lock and unlock ending up on different pooled connections): everything
 * here runs on the single connection Prisma pins for the transaction, and
 * there is no separate unlock call to get wrong. From then on, "is there a
 * RUNNING batch row" is itself a race-free signal, because only one process
 * could ever have won the race to create one.
 */
async function claimArchiveRun(cutoffDate: Date): Promise<ArchiveBatch | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${ARCHIVE_JOB_LOCK_KEY}) AS locked
    `;
    if (!rows[0]?.locked) return null;

    const alreadyRunning = await tx.archiveBatch.findFirst({ where: { status: "RUNNING" } });
    if (alreadyRunning) return null;

    return tx.archiveBatch.create({ data: { cutoffDate, status: "RUNNING" } });
  });
}

function summarizeFailures(failures: string[]): string {
  const shown = failures.slice(0, 5).join("; ");
  return failures.length > 5 ? `${failures.length} tickets failed. First 5: ${shown}` : `${failures.length} ticket(s) failed: ${shown}`;
}

/**
 * Archives every ticket created before the retention cutoff, in bounded
 * pages of `batchSize` rather than loading the whole backlog into memory or
 * one giant transaction — safe even if the active window has accumulated a
 * very large number of overdue tickets.
 *
 * Idempotent: an already-archived ticket no longer exists in the live
 * Ticket table, so re-running finds nothing left to do for it and creates
 * no duplicate archive rows. Safe to retry after a failure for the same
 * reason — whatever didn't get archived is simply still there next time.
 *
 * Each ticket is archived in its own transaction (see archiveOneTicket). If
 * one ticket fails, it's recorded and excluded from the rest of *this* run
 * (so it can't repeatedly reappear at the front of the queue and stall
 * every other candidate behind it) while every other ticket keeps being
 * processed — a single bad ticket degrades the run to FAILED, but doesn't
 * stop it. The exclusion is only in-memory for this run: a later retry
 * attempts the failed ticket again from scratch.
 *
 * Refuses to start a second, overlapping run (see claimArchiveRun) —
 * concurrent invocations return `{ status: "SKIPPED_ALREADY_RUNNING" }"`
 * instead of racing another run's transactions.
 */
export async function runArchiveJob(now: Date = new Date(), batchSize = DEFAULT_BATCH_SIZE): Promise<RunArchiveJobResult> {
  const cutoffDate = resolveArchiveCutoff(now);

  const batch = await claimArchiveRun(cutoffDate);
  if (!batch) {
    return { status: "SKIPPED_ALREADY_RUNNING" };
  }

  let totalFound = 0;
  let totalProcessed = 0;
  const failedIds = new Set<string>();
  const failureMessages: string[] = [];

  try {
    for (;;) {
      const candidates = await findArchivableTicketIds(cutoffDate, batchSize, [...failedIds]);
      if (candidates.length === 0) break;
      totalFound += candidates.length;

      let progressedThisPage = false;
      for (const { id } of candidates) {
        try {
          await archiveOneTicket(id, batch.id);
          totalProcessed++;
          progressedThisPage = true;
        } catch (error) {
          failedIds.add(id);
          failureMessages.push(error instanceof Error ? error.message : String(error));
        }
      }

      // Every candidate in this page failed, so the next page would be
      // identical (all failing ids are now excluded) — stop instead of
      // spinning forever.
      if (!progressedThisPage) break;
    }

    const status = failureMessages.length > 0 ? "FAILED" : "SUCCEEDED";
    const result = await updateArchiveBatch(batch.id, {
      status,
      ticketsFound: totalFound,
      ticketsProcessed: totalProcessed,
      completedAt: new Date(),
      errorMessage: failureMessages.length > 0 ? summarizeFailures(failureMessages) : null,
    });

    await recordAuditLog({
      actorId: null,
      action: status === "SUCCEEDED" ? "archive.batch_completed" : "archive.batch_failed",
      entityType: "ArchiveBatch",
      entityId: batch.id,
      metadata: { ticketsFound: totalFound, ticketsProcessed: totalProcessed, cutoffDate: cutoffDate.toISOString() },
    });

    return result;
  } catch (error) {
    const result = await updateArchiveBatch(batch.id, {
      status: "FAILED",
      ticketsFound: totalFound,
      ticketsProcessed: totalProcessed,
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    await recordAuditLog({
      actorId: null,
      action: "archive.batch_failed",
      entityType: "ArchiveBatch",
      entityId: batch.id,
      metadata: { ticketsFound: totalFound, ticketsProcessed: totalProcessed },
    });

    return result;
  }
}
