import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { FollowUpCounts, FollowUpFilter } from "@/lib/followups";
import { TONE_CLASS } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The rep's first line of the day: "Follow-ups — 2 overdue · 1 today", each
 * part a link that narrows the list below it (SPEC D9). The filter lives in
 * `?filter=` so a refresh and a shared link land on the same list (SPEC §3).
 *
 * Colour is waiting time, never status (DESIGN §1): overdue red, due today
 * amber, never-contacted blue. A count of zero is plain text rather than a
 * link — a filter that can only produce an empty screen is a dead end, and the
 * strip stays put instead of shifting as the numbers change.
 */

/**
 * The three the strip offers, drawn from the one filter vocabulary in
 * `@/lib/followups` — the same words the list narrows by, so a pill and the
 * rows under it can never mean different things. (`followups`, the fourth, is
 * the combined "everything waiting" the manager screens use.)
 */
type Pill = Extract<FollowUpFilter, "overdue" | "today" | "never" | "quiet">;

const PILL =
  "inline-flex h-7 items-center rounded-4xl border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export async function FollowUpStrip({
  counts,
  filter,
  q,
  open,
}: {
  counts: FollowUpCounts;
  filter: FollowUpFilter | null;
  q: string;
  open: string | null;
}) {
  const t = await getTranslations();

  // Local on purpose: the three files that build a /companies URL each own
  // their own copy rather than share one across a client/server boundary.
  function href(next: FollowUpFilter | null): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next) params.set("filter", next);
    if (open) params.set("open", open);
    const query = params.toString();
    return query ? `/companies?${query}` : "/companies";
  }

  function pill(value: Pill, count: number, tone: string) {
    const label = t(`companies.${value}Count`, { count });
    if (count === 0) {
      return (
        <span key={value} className={cn(PILL, "border-transparent text-faint")}>
          {label}
        </span>
      );
    }
    const active = filter === value;
    return (
      <Link
        key={value}
        href={href(active ? null : value)}
        aria-current={active ? "true" : undefined}
        className={cn(
          PILL,
          tone,
          active ? "border-current/60" : "border-transparent hover:border-current/30",
        )}
      >
        {label}
      </Link>
    );
  }

  // Renamed from `quiet`, which now means something else on this screen: a
  // customer who has gone quiet is the opposite of a day with nothing due.
  const nothingDue =
    counts.overdue === 0 &&
    counts.today === 0 &&
    counts.neverContacted === 0 &&
    counts.goneQuiet === 0;

  return (
    // A named group: the pills are one set of choices about one thing, and
    // assistive technology should say so before reading four loose links.
    <div
      role="group"
      aria-labelledby="follow-up-strip-label"
      className="card-face flex flex-wrap items-center gap-2 px-3 py-2.5"
    >
      <span id="follow-up-strip-label" className="text-xs font-medium text-muted-foreground">
        {t("common.followUps")}
      </span>

      {nothingDue ? (
        <span className="text-xs text-faint">{t("companies.nothingDue")}</span>
      ) : (
        <>
          {pill("overdue", counts.overdue, TONE_CLASS.bad)}
          {pill("today", counts.today, TONE_CLASS.wait)}
          {counts.neverContacted > 0
            ? pill("never", counts.neverContacted, TONE_CLASS.open)
            : null}
          {/* Last, because nobody is expecting a call from these today — and
              first in importance, because they are the ones that get lost
              (D63). Hidden when there are none, like the band beside it. */}
          {counts.goneQuiet > 0 ? pill("quiet", counts.goneQuiet, TONE_CLASS.over) : null}
        </>
      )}

      {nothingDue && filter === null ? null : (
        <Link
          href={href(null)}
          aria-current={filter === null ? "true" : undefined}
          className={cn(
            PILL,
            filter === null
              ? "border-line-strong bg-surface-2 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t("common.all")}
        </Link>
      )}
    </div>
  );
}
