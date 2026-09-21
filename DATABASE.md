# Database

PostgreSQL, accessed exclusively through Prisma (`prisma/schema.prisma`,
generated client at `src/generated/prisma/`). This document covers schema
design, migrations, indexing, integrity, and performance — see
[DEPLOYMENT.md](DEPLOYMENT.md) for the actual setup/backup/restore commands
and [SECURITY.md](SECURITY.md) for access-control and data-protection concerns.

## Schema overview

| Model | Purpose |
| --- | --- |
| `User` | Login identity + role (`ADMIN` \| `TEAM_MEMBER`). |
| `Session` | Server-side session record; the cookie holds an opaque token, only its HMAC hash is stored. |
| `TeamMember` | Business profile for a `TEAM_MEMBER` user (assignment target). Separate from `User` so a member can be taken off assignment rotation without disabling their login. |
| `Customer` | Deduplicated by normalized phone number (E.164, see `src/lib/phone.ts`). |
| `Ticket` | Never deleted or moved on archival — `archivedAt` is just a marker (see "Archive integrity" below). |
| `TicketAssignment` / `TicketStatusHistory` / `TicketNote` | Ticket child records. |
| `Payment` | Money actually received. Amounts are `Decimal(12,2)`, never `Float`, anywhere in the schema. |
| `PaymentAuditLog` | Append-only trail for every payment create/update. A `Restrict` FK back to `Payment` makes a payment's audit trail undeletable at the DB level. |
| `AuditLog` | General business-event log (login, ticket/customer mutations, archive runs). Free-form `action` string by design — see the schema doc comment — so new event types don't need a migration. |
| `ArchiveBatch` | One row per archive job invocation. |
| `TicketArchive` + 4 sibling `*Archive` tables | Cold copies of an archived ticket and everything that belonged to it. |

Every model carries a substantive doc comment directly in
`prisma/schema.prisma` explaining *why* it's shaped the way it is — read
those first; this file summarizes rather than repeats them.

## Migrations

Applied in order under `prisma/migrations/`:

1. `init_schema` — core tables (User, Customer, Ticket, and children).
2. `add_sessions` — the `Session` table.
3. `add_ticket_number_sequence` — a Postgres sequence backing
   `TKT-000123`-style ticket numbers, so uniqueness under concurrent ticket
   creation is guaranteed by the database, not by application-level
   check-then-insert logic.
4. `add_dashboard_indexes` — composite indexes added once the dashboard's
   actual query shapes were known (see "Indexes" below).
5. `add_ticket_archive_tables` — `ArchiveBatch` + the five `*Archive` tables.

**Development**: `npm run prisma:migrate` (wraps `prisma migrate dev`) —
creates and applies a new migration from your local schema changes.

**Production**: `npm run prisma:migrate:deploy` (wraps `prisma migrate
deploy`) — applies already-committed migrations only, never generates new
ones, and never prompts. This is the only migration command that should ever
run against a production database. See DEPLOYMENT.md's "Database migration"
section for exactly when to run it in a deploy.

Never hand-edit a database schema outside of a migration, and never run
`prisma migrate dev` (or `prisma db push`) against production — both can
create or reset data in ways `migrate deploy` deliberately cannot.

## Indexes

Every index in the schema is justified by a specific query, not added
speculatively:

- `Ticket`: `[createdAt]`, `[status, createdAt]`, `[customerId, createdAt]`,
  `[archivedAt]`, `[status, completedAt]` — covers the tickets list's default
  sort, status filtering, a customer's ticket history, "is this ticket
  archived", and the dashboard's completed-ticket-by-completion-date queries.
- `Session`: `[userId]`, `[expiresAt]` — session lookup by user, and cheap
  expired-session cleanup if that's ever added.
- `TicketAssignment`: a unique `[ticketId, teamMemberId]` (also see
  "Constraints") plus `[teamMemberId, ticketId]` and
  `[teamMemberId, assignedAt]` for "this team member's tickets" and
  team-stats aggregation.
- `TicketStatusHistory` / `TicketNote`: `[ticketId, createdAt]` — a ticket's
  own history/notes, in order, without a sort at read time.
