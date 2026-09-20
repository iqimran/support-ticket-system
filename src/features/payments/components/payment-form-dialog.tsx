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
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/shared/date-picker";
import { recordPaymentAction, updatePaymentAction } from "@/features/payments/actions";
import { PAYMENT_METHODS } from "@/features/payments/schemas";

type PaymentMethod = (typeof PAYMENT_METHODS)[number];

type ExistingPayment = {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  note: string | null;
  receivedAt: Date;
};

type PaymentFormDialogProps =
  | { mode: "record"; ticketId: string; trigger: React.ReactNode }
  | { mode: "edit"; payment: ExistingPayment; trigger: React.ReactNode };

export function PaymentFormDialog(props: PaymentFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const initial =
    props.mode === "edit"
      ? {
          amount: props.payment.amount,
          paymentMethod: props.payment.paymentMethod,
          note: props.payment.note ?? "",
          receivedAt: props.payment.receivedAt,
        }
      : { amount: "", paymentMethod: "CASH" as PaymentMethod, note: "", receivedAt: new Date() };

  const [amount, setAmount] = useState(initial.amount);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial.paymentMethod);
  const [note, setNote] = useState(initial.note);
  const [receivedAt, setReceivedAt] = useState<Date | undefined>(initial.receivedAt);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function resetForm() {
    setAmount(initial.amount);
    setPaymentMethod(initial.paymentMethod);
    setNote(initial.note);
    setReceivedAt(initial.receivedAt);
    setErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    const payload = { amount, paymentMethod, note, receivedAt };
    const result =
      props.mode === "record"
        ? await recordPaymentAction({ ticketId: props.ticketId, ...payload })
        : await updatePaymentAction(props.payment.id, payload);

    setIsSubmitting(false);

    if (result.status === "error") {
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        toast.error(result.message);
      }
      return;
    }

    toast.success(props.mode === "record" ? "Payment recorded" : "Payment updated");
    setOpen(false);
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
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{props.mode === "record" ? "Record payment" : "Update payment"}</DialogTitle>
            <DialogDescription>
              {props.mode === "record"
                ? "Record money actually received from the customer for this ticket."
                : "Every change is recorded in the payment audit trail."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              {errors.amount ? (
                <p role="alert" className="text-destructive text-sm">
                  {errors.amount[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment method</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                <SelectTrigger id="paymentMethod" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Received date</Label>
              <DatePicker value={receivedAt} onChange={setReceivedAt} placeholder="Select the date received" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea id="note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !amount || !receivedAt}>
              {isSubmitting ? "Saving..." : props.mode === "record" ? "Record payment" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
