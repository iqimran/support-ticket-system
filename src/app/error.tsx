"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary (see node_modules/next/dist/docs/.../error.md).
 * The server-side event is already captured once by src/instrumentation.ts's
 * onRequestError — this console.error is only a client-side echo for
 * whoever has devtools open, not a second source of truth.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        An unexpected error occurred. Try again, and if it keeps happening, let an admin know
        {error.digest ? (
          <>
            {" "}
            with this reference: <span className="font-mono">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
