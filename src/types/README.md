# Types

Shared TypeScript types/interfaces used across multiple features
(e.g. pagination envelope, role enum, API result wrapper).

Types that belong to a single feature should live in that feature's
`types.ts` instead of here. Prisma model types are generated into
`src/generated/prisma` and re-exported from `src/server/db` where needed.
