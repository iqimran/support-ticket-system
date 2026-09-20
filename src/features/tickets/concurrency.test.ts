// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { generateTicketNumber } from "./repository";
import { createTicket } from "./service";

const CREATOR_PHONE = "01900000051";
const CUSTOMER_PHONE = "+8801911190002";
const CONCURRENCY = 25;

let creatorId: string;
let customerId: string;
const cleanupTicketIds: string[] = [];

beforeAll(async () => {
  const passwordHash = await hashPassword("Fixture-Pass-123!");
  const creator = await prisma.user.upsert({
    where: { phone: CREATOR_PHONE },
    update: {},
    create: { name: "Concurrency Fixture Creator", phone: CREATOR_PHONE, passwordHash, role: "TEAM_MEMBER" },
  });
  creatorId = creator.id;

  const customer = await prisma.customer.create({ data: { phone: CUSTOMER_PHONE, name: "Concurrency Fixture Customer" } });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: cleanupTicketIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.user.delete({ where: { id: creatorId } });
});

describe("concurrent ticket number generation", () => {
  it("issues distinct sequence values under real concurrency (raw sequence)", async () => {
    const numbers = await Promise.all(Array.from({ length: CONCURRENCY }, () => generateTicketNumber()));

    expect(new Set(numbers).size).toBe(CONCURRENCY);
    for (const number of numbers) {
      expect(number).toMatch(/^TKT-\d{6}$/);
    }
  });

  it("creates many tickets concurrently with no duplicate ticket numbers", async () => {
    const tickets = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, index) =>
        createTicket({ customerId, problem: `Concurrent issue #${index}` }, creatorId),
      ),
    );

    cleanupTicketIds.push(...tickets.map((ticket) => ticket.id));

    const ticketNumbers = tickets.map((ticket) => ticket.ticketNumber);
    expect(new Set(ticketNumbers).size).toBe(CONCURRENCY);

    const distinctRowsInDb = await prisma.ticket.findMany({
      where: { id: { in: tickets.map((ticket) => ticket.id) } },
      select: { ticketNumber: true },
    });
    expect(new Set(distinctRowsInDb.map((row) => row.ticketNumber)).size).toBe(CONCURRENCY);
  });
});
