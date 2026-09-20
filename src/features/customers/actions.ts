"use server";

import { revalidatePath } from "next/cache";
import { createCustomer, updateCustomer } from "@/features/customers/service";
import { customerFormSchema } from "@/features/customers/schemas";
import { recordAuditLog } from "@/server/audit/log";
import { requireTeamMember } from "@/server/authorization";

export type CustomerActionResult =
  | { status: "success"; customerId: string }
  | { status: "duplicate"; customerId: string; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

// Both ADMIN and TEAM_MEMBER may create/edit customers (project decision —
// this is a deliberate loosening of the stricter "ADMIN manages customers"
// wording from the original permission matrix).

export async function createCustomerAction(input: unknown): Promise<CustomerActionResult> {
  const user = await requireTeamMember();

  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await createCustomer(parsed.data);

  if (result.status === "duplicate") {
    await recordAuditLog({
      actorId: user.id,
      action: "customer.create_duplicate_prevented",
      entityType: "Customer",
      entityId: result.customer.id,
    });
    return {
      status: "duplicate",
      customerId: result.customer.id,
      message: "A customer with this phone number already exists.",
    };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "customer.created",
    entityType: "Customer",
    entityId: result.customer.id,
  });
  revalidatePath("/customers");

  return { status: "success", customerId: result.customer.id };
}

export async function updateCustomerAction(id: string, input: unknown): Promise<CustomerActionResult> {
  const user = await requireTeamMember();

  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await updateCustomer(id, parsed.data);

  if (result.status === "not_found") {
    return { status: "error", message: "Customer not found." };
  }

  if (result.status === "duplicate") {
    return {
      status: "duplicate",
      customerId: result.customer.id,
      message: "Another customer already uses this phone number.",
    };
  }

  await recordAuditLog({
    actorId: user.id,
    action: "customer.updated",
    entityType: "Customer",
    entityId: id,
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);

  return { status: "success", customerId: id };
}
