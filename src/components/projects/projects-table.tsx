"use client";

import { useTransition, type AnimationEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useProjectFlashOf } from "@/components/projects/project-flash";
import { STAGE_KEYS } from "@/components/projects/stage-words";
import { Avatar } from "@/components/ui-ext/avatar";
import { Board, type BoardColumn } from "@/components/ui-ext/board";
import { DayText } from "@/components/ui-ext/day-text";
import { Empty } from "@/components/ui-ext/empty";
import { Sqm } from "@/components/ui-ext/figures";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { ListSearch } from "@/components/ui-ext/list-search";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { ViewSwitch } from "@/components/ui-ext/view-switch";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useArrived, useLanded } from "@/hooks/use-arrived";
import { Link, useRouter } from "@/i18n/navigation";
import type { FollowUpFilter, FollowUpState } from "@/lib/followups";
import { isLossReasonCode, lossReasonLabel } from "@/lib/loss-reason";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/project-stage";
import type { ProjectCard as ProjectBoardCard, ProjectRow } from "@/lib/projects";
import { projectStageTone, TONE_TEXT } from "@/lib/state-tone";
import type { ListView } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * The projects screen's client island: the search box (`?q=`), the follow-up
 * chips (`?filter=`), the list or the board, and the address each row opens
 * (`?open=`) — so a refresh or a shared link lands on the same screen (SPEC §3).
 * The drawer the address opens is project-sheet.tsx.
 *
 * Nothing here decides what a row means. The rows arrive already filtered,
 * ordered and state-tagged from `listProjects`: "overdue" is computed once, in
 * SQL, against Riyadh's today (src/lib/followups.ts). A second opinion drawn
 * from the browser's clock is exactly the drift the data rules forbid.
 *
 * **A row leads with its job and names its company with the company's face**
 * (P13-G6, DESIGN §1b): a 24px square in the tint of the company's own id, so a
 * customer is one colour on every screen, beside its name. A name cut to fit is
 * cut at its own end (`Clip`), never at the page's, which on an English row took
 * the FIRST word of an Arabic job — «…هة برج مكتبي» for «واجهة برج مكتبي».
 */

export type FollowUpStripCounts = { overdue: number; today: number };

/** Colour says how long something has waited, and nothing else (DESIGN §1). */
const WAITING_TEXT: Record<FollowUpState, string> = {
  overdue: TONE_TEXT.bad,
  today: TONE_TEXT.wait,
  future: "text-faint",
};

function listHref(
  q: string,
  filter: FollowUpFilter | null,
  open?: string | null,
  view?: ListView,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter) params.set("filter", filter);
  if (open) params.set("open", open);
  // Written whenever a caller names one, "list" included: without it the
  // remembered board would come straight back (the same rule as quotations).
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

/**
 * A name somebody typed, cut at its OWN end when it has to be cut (S12.1's
 * `Clip`, search-command.tsx). The box takes the name's direction and is never
 * wider than its text — no flex-1, no width — so on an English row an Arabic
 * name keeps its first word and the ellipsis lands where the name ends.
 */
function Clip({ text, className }: { text: string; className?: string }) {
  return (
    <span dir="auto" className={cn("min-w-0 truncate", className)}>
      {text}
    </span>
  );
}

function FollowUp({ day, state }: { day: string | null; state: FollowUpState | null }) {
  const locale = useLocale();
  if (!day || !state) return <span className="text-faint">—</span>;
  return <DayText day={day} locale={locale} className={WAITING_TEXT[state]} />;
}

/**
 * Where the job stands, in the board's word and tone (D170) — never a colour
 * alone (DESIGN §1), and a lost one carries its reason with it: the app's own
 * words whole, and the rep's own words for "Other" cut at their end if they
 * must be.
 */
function StateCell({ stage, lostReason }: { stage: ProjectStage; lostReason: string | null }) {
  const t = useTranslations();
  const reason = stage === "lost" ? lossReasonLabel(lostReason, t) : null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <StateBadge tone={projectStageTone(stage)} className="shrink-0">
        {t(STAGE_KEYS[stage])}
      </StateBadge>
      {reason ? (
        lostReason && isLossReasonCode(lostReason) ? (
          <span className="text-xs text-muted-foreground">{reason}</span>
        ) : (
          <Clip text={reason} className="text-xs text-muted-foreground" />
        )
      ) : null}
    </span>
  );
}

/** The arrived flash, from somebody else's change (live) or the rep's own save. */
function useRowMark(id: string): {
  className?: string;
  onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void;
} {
  const arrived = useArrived(id);
  const own = useProjectFlashOf()?.(id);
  if (own?.className) return own;
  return { className: arrived ? "row-arrived" : undefined };
}

