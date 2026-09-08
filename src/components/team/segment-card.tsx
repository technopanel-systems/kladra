import { getTranslations } from "next-intl/server";
import { Sqm } from "@/components/ui-ext/figures";
import { ShareBars } from "@/components/ui-ext/share-bars";
import type { SegmentShare } from "@/lib/metrics";
import { toNumber } from "@/lib/money";

/**
 * Where the window's metres went, by the kind of customer they went to
 * (SPEC §3, D152).
 *
 * The founder's question was "where did this month's m² go by customer
 * segment", and segment is the company category the admin already edits (D2) —
 * the only classification of a customer this business records.
 *
 * The share is of the metres SHOWN, not of everything the company ever moved,
 * and the caption says so. That matters because the figures under it are a
 * rep's own when a rep is picked: "half of it went to contractors" has to mean
 * half of the half-dozen dispatches on the screen, or the sentence is about a
 * different set of rows than the bars are.
 */
export async function SegmentCard({ rows }: { rows: SegmentShare[] }) {
  const t = await getTranslations();

  const total = rows.reduce((sum, row) => sum + toNumber(row.sqm), 0);

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{t("team.segments")}</h2>

      {/* Nothing approved in the window is a fact, not a blank card: a rep
          reading his own quarter after a quiet one should be told that, and a
          bar chart of zero rows says nothing at all (D127). */}
      {rows.length === 0 || total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.segmentsNone")}</p>
      ) : (
        <ShareBars
          rows={rows.map((row) => ({
            key: String(row.id),
            label: row.name,
            figure: <Sqm value={row.sqm} whole />,
            // The same wrapper the ratios and chain cards give this figure. A
            // bare "100%" in an Arabic paragraph settles against the paragraph
            // and reads «100%» reversed — the per-cent sign leading — because a
            // sign is neutral and takes the line's direction, not the number's.
            support: (
              <span dir="ltr" className="num">
                {t("common.percent", {
                  percent: Math.round((toNumber(row.sqm) / total) * 100),
                })}
              </span>
            ),
            share: (toNumber(row.sqm) / total) * 100,
          }))}
        />
      )}

      <p className="text-xs text-muted-foreground">{t("team.segmentsMeans")}</p>
    </section>
  );
}
