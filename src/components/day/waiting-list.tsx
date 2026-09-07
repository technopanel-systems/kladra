"use client";

import { useTranslations } from "next-intl";
import { Prose } from "@/components/ui-ext/prose";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Link } from "@/i18n/navigation";
import type { Waiting, WaitingCounts } from "@/lib/day";
import { TONE_CLASS } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * What has come back to this rep and is stopped until he does something
 * (SPEC §3, P8).
 *
 * It is first on the screen, above the calls, because every row here is a
 * customer already waiting: a quotation the coordinator sent back, a dispatch
 * she refused, a quotation the customer is sitting on. Each row carries the
 * reason in her own words, so a rep does not have to open it to know whether
 * this is a two-minute fix or a phone call (S53).
 *
 * Drawn on the client from plain rows, like the call bands beside it (D82):
 * every card here is a link with a badge and a paragraph inside it, and a
 * server loop would serialise that whole card into the page once per row.
 *
 * The heading carries the three kinds as pills (P11E): how many are sent
 * back, refused, and with the customer, each a door to that kind's own list.
 * On the volume floor the list said "83" and showed twenty-five, oldest first
 * regardless of kind, and nothing said where the other fifty-eight were or
 * that most of them were customers thinking rather than work stopped on him.
 * The kinds are sorted stopped-first now (src/lib/day.ts), and the pills say
 * the split in one look — the same shape as the follow-up strip's pills, for
 * the same reason (D9).
 */
const PILL =
  "inline-flex h-7 items-center rounded-4xl border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Exported for the message check: `day.<kind>Count` is a computed family (D96). */
export const WAITING_KINDS = ["sentBack", "refused", "withCustomer"] as const;
type WaitingKind = (typeof WAITING_KINDS)[number];

/** Where each kind's door goes, and its colour: the badges' own, a row down. */
const DOORS: Record<WaitingKind, { href: string; tone: string }> = {
  sentBack: { href: "/quotations?status=returned", tone: TONE_CLASS.wait },
  refused: { href: "/dispatches?status=refused", tone: TONE_CLASS.wait },
  withCustomer: { href: "/quotations?status=issued", tone: TONE_CLASS.open },
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
        {/* Sent back and refused are amber — somebody waiting on HIM; with the
            customer is blue — out in the world (DESIGN §6). */}
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
                <span dir="ltr" className="num font-medium">
                  {row.label}
                </span>
                {/* Sent back and refused are somebody waiting on HIM; a
                    quotation with the customer is out in the world (DESIGN §6). */}
                <StateBadge tone={row.reasonKey === "day.withCustomer" ? "open" : "wait"}>
                  {t(row.reasonKey)}
                </StateBadge>
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <bdi className="max-w-full truncate">{row.companyName}</bdi>
                {row.projectName ? (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    <bdi className="max-w-full truncate text-muted-foreground">{row.projectName}</bdi>
                  </>
                ) : null}
              </span>
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
