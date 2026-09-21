/**
 * Every file the app hands out (SPEC §3, P14 14.10; D19 before it).
 *
 * The founder, after a third round of use: everything exports — companies,
 * contacts, projects, quotations with their lines and services, dispatches with
 * their lines, reports, leads, targets and achievement, users, holidays and
 * leave — and "each export carries the filters of the screen it came from,
 * comes in both languages, writes dates as 04/Aug/2026, and opens in Excel with
 * its numbers as numbers and its Arabic intact."
 *
 * So a file is not a report somebody designed: it is a SCREEN, flattened. That
 * is what settles the two questions this registry answers. **Who may ask for
 * one** is who may read that screen, and the narrowing inside each builder is
 * the screen's own (`narrowCompanies` and its siblings), so a rep asking for
 * the customers file gets his customers and nothing else — the admin-only rule
 * D19 wrote is gone, because it was a rule about a panel rather than about the
 * data. **What is in one** is what the screen shows, joined already: an
 * accountant opening this does not want to look a supplier up in a second
 * sheet.
 *
 * The file itself — the byte-order mark Excel needs to read Arabic, the CRLF
 * endings, the quoting, the bare figures and the typed name Excel would
 * otherwise run as a formula — is src/lib/csv.ts. The words at the top of the
 * columns are src/lib/export/columns.ts and `messages/<locale>/export.json`.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import type { BuilderTable } from "@/lib/builder-table";
import { csv } from "@/lib/csv";
import { companiesSheet } from "@/lib/export/companies";
import { dispatchesSheet } from "@/lib/export/dispatches";
import { fileOf, type ExportInput, type ExportRead } from "@/lib/export/kit";
import { quotationsSheet } from "@/lib/export/quotations";
import type { SessionUser } from "@/lib/types";

export const EXPORTS = ["companies", "quotations", "dispatches"] as const;
export type ExportName = (typeof EXPORTS)[number];

export function isExportName(value: unknown): value is ExportName {
  return typeof value === "string" && (EXPORTS as readonly string[]).includes(value);
}

/**
 * One file: how to build it, and who may ask.
 *
 * `mayAsk` is deliberately not "which role": most of these files are somebody's
 * own screen and their builder has already narrowed to his rows, so the honest
 * gate is the screen's. The few that are nobody's own screen — the accounts,
 * the leave table — say so here.
 */
type ExportFile = { read: ExportRead; mayAsk: (user: SessionUser) => boolean };

const anybody = () => true;

const FILES: Record<ExportName, ExportFile> = {
  companies: { read: companiesSheet, mayAsk: anybody },
  quotations: { read: quotationsSheet, mayAsk: anybody },
  dispatches: { read: dispatchesSheet, mayAsk: anybody },
};

/** May this person ask for this file at all? */
export function mayExport(name: ExportName, user: SessionUser): boolean {
  return FILES[name].mayAsk(user);
}

/** The file, in the reader's language, narrowed the way his screen was. */
export async function buildExport(name: ExportName, input: ExportInput): Promise<string> {
  return fileOf(await FILES[name].read(input), input.locale);
}

/**
 * The builder's table as a file, for the manager and the admin (SPEC §3 P13).
 *
 * The same rows as the table under the chart, in the same order, because both
 * come out of `builderTable`; the total is the last line, as it is the table's
 * footer. It has been written in the reader's language since it was built — it
 * is a copy of a screen somebody was reading — which is what the ten files
 * above became in 14.10. Figures are plain numbers, so a spreadsheet adds them
 * up; its head is already words, so each column stands as its own key.
 */
export function builderCsv(table: BuilderTable): string {
  const line = (label: string, figures: string[], won: number[] | null) =>
    Object.fromEntries(
      [label, ...figures, ...(won ?? []).map(String)].map((cell, i) => [table.head[i], cell]),
    );
  return csv(
    // The first column is the row's name; every column after it is a figure.
    table.head.map((key, i) => ({ key, numeric: i > 0 })),
    [
      ...table.rows.map((row) => line(row.label, row.figures, row.won)),
      line(table.total.label, table.total.figures, table.total.won),
    ],
  );
}
