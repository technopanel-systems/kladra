/**
 * The CSV writer (SPEC D19, D96). Pure: the exports in export.ts read the
 * database and hand their rows here.
 *
 * UTF-8 with a byte-order mark, because Excel on Windows reads a BOM-less
 * UTF-8 file as the system codepage and turns every Arabic name into mojibake;
 * CRLF line endings for the same reader. Every cell quoted, so a comma, a quote
 * or a newline inside a name is one cell.
 */

/** What Excel reads as a formula when it opens a cell: `=`, `@`, a tab, a return. */
const FORMULA = /^[=@\t\r]/;
/** A plain signed number — a phone with its plus, a negative figure — is a number. */
const SIGNED_NUMBER = /^[+-]\d+(\.\d+)?$/;

/**
 * One cell, and one that is text when it would otherwise be run (D96).
 *
 * A company name is typed by whoever adds it, and a name that opens with `=`,
 * `@`, `+` or `-` is a formula to Excel — `=HYPERLINK(...)` in a customer's
 * name is the oldest trick in the export book, and the admin opening the file
 * is the one person whose machine matters. A leading apostrophe is how Excel is
 * told to read the cell as text. A `+` or `-` in front of a plain number is
 * left alone: every phone in the file starts with `+966`, and a figure below
 * nought is a figure.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  const armed = FORMULA.test(text) || (/^[+-]/.test(text) && !SIGNED_NUMBER.test(text));
  return `"${(armed ? "'" + text : text).replace(/"/g, '""')}"`;
}

/** The whole file, with its header row. */
export function csv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  // The BOM is what makes Excel read it as UTF-8 (D19).
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
