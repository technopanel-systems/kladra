import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { formatDay, type Day } from "@/lib/dates";
import { HABIT_AT_LEAST, HABIT_SHARE_PERCENT, relianceRows } from "@/lib/reliance";

/**
 * How often each person relies on the coordinator (SPEC §3 P13): "so the
 * manager can see whether it is occasional or a habit".
 *
 * One row per person she may raise for, the largest share of theirs first: the
 * name, "3 of 12 raised by the coordinator", her share as a figure, and the word.
 * The word is the answer to the founder's question and the figures are how the
 * manager checks it, so the threshold is said in the sentence at the top rather
 * than left for him to infer from which rows turned amber (D59).
 *
 * No bar. The question is a word per person, and a bar per person would be a
 * chart drawn for its own sake (CLAUDE.md). Only a habit is tinted — in the
 * amber of "somebody should look at this" — and it says its word like the rest,
 * because a tint is never the only carrier (DESIGN §6).
 *
 * The window is the tab's, chosen once above every card and passed in (D154).
 */
export async function RelianceCard({ from }: { from: Day }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const rows = await relianceRows(from, locale);
  const since = formatDay(from, locale);
  // A window in which nobody raised anything is the answer, not a blank card (D127).
  const nothing = rows.every((row) => row.total === 0);

  return (
    <section data-slot="reliance-card" className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{t("team.reliance.title")}</h2>
        <p className="text-sm text-pretty">
          {nothing
            ? t("team.reliance.nothing", { from: since })
            : t("team.reliance.means", {
                from: since,
                percent: HABIT_SHARE_PERCENT,
                count: HABIT_AT_LEAST,
              })}
        </p>
      </div>

      {nothing ? null : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.userId}
              data-word={row.word}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <Avatar id={row.userId} name={row.name} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <Clip text={row.name} column className="text-sm font-medium" />
                <span className="text-xs text-muted-foreground">
                  {row.total === 0
                    ? t("team.reliance.noPaper")
                    : t("team.reliance.line", { raised: row.raised, total: row.total })}
                </span>
              </div>
              {row.total > 0 ? (
                <span dir="ltr" className="num shrink-0 text-sm">
                  {t("common.percent", { percent: row.percent })}
                </span>
              ) : null}
              {/* Nothing in the window already says it: no word beside it. */}
              {row.total === 0 ? null : row.word === "habit" ? (
                <StateBadge tone="wait" className="shrink-0">
                  {t(`team.reliance.word.${row.word}`)}
                </StateBadge>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(`team.reliance.word.${row.word}`)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
