import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import { PaymentFormDialog } from "@/features/payments/components/payment-form-dialog";
import type { TicketDetail } from "@/features/tickets/repository";
import type { TicketStatus } from "@/generated/prisma/enums";

type PaymentRow = TicketDetail["payments"][number];

type PaymentPanelProps = {
  ticketId: string;
  ticketStatus: TicketStatus;
  payments: PaymentRow[];
  totalReceived: string;
};

export function PaymentPanel({ ticketId, ticketStatus, payments, totalReceived }: PaymentPanelProps) {
  const columns: DataTableColumn<PaymentRow>[] = [
    { key: "amount", header: "Amount", render: (row) => <MoneyDisplay amount={row.amount.toString()} /> },
    { key: "paymentMethod", header: "Method", render: (row) => row.paymentMethod.replace("_", " ") },
    { key: "note", header: "Note", render: (row) => row.note ?? <span className="text-muted-foreground">—</span> },
    { key: "receiver", header: "Received by", render: (row) => row.receiver.name },
    { key: "receivedAt", header: "Received", render: (row) => new Date(row.receivedAt).toLocaleDateString() },
    {
      key: "id",
      header: "",
      render: (row) => (
        <PaymentFormDialog
          mode="edit"
          payment={{
            id: row.id,
            amount: row.amount.toString(),
            paymentMethod: row.paymentMethod,
            note: row.note,
            receivedAt: row.receivedAt,
          }}
          trigger={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit payment">
              <Pencil aria-hidden="true" />
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="text-muted-foreground">Total received: </span>
          <span className="font-semibold">
            <MoneyDisplay amount={totalReceived} />
          </span>
        </p>
        {ticketStatus === "COMPLETED" ? (
          <PaymentFormDialog
            mode="record"
            ticketId={ticketId}
            trigger={
              <Button type="button" size="sm">
                <Plus aria-hidden="true" />
                Record payment
              </Button>
            }
          />
        ) : (
          <p className="text-muted-foreground text-xs">Payments can be recorded once the ticket is completed.</p>
        )}
      </div>

      <DataTable
        columns={columns}
        data={payments}
        getRowId={(row) => row.id}
        emptyState={<EmptyState title="No payments recorded yet" />}
      />
    </div>
  );
}
