import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyDisplay } from "@/components/shared/money-display";
import type { getRecentActivity } from "@/features/dashboard/repository";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";

type RecentActivityData = Awaited<ReturnType<typeof getRecentActivity>>;

function ActivityCard({ title, viewAllHref, children }: { title: string; viewAllHref: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <Link href={viewAllHref} className="text-muted-foreground text-xs hover:underline">
            View all
          </Link>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function RecentActivity({ recentTickets, recentCompletedTickets, recentPayments }: RecentActivityData) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ActivityCard title="Recent tickets" viewAllHref="/tickets">
        {recentTickets.length === 0 ? (
          <EmptyState title="No tickets yet" />
        ) : (
          <ul className="space-y-2 text-sm">
            {recentTickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`} className="font-medium hover:underline">
                  {ticket.ticketNumber}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {ticket.customer.name ?? formatBangladeshiPhoneForDisplay(ticket.customer.phone)} — {ticket.problem}
                </p>
              </li>
            ))}
          </ul>
        )}
      </ActivityCard>

      <ActivityCard title="Recently completed" viewAllHref="/tickets?status=COMPLETED">
        {recentCompletedTickets.length === 0 ? (
          <EmptyState title="No completed tickets yet" />
        ) : (
          <ul className="space-y-2 text-sm">
            {recentCompletedTickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`} className="font-medium hover:underline">
                  {ticket.ticketNumber}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {ticket.customer.name ?? formatBangladeshiPhoneForDisplay(ticket.customer.phone)}
                  {ticket.completedAt ? ` — ${new Date(ticket.completedAt).toLocaleDateString()}` : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </ActivityCard>

      <ActivityCard title="Recent payments" viewAllHref="/admin/payment-audit">
        {recentPayments.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <ul className="space-y-2 text-sm">
            {recentPayments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between">
                <div>
                  <Link href={`/tickets/${payment.ticket.id}`} className="font-medium hover:underline">
                    {payment.ticket.ticketNumber}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {payment.receiver.name} — {new Date(payment.receivedAt).toLocaleDateString()}
                  </p>
                </div>
                <MoneyDisplay amount={payment.amount.toString()} className="font-medium" />
              </li>
            ))}
          </ul>
        )}
      </ActivityCard>
    </div>
  );
}
