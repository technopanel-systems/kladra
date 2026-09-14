/**
 * The builder's answer as a table of words and figures — the one table the
 * screen draws under its chart and the CSV writes to a file (SPEC §3 P13:
 * "the table under the chart, CSV export"). One function, so the file cannot
 * carry a row the screen does not, or name one differently.
 *
 * The figures stay as the database gave them — m² to the hundredth, counts
 * whole — so a spreadsheet adds them up; the screen formats them for reading.
 * The words are the reader's: a person in his script (D68), a month by the app's
 * formatter, and a customer with no city says so rather than leaving a blank.
 *
 * No database, no `server-only`: a translator comes in, and the page and the
 * route each hand it theirs.
 */
import type { Answer } from "@/lib/builder";
import type { Breakdown, Column, Measure, Period } from "@/lib/builder-choice";
import { formatMonth } from "@/lib/dates";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export type BuilderTable = {
  head: string[];
  rows: { key: string; label: string; figures: string[]; won: number[] | null }[];
  total: { label: string; figures: string[]; won: number[] | null };
};

export function measureWord(measure: Measure, t: Translate): string {
  const words: Record<Measure, string> = {
    metres: t("metrics.measure.metres"),
    raised: t("metrics.measure.raised"),
    issued: t("metrics.measure.issued"),
    accepted: t("metrics.measure.accepted"),
    approved: t("metrics.measure.approved"),
    reports: t("metrics.measure.reports"),
    leads: t("metrics.measure.leads"),
  };
  return words[measure];
}

/** What a measure counts, in one sentence under the drawing (D59). */
export function meansWord(measure: Measure, t: Translate): string {
  const words: Record<Measure, string> = {
    metres: t("metrics.means.metres"),
    raised: t("metrics.means.raised"),
    issued: t("metrics.means.issued"),
    accepted: t("metrics.means.accepted"),
    approved: t("metrics.means.approved"),
    reports: t("metrics.means.reports"),
    leads: t("metrics.means.leads"),
  };
  return words[measure];
}

export function breakdownWord(by: Breakdown, t: Translate): string {
  const words: Record<Breakdown, string> = {
    rep: t("metrics.by.rep"),
    segment: t("metrics.by.segment"),
    source: t("metrics.by.source"),
    city: t("metrics.by.city"),
    month: t("metrics.by.month"),
  };
  return words[by];
}

export function periodWord(period: Period, t: Translate): string {
  const words: Record<Period, string> = {
    month: t("common.range.month"),
    quarter: t("common.range.quarter"),
    year: t("common.range.year"),
    compare: t("metrics.compare"),
  };
  return words[period];
}

/** A column's heading: the measure itself, or which of the two months. */
export function columnWord(column: Column, measure: Measure, t: Translate): string {
  if (column.key === "this") return t("common.range.month");
  if (column.key === "last") return t("metrics.lastMonth");
  return measureWord(measure, t);
}

export function builderTable(answer: Answer, t: Translate, locale: string): BuilderTable {
  const { question } = answer;
  const leads = question.measure === "leads";
  const columns = answer.columns.map((column) => columnWord(column, question.measure, t));
  // Every heading is different, because a spreadsheet — and `csv` — keys a
  // column by its heading: two columns called "Won" would be one.
  const head = [
    breakdownWord(question.by, t),
    ...columns,
    ...(leads
      ? columns.map((word) => (columns.length > 1 ? `${t("leads.won")} · ${word}` : t("leads.won")))
      : []),
  ];

  const labelOf = (key: string, name: string | null) => {
    if (question.by === "month") return formatMonth(key, locale);
    if (question.by === "city" && name === null) return t("metrics.noCity");
    return name ?? "";
  };

  return {
    head,
    rows: answer.rows.map((row) => ({
      key: row.key,
      label: labelOf(row.key, row.name),
      figures: row.values,
      won: row.won,
    })),
    total: { label: t("metrics.total"), figures: answer.totals, won: answer.wonTotals },
  };
}
