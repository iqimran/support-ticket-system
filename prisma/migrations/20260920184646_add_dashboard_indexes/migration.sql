-- CreateIndex
CREATE INDEX "Payment_receivedBy_receivedAt_idx" ON "Payment"("receivedBy", "receivedAt");

-- CreateIndex
CREATE INDEX "Ticket_status_completedAt_idx" ON "Ticket"("status", "completedAt");

-- CreateIndex
CREATE INDEX "TicketAssignment_teamMemberId_assignedAt_idx" ON "TicketAssignment"("teamMemberId", "assignedAt");
