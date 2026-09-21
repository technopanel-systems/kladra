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

/** A figure, exactly as a spreadsheet wants to read one. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * A cell in a column of figures, written bare (P14 14.10).
 *
 * The founder, after a third round of use: a file "opens in Excel with its
 * numbers as numbers". Every cell in this writer is quoted, which is right for
 * a name and wrong for a metre: a quoted figure is a string to some readers and
 * a number to others, and the one column an accountant will sum is the one that
 * must not depend on which. A bare number is a number everywhere.
 *
 * Only a plain one. Nothing (a line with no price on it), a dash, a word — and
 * anything a formula could hide behind — falls back to the quoted cell above,
 * so a column declared numeric can still hold an empty row without arming a
 * spreadsheet.
 */
function csvNumber(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  return PLAIN_NUMBER.test(text) ? text : csvCell(text);
}

/**
 * One column: the key its cells are read by, the word at the top of it, and
 * whether it holds figures.
 *
 * The key and the word are two things since P14 14.10, when the files began
 * coming in the reader's language: a row is built under `sqm` and the column
 * says «م²», and two columns whose Arabic word is the same — a name here and a
 * name there — would collapse into one if the word were also the key.
 *
 * `numeric` is declared and never guessed. A phone, a SMAC number and a
 * reference are digits that must stay text, and a column that is sometimes a
 * figure and sometimes empty is still a column of figures.
 */
export type CsvColumn = { key: string; label?: string; numeric?: boolean };

/** The whole file, with its header row. */
export function csv(columns: readonly CsvColumn[], rows: Record<string, unknown>[]): string {
  const cell = (column: CsvColumn, row: Record<string, unknown>) =>
    column.numeric ? csvNumber(row[column.key]) : csvCell(row[column.key]);
  const lines = [columns.map((column) => csvCell(column.label ?? column.key)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(column, row)).join(","));
  }
  // The BOM is what makes Excel read it as UTF-8 (D19).
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
