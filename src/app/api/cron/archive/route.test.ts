// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

const TEST_SECRET = "test-archive-job-secret-0123456789abcdef";
process.env.ARCHIVE_JOB_SECRET = TEST_SECRET;

// Both imported after the env var is set — a static import of anything
// touching @/lib/env (prisma.ts does) would run before this file's own
// top-level code, freezing `env.ARCHIVE_JOB_SECRET` as unset.
const { GET } = await import("./route");
const { prisma } = await import("@/server/db/prisma");

const cleanupBatchIds: string[] = [];

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/archive", { headers });
}

afterAll(async () => {
  if (cleanupBatchIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { entityType: "ArchiveBatch", entityId: { in: cleanupBatchIds } } });
    await prisma.archiveBatch.deleteMany({ where: { id: { in: cleanupBatchIds } } });
  }
});

describe("GET /api/cron/archive", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await GET(makeRequest({ authorization: "Bearer the-wrong-secret-entirely-0000000" }));
    expect(response.status).toBe(401);
  });

  it("rejects a non-bearer Authorization header", async () => {
    const response = await GET(makeRequest({ authorization: TEST_SECRET }));
    expect(response.status).toBe(401);
  });

  it("runs the archive job and returns its result when the secret is correct", async () => {
    const response = await GET(makeRequest({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(response.status).toBe(200);

    const body = await response.json();
    cleanupBatchIds.push(body.id);

    expect(["SUCCEEDED", "FAILED"]).toContain(body.status);
    expect(typeof body.ticketsFound).toBe("number");
    expect(typeof body.ticketsProcessed).toBe("number");

    const batch = await prisma.archiveBatch.findUnique({ where: { id: body.id } });
    expect(batch).not.toBeNull();
  });

  it("never echoes the secret or any env value back in the response body", async () => {
    const response = await GET(makeRequest({ authorization: `Bearer ${TEST_SECRET}` }));
    const body = await response.json();
    cleanupBatchIds.push(body.id);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(TEST_SECRET);
  });
});
