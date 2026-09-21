"use client";

/**
 * Root-layout crash boundary — only fires if the root layout itself throws,
 * which src/app/error.tsx (nested inside the layout) cannot catch. Must
 * define its own <html>/<body> and doesn't inherit the root layout's
 * styles/fonts (see the Next.js docs), so it stays intentionally minimal
 * rather than depending on globals.css being available.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#6b7280", maxWidth: 420, margin: "0.75rem auto" }}>
          An unexpected error occurred. Try again, and if it keeps happening, let an admin know
          {error.digest ? ` with this reference: ${error.digest}` : ""}.
        </p>
        <button
          onClick={() => retry()}
          style={{ marginTop: "0.5rem", padding: "0.5rem 1rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#111827", color: "white" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
