// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { listCustomers } from "./repository";

// Dedicated phone range for this file.
const PHONE_RAHIM = "+8801911181001";
const PHONE_KARIM = "+8801911181002";
const PHONE_UNNAMED = "+8801911181003";

const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const [rahim, karim, unnamed] = await Promise.all([
    prisma.customer.create({ data: { phone: PHONE_RAHIM, name: "Rahim Uddin" } }),
    prisma.customer.create({ data: { phone: PHONE_KARIM, name: "Karim Ahmed" } }),
    prisma.customer.create({ data: { phone: PHONE_UNNAMED, name: null } }),
  ]);
  createdCustomerIds.push(rahim.id, karim.id, unnamed.id);
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
});

const basePagination = { page: 1, pageSize: 20, sortBy: "createdAt" as const, sortDir: "desc" as const };

describe("listCustomers (search)", () => {
  it("finds a customer by full local-format phone number", async () => {
    const { items } = await listCustomers({ ...basePagination, query: "01911181001" });
    expect(items.map((item) => item.id)).toContain(createdCustomerIds[0]);
  });

  it("finds a customer by E.164 phone number", async () => {
    const { items } = await listCustomers({ ...basePagination, query: "+8801911181001" });
    expect(items.map((item) => item.id)).toContain(createdCustomerIds[0]);
  });

  it("finds a customer by a partial phone digit sequence", async () => {
    const { items } = await listCustomers({ ...basePagination, query: "181001" });
    expect(items.map((item) => item.id)).toContain(createdCustomerIds[0]);
  });

  it("finds a customer by name, case-insensitively", async () => {
    const { items } = await listCustomers({ ...basePagination, query: "karim" });
    expect(items.map((item) => item.id)).toContain(createdCustomerIds[1]);
    expect(items.map((item) => item.id)).not.toContain(createdCustomerIds[0]);
  });

  it("finds a customer by partial name", async () => {
    const { items } = await listCustomers({ ...basePagination, query: "Rahim" });
    expect(items.map((item) => item.id)).toContain(createdCustomerIds[0]);
  });

  it("does not match every row when the query has no digits and matches no name", async () => {
    const { items, total } = await listCustomers({ ...basePagination, query: "zzz-no-such-customer-zzz" });
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });

  it("returns all customers (no filtering) when the query is empty", async () => {
    // pageSize large enough to not depend on how many other customers
    // already exist in this shared dev database.
    const { items } = await listCustomers({ ...basePagination, query: "", pageSize: 100 });
    const ids = items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(createdCustomerIds));
  });

  it("paginates results", async () => {
    const pageOne = await listCustomers({ ...basePagination, query: "", page: 1, pageSize: 1 });
    const pageTwo = await listCustomers({ ...basePagination, query: "", page: 2, pageSize: 1 });

    expect(pageOne.items).toHaveLength(1);
    expect(pageTwo.items).toHaveLength(1);
    expect(pageOne.items[0]?.id).not.toBe(pageTwo.items[0]?.id);
    expect(pageOne.total).toBeGreaterThanOrEqual(3);
  });

  it("sorts by name ascending", async () => {
    const { items } = await listCustomers({
      ...basePagination,
      query: "",
      pageSize: 100,
      sortBy: "name",
      sortDir: "asc",
    });
    const ourNames = items.filter((item) => createdCustomerIds.includes(item.id)).map((item) => item.name);
    // Karim Ahmed, Rahim Uddin, and the unnamed (null) fixture — nulls sort
    // last in ascending order on Postgres.
    expect(ourNames).toEqual(["Karim Ahmed", "Rahim Uddin", null]);
  });
});
