import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

type Row = { name: string; amount: number };

describe("toCsv", () => {
  it("renders a header row and one row per item, CRLF-terminated", () => {
    const csv = toCsv<Row>(
      [
        { name: "Alpha", amount: 100 },
        { name: "Beta", amount: 250 },
      ],
      [
        { header: "Name", value: (row) => row.name },
        { header: "Amount", value: (row) => row.amount },
      ],
    );

    expect(csv).toBe("Name,Amount\r\nAlpha,100\r\nBeta,250\r\n");
  });

  it("renders just the header row when there are no rows", () => {
    const csv = toCsv<Row>([], [{ header: "Name", value: (row) => row.name }]);
    expect(csv).toBe("Name\r\n");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv<Row>([{ name: "Doe, John", amount: 1 }], [{ header: "Name", value: (row) => row.name }]);
    expect(csv).toBe('Name\r\n"Doe, John"\r\n');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv<Row>([{ name: "Line1\nLine2", amount: 1 }], [{ header: "Name", value: (row) => row.name }]);
    expect(csv).toBe('Name\r\n"Line1\nLine2"\r\n');
  });

  it("quotes a field containing a double quote, doubling the embedded quote", () => {
    const csv = toCsv<Row>([{ name: 'Say "hi"', amount: 1 }], [{ header: "Name", value: (row) => row.name }]);
    expect(csv).toBe('Name\r\n"Say ""hi"""\r\n');
  });

  it("does not quote a plain field", () => {
    const csv = toCsv<Row>([{ name: "Plain", amount: 1 }], [{ header: "Name", value: (row) => row.name }]);
    expect(csv).toBe("Name\r\nPlain\r\n");
  });
});
