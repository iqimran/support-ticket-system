"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchTeamMembersForPickerAction, type TeamMemberPickerResult } from "@/features/tickets/actions";
import { formatBangladeshiPhoneForDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

type TeamMemberMultiSelectProps = {
  selected: TeamMemberPickerResult[];
  onChange: (teamMembers: TeamMemberPickerResult[]) => void;
  excludeIds?: string[];
  disabled?: boolean;
};

/** Searchable multi-select over active team members. Selecting an item keeps the popover open so several can be picked in one go. */
export function TeamMemberMultiSelect({ selected, onChange, excludeIds = [], disabled }: TeamMemberMultiSelectProps) {
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

  function toggle(teamMember: TeamMemberPickerResult) {
    const isSelected = selected.some((item) => item.id === teamMember.id);
    onChange(isSelected ? selected.filter((item) => item.id !== teamMember.id) : [...selected, teamMember]);
  }

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen && results.length === 0) handleQueryChange("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected.length > 0 ? `${selected.length} team member${selected.length > 1 ? "s" : ""} selected` : "Select team members..."}
            <ChevronsUpDown aria-hidden="true" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search by name or phone..." value={query} onValueChange={handleQueryChange} />
            <CommandList>
              <CommandEmpty>{isPending ? "Searching..." : "No team members found."}</CommandEmpty>
              <CommandGroup>
                {results.map((teamMember) => {
                  const isSelected = selected.some((item) => item.id === teamMember.id);
                  return (
                    <CommandItem key={teamMember.id} value={teamMember.id} onSelect={() => toggle(teamMember)}>
                      <Check aria-hidden="true" className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")} />
                      {teamMember.name} ({formatBangladeshiPhoneForDisplay(teamMember.phone)})
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((teamMember) => (
            <Badge key={teamMember.id} variant="secondary" className="gap-1 pr-1">
              {teamMember.name}
              <button
                type="button"
                aria-label={`Remove ${teamMember.name} from selection`}
                onClick={() => toggle(teamMember)}
                className="rounded-full hover:bg-muted-foreground/20"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
