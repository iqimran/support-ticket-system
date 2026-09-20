"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchCustomersForPickerAction, type CustomerPickerResult } from "@/features/customers/actions";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

type CustomerComboboxProps = {
  value: CustomerPickerResult | null;
  onChange: (customer: CustomerPickerResult | null) => void;
};

function describeCustomer(customer: CustomerPickerResult): string {
  const phone = formatBangladeshiPhoneForDisplay(customer.phone);
  return customer.name ? `${customer.name} (${phone})` : phone;
}

export function CustomerCombobox({ value, onChange }: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerPickerResult[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    startTransition(async () => {
      const items = await searchCustomersForPickerAction(nextQuery);
      setResults(items);
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && results.length === 0) {
          handleQueryChange("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? describeCustomer(value) : "Select a customer..."}
          <ChevronsUpDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by phone or name..." value={query} onValueChange={handleQueryChange} />
          <CommandList>
            <CommandEmpty>{isPending ? "Searching..." : "No customers found."}</CommandEmpty>
            <CommandGroup>
              {results.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => {
                    onChange(customer);
                    setOpen(false);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={cn("size-4", value?.id === customer.id ? "opacity-100" : "opacity-0")}
                  />
                  {describeCustomer(customer)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
