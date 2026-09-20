// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createCustomer, updateCustomer } from "./service";

// Dedicated phone range for this file so parallel test files never collide.
const PHONE_A = "+8801911180001";
const PHONE_B = "+8801911180002";
const PHONE_C = "+8801911180003";

const createdCustomerIds: string[] = [];

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
});

describe("createCustomer", () => {
  it("creates a new customer with only a phone number", async () => {
    const result = await createCustomer({ phone: PHONE_A });
    expect(result.status).toBe("created");
    if (result.status === "created") {
      createdCustomerIds.push(result.customer.id);
      expect(result.customer.phone).toBe(PHONE_A);
      expect(result.customer.name).toBeNull();
    }
  });

  it("creates a customer with all optional fields populated", async () => {
    const result = await createCustomer({
      phone: PHONE_B,
      name: "Karim Ahmed",
      address: "45 Gulshan Ave, Dhaka",
      note: "Has 3 CCTV units installed",
    });

    expect(result.status).toBe("created");
    if (result.status === "created") {
      createdCustomerIds.push(result.customer.id);
      expect(result.customer.name).toBe("Karim Ahmed");
      expect(result.customer.address).toBe("45 Gulshan Ave, Dhaka");
      expect(result.customer.note).toBe("Has 3 CCTV units installed");
    }
  });

  it("returns the existing customer instead of creating a duplicate for the same phone", async () => {
    const first = await createCustomer({ phone: PHONE_C, name: "Original Name" });
    expect(first.status).toBe("created");
    if (first.status === "created") createdCustomerIds.push(first.customer.id);

    const second = await createCustomer({ phone: PHONE_C, name: "Someone Else" });

    expect(second.status).toBe("duplicate");
    if (second.status === "duplicate" && first.status === "created") {
      expect(second.customer.id).toBe(first.customer.id);
      // The duplicate attempt must not have overwritten the original record.
      expect(second.customer.name).toBe("Original Name");
    }

    const rowCount = await prisma.customer.count({ where: { phone: PHONE_C } });
    expect(rowCount).toBe(1);
  });
});

describe("updateCustomer", () => {
  it("updates fields on an existing customer", async () => {
    const created = await createCustomer({ phone: "+8801911180010", name: "Before" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    createdCustomerIds.push(created.customer.id);

    const updated = await updateCustomer(created.customer.id, {
      phone: "+8801911180010",
      name: "After",
      address: "New address",
      note: "New note",
    });

    expect(updated.status).toBe("updated");
    if (updated.status === "updated") {
      expect(updated.customer.name).toBe("After");
      expect(updated.customer.address).toBe("New address");
      expect(updated.customer.note).toBe("New note");
    }
  });

  it("clears a previously-set field when the form submits it empty", async () => {
    const created = await createCustomer({ phone: "+8801911180011", name: "Has Name", note: "Has note" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    createdCustomerIds.push(created.customer.id);

    // customerFormSchema turns "" into undefined — this is exactly what a
    // cleared form field produces once parsed server-side.
    const updated = await updateCustomer(created.customer.id, { phone: "+8801911180011" });

    expect(updated.status).toBe("updated");
    if (updated.status === "updated") {
      expect(updated.customer.name).toBeNull();
      expect(updated.customer.note).toBeNull();
    }
  });

  it("returns not_found for a nonexistent customer id", async () => {
    const result = await updateCustomer("does-not-exist", { phone: "+8801911180099" });
    expect(result.status).toBe("not_found");
  });

  it("prevents renaming a customer's phone to one already used by another customer", async () => {
    const customerOne = await createCustomer({ phone: "+8801911180020" });
    const customerTwo = await createCustomer({ phone: "+8801911180021" });
    if (customerOne.status !== "created" || customerTwo.status !== "created") {
      throw new Error("fixture setup failed");
    }
    createdCustomerIds.push(customerOne.customer.id, customerTwo.customer.id);

    const result = await updateCustomer(customerTwo.customer.id, { phone: "+8801911180020" });

    expect(result.status).toBe("duplicate");
    if (result.status === "duplicate") {
      expect(result.customer.id).toBe(customerOne.customer.id);
    }

    const untouchedCustomerTwo = await prisma.customer.findUniqueOrThrow({ where: { id: customerTwo.customer.id } });
    expect(untouchedCustomerTwo.phone).toBe("+8801911180021");
  });

  it("allows a customer to keep their own phone number unchanged", async () => {
    const created = await createCustomer({ phone: "+8801911180030", name: "Same Phone" });
    if (created.status !== "created") throw new Error("fixture setup failed");
    createdCustomerIds.push(created.customer.id);

    const result = await updateCustomer(created.customer.id, { phone: "+8801911180030", name: "Same Phone Updated" });

    expect(result.status).toBe("updated");
  });
});
