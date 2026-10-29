export type StaffCsvRow = { email: string; first_name: string; last_name: string };

export const MAX_CSV_ROWS = 200;

// RFC 4180 records: quoted fields may hold the delimiter, line breaks and "" for a quote.
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  record.push(field);
  records.push(record);
  return records.filter((r) => r.some((value) => value.trim() !== ""));
}

/** Staff list with a header row (email, first_name, last_name; any case), comma or semicolon. */
export function parseStaffCsv(text: string): { rows: StaffCsvRow[] } | { error: string } {
  const body = text.replace(/^﻿/, "");
  const headerLine = body.split(/\r?\n/, 1)[0] ?? "";
  // The header has no quoted delimiters, so it tells which one the file uses.
  const delimiter =
    headerLine.split(";").length > headerLine.split(",").length ? ";" : ",";
  const [header = [], ...records] = parseRecords(body, delimiter);
  const columns = header.map((name) => name.trim().toLowerCase());
  const index = (name: string) => columns.indexOf(name);
  for (const required of ["email", "first_name"]) {
    if (index(required) < 0) {
      return { error: `Missing column: ${required}` };
    }
  }
  if (records.length > MAX_CSV_ROWS) {
    return { error: `At most ${MAX_CSV_ROWS} rows per import.` };
  }
  const cell = (record: string[], name: string) => (record[index(name)] ?? "").trim();
  return {
    rows: records.map((record) => ({
      email: cell(record, "email"),
      first_name: cell(record, "first_name"),
      last_name: cell(record, "last_name"),
    })),
  };
}

/** CSV with a BOM so spreadsheet apps read umlauts; fields quoted when needed. */
export function toCsv(rows: string[][]): string {
  const quote = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${rows.map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`;
}
