/**
 * What every export is made of (SPEC §3, P14 14.10).
 *
 * The founder, after a third round of use: "Each export carries the filters of
 * the screen it came from, comes in both languages, writes dates as
 * 04/Aug/2026, and opens in Excel with its numbers as numbers and its Arabic
 * intact." Four promises, and each of them is kept here rather than in ten
 * queries that would each have to remember it.
 *
 * A builder answers with a SHEET — the columns it draws, which of them hold
 * figures, and the rows — and this turns that into the file. It never writes a
 * word itself: the columns are keys (`src/lib/export/columns.ts`) and the words
 * come out of `messages/<locale>/export.json`, so the same builder gives an
 * Arabic reader an Arabic file.
 *
 * The filters are not re-implemented either. Every list screen already narrows
 * in one function — `narrowTo` in companies.ts, quotations.ts, dispatches.ts —
 * and a builder asks that function rather than writing the same WHERE a second
 * time, which is what makes "the filters of the screen it came from" a promise
 * the code keeps rather than one it intends (rules/data.md: one definition per
 * figure, and a filter is a figure's other half).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { getTranslations } from "next-intl/server";
import { csv, type CsvColumn } from "@/lib/csv";
import { formatDay, type Day } from "@/lib/dates";
import type { ExportColumn } from "@/lib/export/columns";
import type { SessionUser } from "@/lib/types";

/** What a builder is asked: who wants it, in which language, narrowed how. */
export type ExportInput = {
  /**
   * The person asking. A file is the screen it came from, so it is his rows and
   * nobody else's: the builder asks the same gate the screen's own read asks,
   * and a rep's companies file holds a rep's companies (D213).
   */
  user: SessionUser;
  locale: string;
  /** The screen's own query string, parsed by the screen's own parsers. */
  params: URLSearchParams;
};

/** What a builder answers with. */
export type Sheet = {
  /** The columns, in the order they are read across. */
  columns: readonly ExportColumn[];
  /** Which of them a spreadsheet should add up. */
  numeric?: readonly ExportColumn[];
  /** The rows, each keyed by column. */
  rows: Record<string, unknown>[];
};

export type ExportRead = (input: ExportInput) => Promise<Sheet>;

/**
 * A day in the file, as every screen in the app writes one: 04/Aug/2026, with
 * Western digits in both languages (D6).
 *
 * `YYYY-MM-DD` is what the queries select, because that is what a Riyadh day
 * is in SQL and what sorts correctly; the turn into words happens once, here,
 * and never in a query.
 */
export function exportDay(value: Day | null | undefined, locale: string): string {
  return value ? formatDay(value, locale) : "";
}

/**
 * The address as a screen's own parsers expect one.
 *
 * A page is handed its query string as a record in which a key may repeat — a
 * door opened from a figure names two segments and three cities, and
 * `parseNarrowing` reads every one of them (src/lib/narrowing.ts) — and a route
 * handler is handed `URLSearchParams`, so the repeats are gathered back before
 * the same parser sees them. The control that asks for the file appends rather
 * than sets for the other half of this (src/components/ui-ext/export-button.tsx).
 */
export function asSearch(params: URLSearchParams): Record<string, string[]> {
  return Object.fromEntries([...params.keys()].map((key) => [key, params.getAll(key)]));
}

/** The sheet as a file: the reader's own words at the top of each column. */
export async function fileOf(sheet: Sheet, locale: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "export" });
  const figures = new Set<ExportColumn>(sheet.numeric ?? []);
  const columns: CsvColumn[] = sheet.columns.map((key) => ({
    key,
    label: t(key),
    numeric: figures.has(key),
  }));
  return csv(columns, sheet.rows);
}
