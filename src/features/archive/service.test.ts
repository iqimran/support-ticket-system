// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ArchiveBatch } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { resolveArchiveCutoff } from "./cutoff";
import { archiveOneTicket, runArchiveJob, type RunArchiveJobResult } from "./service";

/** Every test here expects a real run, never a lock-skip — narrows the union so callers can access ArchiveBatch fields directly. */
function assertRan(result: RunArchiveJobResult): asserts result is ArchiveBatch {
  if (result.status === "SKIPPED_ALREADY_RUNNING") {
    throw new Error("expected runArchiveJob to actually run, but it was skipped as already running");
  }
}

const CREATOR_PHONE = "01900000201";
const MEMBER_PHONE = "01900000202";
const CUSTOMER_PHONE = "+8801911190050";

// Fixed "now" for the whole file so every test's notion of "old" vs
// "recent" is reproducible regardless of when the suite actually runs.
const NOW = new Date("2026-09-21T10:00:00.000Z");
const CUTOFF = resolveArchiveCutoff(NOW);
const OLD_DATE = new Date(CUTOFF.getTime() - 24 * 60 * 60 * 1000); // 1 day before the cutoff
const RECENT_DATE = new Date(CUTOFF.getTime() + 24 * 60 * 60 * 1000); // 1 day after the cutoff

let creatorId: string;
let memberTeamId: string;
let customerId: string;
const cleanupTicketIds: string[] = [];
const cleanupBatchIds: string[] = [];

async function createTicket(opts: {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  problem?: string;
}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerId,
      problem: opts.problem ?? "Fixture ticket",
      createdBy: creatorId,
      status: opts.status,
      createdAt: opts.createdAt,
      completedAt: opts.status === "COMPLETED" ? opts.createdAt : null,
    },
  });
  cleanupTicketIds.push(ticket.id);
  return ticket;
}

/** Attaches one of every related record type, so archiving it exercises every _archive table. */
async function attachFullHistory(ticket: { id: string; createdAt: Date }) {
  await prisma.ticketAssignment.create({
    data: { ticketId: ticket.id, teamMemberId: memberTeamId, assignedBy: creatorId },
  });
  await prisma.ticketStatusHistory.create({
    data: { ticketId: ticket.id, oldStatus: "PENDING", newStatus: "IN_PROGRESS", changedBy: creatorId, note: "Started" },
  });
  await prisma.ticketNote.create({
    data: { ticketId: ticket.id, createdBy: creatorId, note: "Fixture note" },
  });
  const payment = await prisma.payment.create({
    data: {
      ticketId: ticket.id,
      amount: "500.00",
      paymentMethod: "CASH",
      receivedBy: creatorId,
      receivedAt: ticket.createdAt,
    },
  });
  await prisma.paymentAuditLog.create({
    data: { paymentId: payment.id, ticketId: ticket.id, action: "CREATED", newAmount: "500.00", changedBy: creatorId },
  });
}

