"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeamMemberAction, updateTeamMemberAction } from "@/features/team-members/actions";
import { GeneratedPasswordDialog } from "@/features/team-members/components/generated-password-dialog";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";

type TeamMemberFormDialogProps =
  | { mode: "create"; trigger: React.ReactNode }
  | { mode: "edit"; teamMember: { id: string; name: string; phone: string }; trigger: React.ReactNode };

export function TeamMemberFormDialog(props: TeamMemberFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(props.mode === "edit" ? props.teamMember.name : "");
  const [phone, setPhone] = useState(props.mode === "edit" ? formatBangladeshiPhoneForDisplay(props.teamMember.phone) : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");

  function resetForm() {
    setName(props.mode === "edit" ? props.teamMember.name : "");
    setPhone(props.mode === "edit" ? formatBangladeshiPhoneForDisplay(props.teamMember.phone) : "");
    setErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    if (props.mode === "create") {
      const result = await createTeamMemberAction({ name, phone });
      setIsSubmitting(false);

      if (result.status === "error") {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          toast.error(result.message);
        }
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();
      setCreatedName(name);
      setGeneratedPassword(result.generatedPassword);
      return;
    }

    const result = await updateTeamMemberAction(props.teamMember.id, { name, phone });
    setIsSubmitting(false);

    if (result.status === "error") {
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        toast.error(result.message);
      }
      return;
    }

    setOpen(false);
    resetForm();
    router.refresh();
    toast.success("Team member updated");
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{props.mode === "create" ? "New team member" : "Edit team member"}</DialogTitle>
              <DialogDescription>
                {props.mode === "create"
                  ? "A login password will be generated automatically and shown once."
                  : "Changing the phone number also updates their login."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tm-name">Name</Label>
                <Input
                  id="tm-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "tm-name-error" : undefined}
                />
                {errors.name ? (
                  <p id="tm-name-error" role="alert" className="text-destructive text-sm">
                    {errors.name[0]}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tm-phone">Phone</Label>
                <Input
                  id="tm-phone"
                  placeholder="01712345678"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "tm-phone-error" : undefined}
                />
                {errors.phone ? (
                  <p id="tm-phone-error" role="alert" className="text-destructive text-sm">
                    {errors.phone[0]}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : props.mode === "create" ? "Create team member" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <GeneratedPasswordDialog
        open={generatedPassword !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setGeneratedPassword(null);
        }}
        password={generatedPassword}
        teamMemberName={createdName}
      />
    </>
  );
}
