import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SESSION_SECRET: z
      .string()
      .min(1)
      .catch(() => process.env.SESSION_SECRET || 'dummy-secret-for-build'),
    // Bearer token required by the /api/cron/archive route so only the
    // production scheduler (never a browser, never an unauthenticated
    // caller) can trigger the archive job. Not read by any client code —
    // deliberately not NEXT_PUBLIC_-prefixed. Optional outside production
    // so local dev/test/CI don't need it set.
    ARCHIVE_JOB_SECRET: z
      .string()
      .min(32, 'ARCHIVE_JOB_SECRET must be at least 32 characters')
      .optional(),
  })
  .refine((value) => value.NODE_ENV !== 'production' || !!value.ARCHIVE_JOB_SECRET, {
   // message: 'ARCHIVE_JOB_SECRET must be set (32+ chars) in production',
    //path: ['ARCHIVE_JOB_SECRET'],
  });

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ARCHIVE_JOB_SECRET: process.env.ARCHIVE_JOB_SECRET,
});
