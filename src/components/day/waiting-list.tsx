"use client";

import { useTranslations } from "next-intl";
import { AcknowledgeLeadButton } from "@/components/leads/acknowledge-lead-button";
import { ReportButton } from "@/components/reports/report-dialog";
import {
  WORK_CARD,
  WORK_ROW,
  WORK_ROW_ACTIONS,
  WORK_ROWS,
  WorkTitle,
} from "@/components/team/work-grid";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { Empty } from "@/components/ui-ext/empty";
import { chipClass } from "@/components/ui-ext/filter-chip";
import { Ref } from "@/components/ui-ext/figures";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Prose } from "@/components/ui-ext/prose";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { ScrollLine } from "@/components/ui-ext/sticky-scroll";
import { Link } from "@/i18n/navigation";
import type { WaitingRowFacts } from "@/components/day/waiting-faces";
import type { WaitingCounts, WaitingKindName } from "@/lib/day";
import { cn } from "@/lib/utils";

/**
 * What has come back to this rep and is stopped until he does something
 * (SPEC §3, P8).
 *
 * It is the first card on the day, before the calls, because every row here is
 * a customer already waiting: a lead somebody has just handed him, a quotation
 * the coordinator sent back, a dispatch she refused, a quotation the customer is
 * sitting on. Each row carries the reason in somebody's own words — hers on the
 * two she sent back, the finder's on a lead — so a rep does not have to open it
 * to know whether this is a two-minute fix or a phone call (S53).
 *
 * Drawn on the client from plain rows, like the call bands beside it (D82):
 * every card here is a link with a badge and a paragraph inside it, and a
 * server loop would serialise that whole card into the page once per row.
 *
 * The heading carries the kinds as pills (P11E): how many are new leads, sent
 * back, refused, and with the customer, each a door to that kind's own list
 * where it has one. The kinds are sorted stopped-first (src/lib/day.ts), and the
 * pills say the split in one look — the same shape as the follow-up strip's
 * pills, for the same reason (D9). They are one line that scrolls, like every
 * row of chips (S12.K): four pills wrapped into two rows on a phone and pushed
 * the first customer under the fold.
 *
 * **One row, the call card's row** (P13-G6 S12.6). A waiting row and a call row
 * stood side by side in one strip with two templates: the calls carried their
 * company's face and an action row, the waiting rows neither. Now both open
 * with the company's face and end with the same row of actions in the same
 * place — Acknowledge on a lead, the one act that takes it off his day, and Add
 * report on every row, prefilled with the customer and the paper, because the
 * next thing a rep does about a quotation the customer is sitting on is ring him
 * and say what was said. The row itself is still the door to the paper.
 */

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
 * Where each kind's door goes, and its dot: the badges' own tone.
 *
 * A new lead has no door, and null says so rather than a link somewhere near
 * enough. The other three each have a list of their own to open — every
 * returned quotation, every refused dispatch — and a rep has no leads screen at
 * all (SPEC §3: the module is marketing's). The list under this heading IS that
 * kind's list: leads sort first on it, so what the pill counts is what the
 * reader is already looking at.
 */
const DOORS: Record<WaitingKind, { href: string | null; dot: string }> = {
  newLead: { href: null, dot: "before:bg-state-wait-fg" },
  sentBack: { href: "/quotations?status=returned", dot: "before:bg-state-wait-fg" },
  refused: { href: "/dispatches?status=refused", dot: "before:bg-state-wait-fg" },
  withCustomer: { href: "/quotations?status=issued", dot: "before:bg-state-open-fg" },
};

/** The dot before a pill's words: the chip's own, sized and spaced by its gap. */
const DOT = "gap-1.5 before:size-1.5 before:shrink-0 before:rounded-full before:content-['']";

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
  answers,
}: {
  /** Stopped work first, then the longest-waiting; as many as the screen draws (D80). */
  rows: WaitingRowFacts[];
  /** How many are waiting altogether — the heading's figure. */
  total: number;
  /** The same total, split by kind — the heading's doors. */
  counts: WaitingCounts;
  /**
   * Whether this reader answers for these rows himself — false for an admin
   * viewing as the rep (D42), who is offered no Acknowledge the action would
   * refuse (DESIGN §5).
   */
  answers: boolean;
}) {
  const t = useTranslations();

  /** A kind's count as a door to its list; a zero stays put, dimmed (D9). */
  function pill(key: WaitingKind) {
    const count = counts[key];
    const label = t(`day.${key}Count`, { count });
    if (count === 0) {
      return (
        <span
          key={key}
          className={cn(
            "inline-flex items-center font-medium whitespace-nowrap",
            chipClass({ active: false, disabled: true }),
            DOT,
            "before:bg-line-strong",
          )}
        >
          {label}
        </span>
      );
    }
    const href = DOORS[key].href;
    // Counted in its own tone, and not a link, for a kind whose list is the
    // one directly below this line.
    if (!href) {
      return (
        <span
          key={key}
          className={cn(
            "inline-flex items-center font-medium whitespace-nowrap",
            chipClass({ active: false }),
            DOT,
            DOORS[key].dot,
            "text-foreground hover:bg-surface hover:text-foreground",
          )}
        >
          {label}
        </span>
      );
    }
    return (
      <Button
        key={key}
        asChild
        size="sm"
        variant="secondary"
        className={cn(chipClass({ active: false }), DOT, DOORS[key].dot, "text-foreground")}
      >
        <Link href={href} data-slot={`waiting-${key}`}>
          {label}
          <LinkPending />
        </Link>
      </Button>
    );
  }

  // Nothing came back: the title over the space the rows would take, not a card
  // with a dashed box inside it — two edges saying one thing (DESIGN §1b).
  if (rows.length === 0) {
    return (
      <section data-slot="waiting-list" className="flex min-w-0 flex-col gap-3">
        <WorkTitle as="h2">{t("day.waitingOnYou")}</WorkTitle>
        <Empty size="panel">{t("day.nothingWaiting")}</Empty>
      </section>
    );
  }

  return (
    <section data-slot="waiting-list" className={WORK_CARD}>
      <div className="flex flex-col gap-2">
        <WorkTitle as="h2" count={total}>
          {t("day.waitingOnYou")}
        </WorkTitle>
        {/* A new lead, sent back and refused are amber — somebody waiting on
            HIM; with the customer is blue — out in the world (DESIGN §6). */}
        <ScrollLine track={{ role: "group", "aria-label": t("day.waitingOnYou") }}>
          {WAITING_KINDS.map(pill)}
        </ScrollLine>
      </div>

      {/* Rows inside the card rather than a card a row (P13-S8): a card inside
          a card is two edges saying one thing. */}
      <ul className={WORK_ROWS}>
        {rows.map((row) => {
          const lead = row.reasonKey === "day.newLead";
          return (
            <li key={`${row.reasonKey}-${row.id}`} className={cn(WORK_ROW, "row-door flex flex-col gap-2")}>
              {/* The whole row is the door to the paper (D161), and the link is
                  the row's first child and its whole text, so a thumb anywhere
                  on the words lands on it (D130). */}
              <Link data-door href={row.href} className="touch flex items-start gap-3">
                {/* The company's face, the one it wears on every screen (DESIGN
                    §1b). The dot on a lead is its state — nobody has said he has
                    it — and the badge beside it says the word. */}
                <Avatar
                  id={row.companyId}
                  name={row.companyName}
                  kind="company"
                  size="sm"
                  ring={lead ? "wait" : undefined}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {/* The document number heads its own row. A lead has none,
                        so the customer's name is the heading instead. */}
                    {row.label ? (
                      // SMAC's number where the paper has one (P12-11): that is
                      // the number the customer is holding, and Kladra's own is
                      // the quiet line under it.
                      <Ref slot="waiting-number" className="font-medium">
                        {row.smacNumber ?? row.label}
                      </Ref>
                    ) : (
                      <Clip text={row.companyName} className="max-w-full font-medium" />
                    )}
                    <StateBadge tone={TONE_OF[row.reasonKey] ?? "wait"}>{t(row.reasonKey)}</StateBadge>
                    <LinkPending />
                  </span>
                  {/* Kladra's own number, on its own line under SMAC's, and only
                      where there are two. */}
                  {row.smacNumber ? (
                    <Ref slot="waiting-second-number" className="text-xs text-muted-foreground">
                      {row.label}
                    </Ref>
                  ) : null}
                  {/* The customer under the number. Not on a lead, where he is
                      the line above and printing him twice would say nothing
                      twice. */}
                  {row.label ? (
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                      <Clip text={row.companyName} className="max-w-full" />
                      {row.projectName ? (
                        <>
                          <span aria-hidden="true" className="text-faint">
                            ·
                          </span>
                          <Clip text={row.projectName} className="max-w-full text-muted-foreground" />
                        </>
                      ) : null}
                    </span>
                  ) : null}
                  {/* Her reason, under the company it is about: a line, so it
                      sits where the row starts and not at the far edge. */}
                  {row.reason ? (
                    <Prose line text={row.reason} className="text-xs text-muted-foreground" />
                  ) : null}
                </span>
              </Link>

              {/* Above the row's door, like the call card's (D71). */}
              <div className={WORK_ROW_ACTIONS}>
                {lead && answers ? (
                  <AcknowledgeLeadButton companyId={row.id} companyName={row.companyName} />
                ) : null}
                <ReportButton
                  companyId={row.companyId}
                  companyName={row.companyName}
                  // On the paper the row is about, where the paper still takes
                  // reports; on the company alone where its job is finished.
                  quotationId={row.paperTakesReports && row.reasonKey !== "day.refused" ? row.id : null}
                  dispatchId={row.paperTakesReports && row.reasonKey === "day.refused" ? row.id : null}
                  variant="outline"
                  size="sm"
                  aria-label={t("reports.addFor", { name: row.companyName })}
                  icon
                >
                  {t("common.addReport")}
                </ReportButton>
              </div>
            </li>
          );
        })}
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
