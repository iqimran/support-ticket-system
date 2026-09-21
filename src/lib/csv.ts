export type CsvColumn<T> = { header: string; value: (row: T) => string | number };

// RFC 4180: quote a field if it contains a comma, quote, or newline, and
// double up any embedded quotes.
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CRLF line endings per RFC 4180 — what most spreadsheet tools expect from a .csv file. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvField(column.header)).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCsvField(String(column.value(row)))).join(","));
  return [header, ...lines].map((line) => `${line}\r\n`).join("");
}
