"use client";

import { UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  assignSelfAction,
  assignTeamMembersAction,
  removeAssignmentAction,
  type TeamMemberPickerResult,
} from "@/features/tickets/actions";
import { TeamMemberMultiSelect } from "@/features/tickets/components/team-member-multi-select";

type Assignment = {
  id: string;
  teamMember: { id: string; name: string; phone: string; isActive: boolean };
  /** Precomputed server-side via canRemoveTicketAssignment: ADMIN sees this for every row, a TEAM_MEMBER only for their own. */
  canRemove: boolean;
};

export function TicketAssignmentPanel({ ticketId, assignments }: { ticketId: string; assignments: Assignment[] }) {
  const router = useRouter();
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<TeamMemberPickerResult[]>([]);
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

  async function handleAssign() {
    if (selectedTeamMembers.length === 0) return;
    setIsBusy(true);
    const result = await assignTeamMembersAction({
      ticketId,
      teamMemberIds: selectedTeamMembers.map((teamMember) => teamMember.id),
    });
    setIsBusy(false);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success(selectedTeamMembers.length > 1 ? "Team members assigned" : "Assigned");
    setSelectedTeamMembers([]);
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
        <div className="flex flex-wrap gap-1.5">
          {assignments.map((assignment) => (
            <Badge
              key={assignment.id}
              variant={assignment.teamMember.isActive ? "secondary" : "outline"}
              className="gap-1 pr-1"
            >
              {assignment.teamMember.name}
              {!assignment.teamMember.isActive ? <span className="text-[10px] opacity-70">(inactive)</span> : null}
              {assignment.canRemove ? (
                <button
                  type="button"
                  aria-label={`Remove ${assignment.teamMember.name}`}
                  onClick={() => setPendingRemovalId(assignment.id)}
                  className="rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleAssignSelf} disabled={isBusy}>
        <UserPlus aria-hidden="true" />
        Assign myself
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <TeamMemberMultiSelect
            selected={selectedTeamMembers}
            onChange={setSelectedTeamMembers}
            excludeIds={excludeIds}
            disabled={isBusy}
          />
        </div>
        <Button type="button" size="sm" onClick={handleAssign} disabled={isBusy || selectedTeamMembers.length === 0}>
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
