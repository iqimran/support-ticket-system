# Server

Server-only code. Nothing here may be imported from a Client Component.

- `db/` — Prisma client singleton and database access helpers.
- `auth/` — session/identity resolution for Admin and Support Team users.
- `authorization/` — role-based permission checks (e.g. `can(user, action, resource)`),
  called from server actions and route handlers before any mutation or sensitive read
  (financial audit data, payment history) is served.

All authorization and validation must happen here, not in the UI layer.
