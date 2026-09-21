import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: keyof T & string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
  ariaSort?: "ascending" | "descending" | "none";
  /**
   * Hides this column below the given breakpoint so the table's most
   * important columns fit a phone screen without horizontal scrolling —
   * the column is still reachable by scrolling, just not shown by default.
   * Put the identifying/status columns a phone needs first and mark
   * everything else (dates, secondary counts) with this.
   */
  hideBelow?: "sm" | "md";
};

const HIDE_BELOW_CLASS: Record<"sm" | "md", string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyState?: ReactNode;
  className?: string;
};

// Responsive strategy: a horizontally scrollable container rather than a
// mobile card layout. Simpler, keeps column alignment, and is the standard
// pattern for dense internal business tables (as opposed to a marketing UI).
// Columns marked `hideBelow` are additionally dropped on narrow screens so
// the columns that matter most (identity, status) are visible without
// scrolling at all — scrolling is a fallback for the rest, not the default
// way to see what you need.
export function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading,
  error,
  onRetry,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return <LoadingState label="Loading table data" />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={onRetry} />;
  }

  if (data.length === 0) {
    return emptyState ?? <EmptyState title="No results" description="There is nothing to show yet." />;
  }

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow], column.className)}
                aria-sort={column.ariaSort}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={getRowId(row)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow], column.className)}
                >
                  {column.render ? column.render(row) : String(row[column.key] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
