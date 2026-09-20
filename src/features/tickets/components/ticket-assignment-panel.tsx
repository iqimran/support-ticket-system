"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { assignSelfAction, assignTeamMemberAction, removeAssignmentAction, type TeamMemberPickerResult } from "@/features/tickets/actions";
import { TeamMemberCombobox } from "@/features/tickets/components/team-member-combobox";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";

type Assignment = {
  id: string;
  teamMember: { id: string; name: string; phone: string };
};

export function TicketAssignmentPanel({ ticketId, assignments }: { ticketId: string; assignments: Assignment[] }) {
  const router = useRouter();
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMemberPickerResult | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleAssignSelf() {
    setIsBusy(true);
    const result = await assignSelfAction(ticketId);
    setIsBusy(false);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success("Assigned");
    router.refresh();
  }

  async function handleAssignOther() {
    if (!selectedTeamMember) return;
    setIsBusy(true);
    const result = await assignTeamMemberAction({ ticketId, teamMemberId: selectedTeamMember.id });
    setIsBusy(false);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success("Assigned");
    setSelectedTeamMember(null);
    router.refresh();
  }

  async function handleRemove() {
    if (!pendingRemovalId) return;
    setIsBusy(true);
    const result = await removeAssignmentAction(pendingRemovalId, ticketId);
    setIsBusy(false);
    setPendingRemovalId(null);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success("Assignment removed");
    router.refresh();
  }

  const excludeIds = assignments.map((assignment) => assignment.teamMember.id);

  return (
    <div className="space-y-3">
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No one is assigned yet.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <UserAvatar name={assignment.teamMember.name} className="size-7" />
                <div className="text-sm">
                  <p className="font-medium">{assignment.teamMember.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatBangladeshiPhoneForDisplay(assignment.teamMember.phone)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${assignment.teamMember.name}`}
                onClick={() => setPendingRemovalId(assignment.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleAssignSelf} disabled={isBusy}>
        <UserPlus aria-hidden="true" />
        Assign myself
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <TeamMemberCombobox value={selectedTeamMember} onChange={setSelectedTeamMember} excludeIds={excludeIds} />
        </div>
        <Button type="button" size="sm" onClick={handleAssignOther} disabled={isBusy || !selectedTeamMember}>
          Assign
        </Button>
      </div>

      <ConfirmDialog
        open={pendingRemovalId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemovalId(null);
        }}
        title="Remove assignment?"
        description="This team member will no longer be assigned to this ticket."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
        isConfirming={isBusy}
      />
    </div>
  );
}
