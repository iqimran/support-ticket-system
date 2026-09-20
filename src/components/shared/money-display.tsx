import { cn } from "@/lib/utils";

// No locale/currency was specified by the business yet; BDT is a
// placeholder default based on the phone number formats seen elsewhere in
// this project. Override via the `currency` prop once confirmed.
const DEFAULT_CURRENCY = "BDT";

// Fixed locale, not `undefined` — `Intl.NumberFormat(undefined, ...)` uses
// the runtime's ambient locale, which differs between the Node server
// (SSR) and the browser (hydration), causing a hydration mismatch in any
// Client Component that renders this. See src/lib/format-date.ts for the
// same issue with dates.
const LOCALE = "en-GB";

type MoneyDisplayProps = {
  amount: number | string;
  currency?: string;
  className?: string;
};

export function MoneyDisplay({ amount, currency = DEFAULT_CURRENCY, className }: MoneyDisplayProps) {
  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  const formatted = Number.isFinite(numericAmount)
    ? new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(numericAmount)
    : "-";

  return (
    <span className={cn("tabular-nums", className)} title={formatted}>
      {formatted}
    </span>
  );
}
