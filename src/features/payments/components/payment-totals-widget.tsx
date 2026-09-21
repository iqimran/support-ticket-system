"use client";

import { useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { MoneyDisplay } from "@/components/shared/money-display";
import { getDateRangePaymentTotalAction } from "@/features/payments/actions";

type PaymentTotalsWidgetProps = {
  todayTotal: string;
  monthTotal: string;
};

export function PaymentTotalsWidget({ todayTotal, monthTotal }: PaymentTotalsWidgetProps) {
  const [range, setRange] = useState<DateRange | undefined>();
  const [rangeTotal, setRangeTotal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRangeChange(nextRange: DateRange | undefined) {
    setRange(nextRange);
    setRangeTotal(null);
    if (nextRange?.from && nextRange?.to) {
      const from = nextRange.from;
      const to = nextRange.to;
      startTransition(async () => {
        const result = await getDateRangePaymentTotalAction({ from, to });
        setRangeTotal("total" in result ? result.total : null);
      });
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="text-muted-foreground text-xs">Today</p>
          <p className="text-xl font-semibold sm:text-2xl">
            <MoneyDisplay amount={todayTotal} />
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="text-muted-foreground text-xs">This month</p>
          <p className="text-xl font-semibold sm:text-2xl">
            <MoneyDisplay amount={monthTotal} />
          </p>
        </CardContent>
      </Card>
      <Card className="col-span-2 sm:col-span-1">
        <CardContent className="space-y-2 p-4">
          <p className="text-muted-foreground text-xs">Custom range</p>
          <DateRangePicker value={range} onChange={handleRangeChange} placeholder="Pick a range" />
          {isPending ? (
            <p className="text-muted-foreground text-sm">Calculating...</p>
          ) : rangeTotal !== null ? (
            <p className="text-xl font-semibold sm:text-2xl">
              <MoneyDisplay amount={rangeTotal} />
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
