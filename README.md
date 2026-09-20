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
