# Deployment

Operational guide for running this application in production. See
[DATABASE.md](DATABASE.md) for schema/migration internals and
[SECURITY.md](SECURITY.md) for the security model this deployment relies on.

## 1. Environment variables

Validated at startup by `src/lib/env.ts` (Zod) — the app refuses to boot
rather than run with a missing or malformed value. See `.env.example` for
the canonical list with generation instructions.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL connection string. See "PostgreSQL setup" below. |
| `NODE_ENV` | Always | `production` in production. Next.js sets this automatically for `next build`/`next start`; do not override it. |
| `SESSION_SECRET` | Always | 32+ random characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Rotating it invalidates every existing session (their stored HMAC hashes no longer match). |
| `ARCHIVE_JOB_SECRET` | **Production: required.** Optional elsewhere. | 32+ random characters, generated the same way. Bearer token the scheduler sends to `GET /api/cron/archive`. See "Scheduled archive job" below. |
| `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Development only | Used by `prisma/seed.ts`. Never set these in a production environment — see "Seed process" below. |

`ARCHIVE_JOB_SECRET` being required in production applies at **build time**,
not just runtime: `next build` evaluates route configuration for every
route, including `/api/cron/archive`, which imports `src/lib/env.ts`. A
production build (`NODE_ENV=production`, which `next build` sets
automatically) will fail fast with a clear Zod error if `ARCHIVE_JOB_SECRET`
isn't present in the build environment — set it there, not only on the
running server.

## 2. PostgreSQL setup

- Postgres 14+ (the schema uses standard `Decimal`/`Json` types and advisory
  locks — nothing version-exotic, but this is the minimum actually tested).
- No extensions required.
- Create a dedicated database and a role scoped to it:
  ```sql
  CREATE DATABASE cctv_support_ticket_system;
  CREATE USER app_user WITH PASSWORD '...';
  GRANT ALL PRIVILEGES ON DATABASE cctv_support_ticket_system TO app_user;
  ```
- Point `DATABASE_URL` at it: `postgresql://app_user:...@host:5432/cctv_support_ticket_system?schema=public`.
- Enable TLS (`?sslmode=require`, or your host's equivalent) for any
  connection that crosses a network boundary — this database holds
  financial records and PII (customer names/phone numbers).
- Connection pooling: Prisma opens its own connection pool per running
  instance. If deploying multiple instances (see SECURITY.md's login
  rate-limit caveat for a related multi-instance note), size Postgres's
  `max_connections` for `instances × pool_size`, or put a pooler (PgBouncer,
  or your host's built-in pooler) in front.

## 3. Database migration

Production uses **`prisma migrate deploy`** only:

```bash
npm run prisma:migrate:deploy
```

This applies every committed-but-unapplied migration under
`prisma/migrations/` in order, and does nothing else — it never generates a
new migration, never prompts, and never resets data. Run it:

- Before starting the new build's server processes, as part of your deploy
  pipeline (see "Updating the application" below for exact ordering).
- Against the real production `DATABASE_URL` — get this step's target
  right; it is the one command in this whole document that changes
  production schema.

Never run `prisma migrate dev` or `prisma db push` against production —
both are development commands that can drop and recreate data to reconcile
schema drift.

## 4. Seed process (development only)

`prisma/seed.ts` generates a large, deterministic, realistic dataset for
local development — see [README.md](README.md#development-database-seeding)
for what it creates and why it's deterministic.

```bash
npm run prisma:reseed   # drop, re-migrate, and seed a LOCAL dev database
```

**This must never run against a production or staging database that holds
real customer/ticket/payment data.** It is not designed to be idempotent
against pre-existing production data (`prisma:reseed` starts by dropping the
database outright), and its `SEED_ADMIN_*` credentials are meant to be
changed immediately in any environment beyond a developer's own machine. A
production database gets its first `ADMIN` user via a one-off script or
direct `INSERT` you write and run once, by hand, against that environment
specifically — not via this seed script.

## 5. Build command

```bash
npm run build
```

Runs `next build` (Turbopack). Requires every variable in the "Environment
variables" table above to be present in the **build** environment (not just
the runtime environment) — see the `ARCHIVE_JOB_SECRET` note there. The
build also runs the full TypeScript check as part of route-type generation;
a type error fails the build, not just `npm run typecheck`.

## 6. Start command

```bash
npm run start
```

Runs `next start`, serving the build produced by step 5. Respects the
standard `PORT` (default `3000`) and `HOSTNAME` (default `0.0.0.0`)
environment variables if your host needs a non-default bind address/port.
Run `npm run prisma:migrate:deploy` (step 3) before this, every deploy — an
out-of-date schema is a broken deploy, not a soft-fail.

## 7. Scheduled archive job

`runArchiveJob()` (`src/features/archive/service.ts`) moves tickets older
than the 3-month retention window into the archive tables. It is **not**
triggered by anything inside the running app — an external scheduler must
call it, once a day:

```
GET /api/cron/archive
Authorization: Bearer <ARCHIVE_JOB_SECRET>
```

The route checks that bearer token with a constant-time comparison and
returns `401` for anything else, including a request with no
`ARCHIVE_JOB_SECRET` configured — a misconfigured deployment fails closed.

Pick **one**, depending on where this app is hosted:

- **Vercel** — add a `vercel.json` at the repo root:
  ```json
  { "crons": [{ "path": "/api/cron/archive", "schedule": "0 3 * * *" }] }
  ```
  Vercel signs its own cron requests with a `CRON_SECRET` it manages — set
  `ARCHIVE_JOB_SECRET` to the same value as `CRON_SECRET`.
- **A server you control** (systemd timer / crontab):
  ```cron
  0 3 * * * curl -fsS -H "Authorization: Bearer $ARCHIVE_JOB_SECRET" https://your-domain/api/cron/archive
  ```
  Load the secret from the same secrets store the app itself uses, not
  hardcoded in the crontab line.
- **GitHub Actions** — a workflow with a `schedule: - cron: "0 3 * * *"`
  trigger running the same `curl`, with `ARCHIVE_JOB_SECRET` stored as a
  repository secret.

**Monitor it** via Archive Monitor (`/admin/archive`, admin-only) — last
run's status, tickets found/archived, duration, and any error, read from the
authoritative `ArchiveBatch` table — and via the `archive.job_*` structured
log events (see "Monitoring" below and SECURITY.md's Observability table).
A run that never completes (stuck `RUNNING`) or repeated `archive.job_failed`
events both warrant paging someone, not just checking the UI once a week.

## 8. Backup strategy

- **What to back up**: the entire Postgres database. There is no
  supplementary data store — every business record (including archived
  tickets, which stay in the same database, just different tables) lives in
  Postgres.
- **How**: `pg_dump` in custom format, so a restore can be selective/parallel
  if ever needed:
  ```bash
  pg_dump -Fc --no-owner -f "backup_$(date +%Y%m%d_%H%M%S).dump" "$DATABASE_URL"
  ```
- **Frequency**: at minimum, a nightly full backup, retained for a rolling
  window (30 days is a reasonable starting point) plus a small number of
  longer-retained monthly snapshots. Financial data (`Payment`,
  `PaymentAuditLog`) and its archive counterparts are the highest-value
  tables in this database — losing them is worse than losing anything else
  here.
- **Where**: store backups off the database host itself (object storage —
  S3 or equivalent — with versioning/lifecycle rules), encrypted at rest.
  Never leave the only copy of a backup on the same disk/instance as the
  live database.
- If your Postgres host offers managed continuous backup / point-in-time
  recovery (RDS, Cloud SQL, Supabase, etc.), prefer enabling that over a
  hand-rolled `pg_dump` cron — it covers "restore to 20 minutes before the
  bad deploy" in a way a nightly dump alone cannot.

## 9. Restore strategy

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backup_20260101_030000.dump
```

After restoring:

1. Run `npx prisma migrate status` against the restored database and
   confirm it reports every migration as applied. A backup taken between
   two migrations, restored after a newer migration was already applied
   elsewhere, is the one scenario worth explicitly checking for.
2. Hit `GET /api/health` (see "Monitoring" below) and confirm `200 { status:
   "ok" }` before pointing traffic at it.
3. Spot-check Archive Monitor (`/admin/archive`) and the payment audit log
   for a period around the restore point — these are the two areas where a
   subtly-wrong restore point would be most consequential to notice late.

**Test the restore procedure periodically** against a non-production
database — a backup strategy that has never been exercised as a *restore*
is unverified. Point-in-time recovery (if your host supports it) is
generally the safer default over a nightly dump for minimizing data loss;
either way, know your actual recovery point objective (how much data you
could lose) and recovery time objective (how long a restore takes) before
you need them for real.

## 10. Monitoring

- **Structured logs**: every server process writes single-line JSON to
  stdout/stderr (`src/server/observability/logger.ts`) — see SECURITY.md's
  "Observability" table for the full event list. Point your host's log
  collector (CloudWatch, Vercel's own log drain, Datadog, etc.) at stdout;
  no additional log-shipping code is needed since these are already
  line-delimited JSON.
- **What to alert on**, roughly in priority order:
  - `app.unhandled_error` (level `error`) — an uncaught exception anywhere
    server-side. Any occurrence is worth knowing about; a spike is worth
    paging on.
  - `archive.job_failed` (level `error`) — the daily archive job failed
    outright, or a run that should have happened didn't (no
    `archive.job_started`/`archive.job_succeeded` pair in the last ~26
    hours is itself a signal, independent of any explicit failure event).
  - `app.health_check_failed` — the app can't reach its database.
  - A sustained rate of `auth.login_failed` (especially many for the same
    masked phone, or `auth.login_rate_limited` firing repeatedly) —
    possible credential-stuffing attempt against a specific account.
- **Health check**: `GET /api/health` — unauthenticated, checks database
  connectivity (`SELECT 1`), returns `200 { status: "ok" }` or
  `503 { status: "error" }`. Point your load balancer's/orchestrator's
  liveness or readiness probe at this.
- **Business-level monitoring**: Archive Monitor (`/admin/archive`) and the
  Payment Audit Log (`/admin/payment-audit`) are admin UI, not
  machine-readable monitoring, but are the right place for a human to
  spot-check that the archive job and financial records look right —
  worth a periodic (weekly, say) manual glance in addition to automated
  alerting.

## 11. Updating the application

Standard order for a deploy that includes a schema change (the safe order
covers every deploy, including ones with no schema change):

1. Build the new version (step 5) against the target environment's
   variables.
2. Run `npm run prisma:migrate:deploy` (step 3) **before** starting any
   process running the new code. Prisma migrations in this project are
   written to be applied before the new code that depends on them runs; the
   project does not currently maintain a formal backward-compatible-migration
   window (e.g. expand/contract) for zero-downtime schema changes, so a
   brief overlap between "new migration applied" and "old code still
   running against it" should be treated as a real (if usually harmless)
   possibility, not assumed away.
3. Start the new process(es) (step 6).
4. Confirm `GET /api/health` returns `200` and skim recent logs for
   `app.unhandled_error` before considering the deploy complete.
5. Only after the new version is confirmed healthy, terminate old
   process(es) (if your deploy strategy runs old and new side-by-side during
   the rollout).

**Rolling back**: revert to the previous build and restart (step 3 again
with the old artifact). If the deploy being rolled back included a forward
migration that the previous code version is incompatible with, a rollback
is a database decision, not just a code one — restoring the previous
migration state generally means restoring from backup (see "Restore
strategy") rather than attempting to hand-write a down-migration, since
none are authored for this project's migrations.
