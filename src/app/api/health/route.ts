import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/observability/logger";

export const runtime = "nodejs";

/**
 * Liveness/readiness probe for a load balancer or orchestrator (see
 * DEPLOYMENT.md "Monitoring"). Deliberately unauthenticated — it reveals
 * nothing beyond "the app can reach its database", and requiring a session
 * cookie would defeat the point for a machine-to-machine health check.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logger.error("app.health_check_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
