/**
 * Structured operational logging — one JSON object per line to stdout/stderr,
 * so a production log collector (CloudWatch, Vercel logs, Datadog, etc.) can
 * parse and index every field without a custom grok pattern. This is
 * separate from AuditLog (see src/server/audit/log.ts): AuditLog is a
 * permanent, queryable business record read from inside the app; this is a
 * transient operational stream read from outside it (a log viewer), and is
 * fine to lose or truncate.
 *
 * Never pass a field that could hold a credential — see REDACTED_KEYS below
 * for the defense-in-depth backstop, but the real guarantee has to be at the
 * call site: don't pass raw passwords, session tokens, or full phone numbers
 * (use maskPhone) into `fields`.
 */
export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "sessiontoken",
  "session",
  "cookie",
  "secret",
  "authorization",
]);

const REDACTED_VALUE = "[REDACTED]";

function redact(fields: LogFields | undefined): LogFields | undefined {
  if (!fields) return fields;

  let clone: LogFields | undefined;
  for (const key of Object.keys(fields)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      clone ??= { ...fields };
      clone[key] = REDACTED_VALUE;
    }
  }
  return clone ?? fields;
}

function write(level: LogLevel, event: string, fields?: LogFields): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(event: string, fields?: LogFields): void {
    write("info", event, fields);
  },
  warn(event: string, fields?: LogFields): void {
    write("warn", event, fields);
  },
  error(event: string, fields?: LogFields): void {
    write("error", event, fields);
  },
};

/**
 * Masks a Bangladeshi E.164 phone ("+8801712345678") to "+880******5678"
 * for log lines — enough to correlate repeated log entries or spot a pattern
 * across attempts without persisting a full customer/staff phone number in
 * plaintext log storage. Falls back to full redaction for anything too
 * short to mask meaningfully, rather than leaking an unrecognized value
 * verbatim.
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 8) return REDACTED_VALUE;
  const visibleStart = phone.slice(0, 4);
  const visibleEnd = phone.slice(-4);
  return `${visibleStart}${"*".repeat(6)}${visibleEnd}`;
}
