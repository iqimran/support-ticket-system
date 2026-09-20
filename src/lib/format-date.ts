import { BUSINESS_TIMEZONE } from "@/lib/timezone";

// Fixed locale, explicit timeZone. `.toLocaleDateString()`/`.toLocaleString()`
// without both of these depend on the runtime's ambient locale/timezone —
// which differs between the Node server (SSR) and the browser (hydration),
// causing "Hydration failed because the server rendered text didn't match
// the client" for every Client Component that formats a date this way.
const LOCALE = "en-GB";

export function formatDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function formatDateTime(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
