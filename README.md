# CCTV Support Ticket Management System

Production-oriented support ticket management system for a CCTV service
business: customer management, ticket lifecycle and assignment, service
charge/payment recording with audit history, dashboards/reports, and an
automatic 3-month active/archive data window.

See also: [DEPLOYMENT.md](DEPLOYMENT.md) (environment variables, build/start,
scheduled jobs, backup/restore, monitoring), [DATABASE.md](DATABASE.md)
(schema, migrations, indexes, archive integrity), and
[SECURITY.md](SECURITY.md) (authentication, authorization, secrets,
financial-data protection).

## Stack

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui
- PostgreSQL + Prisma ORM
- Zod for input validation
- Vitest + React Testing Library (unit/component tests)
- Playwright (end-to-end tests)

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env file and point it at a local PostgreSQL database:
   ```bash
   cp .env.example .env
   ```
3. Generate the Prisma client:
   ```bash
   npm run prisma:generate
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Script                  | Purpose                                    |
| ------------------------ | ------------------------------------------- |
| `npm run dev`            | Start the Next.js dev server               |
| `npm run build`          | Production build                           |
| `npm run start`          | Start the production server                |
| `npm run lint`           | ESLint                                     |
| `npm run typecheck`      | TypeScript, no emit                        |
| `npm test`               | Run unit/component tests once (Vitest)     |
| `npm run test:watch`     | Vitest in watch mode                       |
| `npm run test:coverage`  | Vitest with coverage report                |
| `npm run e2e`            | Playwright end-to-end tests                |
| `npm run prisma:generate`| Regenerate the Prisma client               |
| `npm run prisma:migrate` | Create/apply a **dev** migration (never in production — see DATABASE.md) |
| `npm run prisma:migrate:deploy` | Apply committed migrations in **production** (see DEPLOYMENT.md) |
| `npm run prisma:studio`  | Open Prisma Studio                         |
| `npm run prisma:seed`    | Seed dev data into the current database (fails if it's already seeded — see below) |
| `npm run prisma:reseed`  | **Reset and reseed**: drops the dev database, reapplies every migration, then seeds fresh realistic data |

## Project structure

```
src/
  app/                  Next.js routes (App Router): tickets, customers,
                         team members, dashboard, reports, archive, admin,
                         plus api/ route handlers (CSV export, cron, health)
  components/
    ui/                 shadcn/ui primitives
    shared/             reusable, presentation-only components (DataTable,
                         StatCard, empty/loading states, etc.)
  features/             vertical slices: auth, customers, tickets,
                         payments, dashboard, archive, audit, reports,
                         team-members — each with its own schemas
                         (Zod), repository (raw queries), service
                         (business logic/transactions), and actions
                         (server actions) where applicable
  server/
    db/                 Prisma client singleton + error helpers
    auth/               password hashing, session issuance/validation,
                         cookies, login rate limiting
    authorization/      require*() gates + fine-grained permission checks
    audit/              AuditLog (permanent business-event trail)
    observability/      structured operational logger (see SECURITY.md)
  lib/                  cross-cutting utilities (env validation, phone
                         normalization, date/money formatting, CSV)
  instrumentation.ts    server-side critical-error logging hook
  proxy.ts              auth/role fast-path (not the security boundary —
                         see SECURITY.md)
  types/                shared TypeScript types
  generated/prisma/     generated Prisma client (do not edit)
prisma/
  schema.prisma         database schema — see DATABASE.md
  migrations/           applied migrations, in order
  seed/, seed.ts         development-only seed data generator
