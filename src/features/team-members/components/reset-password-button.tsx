"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { resetTeamMemberPasswordAction } from "@/features/team-members/actions";
import { GeneratedPasswordDialog } from "@/features/team-members/components/generated-password-dialog";

export function ResetPasswordButton({ teamMemberId, teamMemberName }: { teamMemberId: string; teamMemberName: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  async function handleConfirm() {
    setIsResetting(true);
    const result = await resetTeamMemberPasswordAction(teamMemberId);
    setIsResetting(false);
    setConfirmOpen(false);

    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    setGeneratedPassword(result.generatedPassword);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
        <KeyRound aria-hidden="true" />
        Reset password
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset password?"
        description={`This immediately signs ${teamMemberName} out of any active session and replaces their password with a newly generated one.`}
        confirmLabel="Reset password"
        variant="destructive"
        onConfirm={handleConfirm}
        isConfirming={isResetting}
      />

      <GeneratedPasswordDialog
        open={generatedPassword !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setGeneratedPassword(null);
        }}
        password={generatedPassword}
        teamMemberName={teamMemberName}
      />
    </>
  );
}
