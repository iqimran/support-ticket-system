import { Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ResetPasswordButton } from "@/features/team-members/components/reset-password-button";
import { TeamMemberFormDialog } from "@/features/team-members/components/team-member-form-dialog";
import { TeamMemberStatusToggles } from "@/features/team-members/components/team-member-status-toggles";
import { getTeamMemberDetail } from "@/features/team-members/queries";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { formatDate } from "@/lib/format-date";
import { requireAdmin } from "@/server/authorization";

type TeamMemberDetailPageProps = { params: Promise<{ id: string }> };

export default async function TeamMemberDetailPage({ params }: TeamMemberDetailPageProps) {
  await requireAdmin();

  const { id } = await params;
  const detail = await getTeamMemberDetail(id);
  if (!detail) {
    notFound();
  }

  const { teamMember, stats } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={teamMember.name}
        description={formatBangladeshiPhoneForDisplay(teamMember.phone)}
        actions={
          <>
            <ResetPasswordButton teamMemberId={teamMember.id} teamMemberName={teamMember.name} />
            <TeamMemberFormDialog
              mode="edit"
              teamMember={teamMember}
              trigger={
                <Button type="button" variant="outline">
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active assignments" value={stats.activeAssignments} />
        <StatCard label="Pending tickets" value={stats.pendingTickets} />
        <StatCard label="In progress tickets" value={stats.inProgressTickets} />
        <StatCard label="Completed tickets" value={stats.completedTickets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active status</span>
              <Badge variant={teamMember.isActive ? "default" : "outline"}>
                {teamMember.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Login status</span>
              <Badge variant={teamMember.loginActive ? "default" : "outline"}>
                {teamMember.loginActive ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Member since</span>
              <span>{formatDate(teamMember.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <TeamMemberStatusToggles
              teamMemberId={teamMember.id}
              isActive={teamMember.isActive}
              loginActive={teamMember.loginActive}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
