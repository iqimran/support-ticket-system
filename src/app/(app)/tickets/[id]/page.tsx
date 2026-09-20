import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { PaymentPanel } from "@/features/payments/components/payment-panel";
import { getTicketPaymentTotal } from "@/features/payments/queries";
import { TicketAssignmentPanel } from "@/features/tickets/components/ticket-assignment-panel";
import { TicketNoteForm } from "@/features/tickets/components/ticket-note-form";
import { TicketStatusControl } from "@/features/tickets/components/ticket-status-control";
import { TicketTimeline } from "@/features/tickets/components/ticket-timeline";
import { PRIORITY_TONES } from "@/features/tickets/priority-tone";
import { getTicketDetail } from "@/features/tickets/queries";
import type { TicketDetail } from "@/features/tickets/repository";
import { formatDateTime } from "@/lib/format-date";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { requireTeamMember } from "@/server/authorization";

type TicketDetailPageProps = { params: Promise<{ id: string }> };

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  await requireTeamMember();

  const { id } = await params;
  const detail = await getTicketDetail(id);
  if (!detail) notFound();

  const { ticket, timeline } = detail;
  const totalReceived = await getTicketPaymentTotal(ticket.id);

  const noteColumns: DataTableColumn<TicketDetail["notes"][number]>[] = [
    { key: "note", header: "Note" },
    { key: "creator", header: "Author", render: (row) => row.creator.name },
    { key: "createdAt", header: "When", render: (row) => formatDateTime(row.createdAt) },
  ];

  const historyColumns: DataTableColumn<TicketDetail["statusHistory"][number]>[] = [
    { key: "oldStatus", header: "From", render: (row) => <StatusBadge status={row.oldStatus} /> },
    { key: "newStatus", header: "To", render: (row) => <StatusBadge status={row.newStatus} /> },
    { key: "changedByUser", header: "Changed by", render: (row) => row.changedByUser.name },
    { key: "note", header: "Reason / note", render: (row) => row.note ?? <span className="text-muted-foreground">—</span> },
    { key: "createdAt", header: "When", render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.ticketNumber}
        description={ticket.problem}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={ticket.status} />
            <StatusBadge status={ticket.priority} tone={PRIORITY_TONES[ticket.priority]} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Created by: </span>
              {ticket.creator.name}
            </div>
            <div>
              <span className="text-muted-foreground">Created: </span>
              {formatDateTime(ticket.createdAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Last updated: </span>
              {formatDateTime(ticket.updatedAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Completed: </span>
              {ticket.completedAt ? formatDateTime(ticket.completedAt) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">
              <Link href={`/customers/${ticket.customer.id}`} className="hover:underline">
                {ticket.customer.name ?? formatBangladeshiPhoneForDisplay(ticket.customer.phone)}
              </Link>
            </p>
            <p className="text-muted-foreground">{formatBangladeshiPhoneForDisplay(ticket.customer.phone)}</p>
            {ticket.customer.address ? <p className="text-muted-foreground">{ticket.customer.address}</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-semibold">Status</h2>
            <TicketStatusControl ticketId={ticket.id} currentStatus={ticket.status} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-semibold">Assigned members</h2>
            <TicketAssignmentPanel
              ticketId={ticket.id}
              assignments={ticket.assignments.map((assignment) => ({
                id: assignment.id,
                teamMember: assignment.teamMember,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="history">Status history</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="pt-4">
          <TicketTimeline entries={timeline} />
        </TabsContent>

        <TabsContent value="notes" className="space-y-4 pt-4">
          <TicketNoteForm ticketId={ticket.id} />
          <DataTable
            columns={noteColumns}
            data={ticket.notes}
            getRowId={(row) => row.id}
            emptyState={<EmptyState title="No notes yet" />}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <DataTable
            columns={historyColumns}
            data={ticket.statusHistory}
            getRowId={(row) => row.id}
            emptyState={<EmptyState title="No status changes yet" />}
          />
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          <PaymentPanel
            ticketId={ticket.id}
            ticketStatus={ticket.status}
            payments={ticket.payments}
            totalReceived={totalReceived}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
