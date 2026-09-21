import { CalendarDays, CalendarRange, User, UserCog, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/server/authorization";

const REPORTS: { title: string; description: string; href: string; icon: LucideIcon }[] = [
  {
    title: "Daily report",
    description: "Tickets created, completed, pending, and in progress, plus money received, for one date.",
    href: "/reports/daily",
    icon: CalendarDays,
  },
  {
    title: "Monthly report",
    description: "Total, completed, pending, in progress, and cancelled tickets, plus payment totals, for a period.",
    href: "/reports/monthly",
    icon: CalendarRange,
  },
  {
    title: "Team member report",
    description: "Assigned, completed, pending, and in-progress tickets, plus payments recorded, per team member.",
    href: "/reports/team-members",
    icon: UserCog,
  },
  {
    title: "Customer report",
    description: "Total support tickets, total payments received, and first/latest support dates for one customer.",
    href: "/reports/customer",
    icon: User,
  },
];

export default async function ReportsPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Admin-only. Operational and financial reporting, with CSV export." />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardContent className="flex gap-3">
                <report.icon aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
                <div className="space-y-1">
                  <h2 className="font-semibold">{report.title}</h2>
                  <p className="text-muted-foreground text-sm">{report.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