e2e/                    Playwright end-to-end tests
```

## Architecture rules

- Business logic lives in `src/features/*` and `src/server/*`, never in UI
  components.
- All input is validated with Zod at the server boundary.
- Authorization is enforced server-side (`src/server/authorization`), never
  only in the UI.
- Multi-step writes use Prisma database transactions.
- Financial/audit records are never deleted; the archive system moves data
  out of the 3-month active window rather than discarding it.
- Ticket and archive lists are paginated at the query level — the UI never
  loads unbounded record sets.

## Testing

- **Unit and integration tests** both run via `npm test` (Vitest). Pure-logic
  tests (`phone.test.ts`, `csv.test.ts`, `schemas.test.ts`, etc.) need no
  database; most `service.test.ts`/`repository.test.ts`/`actions.test.ts`
  files are integration tests that exercise real Prisma queries and
  transactions against the database `DATABASE_URL` points at — see
  [DATABASE.md § Testing against this database](DATABASE.md#testing-against-this-database)
  for the shared-database caveat before adding new ones.
- **End-to-end tests** run via `npm run e2e` (Playwright). This builds and
  starts a production server (`playwright.config.ts`'s `webServer`) and
  drives it with a real browser, so a passing e2e run is also a real
  production-build smoke test. `e2e/global-setup.ts` seeds two fixture
  accounts (`e2e/fixtures.ts`) before the suite runs.
- Run `npm run lint && npm run typecheck && npm test && npm run e2e && npm run build`
  before considering any change ready to ship. There is no CI pipeline
  configured yet to enforce this automatically — it's a manual step.

## Database

The `DATABASE_URL` in `.env` must point to a PostgreSQL instance. See
[DATABASE.md](DATABASE.md) for the schema, migration workflow, indexing
rationale, and archive-integrity design, and
[DEPLOYMENT.md](DEPLOYMENT.md) for setting one up in production.

## Development database seeding

`prisma/seed.ts` (plus its helpers in `prisma/seed/`) generates a realistic,
deterministic development dataset — not the sparse handful of rows you'd get
from clicking through the UI a few times:

- 1 admin (`SEED_ADMIN_PHONE`/`SEED_ADMIN_PASSWORD`/`SEED_ADMIN_NAME` in
  `.env`, same as before) + 5 team members (one deliberately deactivated, to
  exercise "historical assignment to a now-inactive team member"). All 5
  team members log in with the phone printed by the seed script and the
  password `ChangeMe123!`.
- 120+ customers with synthetic Bangladeshi-style names, phone numbers, and
  addresses — common name components, never a real person's identity.
- 1,380+ tickets covering realistic CCTV problems (camera offline, DVR not
  recording, NVR storage full, blurry image, power/network issues, HDD/camera
  replacement, mobile app configuration, playback issues, and more), each
  with a plausible assignment/status-history/notes/payment trail: at least
  100 pending/in-progress, 500 completed, 200 cancelled (all in the active
  3-month window), and 500+ more that are old enough to have been swept into
  archive storage by the **real** `runArchiveJob()` — not a hand-copied
  imitation of it — so the seeded archive data is guaranteed consistent with
  whatever the actual archive pipeline does.
- Payments on most completed tickets, with a realistic slice later corrected
  (an `UPDATED` `PaymentAuditLog` entry alongside the original `CREATED` one).

**Deterministic**: every random choice goes through a seeded PRNG
(`prisma/seed/random.ts`), never `Math.random()`, and the whole script is
anchored to a fixed reference "now" rather than the real clock. Resetting and
reseeding twice in a row produces byte-for-byte identical customers, tickets,
dates, and text every time — verified by diffing two consecutive runs.

**To reset and reseed:**

```bash
npm run prisma:reseed
```

This drops the database, reapplies every migration, and runs the seed
script automatically (via Prisma's own `migrate reset`, configured in
`prisma.config.ts`). It's destructive — run it only against your local dev
database, never anything shared or production. `npm run prisma:seed` alone
(without a reset first) will fail with unique-constraint errors if the
database already has this seed data in it; it's only meant to run once
against a freshly migrated, empty database.

Integration tests share this same dev database (see `vitest.config.mts`), so
after seeding it always contains this full dataset in the background — any
test that lists/searches/counts rows without scoping to its own fixtures
will see it. Existing tests already account for this (filter or scope by
known ids rather than asserting exact global totals); follow the same
pattern in new tests.

## Scheduled jobs

`src/features/archive/service.ts`'s `runArchiveJob()` moves tickets older
than the 3-month retention window into the archive tables. It is **not**
triggered by anything inside this app — see
[DEPLOYMENT.md § Scheduled archive job](DEPLOYMENT.md#7-scheduled-archive-job)
for how to trigger it in production (Vercel Cron, a plain crontab, or
GitHub Actions) and how to monitor it.

## Observability, security, and operations

Structured operational logging, health checks, authentication/session
design, and financial-data protection are documented in
[SECURITY.md](SECURITY.md). Backup/restore, monitoring, and the
build/deploy/update process are documented in [DEPLOYMENT.md](DEPLOYMENT.md).
