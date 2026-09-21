import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getArchivedTicketDetail, type ArchivedTicketDetail } from "@/features/archive/queries";
import { TicketTimeline } from "@/features/tickets/components/ticket-timeline";
import { PRIORITY_TONES } from "@/features/tickets/priority-tone";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { canViewPaymentAudit, requireTeamMember } from "@/server/authorization";

type ArchivedTicketPageProps = { params: Promise<{ id: string }> };

function FieldChange({ oldValue, newValue }: { oldValue: ReactNode; newValue: ReactNode }) {
  if (oldValue && newValue) {
    return (
      <span>
        {oldValue} → {newValue}
      </span>
    );
  }
  return newValue ?? oldValue ?? <span className="text-muted-foreground">—</span>;
}

export default async function ArchivedTicketPage({ params }: ArchivedTicketPageProps) {
  const user = await requireTeamMember();
  const { id } = await params;

  const includePaymentAudit = canViewPaymentAudit(user);
  const detail = await getArchivedTicketDetail(id, { includePaymentAudit });
  if (!detail) notFound();

  const { ticket, customer, creatorName, assignments, notes, payments, paymentAuditLogs, timeline } =
    detail as ArchivedTicketDetail;

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const noteColumns: DataTableColumn<(typeof notes)[number]>[] = [
    { key: "note", header: "Note" },
    { key: "creatorName", header: "Author" },
    { key: "createdAt", header: "When", render: (row) => formatDateTime(row.createdAt) },
  ];

  const historyColumns: DataTableColumn<ArchivedTicketDetail["statusHistory"][number]>[] = [
    { key: "oldStatus", header: "From", render: (row) => <StatusBadge status={row.oldStatus} /> },
    { key: "newStatus", header: "To", render: (row) => <StatusBadge status={row.newStatus} /> },
    { key: "changedByName", header: "Changed by" },
    { key: "note", header: "Reason / note", render: (row) => row.note ?? <span className="text-muted-foreground">—</span> },
    { key: "createdAt", header: "When", render: (row) => formatDateTime(row.createdAt) },
  ];

  const paymentColumns: DataTableColumn<(typeof payments)[number]>[] = [
    { key: "amount", header: "Amount", render: (row) => <MoneyDisplay amount={row.amount.toString()} /> },
    { key: "paymentMethod", header: "Method", render: (row) => row.paymentMethod.replace("_", " ") },
    { key: "note", header: "Note", render: (row) => row.note ?? <span className="text-muted-foreground">—</span> },
    { key: "receiverName", header: "Received by" },
    { key: "receivedAt", header: "Received", render: (row) => formatDate(row.receivedAt) },
  ];

  const auditColumns: DataTableColumn<NonNullable<typeof paymentAuditLogs>[number]>[] = [
    { key: "action", header: "Action" },
    {
      key: "id",
      header: "Amount",
      render: (row) => (
        <FieldChange
          oldValue={row.oldAmount ? <MoneyDisplay amount={row.oldAmount.toString()} /> : null}
          newValue={row.newAmount ? <MoneyDisplay amount={row.newAmount.toString()} /> : null}
        />
      ),
    },
    {
      key: "oldPaymentMethod",
      header: "Method",
      render: (row) => <FieldChange oldValue={row.oldPaymentMethod} newValue={row.newPaymentMethod} />,
    },
    { key: "oldNote", header: "Note", render: (row) => <FieldChange oldValue={row.oldNote} newValue={row.newNote} /> },
    { key: "changedByName", header: "Changed by" },
    { key: "createdAt", header: "When", render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/archive" className="text-muted-foreground text-sm hover:underline">
          ← Back to Archive
        </Link>
      </div>

      <PageHeader
        title={ticket.ticketNumber}
        description={ticket.problem}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">ARCHIVED</Badge>
            <StatusBadge status={ticket.status} />
            <StatusBadge status={ticket.priority} tone={PRIORITY_TONES[ticket.priority]} />
          </div>
        }
      />

      <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-500/10">
        <CardContent className="text-sm">
          This is a read-only historical record. It was moved out of active tickets on{" "}
          <strong>{formatDateTime(ticket.archivedAt)}</strong> because it was created more than 3 months ago. It cannot be
          edited, assigned, or updated from here.
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Created by: </span>
              {creatorName}
            </div>
            <div>
              <span className="text-muted-foreground">Original creation date: </span>
              {formatDateTime(ticket.createdAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Archived date: </span>
              {formatDateTime(ticket.archivedAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Completed: </span>
              {ticket.completedAt ? formatDateTime(ticket.completedAt) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{customer?.name ?? "Unnamed customer"}</p>
            {customer ? <p className="text-muted-foreground">{formatBangladeshiPhoneForDisplay(customer.phone)}</p> : null}
            {customer?.address ? <p className="text-muted-foreground">{customer.address}</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Assigned team members</h2>
          {assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No one was assigned.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {assignments.map((assignment) => (
                <Badge key={assignment.id} variant="secondary">
                  {assignment.teamMemberName}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="history">Status history</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          {includePaymentAudit ? <TabsTrigger value="payment-audit">Payment audit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="timeline" className="pt-4">
          <TicketTimeline entries={timeline} />
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <DataTable
            columns={noteColumns}
            data={notes}
            getRowId={(row) => row.id}
            emptyState={<EmptyState title="No notes were recorded" />}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <DataTable
            columns={historyColumns}
            data={detail.statusHistory}
            getRowId={(row) => row.id}
            emptyState={<EmptyState title="No status changes were recorded" />}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-3 pt-4">
          <p className="text-sm">
            <span className="text-muted-foreground">Total received: </span>
            <MoneyDisplay amount={totalReceived} className="font-medium" />
          </p>
          <DataTable
            columns={paymentColumns}
            data={payments}
            getRowId={(row) => row.id}
            emptyState={<EmptyState title="No payments were recorded" />}
          />
        </TabsContent>

        {includePaymentAudit ? (
          <TabsContent value="payment-audit" className="pt-4">
            <p className="text-muted-foreground mb-3 text-sm">Admin-only. Every payment creation and correction, in full.</p>
            <DataTable
              columns={auditColumns}
              data={paymentAuditLogs ?? []}
              getRowId={(row) => row.id}
              emptyState={<EmptyState title="No payment audit activity" />}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
