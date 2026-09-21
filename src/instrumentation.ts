import type { Instrumentation } from "next";

/**
 * Next's server-error hook (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md) —
 * fires for uncaught errors from Server Components, Route Handlers, Server
 * Actions, and the proxy (this app's middleware), which is every server
 * surface a bug could actually throw from. This is the single place
 * "critical errors" observability lives, instead of hand-wrapping every
 * server action and route handler in its own try/catch.
 *
 * Only dynamically imported inside the handler (not at module top level) so
 * this file — loaded once per server instance on boot, in both the Node and
 * Edge runtime — never pulls in the logger (and its dependency graph) for a
 * request that never errors, and never runs in the Edge runtime where the
 * logger's Node-only pieces wouldn't apply anyway.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { logger } = await import("@/server/observability/logger");

  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;

  logger.error("app.unhandled_error", {
    message: error instanceof Error ? error.message : String(error),
    digest,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