function ProjectTableRow({
  row,
  href,
  openId,
}: {
  row: ProjectRow;
  href: string;
  openId: string | null;
}) {
  const t = useTranslations();
  const mark = useRowMark(row.id);
  return (
    <TableRow
      data-state={openId === row.id ? "selected" : undefined}
      onAnimationEnd={mark.onAnimationEnd}
      className={cn("row-door cursor-pointer", mark.className)}
    >
      <TableCell className="max-w-[18rem] px-3 py-2 font-medium">
        {/* The whole row opens the drawer while middle-click and "copy link"
            still work (globals.css `row-door`). */}
        <Link data-door href={href} className="flex min-w-0 items-center gap-2 hover:underline">
          <span className="sr-only">{t("projects.openProject", { name: row.name })}</span>
          <Clip text={row.name} />
          <LinkPending />
        </Link>
      </TableCell>
      <TableCell className="max-w-[16rem] px-3 py-2 text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar id={row.companyId} name={row.companyName} kind="company" size="sm" />
          <Clip text={row.companyName} />
        </span>
      </TableCell>
      <TableCell className="px-3 py-2 text-end">
        <Sqm value={row.expectedSqm} />
      </TableCell>
      <TableCell className="px-3 py-2">
        <FollowUp day={row.nextFollowUp} state={row.followUpState} />
      </TableCell>
      <TableCell className="max-w-[18rem] px-3 py-2">
        <StateCell stage={row.stage} lostReason={row.lostReason} />
      </TableCell>
    </TableRow>
  );
}

