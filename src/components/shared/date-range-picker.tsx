"use client";

import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type DateRangePickerProps = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
};

function formatRange(range: DateRange | undefined, placeholder: string): string {
  if (!range?.from) return placeholder;
  const from = formatDate(range.from);
  if (!range.to || range.to.getTime() === range.from.getTime()) return from;
  return `${from} - ${formatDate(range.to)}`;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Select a date range",
  className,
}: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start font-normal sm:w-auto", className)}
        >
          <CalendarIcon aria-hidden="true" />
          <span className={cn(!value?.from && "text-muted-foreground")}>{formatRange(value, placeholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          defaultMonth={value?.from}
          className="sm:[--cell-size:--spacing(8)]"
        />
      </PopoverContent>
    </Popover>
  );
}
