"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyDisplay } from "@/components/shared/money-display";
import { StatCard } from "@/components/shared/stat-card";
import { getDailySummaryAction } from "@/features/dashboard/actions";
import type { DailySummary } from "@/features/dashboard/repository";

export function DailyReportPanel({ initialDate, initialSummary }: { initialDate: Date; initialSummary: DailySummary }) {
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xs">
          <DatePicker value={date} onChange={handleDateChange} placeholder="Select a date" />
        </div>
        {date ? (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/reports/daily/csv?date=${encodeURIComponent(date.toISOString())}`}>
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        ) : null}
      </div>
      <div className={isPending ? "opacity-50 transition-opacity" : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
