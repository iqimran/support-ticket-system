-- CreateEnum
CREATE TYPE "ArchiveBatchStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ArchiveBatch" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "status" "ArchiveBatchStatus" NOT NULL DEFAULT 'RUNNING',
    "ticketsFound" INTEGER NOT NULL DEFAULT 0,
    "ticketsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ArchiveBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets_archive" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archiveBatchId" TEXT NOT NULL,

    CONSTRAINT "tickets_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assignments_archive" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_assignments_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_status_history_archive" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "oldStatus" "TicketStatus" NOT NULL,
    "newStatus" "TicketStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_status_history_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_notes_archive" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_notes_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments_archive" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "receivedBy" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_audit_log_archive" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" "PaymentAuditAction" NOT NULL,
    "oldAmount" DECIMAL(12,2),
    "newAmount" DECIMAL(12,2),
    "oldPaymentMethod" "PaymentMethod",
    "newPaymentMethod" "PaymentMethod",
    "oldNote" TEXT,
    "newNote" TEXT,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_audit_log_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArchiveBatch_startedAt_idx" ON "ArchiveBatch"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_archive_ticketNumber_key" ON "tickets_archive"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_archive_customerId_idx" ON "tickets_archive"("customerId");

-- CreateIndex
CREATE INDEX "tickets_archive_createdAt_idx" ON "tickets_archive"("createdAt");

-- CreateIndex
CREATE INDEX "tickets_archive_archivedAt_idx" ON "tickets_archive"("archivedAt");

-- CreateIndex
CREATE INDEX "ticket_assignments_archive_ticketId_idx" ON "ticket_assignments_archive"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_assignments_archive_teamMemberId_idx" ON "ticket_assignments_archive"("teamMemberId");

-- CreateIndex
CREATE INDEX "ticket_status_history_archive_ticketId_createdAt_idx" ON "ticket_status_history_archive"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_notes_archive_ticketId_createdAt_idx" ON "ticket_notes_archive"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_archive_ticketId_idx" ON "payments_archive"("ticketId");

-- CreateIndex
CREATE INDEX "payments_archive_receivedAt_idx" ON "payments_archive"("receivedAt");

-- CreateIndex
CREATE INDEX "payment_audit_log_archive_paymentId_idx" ON "payment_audit_log_archive"("paymentId");

-- CreateIndex
CREATE INDEX "payment_audit_log_archive_ticketId_idx" ON "payment_audit_log_archive"("ticketId");

-- AddForeignKey
ALTER TABLE "tickets_archive" ADD CONSTRAINT "tickets_archive_archiveBatchId_fkey" FOREIGN KEY ("archiveBatchId") REFERENCES "ArchiveBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments_archive" ADD CONSTRAINT "ticket_assignments_archive_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_history_archive" ADD CONSTRAINT "ticket_status_history_archive_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes_archive" ADD CONSTRAINT "ticket_notes_archive_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_archive" ADD CONSTRAINT "payments_archive_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_audit_log_archive" ADD CONSTRAINT "payment_audit_log_archive_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_audit_log_archive" ADD CONSTRAINT "payment_audit_log_archive_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets_archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
