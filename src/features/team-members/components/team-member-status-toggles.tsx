"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setTeamMemberActiveAction, setTeamMemberLoginStatusAction } from "@/features/team-members/actions";

type TeamMemberStatusTogglesProps = {
  teamMemberId: string;
  isActive: boolean;
  loginActive: boolean;
};

export function TeamMemberStatusToggles({ teamMemberId, isActive, loginActive }: TeamMemberStatusTogglesProps) {
  const router = useRouter();
  const [busyField, setBusyField] = useState<"active" | "login" | null>(null);

  async function handleActiveChange(nextValue: boolean) {
    setBusyField("active");
    const result = await setTeamMemberActiveAction(teamMemberId, nextValue);
    setBusyField(null);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success(nextValue ? "Team member activated" : "Team member deactivated");
    router.refresh();
  }

  async function handleLoginChange(nextValue: boolean) {
    setBusyField("login");
    const result = await setTeamMemberLoginStatusAction(teamMemberId, nextValue);
    setBusyField(null);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success(nextValue ? "Login enabled" : "Login disabled — any existing session was signed out");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="active-status">Active status</Label>
          <p className="text-muted-foreground text-xs">Eligible for new ticket assignments.</p>
        </div>
        <Switch
          id="active-status"
          checked={isActive}
          disabled={busyField !== null}
          onCheckedChange={handleActiveChange}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="login-status">Login status</Label>
          <p className="text-muted-foreground text-xs">Can sign in to the system.</p>
        </div>
        <Switch
          id="login-status"
          checked={loginActive}
          disabled={busyField !== null}
          onCheckedChange={handleLoginChange}
        />
      </div>
    </div>
  );
}
