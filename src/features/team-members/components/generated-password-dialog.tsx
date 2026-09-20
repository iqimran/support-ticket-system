"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GeneratedPasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  password: string | null;
  teamMemberName: string;
};

export function GeneratedPasswordDialog({ open, onOpenChange, password, teamMemberName }: GeneratedPasswordDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setCopied(false);
      }}
    >
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>New password for {teamMemberName}</DialogTitle>
          <DialogDescription>
            This password is shown only once and cannot be retrieved again. Share it with {teamMemberName} securely,
            then close this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="generated-password">Password</Label>
          <div className="flex gap-2">
            <Input id="generated-password" readOnly value={password ?? ""} className="font-mono" />
            <Button type="button" variant="outline" size="icon" aria-label="Copy password" onClick={handleCopy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
