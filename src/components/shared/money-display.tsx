import { cn } from "@/lib/utils";

// No locale/currency was specified by the business yet; BDT is a
// placeholder default based on the phone number formats seen elsewhere in
// this project. Override via the `currency` prop once confirmed.
const DEFAULT_CURRENCY = "BDT";

type MoneyDisplayProps = {
  amount: number | string;
  currency?: string;
  className?: string;
};

export function MoneyDisplay({ amount, currency = DEFAULT_CURRENCY, className }: MoneyDisplayProps) {
  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  const formatted = Number.isFinite(numericAmount)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(numericAmount)
    : "-";

  return (
    <span className={cn("tabular-nums", className)} title={formatted}>
      {formatted}
    </span>
  );
}
