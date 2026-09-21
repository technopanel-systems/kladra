import { getLocale, getTranslations } from "next-intl/server";
import { rankInk } from "@/components/metrics/colors";
import { SharePie } from "@/components/metrics/charts";
import type { PieSlice } from "@/components/metrics/share-pie";
import { formatDay, type Day } from "@/lib/dates";
import type { SegmentShare } from "@/lib/metrics";
import { formatSqmWhole, toNumber } from "@/lib/money";
import { narrowingQuery } from "@/lib/narrowing";
import { foldForPie, wholePercents } from "@/lib/slices";

/**
 * Where the window's metres went, by the kind of customer they went to
 * (SPEC §3, D152) — a pie since the founder reversed D150 (§3 P13).
 *
 * The question is "where did this quarter's m² go", and its answer is a share of
 * one whole: every approved metre in the window went to exactly one segment, so
 * the parts add up to the metres and nothing else. That is the case a pie is
 * for. Segment is the company category the admin already edits (D2), ten of
 * them, so the pie draws the five largest and one slice for the rest (DESIGN
 * §1b's six).
 *
 * The share is of the metres SHOWN — a rep's own when a rep is picked — and the
 * caption says so with the figure in it, so "half" is always half of a number
 * on the screen. Each slice opens the approved dispatches that moved those
 * metres: the same window, the same person, the same segment, through the same
 * clause (src/lib/counted.ts).
 */
export async function SegmentCard({
  rows,
  from,
  personId,
}: {
  rows: SegmentShare[];
  from: Day;
  /** Whose metres — the picked rep, the rep himself, or null for the company. */
  personId: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  // Summed in hundredths: the metres are numeric(12,2) and a float sum of them
  // is the rounding this app keeps out of every figure (rules/data.md).
  const cents = (sqm: string) => Math.round(toNumber(sqm) * 100);
  const total = rows.reduce((sum, row) => sum + cents(row.sqm), 0) / 100;

  const folded = foldForPie(rows, (row) => toNumber(row.sqm));
  const parts = [
    ...folded.kept.map((row) => ({
      key: String(row.id),
      label: row.name,
      value: toNumber(row.sqm),
      ids: [row.id],
    })),
    ...(folded.rest.length > 0
      ? [
          {
            key: "rest",
            label: t("metrics.rest", { count: folded.rest.length }),
            value: folded.rest.reduce((sum, row) => sum + cents(row.sqm), 0) / 100,
            ids: folded.rest.map((row) => row.id),
          },
        ]
      : []),
  ];
  const shares = wholePercents(parts.map((part) => part.value));

  const slices: PieSlice[] = parts.map((part, index) => ({
    key: part.key,
    label: part.label,
    figure: formatSqmWhole(part.value),
    unit: t("common.sqm"),
    share: shares[index],
    value: part.value,
    href: `/dispatches?${narrowingQuery({ from, credited: personId, segment: part.ids })}`,
    ink: rankInk(index),
  }));

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium text-foreground">{t("team.segments")}</h2>

      {/* Nothing approved in the window is a fact, not a blank card: a rep
          reading his own quarter after a quiet one should be told that, and a
          pie of nothing says nothing at all (D127). */}
      {rows.length === 0 || total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.segmentsNone")}</p>
      ) : (
        <>
          <SharePie slices={slices} label={t("team.segments")} />
          <p className="text-xs text-muted-foreground">
            {t("team.segmentsOf", { sqm: formatSqmWhole(total), from: formatDay(from, locale) })}
          </p>
        </>
      )}
    </section>
  );
}
