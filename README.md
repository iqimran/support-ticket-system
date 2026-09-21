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
