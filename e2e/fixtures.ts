// Plain constants only — no Prisma/DB imports here. Playwright's own
// config/spec transform can't parse the generated (ESM-only) Prisma client,
// so anything that touches Prisma lives in seed-fixtures.ts and runs as a
// separate tsx subprocess from global-setup.ts instead.
export const E2E_ADMIN = { phone: "01900000011", password: "E2E-Admin-Pass-1!" };
export const E2E_TEAM_MEMBER = { phone: "01900000012", password: "E2E-Team-Pass-1!" };
