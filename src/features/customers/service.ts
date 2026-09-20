import type { Customer } from "@/generated/prisma/client";
import type { CustomerFormInput } from "@/features/customers/schemas";
import {
  createCustomerRecord,
  findCustomerByPhone,
  findCustomerById,
  isUniqueConstraintError,
  updateCustomerRecord,
} from "@/features/customers/repository";

export type CreateCustomerResult =
  | { status: "created"; customer: Customer }
  | { status: "duplicate"; customer: Customer };

/**
 * Prevents accidental duplicate customers. The check-then-create has a
 * narrow race window under concurrent requests for the same phone number;
 * the catch below closes it by falling back to a lookup when the database's
 * own unique constraint on Customer.phone rejects the insert.
 */
export async function createCustomer(input: CustomerFormInput): Promise<CreateCustomerResult> {
  const existing = await findCustomerByPhone(input.phone);
  if (existing) {
    return { status: "duplicate", customer: existing };
  }

  try {
    const customer = await createCustomerRecord(input);
    return { status: "created", customer };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const conflicting = await findCustomerByPhone(input.phone);
      if (conflicting) {
        return { status: "duplicate", customer: conflicting };
      }
    }
    throw error;
  }
}

export type UpdateCustomerResult =
  | { status: "updated"; customer: Customer }
  | { status: "duplicate"; customer: Customer }
  | { status: "not_found" };

export async function updateCustomer(id: string, input: CustomerFormInput): Promise<UpdateCustomerResult> {
  const current = await findCustomerById(id);
  if (!current) {
    return { status: "not_found" };
  }

  if (input.phone !== current.phone) {
    const conflicting = await findCustomerByPhone(input.phone);
    if (conflicting && conflicting.id !== id) {
      return { status: "duplicate", customer: conflicting };
    }
  }

  try {
    const customer = await updateCustomerRecord(id, {
      phone: input.phone,
      name: input.name ?? null,
      address: input.address ?? null,
      note: input.note ?? null,
    });
    return { status: "updated", customer };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const conflicting = await findCustomerByPhone(input.phone);
      if (conflicting) {
        return { status: "duplicate", customer: conflicting };
      }
    }
    throw error;
  }
}
