"use client";

import { useState, useTransition } from "react";
import { DatePicker } from "@/components/shared/date-picker";
import { StatCard } from "@/components/shared/stat-card";
import { MoneyDisplay } from "@/components/shared/money-display";
import { getDailySummaryAction } from "@/features/dashboard/actions";
import type { DailySummary } from "@/features/dashboard/repository";

export function DailySummaryPanel({ initialDate, initialSummary }: { initialDate: Date; initialSummary: DailySummary }) {
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [summary, setSummary] = useState<DailySummary>(initialSummary);
  const [isPending, startTransition] = useTransition();

  function handleDateChange(nextDate: Date | undefined) {
    setDate(nextDate);
    if (!nextDate) return;
    startTransition(async () => {
      const result = await getDailySummaryAction({ date: nextDate.toISOString() });
      setSummary(result);
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <DatePicker value={date} onChange={handleDateChange} placeholder="Select a date" />
      </div>
      <div className={isPending ? "opacity-50 transition-opacity" : undefined}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Created" value={summary.ticketsCreated} />
          <StatCard label="Completed" value={summary.ticketsCompleted} />
          <StatCard label="Pending" value={summary.ticketsPending} description="Created that day, still pending" />
          <StatCard label="In progress" value={summary.ticketsInProgress} description="Created that day, still in progress" />
          <StatCard label="Money received" value={<MoneyDisplay amount={summary.moneyReceived} />} />
        </div>
      </div>
    </div>
  );
}
