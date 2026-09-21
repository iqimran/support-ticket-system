/**
 * Realistic, deterministic development seed data.
 *
 * Run via `npm run prisma:seed` (seeds into whatever's already in the DB —
 * will fail on unique-constraint collisions if run twice without a reset)
 * or, normally, `npm run prisma:reseed` (drops the DB, reapplies every
 * migration, then runs this script against a guaranteed-clean database —
 * see README.md "Development database seeding").
 *
 * Every random choice below goes through a seeded PRNG (prisma/seed/random.ts),
 * never Math.random() — re-running this against a freshly reset database
 * always produces the same customers, tickets, dates, and text. The only
 * exception is generated cuid primary keys, which Prisma itself derives
 * partly from wall-clock time; nothing in this app or its tests depends on
 * a specific id value, only on the deterministic *content* and *shape* of
 * the data.
 */
import { generateTicketNumber } from "@/features/tickets/repository";
import { resolveArchiveCutoff } from "@/features/archive/cutoff";
import { runArchiveJob } from "@/features/archive/service";
import type { PaymentMethod, TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { normalizeBangladeshiPhone } from "@/lib/phone";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import {
  buildAddress,
  buildProblemDescription,
  CANCEL_REASONS,
  FIRST_NAMES,
  LAST_NAMES,
  PAYMENT_METHODS,
  PROGRESS_NOTES,
  REOPEN_REASONS,
} from "./seed/data";
import { chance, createRng, laterBy, pick, pickDistinct, pickWeighted, randInt, randomDateBetween, type Rng } from "./seed/random";

// Fixed, not `new Date()` — so which tickets land in the active window vs
// the archive is identical no matter what day this script actually runs.
const SEED_NOW = new Date("2026-09-21T12:00:00.000Z");
const RNG_SEED = 20250101;

const TEAM_MEMBER_COUNT = 5;
const CUSTOMER_COUNT = 120;

// "At least" counts from the spec, each with a little headroom.
const ACTIVE_PENDING_COUNT = 60;
const ACTIVE_IN_PROGRESS_COUNT = 60;
const ACTIVE_COMPLETED_COUNT = 520;
const ACTIVE_CANCELLED_COUNT = 220;
const ARCHIVED_COUNT = 520;

const OPERATOR_PREFIXES = ["013", "014", "015", "016", "017", "018", "019"] as const;

async function main() {
  const rng = createRng(RNG_SEED);

  const admin = await seedAdmin();
  const teamMembers = await seedTeamMembers(rng);
  const customers = await seedCustomers(rng);

  const staffUserIds = [admin.id, ...teamMembers.map((m) => m.userId)];
  const teamMemberProfileIds = teamMembers.map((m) => m.id);
  const customerIds = customers.map((c) => c.id);

  const cutoff = resolveArchiveCutoff(SEED_NOW);
  const activeWindowStart = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000);
  const archivedWindowStart = new Date(cutoff.getTime() - 540 * 24 * 60 * 60 * 1000); // ~18 months before cutoff
  const archivedWindowEnd = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);

  console.log("Seeding tickets (this takes a while for ~1,300+ tickets)...");

  const plans: TicketPlan[] = [
    ...buildPlans(rng, "PENDING", ACTIVE_PENDING_COUNT, activeWindowStart, SEED_NOW),
    ...buildPlans(rng, "IN_PROGRESS", ACTIVE_IN_PROGRESS_COUNT, activeWindowStart, SEED_NOW),
    ...buildPlans(rng, "COMPLETED", ACTIVE_COMPLETED_COUNT, activeWindowStart, SEED_NOW),
    ...buildPlans(rng, "CANCELLED", ACTIVE_CANCELLED_COUNT, activeWindowStart, SEED_NOW),
    // Archived-bucket tickets get a realistic mix of final statuses too —
    // any status can age into the archive, not just completed ones.
    ...buildWeightedPlans(rng, ARCHIVED_COUNT, archivedWindowStart, archivedWindowEnd),
  ];

  let ticketsCreated = 0;
  let paymentsCreated = 0;

  for (const plan of plans) {
    const result = await seedOneTicket(rng, plan, {
      staffUserIds,
      teamMemberProfileIds,
      customerIds,
    });
    ticketsCreated++;
    paymentsCreated += result.paymentsCreated;
    if (ticketsCreated % 200 === 0) {
      console.log(`  ...${ticketsCreated}/${plans.length} tickets created`);
    }
  }

  console.log(`Created ${ticketsCreated} tickets (${paymentsCreated} with a payment).`);
  console.log("Running the real archive job to sweep old tickets into archive storage...");

  const archiveResult = await runArchiveJob(SEED_NOW);
  if (archiveResult.status === "SKIPPED_ALREADY_RUNNING") {
    throw new Error("Archive job reported another run in progress — unexpected during seeding.");
  }
  console.log(
    `Archive job ${archiveResult.status}: ${archiveResult.ticketsProcessed}/${archiveResult.ticketsFound} tickets archived.`,
  );

  console.log("\nSeed summary:");
  console.log(`  Admin:         1 (${admin.phone})`);
  console.log(`  Team members:  ${teamMembers.length}`);
  console.log(`  Customers:     ${customers.length}`);
  console.log(`  Tickets:       ${ticketsCreated} total (${archiveResult.ticketsProcessed} archived)`);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function seedAdmin() {
  const rawPhone = process.env.SEED_ADMIN_PHONE ?? "01700000000";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "System Admin";

  const phone = normalizeBangladeshiPhone(rawPhone);
  if (!phone) {
    throw new Error(`SEED_ADMIN_PHONE "${rawPhone}" is not a valid Bangladeshi mobile number`);
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { name, phone, passwordHash, role: "ADMIN", isActive: true },
  });

  console.log(`Seeded admin "${admin.name}" (phone: ${admin.phone}).`);
  return admin;
}

