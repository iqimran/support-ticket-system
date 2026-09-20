"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchTeamMembersForPickerAction, type TeamMemberPickerResult } from "@/features/tickets/actions";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

type TeamMemberComboboxProps = {
  value: TeamMemberPickerResult | null;
  onChange: (teamMember: TeamMemberPickerResult | null) => void;
  excludeIds?: string[];
};

export function TeamMemberCombobox({ value, onChange, excludeIds = [] }: TeamMemberComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamMemberPickerResult[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    startTransition(async () => {
      const items = await searchTeamMembersForPickerAction(nextQuery);
      setResults(items.filter((item) => !excludeIds.includes(item.id)));
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && results.length === 0) handleQueryChange("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {value ? `${value.name} (${formatBangladeshiPhoneForDisplay(value.phone)})` : "Select a team member..."}
          <ChevronsUpDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name or phone..." value={query} onValueChange={handleQueryChange} />
          <CommandList>
            <CommandEmpty>{isPending ? "Searching..." : "No team members found."}</CommandEmpty>
            <CommandGroup>
              {results.map((teamMember) => (
                <CommandItem
                  key={teamMember.id}
                  value={teamMember.id}
                  onSelect={() => {
                    onChange(teamMember);
                    setOpen(false);
                  }}
                >
                  <Check aria-hidden="true" className={cn("size-4", value?.id === teamMember.id ? "opacity-100" : "opacity-0")} />
                  {teamMember.name} ({formatBangladeshiPhoneForDisplay(teamMember.phone)})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