/** Full teardown across both live and archive tables, keyed by ticket id — used after every archive-affecting test. */
async function cleanupTicketTree(ticketIds: string[]) {
  if (ticketIds.length === 0) return;
  await prisma.paymentAuditLogArchive.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.paymentArchive.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketNoteArchive.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketStatusHistoryArchive.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketAssignmentArchive.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketArchive.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.paymentAuditLog.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.payment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketAssignment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");

  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Archive Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "ADMIN" },
  });
  creatorId = creator.id;

  const memberUser = await prisma.user.upsert({
    where: { phone: MEMBER_PHONE },
    update: {},
    create: { name: "Archive Fixture Member", phone: MEMBER_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  const member = await prisma.teamMember.upsert({
    where: { userId: memberUser.id },
    update: {},
    create: { userId: memberUser.id, name: "Archive Fixture Member", phone: MEMBER_PHONE },
  });
  memberTeamId = member.id;

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Archive Fixture Customer" } });
  customerId = customer.id;
});

// runArchiveJob scans ALL old tickets globally (correct production
// behavior — there's no per-customer scoping), so any fixture ticket left
// live after one test would get swept up by a *later* test's runArchiveJob
// call. Cleaning up after every test (not just once at the end) keeps each
// test's "which old tickets exist right now" world isolated.
afterEach(async () => {
  await cleanupTicketTree(cleanupTicketIds);
  if (cleanupBatchIds.length > 0) {
    // runArchiveJob writes a general AuditLog entry per run (entityType
    // "ArchiveBatch") in addition to the ArchiveBatch row itself.
    await prisma.auditLog.deleteMany({ where: { entityType: "ArchiveBatch", entityId: { in: cleanupBatchIds } } });
    await prisma.archiveBatch.deleteMany({ where: { id: { in: cleanupBatchIds } } });
  }
  cleanupTicketIds.length = 0;
  cleanupBatchIds.length = 0;
});

afterAll(async () => {
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.teamMember.deleteMany({ where: { id: memberTeamId } });
  await prisma.user.deleteMany({ where: { phone: { in: [CREATOR_PHONE, MEMBER_PHONE] } } });
});

describe("archiveOneTicket", () => {
  it("moves a ticket and every related record type into the archive tables with the same ids, and removes the live originals", async () => {
    const ticket = await createTicket({ status: "COMPLETED", createdAt: OLD_DATE });
    await attachFullHistory(ticket);
    const assignment = await prisma.ticketAssignment.findFirstOrThrow({ where: { ticketId: ticket.id } });
    const statusHistory = await prisma.ticketStatusHistory.findFirstOrThrow({ where: { ticketId: ticket.id } });
    const note = await prisma.ticketNote.findFirstOrThrow({ where: { ticketId: ticket.id } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { ticketId: ticket.id } });
    const auditLog = await prisma.paymentAuditLog.findFirstOrThrow({ where: { ticketId: ticket.id } });

    const batch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF } });
    cleanupBatchIds.push(batch.id);

    await archiveOneTicket(ticket.id, batch.id);

    // Live originals are gone.
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    expect(await prisma.ticketAssignment.findUnique({ where: { id: assignment.id } })).toBeNull();
    expect(await prisma.ticketStatusHistory.findUnique({ where: { id: statusHistory.id } })).toBeNull();
    expect(await prisma.ticketNote.findUnique({ where: { id: note.id } })).toBeNull();
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toBeNull();
    expect(await prisma.paymentAuditLog.findUnique({ where: { id: auditLog.id } })).toBeNull();

    // Archive copies exist with the SAME ids (preserved originalTicketId relationship).
    const archivedTicket = await prisma.ticketArchive.findUnique({ where: { id: ticket.id } });
    expect(archivedTicket).not.toBeNull();
    expect(archivedTicket?.ticketNumber).toBe(ticket.ticketNumber);
    expect(archivedTicket?.status).toBe("COMPLETED");
    expect(archivedTicket?.archiveBatchId).toBe(batch.id);

    expect(await prisma.ticketAssignmentArchive.findUnique({ where: { id: assignment.id } })).toMatchObject({
      ticketId: ticket.id,
      teamMemberId: memberTeamId,
      assignedBy: creatorId,
    });
    expect(await prisma.ticketStatusHistoryArchive.findUnique({ where: { id: statusHistory.id } })).toMatchObject({
      ticketId: ticket.id,
      oldStatus: "PENDING",
      newStatus: "IN_PROGRESS",
    });
    expect(await prisma.ticketNoteArchive.findUnique({ where: { id: note.id } })).toMatchObject({
      ticketId: ticket.id,
      note: "Fixture note",
    });
    const archivedPayment = await prisma.paymentArchive.findUnique({ where: { id: payment.id } });
    expect(archivedPayment?.ticketId).toBe(ticket.id);
    expect(archivedPayment?.amount.toString()).toBe("500");
    expect(await prisma.paymentAuditLogArchive.findUnique({ where: { id: auditLog.id } })).toMatchObject({
      ticketId: ticket.id,
      paymentId: payment.id,
      action: "CREATED",
    });
  });

  it("archives a ticket with no related records at all (assignments/notes/payments are all optional)", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });
    const batch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF } });
    cleanupBatchIds.push(batch.id);

    await archiveOneTicket(ticket.id, batch.id);

    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it.each(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)(
    "archives a %s ticket (the business rule is: archive ALL statuses once old enough)",
    async (status) => {
      const ticket = await createTicket({ status, createdAt: OLD_DATE });
      const batch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF } });
      cleanupBatchIds.push(batch.id);

      await archiveOneTicket(ticket.id, batch.id);

      const archived = await prisma.ticketArchive.findUnique({ where: { id: ticket.id } });
      expect(archived?.status).toBe(status);
      expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    },
  );

  it("rolls back completely — including the ticket-level copy that already succeeded — when a related record's archive copy collides", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });
    await attachFullHistory(ticket);
    const assignment = await prisma.ticketAssignment.findFirstOrThrow({ where: { ticketId: ticket.id } });

    // An unrelated, already-archived ticket used only to park a conflicting
    // assignment-archive row under (its own ticketId parent doesn't matter —
    // what matters is that its `id` collides with the real assignment's id,
    // which is what forces createMany to fail on the *second* archive
    // table write, after the ticket-level copy already committed within
    // this same transaction).
    const placeholderBatch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF, status: "SUCCEEDED" } });
    cleanupBatchIds.push(placeholderBatch.id);
    const placeholderTicket = await createTicket({ status: "PENDING", createdAt: OLD_DATE, problem: "placeholder" });
    await prisma.ticketArchive.create({
      data: {
        id: placeholderTicket.id,
        ticketNumber: placeholderTicket.ticketNumber,
        customerId,
        problem: "placeholder",
        status: "PENDING",
        priority: "MEDIUM",
        createdBy: creatorId,
        createdAt: OLD_DATE,
        updatedAt: OLD_DATE,
        archiveBatchId: placeholderBatch.id,
      },
    });
    await prisma.ticketAssignmentArchive.create({
      data: {
        id: assignment.id,
        ticketId: placeholderTicket.id,
        teamMemberId: memberTeamId,
        assignedBy: creatorId,
        assignedAt: OLD_DATE,
      },
    });

    const batch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF } });
    cleanupBatchIds.push(batch.id);

    await expect(archiveOneTicket(ticket.id, batch.id)).rejects.toThrow();

    // Nothing was deleted: the live ticket and its full history survive untouched.
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
    expect(await prisma.ticketAssignment.findUnique({ where: { id: assignment.id } })).not.toBeNull();
    // And the ticket-level archive row that succeeded earlier in this same
    // transaction was rolled back too — not left behind as an orphan.
    expect(await prisma.ticketArchive.findUnique({ where: { id: ticket.id } })).toBeNull();
  });
});

