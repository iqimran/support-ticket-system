import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runArchiveJob } from "@/features/archive/service";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Constant-time bearer-token check against ARCHIVE_JOB_SECRET (server-side
 * only — never sent to the browser, never NEXT_PUBLIC_-prefixed). If the
 * secret isn't configured at all (e.g. a misconfigured non-production
 * environment), the endpoint refuses every request rather than falling
 * back to "no auth required".
 */
function isAuthorized(request: Request): boolean {
  if (!env.ARCHIVE_JOB_SECRET) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(env.ARCHIVE_JOB_SECRET);
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Entry point for the production scheduler (see README.md "Scheduled
 * jobs"). Never call this from client-side code — it exists purely for a
 * server-to-server cron trigger authenticated by a bearer secret.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runArchiveJob();

  if (result.status === "SKIPPED_ALREADY_RUNNING") {
    return NextResponse.json({ status: "skipped", reason: "already_running" });
  }

  return NextResponse.json({
    id: result.id,
    status: result.status,
    ticketsFound: result.ticketsFound,
    ticketsProcessed: result.ticketsProcessed,
    durationMs: result.completedAt ? result.completedAt.getTime() - result.startedAt.getTime() : null,
  });
}
