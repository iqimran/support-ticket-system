# CCTV Support Ticket Management System

Production-oriented support ticket management system for a CCTV service
business: customer management, ticket lifecycle and assignment, service
charge/payment recording with audit history, dashboards/reports, and an
automatic 3-month active/archive data window.

> Status: project scaffolding only. No business features are implemented yet.

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
| `npm run prisma:migrate` | Create/apply a dev migration               |
| `npm run prisma:studio`  | Open Prisma Studio                         |
| `npm run prisma:seed`    | Seed dev data into the current database (fails if it's already seeded — see below) |
| `npm run prisma:reseed`  | **Reset and reseed**: drops the dev database, reapplies every migration, then seeds fresh realistic data |

## Project structure

```
src/
  app/                  Next.js routes (App Router)
  components/
    ui/                 shadcn/ui primitives
    shared/             reusable, presentation-only components
  features/             vertical slices: auth, customers, tickets,
                         payments, dashboard, archive, audit
  server/
    db/                 Prisma client singleton
    auth/               session/identity resolution
    authorization/      role-based permission checks
  lib/                  cross-cutting utilities (env validation, etc.)
  types/                shared TypeScript types
  generated/prisma/     generated Prisma client (do not edit)
prisma/
  schema.prisma         database schema (models to be added)
e2e/                    Playwright tests
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

## Database

The `DATABASE_URL` in `.env` must point to a PostgreSQL instance. No schema
has been defined yet — `prisma/schema.prisma` currently only declares the
generator and datasource.

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

### Ticket archive job

`src/features/archive/service.ts`'s `runArchiveJob()` moves tickets older
than the 3-month retention window (plus every related assignment, status
history entry, note, payment, and payment audit log) into the `*_archive`
tables, in bounded batches, and is safe to call repeatedly — see that
file's doc comments for the transaction/locking/idempotency design.

It is **not** triggered by anything inside this app. In production, an
external scheduler must call it once a day:

```
GET /api/cron/archive
Authorization: Bearer <ARCHIVE_JOB_SECRET>
```

The route ([src/app/api/cron/archive/route.ts](src/app/api/cron/archive/route.ts))
checks that bearer token with a constant-time comparison and returns `401`
for anything else — including a request with no `ARCHIVE_JOB_SECRET`
configured at all, so a misconfigured deployment fails closed rather than
open. Set `ARCHIVE_JOB_SECRET` to a random 32+ character value (see
`.env.example`) and keep it out of version control and out of any
client-visible code — it is a server-only secret, never a
`NEXT_PUBLIC_`-prefixed variable, and the route never echoes it back.

Pick **one** of these to actually invoke it daily, depending on where this
app is hosted:

- **Vercel** — add a `vercel.json` at the repo root:

  ```json
  {
    "crons": [{ "path": "/api/cron/archive", "schedule": "0 3 * * *" }]
  }
  ```

  Vercel signs its own cron requests with a `CRON_SECRET` it manages for
  you and sends it as `Authorization: Bearer $CRON_SECRET` — set
  `ARCHIVE_JOB_SECRET` in the project's environment variables to the same
  value as `CRON_SECRET`.

- **A server you control (systemd timer / plain crontab)** — run:

  ```cron
  0 3 * * * curl -fsS -H "Authorization: Bearer $ARCHIVE_JOB_SECRET" https://your-domain/api/cron/archive
  ```

  Load `ARCHIVE_JOB_SECRET` from the same secrets store the app itself
  uses (e.g. an env file readable only by the cron user), not hardcoded in
  the crontab line.

- **GitHub Actions** (works from anywhere, no server needed) — a
  `.github/workflows/archive-cron.yml` with a `schedule: - cron: "0 3 * * *"`
  trigger that runs the same `curl` command, with `ARCHIVE_JOB_SECRET`
  stored as a repository secret and passed via `${{ secrets.ARCHIVE_JOB_SECRET }}`.

Whichever option is used, monitor the job via **Archive Monitor**
(`/admin/archive`, admin-only) rather than the scheduler's own logs — it
shows the last run's status, tickets found/archived, duration, and any
error, straight from the `ArchiveBatch` audit table, which is the
authoritative record regardless of which scheduler triggered the run.
