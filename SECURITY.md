# Security

This is an internal business tool used by a small number of staff accounts
(admins and CCTV support team members) — there is no public signup, and
every route requires authentication. This document covers how authentication,
authorization, sessions, secrets, and financial data are protected, plus the
known, deliberate trade-offs.

## Authentication

- Login is phone + password (`src/features/auth/actions.ts`). Passwords are
  hashed with bcrypt at cost factor 12 (`src/server/auth/password.ts`) —
  never stored or logged in plaintext anywhere, including in the structured
  operational logs (see "Observability" below).
- The error for "no such account", "account deactivated", and "wrong
  password" is **identical** on purpose (`"Invalid phone or password."`) —
  distinguishing them to the caller would let an attacker enumerate which
  phone numbers have accounts. The distinction *is* recorded server-side
  (see "Observability") for legitimate debugging/monitoring, since that
  never reaches the client.
- **Login rate limiting** (`src/server/auth/rate-limit.ts`): after 5 failed
  attempts against the same phone number within 15 minutes, further
  attempts are rejected with a distinct "too many attempts" message (safe to
  distinguish — it fires the same way whether or not the phone number has an
  account, so it leaks nothing about account existence). The counter clears
  on a successful login.
  - **Known limitation**: this is an in-memory, single-process counter, not
    a distributed one. Behind more than one running instance, each instance
    counts independently, so the effective limit scales with instance
    count. It also resets on every restart/deploy. This is an accepted
    trade-off for a small internal tool; if this app is ever deployed with
    more than one instance, replace it with a shared store (Redis or
    equivalent) — the call sites in `features/auth/actions.ts` would not
    need to change.

## Sessions

- A session is a random 32-byte token (`src/server/auth/session.ts`),
  handed to the browser as an `httpOnly`, `secure` (in production),
  `sameSite: lax` cookie (`src/server/auth/cookies.ts`). It is **never**
  readable by client-side JavaScript.
- Only an **HMAC-SHA256 hash** of the token (keyed by `SESSION_SECRET`) is
  stored in the `Session` table — a database leak alone does not hand out
  replayable session tokens, since the raw token that hashes to a given row
  is never stored anywhere.
- Sessions expire after 7 days server-side (`Session.expiresAt`, checked on
  every `validateSessionToken` call) and are deleted outright on logout
  (`invalidateSessionToken`) — not just cleared from the cookie.
- A deactivated account (`User.isActive = false`) is rejected by
  `validateSessionToken` even if its session hasn't expired yet, so
  deactivating a user immediately invalidates every session they're
  currently holding, without needing to enumerate and delete their sessions
  first.
