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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTicketAction } from "@/features/tickets/actions";
import { CustomerCombobox } from "@/features/tickets/components/customer-combobox";
import { TICKET_PRIORITIES } from "@/features/tickets/schemas";
import type { CustomerPickerResult } from "@/features/customers/actions";

type TicketFormDialogProps = {
  trigger: React.ReactNode;
  /** Pre-selects and locks the customer, e.g. when launched from a customer's detail page. */
  fixedCustomer?: CustomerPickerResult;
};

export function TicketFormDialog({ trigger, fixedCustomer }: TicketFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerPickerResult | null>(fixedCustomer ?? null);
  const [problem, setProblem] = useState("");
  const [priority, setPriority] = useState<(typeof TICKET_PRIORITIES)[number]>("MEDIUM");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function resetForm() {
    setCustomer(fixedCustomer ?? null);
    setProblem("");
    setPriority("MEDIUM");
    setErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const result = await createTicketAction({ customerId: customer?.id, problem, priority });

    setIsSubmitting(false);

    if (result.status === "error") {
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        toast.error(result.message);
      }
      return;
    }

    toast.success("Ticket created");
    setOpen(false);
    resetForm();
    router.push(`/tickets/${result.ticketId}`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>Create a support ticket for a customer.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              {fixedCustomer ? (
                <p className="text-sm font-medium">{fixedCustomer.name ?? fixedCustomer.phone}</p>
              ) : (
                <CustomerCombobox value={customer} onChange={setCustomer} />
              )}
              {errors.customerId ? (
                <p id="customer-error" role="alert" className="text-destructive text-sm">
                  {errors.customerId[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="problem">Problem description</Label>
              <Textarea
                id="problem"
                rows={4}
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
                required
                aria-invalid={!!errors.problem}
                aria-describedby={errors.problem ? "problem-error" : undefined}
              />
              {errors.problem ? (
                <p id="problem-error" role="alert" className="text-destructive text-sm">
                  {errors.problem[0]}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !customer}>
              {isSubmitting ? "Creating..." : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
