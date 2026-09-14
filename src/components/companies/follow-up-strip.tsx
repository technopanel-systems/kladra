import { getTranslations } from "next-intl/server";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import type { FollowUpCounts, FollowUpFilter } from "@/lib/followups";

/**
 * The rep's first line of the day: All · 2 overdue · 1 today · …, each chip a
 * door that narrows the list below it (SPEC D9). The filter lives in `?filter=`
 * so a refresh and a shared link land on the same list (SPEC §3).
 *
 * The kit's chip in the kit's row (D145, P13-G6). This strip drew its own pill
 * — a fourth height, 10px paddings off the 4px scale, and a line that wrapped
 * into two at 375 — beside the projects list's `FilterChip`s one screen over,
 * so the same four words about lateness looked like two products. It is the
 * one row now: one line that scrolls sideways on a phone, All first.
 *
 * Colour is waiting time, never status (DESIGN §1): the overdue chip keeps the
 * red and the today chip the amber the dates under them carry, which is the
 * only reason a filter is allowed a tone (`FilterChip`). Never contacted and
 * gone quiet are words on the quiet chip: the kit offers a chip no third tone,
 * and a blue that means "nobody has rung him" on one screen and "out in the
 * world" on the next is the colour-per-category §1b refuses.
 *
 * A count of zero is a chip with nothing behind it, dimmed and not a link — a
 * filter that can only produce an empty screen is a dead end, and the row keeps
 * its shape instead of shifting as the numbers change.
 */

/**
 * The four the strip offers, drawn from the one filter vocabulary in
 * `@/lib/followups` — the same words the list narrows by, so a chip and the
 * rows under it can never mean different things. (`followups`, the fifth, is
 * the combined "everything waiting" the manager screens use.)
 */
/** Exported for the message check: `companies.<pill>Count` is a computed family (D96). */
export type Pill = Extract<FollowUpFilter, "overdue" | "today" | "never" | "quiet">;

export async function FollowUpStrip({
  counts,
  filter,
  q,
  open,
  rep,
}: {
  counts: FollowUpCounts;
  filter: FollowUpFilter | null;
  q: string;
  open: string | null;
  /** Whose floor a manager is reading (S8): every chip keeps him on it (P11G). */
  rep: string | null;
}) {
  const t = await getTranslations();

  // Local on purpose: the three files that build a /companies URL each own
  // their own copy rather than share one across a client/server boundary.
  function href(next: FollowUpFilter | null): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next) params.set("filter", next);
    if (open) params.set("open", open);
    if (rep) params.set("rep", rep);
    const query = params.toString();
    return query ? `/companies?${query}` : "/companies";
  }

  function chip(value: Pill, count: number, tone?: "bad" | "wait") {
    const active = filter === value;
    return (
      <FilterChip
        key={value}
        // Pressing the chosen chip again takes the filter off.
        href={href(active ? null : value)}
        active={active}
        tone={count > 0 ? tone : undefined}
        disabled={count === 0 && !active}
      >
        {t(`companies.${value}Count`, { count })}
      </FilterChip>
    );
  }

  const nothingDue =
    counts.overdue === 0 &&
    counts.today === 0 &&
    counts.neverContacted === 0 &&
    counts.goneQuiet === 0;

  return (
    // A named group: the chips are one set of choices about one thing, and
    // assistive technology should say so before reading four loose links.
    <div role="group" aria-label={t("common.followUps")} data-slot="follow-up-strip">
      {nothingDue && filter === null ? (
        // A strip that says nothing is due has nothing to choose between.
        <p className="text-xs text-muted-foreground">{t("companies.nothingDue")}</p>
      ) : (
        <FilterRow
          all={
            // All first (SPEC §3 P13): the choice the list opens on, where the
            // eye starts, and never behind the chips it undoes.
            <FilterChip href={href(null)} active={filter === null}>
              {t("common.all")}
            </FilterChip>
          }
        >
          {chip("overdue", counts.overdue, "bad")}
          {chip("today", counts.today, "wait")}
          {/* Hidden when there are none: nobody is expecting these calls today,
              and a band of zeros would be a row of dead chips every morning. */}
          {counts.neverContacted > 0 || filter === "never"
            ? chip("never", counts.neverContacted)
            : null}
          {/* Last, because nobody is expecting a call from these today — and
              first in importance, because they are the ones that get lost (D63). */}
          {counts.goneQuiet > 0 || filter === "quiet" ? chip("quiet", counts.goneQuiet) : null}
        </FilterRow>
      )}
    </div>
  );
}