/** The same row on a phone: a card that is a door, with the company's face at 32 (DESIGN §1b). */
function ProjectCard({ row, href }: { row: ProjectRow; href: string }) {
  const t = useTranslations();
  const mark = useRowMark(row.id);
  return (
    <Link
      href={href}
      onAnimationEnd={mark.onAnimationEnd}
      className={cn("card-face hover-tint flex items-start gap-3 p-3", mark.className)}
    >
      <Avatar id={row.companyId} name={row.companyName} kind="company" size="md" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <Clip text={row.name} />
            <LinkPending />
          </span>
          <StateBadge tone={projectStageTone(row.stage)} className="shrink-0">
            {t(STAGE_KEYS[row.stage])}
          </StateBadge>
        </span>
        <span className="flex min-w-0 text-xs text-muted-foreground">
          <Clip text={row.companyName} />
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <Sqm value={row.expectedSqm} />
          {row.stage === "lost" ? (
            <span className="text-muted-foreground">{lossReasonLabel(row.lostReason, t)}</span>
          ) : (
            <span className="inline-flex items-baseline gap-1">
              <span className="text-muted-foreground">{t("common.nextFollowUp")}</span>
              <FollowUp day={row.nextFollowUp} state={row.followUpState} />
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

export function ProjectsTable({
  rows,
  cards,
  counts,
  q,
  filter,
  hidden,
  canAdd,
  openId,
  view,
  remembered,
}: {
  rows: ProjectRow[];
  /** The board's cards, each already in its stage — empty on the list. */
  cards: ProjectBoardCard[];
  counts: FollowUpStripCounts;
  q: string;
  filter: FollowUpFilter | null;
  /**
   * How many projects the chosen filter is hiding, counted only when it hides
   * every one of them — the number the filtered-out sentence says.
   */
  hidden: number;
  /** Whether this reader is offered Add project at the top of the screen. */
  canAdd: boolean;
  openId: string | null;
  view: ListView;
  /** What this person had remembered when the page was drawn (D164). */
  remembered?: string;
}) {
  const t = useTranslations();
  // The rows are on screen: whatever arrived while the refresh was in flight
  // starts its two seconds now (D105).
  useLanded(rows);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  // The box is `ListSearch` now; what is left here is the way OUT of a search
  // from the empty list, which is a navigation and not a second search box.
  function clearTerm() {
    go(view === "board" ? listHref("", null, null, "board") : listHref("", filter));
  }

  /** Clicking the chip you are already on takes the filter off again. */
  const chip = (value: FollowUpFilter) => listHref(q, filter === value ? null : value);

  const board = view === "board";

  /**
   * The five columns, in the order a job lives them. The stage was decided in
   * the query, before the cap; this only puts each card under its word, and a
   * column's count is the one the query counted (D80).
   */
  const columns: BoardColumn[] = PROJECT_STAGES.map((stage) => {
    const inStage = cards.filter((card) => card.stage === stage);
    return {
      key: stage,
      label: t(STAGE_KEYS[stage]),
      tone: projectStageTone(stage),
      total: inStage[0]?.inStage ?? 0,
      cards: inStage.map((card) => ({
        id: card.id,
        href: listHref(q, null, card.id, "board"),
        title: card.name,
        subtitle: card.companyName,
        sqm: card.expectedSqm,
        day: card.since,
        person: { id: card.repId, name: card.repName },
        current: openId === card.id,
      })),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {/* What is late, what is due, then the list (SPEC D9). On the board the
          chips step aside: a board of stages is every project. */}
      <FilterRow
        lead={
          <ViewSwitch
            screen="projects"
            view={view}
            remembered={remembered}
            listHref={listHref(q, filter, null, "list")}
            boardHref={listHref(q, null, null, "board")}
          />
        }
        all={
          board ? null : (
            <FilterChip href={listHref(q, null)} active={filter === null}>
              {t("common.all")}
            </FilterChip>
          )
        }
      >
        {board ? null : (
          <>
            <FilterChip href={chip("followups")} active={filter === "followups"}>
              {t("common.followUps")}
            </FilterChip>
            <FilterChip
              href={chip("overdue")}
              active={filter === "overdue"}
              tone={counts.overdue > 0 ? "bad" : undefined}
            >
              {t("projects.overdueChip", { count: counts.overdue })}
            </FilterChip>
            <FilterChip
              href={chip("today")}
              active={filter === "today"}
              tone={counts.today > 0 ? "wait" : undefined}
            >
              {t("projects.todayChip", { count: counts.today })}
            </FilterChip>
          </>
        )}
      </FilterRow>

      <ListSearch
        q={q}
        keep={{ filter: board ? null : filter, view: board ? "board" : null }}
        label={t("projects.searchLabel")}
        placeholder={t("projects.searchPlaceholder")}
        clearLabel={t("common.clear")}
        className="max-w-md sm:max-w-md"
      />

      <div
        className={cn("transition-opacity duration-150", pending && "opacity-60")}
        aria-busy={pending}
      >
        {board ? (
          cards.length === 0 ? (
            // Before the board: five empty columns say nothing about why (P11G).
            <EmptyProjects q={q} filter={null} hidden={0} canAdd={canAdd} onClear={clearTerm} />
          ) : (
            <Board columns={columns} />
          )
        ) : rows.length === 0 ? (
          <EmptyProjects q={q} filter={filter} hidden={hidden} canAdd={canAdd} onClear={clearTerm} />
        ) : (
          <>
            {/* 375: cards. Five columns on a phone is a horizontal scroll. */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <ProjectCard key={row.id} row={row} href={listHref(q, filter, row.id)} />
              ))}
            </div>

            <div className="card-face hidden md:block">
              <Table label={t("common.projects")}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3">{t("common.project")}</TableHead>
                    <TableHead className="px-3">{t("common.company")}</TableHead>
                    <TableHead className="px-3 text-end">{t("common.expectedSqm")}</TableHead>
                    <TableHead className="px-3">{t("common.nextFollowUp")}</TableHead>
                    <TableHead className="px-3">{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <ProjectTableRow
                      key={row.id}
                      row={row}
                      openId={openId}
                      href={listHref(q, filter, row.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Nothing to draw, and the four kinds of nothing are four sentences (DESIGN §8).
 *
 * - **No results**: the words matched nothing, and the way out is to clear them.
 * - **Filtered out**: the chip is hiding every project there is, so the sentence
 *   says how many and the button shows them — "nothing is overdue" over a floor
 *   of fourteen jobs read like a floor of none.
 * - **First use**: nothing at all yet. It never draws Add project a second time
 *   (§2) — the one at the top is where the work starts, and the sentence says so
 *   to the person who has it and says where projects come from to the one who
 *   does not.
 * - **Could not load** is not an empty list; the screen's error card draws it.
 */
function EmptyProjects({
  q,
  filter,
  hidden,
  canAdd,
  onClear,
}: {
  q: string;
  filter: FollowUpFilter | null;
  hidden: number;
  canAdd: boolean;
  onClear: () => void;
}) {
  const t = useTranslations();

  if (q) {
    return (
      <Empty
        action={
          <Button type="button" variant="outline" onClick={onClear}>
            {t("common.clear")}
          </Button>
        }
      >
        {t("projects.emptySearch", { q })}
      </Empty>
    );
  }

  if (filter && hidden > 0) {
    // `quiet` and `never` are COMPANY bands and never reach a chip here — a
    // project with no follow-up is not a customer who has gone silent, it is a
    // job waiting on something else (D63). The record is exhaustive so the day a
    // sixth filter lands this stops compiling rather than rendering a key.
    const sentence: Record<FollowUpFilter, string> = {
      overdue: "projects.emptyOverdue",
      today: "projects.emptyToday",
      followups: "projects.emptyFollowups",
      never: "projects.emptyNever",
      quiet: "projects.emptyFollowups",
    };
    return (
      <Empty
        action={
          <Button asChild variant="outline">
            <Link href={listHref("", null)}>{t("projects.showAll")}</Link>
          </Button>
        }
      >
        {t(sentence[filter])} {t("projects.hiddenByFilter", { count: hidden })}
      </Empty>
    );
  }

  return <Empty>{t(canAdd ? "projects.empty" : "projects.emptyReadOnly")}</Empty>;
}
