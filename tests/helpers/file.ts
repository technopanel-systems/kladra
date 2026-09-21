import { EXPORT_COLUMNS } from "@/lib/export/columns";
import type { Translate } from "./i18n";

/**
 * A file the app handed out, read back the way Excel reads one (SPEC §3, P14
 * 14.10; D19 before it).
 *
 * Two specs ask about these files and they ask different questions —
 * tests/csv.spec.ts about what is in the rows, tests/export.spec.ts about which
 * rows are in the file at all — so the reader is here rather than in whichever
 * of them was written first.
 *
 * It keeps the cells twice: `rows` is what a reader sees, and `written` is what
 * is actually in the file, quotes and all, because "a figure is bare so a
 * spreadsheet adds it up" is a question about the second and not the first.
 */
export type CsvFile = {
  /** The words at the top, in the order the columns are read across. */
  head: string[];
  /** Every row after the head, keyed by the word above each cell. */
  rows: Record<string, string>[];
  /** The same rows exactly as written, quotes and all. */
  written: string[][];
};

export function readCsv(text: string): CsvFile {
  const body = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  const written: string[][] = [];
  let row: string[] = [];
  let raw: string[] = [];
  let cell = "";
  let asWritten = "";
  let quoted = false;

  const endCell = () => {
    row.push(cell);
    raw.push(asWritten);
    cell = "";
    asWritten = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    written.push(raw);
    row = [];
    raw = [];
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    asWritten += ch;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (body[i + 1] === '"') {
        cell += '"';
        asWritten += body[++i];
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      asWritten = asWritten.slice(0, -1);
      endCell();
    } else if (ch === "\r" && body[i + 1] === "\n") {
      asWritten = asWritten.slice(0, -1);
      i++;
      endRow();
    } else cell += ch;
  }

  const [head = [], ...data] = rows;
  return {
    head,
    rows: data.map((cells) => Object.fromEntries(head.map((word, i) => [word, cells[i]]))),
    written: written.slice(1),
  };
}

/**
 * The rows keyed by COLUMN rather than by the word at the top of the column.
 *
 * The head is in the reader's language since P14 14.10, so a spec that keyed its
 * rows by the heading would read «التوريد» in one project and "Dispatch" in the
 * other. The words are the columns' own translations, one for one, and
 * tests/csv.spec.ts holds them to being one for one.
 */
export function keyed(rows: Record<string, string>[], t: Translate): Record<string, string>[] {
  const key = new Map<string, string>(
    EXPORT_COLUMNS.map((column) => [t(`export.${column}`), column]),
  );
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([word, value]) => [key.get(word) ?? word, value])),
  );
}
