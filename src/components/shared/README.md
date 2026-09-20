# Shared components

Reusable, presentation-only components used across multiple features
(e.g. paginated data table shell, status badge, page header, empty states).

- `src/components/ui` — shadcn/ui primitives (generated, low-level).
- `src/components/shared` — app-level compositions built on top of `ui/`.

Components here must not contain business logic, data fetching, or
authorization decisions — those belong in `src/features/*` and `src/server/*`.