- **Known limitation**: there is no session rotation on privilege change
  (e.g. a role change while a session is active keeps using the old
  session row, though `validateSessionToken` re-reads the user's *current*
  role on every request, so a role change does take effect immediately —
  what doesn't happen is issuing a fresh token). Given the small, trusted
  user base and 7-day expiry, this has been judged acceptable.

## Authorization

Enforced **server-side only**, in this order of trust:

1. `src/proxy.ts` (Next's middleware) redirects an unauthenticated request
   to `/login` and an authenticated `TEAM_MEMBER` away from `/admin`,
   `/team-members`, and `/reports` — but this is explicitly documented in
   the file itself as a **UX-only fast path, not the security boundary**.
2. Every page, layout, server action, and route handler calls
   `requireAuth()` / `requireAdmin()` / `requireTeamMember()`
   (`src/server/authorization/require.ts`) itself, regardless of what the
   proxy already did. `requireAdmin()` uses `notFound()` rather than a
   redirect specifically so a non-admin hitting an admin-only route
   (including the payment-audit pages) can't distinguish "doesn't exist"
   from "exists but you can't see it".
3. Fine-grained rules live in `src/server/authorization/permissions.ts` —
   e.g. a `TEAM_MEMBER` may remove only their own ticket assignment; an
   `ADMIN` may remove any. These are checked in the service layer
   (`src/features/tickets/service.ts`), not just hidden in the UI, so a
   crafted request can't bypass them by skipping the button that would
   normally be hidden.

**Rule for any new page/action**: never rely on the proxy or a hidden UI
element as the only access control. Call the appropriate `require*()`
function first, and add a `permissions.ts` check if the rule is more
specific than "any authenticated staff member" / "admin only".

## Secrets

- All required environment variables are validated at startup via a Zod
  schema (`src/lib/env.ts`) — the app fails to boot with a clear message
  rather than running with an unset or malformed secret.
- `SESSION_SECRET` and `ARCHIVE_JOB_SECRET` must both be 32+ characters.
  `ARCHIVE_JOB_SECRET` is required in production (enforced by the same
  schema) but optional in development/test/CI, where the cron route simply
  isn't exercised.
- Neither secret is ever `NEXT_PUBLIC_`-prefixed or referenced from any
  Client Component — both are server-only by construction, not just by
  convention.
- `/api/cron/archive` compares its bearer token with **constant-time**
  comparison (`node:crypto`'s `timingSafeEqual`), and refuses every request
  if `ARCHIVE_JOB_SECRET` isn't configured at all — a misconfigured
  deployment fails closed, never open. See DEPLOYMENT.md for how this
  secret is provisioned per hosting target.
- `.env` is git-ignored (`.gitignore`); `.env.example` documents every
  variable's shape without real values. Never commit a real secret to
  either file or anywhere else in the repository.

## Financial data protection

- Payments are **never physically deleted or overwritten** — a correction
  goes through `updatePayment`, which writes a new `PaymentAuditLog` row
  capturing the old and new values in the same transaction as the update
  (`src/features/payments/service.ts`). The DB schema makes this structural:
  `PaymentAuditLog.paymentId → Payment` is `onDelete: Restrict`, so once a
  payment has an audit trail (immediately, on creation), it is impossible
  to delete that payment at the database level, regardless of what the
  application code does or a future bug might attempt.
- All money fields are `Decimal(12, 2)` in Postgres, never `Float`/`Double`
  anywhere in the schema or application code — no floating-point rounding
  risk on financial totals.
- `PaymentAuditLog` (and its archive counterpart) is readable only by
  `ADMIN` (`canViewPaymentAudit` in `permissions.ts`, enforced by
  `requireAdmin()` on every payment-audit page and CSV export route) — a
  `TEAM_MEMBER` can see that a payment exists and its current value, but not
  the correction history.
- Payment creation is gated on ticket state (`ticket.status === "COMPLETED"`)
  at the service layer, not just the UI, so a direct request against the
  server action can't record a payment against a ticket that isn't
  actually completed.
- Every payment create/update is mirrored to the structured operational log
  (see below) in addition to `PaymentAuditLog`, specifically because
  financial events warrant visibility beyond "queryable in the database if
  someone thinks to look."

## Observability

Structured, single-line-JSON operational logs go to stdout/stderr via
`src/server/observability/logger.ts` — see that file's doc comment for how
this differs from `AuditLog` (a permanent, queryable business record) and
`PaymentAuditLog`. Current coverage:

| Category | Events | Level |
| --- | --- | --- |
| Authentication failures | `auth.login_failed` (with a `reason`: invalid input, no such account, inactive account, or wrong password), `auth.login_rate_limited` | `warn` |
| Authentication success | `auth.login_succeeded`, `auth.logout` | `info` |
| Critical errors | `app.unhandled_error` — every uncaught error from a Server Component, Route Handler, Server Action, or the proxy, via `src/instrumentation.ts`'s `onRequestError` hook | `error` |
| Archive runs | `archive.job_started`, `archive.job_succeeded`, `archive.job_failed`, `archive.job_skipped` (already running), `archive.ticket_failed` (one ticket within a run) | `info`/`warn`/`error` |
| Payment changes | `payment.recorded`, `payment.record_rejected`, `payment.updated`, `payment.update_rejected` | `info`/`warn` |
| System health | `app.health_check_failed` (from `/api/health`) | `error` |

**What is never logged**: passwords, session tokens, or full phone numbers.
Phone numbers are masked to `+880******5678` form (`maskPhone` in the logger
module) before being passed to any log call. As a defense-in-depth backstop
— not the primary guarantee, which is call-site discipline — the logger
also redacts any field whose *key* looks like a credential (`password`,
`token`, `secret`, `cookie`, `authorization`, etc., case-insensitively)
regardless of what value was passed.

Ticket lifecycle events (created, status changed, assigned, note added) are
intentionally **not** duplicated into this stream — they already have a
permanent, queryable record in `AuditLog`, and mirroring every business
mutation into stdout logs as well would mostly add noise. The categories
above were chosen because they previously had no operational visibility at
all (auth failures, unhandled errors) or because they specifically warrant
extra scrutiny beyond the database (financial changes, a scheduled job with
no human watching it fire).

See DEPLOYMENT.md's "Monitoring" section for what to actually do with these
logs in production (what to alert on, where they end up depending on host).

## Known limitations / accepted risks

- No distributed rate limiting (see "Sessions" — actually "Authentication"
  above) if scaled beyond one instance.
- No session rotation on role change (see "Sessions").
- No 2FA / MFA. Judged unnecessary for the current scale (a handful of
  known staff accounts) but would be the next authentication hardening step
  if the user base grows or the threat model changes.
- No CSRF token beyond what Next.js Server Actions provide by default
  (same-origin `Origin`/`Referer` checking built into the framework) — no
  additional CSRF middleware has been added on top.

## Reporting a vulnerability

This is an internal system with no public-facing bug bounty. If you find a
security issue, report it directly to the project maintainer rather than
opening a public issue.