/** Dev convenience only — real team members get a random one-time password (see features/team-members); a fixed known password here is what makes the seeded accounts actually usable for local login. */
const TEAM_MEMBER_PASSWORD = "ChangeMe123!";

async function seedTeamMembers(rng: Rng) {
  const passwordHash = await hashPassword(TEAM_MEMBER_PASSWORD);
  const members: { id: string; userId: string; name: string }[] = [];

  for (let i = 0; i < TEAM_MEMBER_COUNT; i++) {
    const name = fullName(rng);
    const phone = uniquePhone(rng, `team-member-${i}`);
    // The last team member is deactivated on purpose: historical
    // assignments to a now-inactive team member are a real scenario the
    // app must keep showing correctly (see the archive/assignment features).
    const isActive = i < TEAM_MEMBER_COUNT - 1;

    const user = await prisma.user.create({
      data: { name, phone, passwordHash, role: "TEAM_MEMBER", isActive: true },
    });
    const teamMember = await prisma.teamMember.create({
      data: { userId: user.id, name, phone, isActive },
    });
    members.push({ id: teamMember.id, userId: user.id, name });
  }

  console.log(`Seeded ${members.length} team members (password for all: "${TEAM_MEMBER_PASSWORD}").`);
  return members;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

function fullName(rng: Rng): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

const usedPhones = new Set<string>();

/** Deterministically generates a unique, valid Bangladeshi mobile number. `salt` just varies the derived digits per caller so different entities don't collide. */
function uniquePhone(rng: Rng, salt: string): string {
  let saltIndex = 0;
  for (;;) {
    const prefix = OPERATOR_PREFIXES[(salt.length + saltIndex) % OPERATOR_PREFIXES.length];
    const suffix = randInt(rng, 0, 99_999_999).toString().padStart(8, "0");
    const local = `${prefix}${suffix}`;
    const normalized = normalizeBangladeshiPhone(local);
    if (normalized && !usedPhones.has(normalized)) {
      usedPhones.add(normalized);
      return normalized;
    }
    saltIndex++;
  }
}

async function seedCustomers(rng: Rng) {
  const customers: { id: string }[] = [];
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const name = fullName(rng);
    const phone = uniquePhone(rng, `customer-${i}`);
    const address = buildAddress(rng, i);
    const customer = await prisma.customer.create({ data: { name, phone, address } });
    customers.push(customer);
  }
  console.log(`Seeded ${customers.length} customers.`);
  return customers;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

type TicketPlan = { status: TicketStatus; createdAt: Date };

function buildPlans(rng: Rng, status: TicketStatus, count: number, from: Date, to: Date): TicketPlan[] {
  return Array.from({ length: count }, () => ({ status, createdAt: randomDateBetween(rng, from, to) }));
}

/** Archived tickets age in at every status, skewed the way a real, mostly-healthy support queue would be: mostly resolved, some cancelled, a few stale ones nobody closed out. */
function buildWeightedPlans(rng: Rng, count: number, from: Date, to: Date): TicketPlan[] {
  const weights: [TicketStatus, number][] = [
    ["COMPLETED", 60],
    ["CANCELLED", 25],
    ["PENDING", 8],
    ["IN_PROGRESS", 7],
  ];
  return Array.from({ length: count }, () => ({
    status: pickWeighted(rng, weights),
    createdAt: randomDateBetween(rng, from, to),
  }));
}

type LifecycleEvent = { at: Date; oldStatus: TicketStatus; newStatus: TicketStatus; note: string | null };

function buildLifecycle(
  rng: Rng,
  finalStatus: TicketStatus,
  createdAt: Date,
): { events: LifecycleEvent[]; completedAt: Date | null; updatedAt: Date } {
  if (finalStatus === "PENDING") {
    return { events: [], completedAt: null, updatedAt: createdAt };
  }

  if (finalStatus === "IN_PROGRESS") {
    const at = laterBy(rng, createdAt, 4, 48);
    return { events: [{ at, oldStatus: "PENDING", newStatus: "IN_PROGRESS", note: null }], completedAt: null, updatedAt: at };
  }

  if (finalStatus === "CANCELLED") {
    const events: LifecycleEvent[] = [];
    let cursor = createdAt;
    let priorStatus: TicketStatus = "PENDING";
    if (chance(rng, 0.4)) {
      const at = laterBy(rng, cursor, 4, 48);
      events.push({ at, oldStatus: "PENDING", newStatus: "IN_PROGRESS", note: null });
      cursor = at;
      priorStatus = "IN_PROGRESS";
    }
    const at = laterBy(rng, cursor, 4, 72);
    events.push({ at, oldStatus: priorStatus, newStatus: "CANCELLED", note: pick(rng, CANCEL_REASONS) });
    return { events, completedAt: null, updatedAt: at };
  }

  // COMPLETED
  const atInProgress = laterBy(rng, createdAt, 4, 48);
  const atCompleted = laterBy(rng, atInProgress, 4, 96);
  const events: LifecycleEvent[] = [
    { at: atInProgress, oldStatus: "PENDING", newStatus: "IN_PROGRESS", note: null },
    { at: atCompleted, oldStatus: "IN_PROGRESS", newStatus: "COMPLETED", note: null },
  ];
  let completedAt = atCompleted;
  let updatedAt = atCompleted;

  if (chance(rng, 0.15)) {
    const atReopen = laterBy(rng, atCompleted, 24, 96);
    const atRecompleted = laterBy(rng, atReopen, 4, 96);
    events.push({ at: atReopen, oldStatus: "COMPLETED", newStatus: "IN_PROGRESS", note: pick(rng, REOPEN_REASONS) });
    events.push({ at: atRecompleted, oldStatus: "IN_PROGRESS", newStatus: "COMPLETED", note: null });
    completedAt = atRecompleted;
    updatedAt = atRecompleted;
  }

  return { events, completedAt, updatedAt };
}

const PRIORITY_WEIGHTS: [TicketPriority, number][] = [
  ["LOW", 2],
  ["MEDIUM", 5],
  ["HIGH", 2],
  ["URGENT", 1],
];

const PAYMENT_METHOD_WEIGHTS: [PaymentMethod, number][] = PAYMENT_METHODS.map((method) => [
  method,
  method === "CASH" ? 5 : method === "MOBILE_BANKING" ? 3 : method === "BANK" ? 2 : 1,
]);

const ASSIGNMENT_CHANCE: Record<TicketStatus, number> = {
  PENDING: 0.4,
  IN_PROGRESS: 0.9,
  COMPLETED: 0.9,
  CANCELLED: 0.4,
};

const NOTE_COUNT_RANGE: Record<TicketStatus, [number, number]> = {
  PENDING: [0, 1],
  IN_PROGRESS: [1, 3],
  COMPLETED: [1, 4],
  CANCELLED: [0, 2],
};

type SeedContext = { staffUserIds: string[]; teamMemberProfileIds: string[]; customerIds: string[] };

async function seedOneTicket(
  rng: Rng,
  plan: TicketPlan,
  ctx: SeedContext,
): Promise<{ paymentsCreated: number }> {
  const ticketNumber = await generateTicketNumber();
  const customerId = pick(rng, ctx.customerIds);
  const createdBy = pick(rng, ctx.staffUserIds);
  const priority = pickWeighted(rng, PRIORITY_WEIGHTS);
  const problem = buildProblemDescription(rng);

  const { events, completedAt, updatedAt } = buildLifecycle(rng, plan.status, plan.createdAt);

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      customerId,
      problem,
      status: plan.status,
      priority,
      createdBy,
      createdAt: plan.createdAt,
      updatedAt,
      completedAt,
    },
  });

  if (events.length > 0) {
    await prisma.ticketStatusHistory.createMany({
      data: events.map((event) => ({
        ticketId: ticket.id,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        note: event.note,
        changedBy: pick(rng, ctx.staffUserIds),
        createdAt: event.at,
      })),
    });
  }

  if (chance(rng, ASSIGNMENT_CHANCE[plan.status])) {
    const assigneeCount = plan.status === "PENDING" || plan.status === "CANCELLED" ? 1 : randInt(rng, 1, 2);
    const assignees = pickDistinct(rng, ctx.teamMemberProfileIds, assigneeCount);
    await prisma.ticketAssignment.createMany({
      data: assignees.map((teamMemberId) => ({
        ticketId: ticket.id,
        teamMemberId,
        assignedBy: pick(rng, ctx.staffUserIds),
        assignedAt: laterBy(rng, plan.createdAt, 1, 24),
      })),
    });
  }

  const [minNotes, maxNotes] = NOTE_COUNT_RANGE[plan.status];
  const noteCount = randInt(rng, minNotes, maxNotes);
  if (noteCount > 0) {
    await prisma.ticketNote.createMany({
      data: Array.from({ length: noteCount }, () => ({
        ticketId: ticket.id,
        createdBy: pick(rng, ctx.staffUserIds),
        note: pick(rng, PROGRESS_NOTES),
        createdAt: randomDateBetween(rng, plan.createdAt, updatedAt),
      })),
    });
  }

  let paymentsCreated = 0;
  if (plan.status === "COMPLETED" && completedAt && chance(rng, 0.8)) {
    const receivedBy = pick(rng, ctx.staffUserIds);
    const originalAmount = randInt(rng, 6, 160) * 50; // 300 - 8000 BDT, in round 50s
    const originalMethod = pickWeighted(rng, PAYMENT_METHOD_WEIGHTS);
    const receivedAt = laterBy(rng, completedAt, 0, 6);

    const payment = await prisma.payment.create({
      data: {
        ticketId: ticket.id,
        amount: originalAmount,
        paymentMethod: originalMethod,
        receivedBy,
        receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      },
    });
    await prisma.paymentAuditLog.create({
      data: {
        paymentId: payment.id,
        ticketId: ticket.id,
        action: "CREATED",
        newAmount: originalAmount,
        newPaymentMethod: originalMethod,
        changedBy: receivedBy,
        createdAt: receivedAt,
      },
    });
    paymentsCreated++;

    // A realistic slice of payments get corrected after the fact (a typo, a discount applied late, etc.).
    if (chance(rng, 0.1)) {
      const correctedAmount = Math.max(50, originalAmount + (chance(rng, 0.5) ? 1 : -1) * randInt(rng, 1, 6) * 50);
      const correctedAt = laterBy(rng, receivedAt, 24, 48);
      const correctedBy = pick(rng, ctx.staffUserIds);

      await prisma.payment.update({
        where: { id: payment.id },
        data: { amount: correctedAmount, updatedAt: correctedAt },
      });
      await prisma.paymentAuditLog.create({
        data: {
          paymentId: payment.id,
          ticketId: ticket.id,
          action: "UPDATED",
          oldAmount: originalAmount,
          newAmount: correctedAmount,
          oldPaymentMethod: originalMethod,
          newPaymentMethod: originalMethod,
          changedBy: correctedBy,
          createdAt: correctedAt,
        },
      });
    }
  }

  return { paymentsCreated };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