- `Payment`: `[ticketId]`, `[receivedAt]`, `[receivedBy, receivedAt]` —
  a ticket's payments, date-range reporting, and per-team-member payment
  totals.
- `PaymentAuditLog`: `[paymentId]`, `[ticketId]`, `[createdAt]`.
- `AuditLog`: `[createdAt]`, `[entityType, entityId]`.
- `ArchiveBatch`: `[startedAt]`.
- `TicketArchive`: `[customerId]`, `[createdAt]`, `[archivedAt]` — mirrors the
  live `Ticket` indexes so historical search performs the same way active
  search does.
- Every archive child table indexes `[ticketId]` (or `[ticketId, createdAt]`
  where order matters), matching its live-table counterpart.

If a new page introduces a new filter/sort combination, check whether an
existing index covers it (`EXPLAIN ANALYZE` the query) before assuming one is
missing.

## Constraints and foreign keys

- `User.phone`, `Customer.phone`, `Ticket.ticketNumber`,
  `Session.tokenHash`, `TeamMember.userId` — all unique.
- `TicketAssignment` has a compound unique constraint on
  `[ticketId, teamMemberId]`: the database itself prevents assigning the
  same team member to the same ticket twice, even under concurrent requests
  (the application also pre-checks, but the constraint is the real
  guarantee — see `assignTeamMembers` in
  `src/features/tickets/service.ts`, which catches the resulting `P2002` and
  turns it into an `already_assigned` result rather than a 500).
- **Cascade behavior is deliberately not uniform** — it's chosen per
  relationship:
  - `Session.userId → User`: `onDelete: Cascade` — a deleted user's sessions
    are meaningless and should disappear with them. (In practice, users are
    deactivated via `User.isActive`, not deleted — see SECURITY.md — but the
    cascade is correct either way.)
  - `TeamMember.userId → User`: `onDelete: Cascade` — same reasoning.
  - Every FK from a live business record back to `Ticket` or `Payment`
    (`TicketAssignment`, `TicketStatusHistory`, `TicketNote`, `Payment`,
    `PaymentAuditLog`, and `Ticket.customerId`/`Ticket.createdBy` themselves)
    is `onDelete: Restrict`. Tickets, payments, customers, and the users who
    acted on them are never deleted through the application, so nothing
    should ever be capable of silently cascading that away — a `Restrict`
    FK turns "someone tries to delete a customer with tickets" into a loud
    database error instead of a quiet cascade of financial history.
  - Every FK *within* the archive tables (`TicketArchive`'s children back to
    `TicketArchive` itself) is `onDelete: Cascade` — once a ticket is
    archived, its archived children are logically inseparable from it, and
    there is no path in the application that deletes a `TicketArchive` row
    at all.
  - `AuditLog.actorId → User`: `onDelete: SetNull` — `actorId` is nullable
    specifically so the log entry survives (with an anonymized actor) even
    in a hypothetical future where users are hard-deleted rather than
    deactivated.
- `TicketArchive.customerId` / `TicketArchive.createdBy` and the equivalent
  columns on its sibling archive tables are **plain columns, not foreign
  keys** — see the doc comment on `TicketArchive` in `schema.prisma`.
  `Customer` and `User` are live, permanent tables that archiving never
  touches, so the id alone is a stable pointer without coupling the archive
  schema to tables it has no business referencing.

## Archive integrity

`runArchiveJob()` (`src/features/archive/service.ts`) moves a ticket older
than the retention cutoff — plus every assignment, status-history entry,
note, payment, and payment-audit-log row that belongs to it — into the
`*_archive` tables, and only then deletes the live originals. The whole
per-ticket operation is one database transaction with three properties worth
calling out explicitly, because they're what makes "the archive is
trustworthy" a guarantee rather than a hope:

1. **Copy-then-verify-then-delete, atomically.** Row counts read from the
   live tables are compared against row counts actually written to the
   archive tables *inside the same transaction*, before any live row is
   touched. A mismatch throws, which rolls back the entire transaction — the
   ticket is left completely untouched, never partially archived.
