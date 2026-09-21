"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { createCustomerAction, updateCustomerAction } from "@/features/customers/actions";
import { customerFormSchema } from "@/features/customers/schemas";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";

type CustomerFormValues = {
  phone: string;
  name: string;
  address: string;
  note: string;
};

type CustomerFormDialogProps =
  | {
      mode: "create";
      trigger: React.ReactNode;
    }
  | {
      mode: "edit";
      trigger: React.ReactNode;
      customer: { id: string; phone: string; name: string | null; address: string | null; note: string | null };
    };

export function CustomerFormDialog(props: CustomerFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const defaultValues: CustomerFormValues =
    props.mode === "edit"
      ? {
          phone: formatBangladeshiPhoneForDisplay(props.customer.phone),
          name: props.customer.name ?? "",
          address: props.customer.address ?? "",
          note: props.customer.note ?? "",
        }
      : { phone: "", name: "", address: "", note: "" };

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema) as never,
    defaultValues,
  });

  async function onSubmit(values: CustomerFormValues) {
    setDuplicateId(null);
    // The server action re-validates with the same Zod schema regardless,
    // so the raw form values are passed through as-is (typed `unknown` on
    // the action side) rather than pretending they're already normalized.
    const result =
      props.mode === "create"
        ? await createCustomerAction(values)
        : await updateCustomerAction(props.customer.id, values);

    if (result.status === "error") {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            form.setError(field as keyof CustomerFormValues, { message: messages[0] });
          }
        }
      } else {
        toast.error(result.message);
      }
      return;
    }

    if (result.status === "duplicate") {
      setDuplicateId(result.customerId);
      form.setError("phone", { message: result.message });
      return;
    }

    toast.success(props.mode === "create" ? "Customer created" : "Customer updated");
    setOpen(false);
    form.reset(defaultValues);
    router.push(`/customers/${result.customerId}`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset(defaultValues);
          setDuplicateId(null);
        }
      }}
    >
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{props.mode === "create" ? "New customer" : "Edit customer"}</DialogTitle>
            <DialogDescription>
              {props.mode === "create"
                ? "Phone is the only required field."
                : "Update this customer's information."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="01712345678"
                aria-invalid={!!form.formState.errors.phone}
                aria-describedby={form.formState.errors.phone ? "phone-error" : undefined}
                {...form.register("phone")}
              />
              {form.formState.errors.phone ? (
                <p id="phone-error" role="alert" className="text-destructive text-sm">
                  {form.formState.errors.phone.message}
                </p>
              ) : null}
              {duplicateId ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => router.push(`/customers/${duplicateId}`)}
                >
                  View the existing customer
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                aria-invalid={!!form.formState.errors.name}
                aria-describedby={form.formState.errors.name ? "name-error" : undefined}
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p id="name-error" role="alert" className="text-destructive text-sm">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...form.register("address")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea id="note" rows={3} {...form.register("note")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
