# Features

Feature-based modules. Each subfolder is a vertical slice of the domain and
owns its own UI, server actions, data-access queries, and Zod schemas so that
business logic stays out of `src/app` route files and out of UI components.

Conventional layout inside a feature folder (created as needed, not upfront):

```
features/<name>/
  components/   feature-specific UI (composes src/components/ui primitives)
  actions/      server actions / mutations (auth + validation + transactions)
  queries/      read-only server-side data access (pagination-aware)
  schemas/      Zod schemas for input validation
  permissions.ts role-based authorization rules for this feature
  types.ts      feature-local types
```

Current modules (structure only, no logic yet):

- `auth` — admin & support team authentication
- `customers` — customer management
- `tickets` — ticket lifecycle, assignment, status workflow
- `payments` — service charge/payment recording and audit history
- `dashboard` — aggregate views and reports
- `archive` — three-month active window + automatic archival + archive search
- `audit` — cross-cutting audit log read models