2. **Idempotent and retry-safe.** An archived ticket no longer exists in the
   live `Ticket` table, so re-running the job (whether from a schedule
   firing twice, a manual retry after a failure, or a scheduler that doesn't
   itself guarantee at-most-once delivery) simply finds nothing left to do
   for it. A ticket that failed to archive is retried from scratch on the
   next run.
3. **Single-flight across processes.** `claimArchiveRun` uses a Postgres
   transaction-scoped advisory lock (`pg_try_advisory_xact_lock`) to ensure
   at most one archive run is ever `RUNNING` at a time, even if two
   schedulers (or a manual trigger racing a scheduled one) fire at the same
   instant. A losing caller gets `{ status: "SKIPPED_ALREADY_RUNNING" }`
   immediately rather than queueing or racing the winner's transactions.

One bad ticket degrades a run to `FAILED` (recorded on `ArchiveBatch`, in
`AuditLog`, and in the structured operational log — see the "Observability"
section of SECURITY.md) without blocking every other ticket in that run —
see `runArchiveJob`'s doc comment for the per-page failure-isolation logic.

**Verifying archive integrity by hand**, if ever needed: for a given
archived ticket id, the row counts in `ticket_assignments_archive`,
`ticket_status_history_archive`, `ticket_notes_archive`,
`payments_archive`, and `payment_audit_log_archive` (all filtered by
`ticketId`) should equal what a support engineer would expect from that
ticket's history — and there should be no live-table row with that same id
in `Ticket`/`TicketAssignment`/etc. at all, ever, for an archived ticket.

## Performance

- **Pagination**: every list (tickets, customers, team members, archive
  search) is paginated at the query level (`skip`/`take` + a separate
  `count`), never fetched in full and sliced in memory.
- **Dashboard aggregation**: `src/features/dashboard/repository.ts` computes
  every figure via `prisma.count`/`groupBy`/`aggregate`, or a hand-written
  `$queryRaw` for the one shape (per-team-member stats across two different
  join paths) Prisma's query builder can't express as a single `groupBy` —
  never by loading rows into Node and reducing them there.
- **N+1 avoidance**: anywhere a list needs per-row related data (assigned
  team members and payment totals on a customer's ticket history; customer
  names on an archive search page), the related data is fetched in one
  batched `findMany`/`groupBy` with an `id IN (...)` filter and joined in
  memory via a `Map`, not with one query per row. See
  `src/features/customers/ticket-history.ts`'s `enrichPage` and
  `src/features/archive/repository.ts`'s `searchArchivedTickets` for the
  pattern.
- **Customer history across two sources**: a customer's support history
  spans both the live `Ticket` table and the archive. Rather than fetching
  everything from both and sorting in memory, each source returns its own
  top-N pre-sorted rows and a two-pointer merge combines them in O(n) — see
  `getCustomerSupportHistory` in `src/features/customers/ticket-history.ts`.
  **Known scaling limit**: this asks each source for the first
  `page × pageSize` rows on every request, so very deep pagination (page 100+)
  against a customer with an unusually large ticket count does more work
  than a true keyset-paginated query would. This has not been a problem at
  any realistic per-customer ticket volume; if it ever becomes one, the fix
  is keyset pagination on each source rather than a schema change.
- **Archive search**: paginated at the database level the same way the
  active ticket list is (see `searchArchivedTickets`), with customer
  name/phone matches resolved as a batched id lookup rather than an
  unindexed join across an unrelated table (see "Constraints" above for why
  `TicketArchive` has no real FK to `Customer` to join against in the first
  place).

## Testing against this database

Integration tests (`*.test.ts` files under `src/features/**/service.ts`,
`repository.ts`, `actions.ts`) run against a **real** Postgres database — the
same one `DATABASE_URL` points at — not a mock. There is currently no
per-test or per-worker database isolation; `vitest.config.mts` disables file
parallelism specifically because two test files' fixtures were observed to
transiently collide inside global, unscoped aggregate queries otherwise (see
that file's comment). New tests should scope assertions to their own fixture
ids rather than asserting exact global totals, matching the existing tests.

Do not point `DATABASE_URL` at a production database while running tests —
tests create and delete real rows.