async function seedConflictingArchiveRow(ticket: { id: string; customerId: string }): Promise<string> {
  const priorBatch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF, status: "SUCCEEDED" } });
  cleanupBatchIds.push(priorBatch.id);
  await prisma.ticketArchive.create({
    data: {
      id: ticket.id,
      ticketNumber: `TKT-CONFLICT-${Math.random().toString(36).slice(2, 8)}`,
      customerId: ticket.customerId,
      problem: "Pre-existing conflicting archive row",
      status: "PENDING",
      priority: "MEDIUM",
      createdBy: creatorId,
      createdAt: OLD_DATE,
      updatedAt: OLD_DATE,
      archiveBatchId: priorBatch.id,
    },
  });
  return priorBatch.id;
}

describe("runArchiveJob", () => {
  it("successfully archives only tickets older than the cutoff, leaving recent tickets untouched", async () => {
    const oldTicket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });
    const recentTicket = await createTicket({ status: "PENDING", createdAt: RECENT_DATE });

    const result = await runArchiveJob(NOW);
    assertRan(result);
    cleanupBatchIds.push(result.id);

    expect(result.status).toBe("SUCCEEDED");
    expect(await prisma.ticket.findUnique({ where: { id: oldTicket.id } })).toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: oldTicket.id } })).not.toBeNull();
    expect(await prisma.ticket.findUnique({ where: { id: recentTicket.id } })).not.toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: recentTicket.id } })).toBeNull();
  });

  it("records a batch audit row with startedAt, completedAt, cutoffDate, and the number of tickets processed", async () => {
    const ticketOne = await createTicket({ status: "PENDING", createdAt: OLD_DATE });
    const ticketTwo = await createTicket({ status: "COMPLETED", createdAt: OLD_DATE });

    const result = await runArchiveJob(NOW);
    assertRan(result);
    cleanupBatchIds.push(result.id);

    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.cutoffDate.getTime()).toBe(CUTOFF.getTime());
    expect(result.status).toBe("SUCCEEDED");
    expect(result.ticketsFound).toBeGreaterThanOrEqual(2);
    expect(result.ticketsProcessed).toBe(result.ticketsFound);

    // Sanity: both fixture tickets from this test were actually among those archived.
    expect(await prisma.ticketArchive.findUnique({ where: { id: ticketOne.id } })).not.toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: ticketTwo.id } })).not.toBeNull();
  });

  it("records a general AuditLog entry for the run, since AuditLog documents archive runs alongside every other system action", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });

    const result = await runArchiveJob(NOW);
    assertRan(result);
    cleanupBatchIds.push(result.id);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "ArchiveBatch", entityId: result.id, action: "archive.batch_completed" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorId).toBeNull(); // system-initiated, not a user action
    expect(entry?.metadata).toMatchObject({ ticketsProcessed: 1 });
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
  });

  it("is idempotent: running it twice does not create duplicate archive records", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });

    const firstRun = await runArchiveJob(NOW);
    assertRan(firstRun);
    cleanupBatchIds.push(firstRun.id);
    expect(await prisma.ticketArchive.count({ where: { id: ticket.id } })).toBe(1);

    const secondRun = await runArchiveJob(NOW);
    assertRan(secondRun);
    cleanupBatchIds.push(secondRun.id);

    // Nothing left to archive on the second pass — the ticket is already gone from the live table.
    expect(secondRun.status).toBe("SUCCEEDED");
    expect(secondRun.ticketsProcessed).toBe(0);
    // Still exactly one archive row for this ticket — no duplicate.
    expect(await prisma.ticketArchive.count({ where: { id: ticket.id } })).toBe(1);
  });

  it("continues past a failed ticket instead of stopping the run, and keeps prior/later successes", async () => {
    const earlierOldDate = new Date(OLD_DATE.getTime() - 2 * 24 * 60 * 60 * 1000);
    const laterOldDate = new Date(OLD_DATE.getTime() - 24 * 60 * 60 * 1000);
    const goodTicketBefore = await createTicket({ status: "PENDING", createdAt: earlierOldDate });
    const conflictingTicket = await createTicket({ status: "PENDING", createdAt: laterOldDate });
    const goodTicketAfter = await createTicket({ status: "PENDING", createdAt: OLD_DATE });

    await seedConflictingArchiveRow(conflictingTicket);

    const result = await runArchiveJob(NOW);
    assertRan(result);
    cleanupBatchIds.push(result.id);

    expect(result.status).toBe("FAILED");
    expect(result.ticketsProcessed).toBe(2);
    expect(result.errorMessage).toContain(conflictingTicket.id);
    expect(result.completedAt).toBeInstanceOf(Date);

    // Both the ticket before AND the ticket after the failure are archived —
    // the one bad ticket in the middle didn't block its neighbors.
    expect(await prisma.ticket.findUnique({ where: { id: goodTicketBefore.id } })).toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: goodTicketBefore.id } })).not.toBeNull();
    expect(await prisma.ticket.findUnique({ where: { id: goodTicketAfter.id } })).toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: goodTicketAfter.id } })).not.toBeNull();
    // ...while conflictingTicket's own transaction rolled back and it's still live, untouched.
    expect(await prisma.ticket.findUnique({ where: { id: conflictingTicket.id } })).not.toBeNull();
  });

  it("is safe to retry: a ticket that failed can be archived successfully once the underlying problem is gone", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });
    const conflictBatchId = await seedConflictingArchiveRow(ticket);

    const firstAttempt = await runArchiveJob(NOW);
    assertRan(firstAttempt);
    cleanupBatchIds.push(firstAttempt.id);
    expect(firstAttempt.status).toBe("FAILED");
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();

    // The problem is resolved (e.g. an operator cleans up the stale
    // conflicting row) — retry from scratch.
    await prisma.ticketArchive.delete({ where: { id: ticket.id } });
    await prisma.archiveBatch.delete({ where: { id: conflictBatchId } });
    cleanupBatchIds.splice(cleanupBatchIds.indexOf(conflictBatchId), 1);

    const retry = await runArchiveJob(NOW);
    assertRan(retry);
    cleanupBatchIds.push(retry.id);

    expect(retry.status).toBe("SUCCEEDED");
    expect(retry.ticketsProcessed).toBe(1);
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    expect(await prisma.ticketArchive.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it("processes an active dataset larger than one page across multiple internal batches", async () => {
    const tickets = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createTicket({ status: "PENDING", createdAt: new Date(OLD_DATE.getTime() - i * 60_000) }),
      ),
    );

    const result = await runArchiveJob(NOW, 2); // batchSize=2, so this needs 3 internal pages for 5 tickets
    assertRan(result);
    cleanupBatchIds.push(result.id);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.ticketsFound).toBe(5);
    expect(result.ticketsProcessed).toBe(5);
    for (const ticket of tickets) {
      expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
      expect(await prisma.ticketArchive.findUnique({ where: { id: ticket.id } })).not.toBeNull();
    }
  });

  it("refuses to start a second run while one is already RUNNING (duplicate-execution protection)", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });
    const inProgressBatch = await prisma.archiveBatch.create({ data: { cutoffDate: CUTOFF, status: "RUNNING" } });
    cleanupBatchIds.push(inProgressBatch.id);

    const result = await runArchiveJob(NOW);

    expect(result.status).toBe("SKIPPED_ALREADY_RUNNING");
    // Nothing was touched — the ticket is untouched and no second batch row was created.
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
    expect(await prisma.archiveBatch.count({ where: { cutoffDate: CUTOFF } })).toBe(1);
  });

  it("under genuine concurrent invocation, archives each ticket exactly once with no duplicates", async () => {
    const ticket = await createTicket({ status: "PENDING", createdAt: OLD_DATE });

    const [first, second] = await Promise.all([runArchiveJob(NOW), runArchiveJob(NOW)]);
    for (const result of [first, second]) {
      if (result.status !== "SKIPPED_ALREADY_RUNNING") cleanupBatchIds.push(result.id);
    }

    const skippedCount = [first, second].filter((r) => r.status === "SKIPPED_ALREADY_RUNNING").length;
    // Either the second call was blocked by the lock, or (if the two calls
    // didn't truly overlap at the DB) both ran in sequence — both are safe
    // outcomes. What must always hold is: no duplicate archiving.
    expect(skippedCount).toBeLessThanOrEqual(1);
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    expect(await prisma.ticketArchive.count({ where: { id: ticket.id } })).toBe(1);
  });
});
