"use client";

import { useTranslations } from "next-intl";
import { Prose } from "@/components/ui-ext/prose";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Link } from "@/i18n/navigation";
import type { Waiting, WaitingCounts, WaitingKindName } from "@/lib/day";
import { TONE_CLASS } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * What has come back to this rep and is stopped until he does something
 * (SPEC §3, P8).
 *
 * It is first on the screen, above the calls, because every row here is a
 * customer already waiting: a lead somebody has just handed him, a quotation
 * the coordinator sent back, a dispatch she refused, a quotation the customer
 * is sitting on. Each row carries the reason in somebody's own words — hers on
 * the two she sent back, the finder's on a lead — so a rep does not have to
 * open it to know whether this is a two-minute fix or a phone call (S53).
 *
 * Drawn on the client from plain rows, like the call bands beside it (D82):
 * every card here is a link with a badge and a paragraph inside it, and a
 * server loop would serialise that whole card into the page once per row.
 *
 * The heading carries the kinds as pills (P11E): how many are new leads, sent
 * back, refused, and with the customer, each a door to that kind's own list
 * where it has one. On the volume floor the list said "83" and showed twenty-five, oldest first
 * regardless of kind, and nothing said where the other fifty-eight were or
 * that most of them were customers thinking rather than work stopped on him.
 * The kinds are sorted stopped-first now (src/lib/day.ts), and the pills say
 * the split in one look — the same shape as the follow-up strip's pills, for
 * the same reason (D9).
 */
const PILL =
  "touch inline-flex h-7 items-center rounded-4xl border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Exported for the message check: `day.<kind>Count` is a computed family (D96). */
export const WAITING_KINDS = ["newLead", "sentBack", "refused", "withCustomer"] as const;
type WaitingKind = (typeof WAITING_KINDS)[number];

/*
 * This list and the kinds on the day are one list, proved at compile time.
 *
 * It cannot be derived: `@/lib/day` reads the database, and a VALUE imported
 * from it here would drag that whole graph into the browser bundle
 * (rules/data.md). So the list is written twice and the second copy is held to
 * the first — a kind with no pill would leave the pills adding up to less than
 * the figure beside the heading they split, which is the figure-that-lies, and
 * nothing else would fail. Adding one to `WaitingReason` fails the build here
 * until it has a pill, a door and a word (§5 #170).
 */
type KindWithNoPill = Exclude<WaitingKindName, WaitingKind>;
const EVERY_KIND_HAS_A_PILL: KindWithNoPill extends never ? true : never = true;
void EVERY_KIND_HAS_A_PILL;

/**
 * Where each kind's door goes, and its colour: the badges' own, a row down.
 *
 * A new lead has no door, and null says so rather than a link somewhere near
 * enough. The other three each have a list of their own to open — every
 * returned quotation, every refused dispatch — and a rep has no leads screen at
 * all (SPEC §3: the module is marketing's). The list under this heading IS that
 * kind's list: leads sort first on it, so what the pill counts is what the
 * reader is already looking at.
 */
const DOORS: Record<WaitingKind, { href: string | null; tone: string }> = {
  newLead: { href: null, tone: TONE_CLASS.wait },
  sentBack: { href: "/quotations?status=returned", tone: TONE_CLASS.wait },
  refused: { href: "/dispatches?status=refused", tone: TONE_CLASS.wait },
  withCustomer: { href: "/quotations?status=issued", tone: TONE_CLASS.open },
};

/**
 * Amber for anything stopped on HIM, blue for what is out in the world
 * (DESIGN §6). A lead is his the moment it lands.
 */
const TONE_OF: Record<string, "wait" | "open"> = {
  "day.withCustomer": "open",
};

export function WaitingList({
  rows,
  total,
  counts,
}: {
  /** Stopped work first, then the longest-waiting; as many as the screen draws (D80). */
  rows: Waiting[];
  /** How many are waiting altogether — the heading's figure. */
  total: number;
  /** The same total, split by kind — the heading's doors. */
  counts: WaitingCounts;
}) {
  const t = useTranslations();

  /** A kind's count as a door to its list; a zero stays put as plain text (D9). */
  function pill(key: WaitingKind) {
    const count = counts[key];
    const label = t(`day.${key}Count`, { count });
    if (count === 0) {
      return (
        <span key={key} className={cn(PILL, "border-transparent text-faint")}>
          {label}
        </span>
      );
    }
    // Counted in its own colour, and not a link, for a kind whose list is the
    // one directly below this line.
    if (!DOORS[key].href) {
      return (
        <span key={key} className={cn(PILL, DOORS[key].tone, "border-transparent")}>
          {label}
        </span>
      );
    }
    return (
      <Link
        key={key}
        href={DOORS[key].href}
        data-slot={`waiting-${key}`}
        className={cn(PILL, DOORS[key].tone, "border-transparent hover:border-current/30")}
      >
        {label}
      </Link>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("day.waitingOnYou")}</h2>
        <p className="card-face px-4 py-6 text-center text-sm text-muted-foreground">
          {t("day.nothingWaiting")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-medium">
          {t("day.waitingOnYou")}{" "}
          <span dir="ltr" className="num text-muted-foreground">
            {total}
          </span>
        </h2>
        {/* A new lead, sent back and refused are amber — somebody waiting on
            HIM; with the customer is blue — out in the world (DESIGN §6). */}
        <div role="group" aria-label={t("day.waitingOnYou")} className="flex flex-wrap gap-2">
          {WAITING_KINDS.map(pill)}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${row.reasonKey}-${row.id}`}>
            <Link
              href={row.href}
              className="card-face flex flex-col gap-1.5 p-3 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex flex-wrap items-center gap-2">
                {/* The document number heads its own card. A lead has none, so
                    the customer's name is the heading instead — as a `bdi`,
                    because an Arabic company name forced LTR the way a number
                    is comes out with its punctuation on the wrong side
                    (rules/words.md). */}
                {row.label ? (
                  <span dir="ltr" className="num font-medium">
                    {row.label}
                  </span>
                ) : (
                  <span className="max-w-full truncate font-medium">
                    <bdi>{row.companyName}</bdi>
                  </span>
                )}
                <StateBadge tone={TONE_OF[row.reasonKey] ?? "wait"}>{t(row.reasonKey)}</StateBadge>
              </span>
              {/* The customer under the number. Not on a lead, where he is the
                  line above and printing him twice would say nothing twice. */}
              {row.label ? (
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span className="max-w-full truncate">
                    <bdi>{row.companyName}</bdi>
                  </span>
                  {row.projectName ? (
                    <>
                      <span aria-hidden="true" className="text-faint">
                        ·
                      </span>
                      <span className="max-w-full truncate text-muted-foreground">
                        <bdi>{row.projectName}</bdi>
                      </span>
                    </>
                  ) : null}
                </span>
              ) : null}
              {/* Her reason, under the company it is about: a line, so it sits
                  where the row starts and not at the far edge of a wide card. */}
              {row.reason ? (
                <Prose line text={row.reason} className="text-xs text-muted-foreground" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* Said, not dropped (D80). The rest are on two lists under their own
          status, and the pills in the heading are the doors to each (P11E);
          this line is the count of what the screen did not draw (D83). */}
      {total > rows.length ? (
        <p className="text-xs text-faint">{t("common.andMore", { count: total - rows.length })}</p>
      ) : null}
    </section>
  );
}
