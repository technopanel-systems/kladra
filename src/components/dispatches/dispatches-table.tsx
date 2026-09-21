"use client";

import { STATUS_KEYS } from "@/components/dispatches/status-words";
import { Fragment, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { DispatchActions } from "@/components/dispatches/dispatch-actions";
import type { DispatchScope } from "@/components/dispatches/dispatch-brand";
import { ToneNote } from "@/components/dispatches/tone-note";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { Empty } from "@/components/ui-ext/empty";
import { ListSearch } from "@/components/ui-ext/list-search";
import { NoteBlock } from "@/components/ui-ext/note-block";
import { RaisedBy } from "@/components/ui-ext/raised-by";
import { Prose } from "@/components/ui-ext/prose";
import type { DispatchDraft } from "@/components/dispatches/request-dispatch-dialog";
import type { Waited } from "@/lib/waiting";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { RecordPanel } from "@/components/ui-ext/record-panel";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { Board, type BoardColumn } from "@/components/ui-ext/board";
import { Money, Ref, Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { paymentDetailLabel, paymentTermsLabel } from "@/lib/payment";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { WaitedFor } from "@/components/ui-ext/waited-for";
import { formatMoney, formatSqm, lineTotal, loadTotals, serviceTotal } from "@/lib/money";
import type { CreditLine } from "@/lib/credit-rows";
import type {
  DispatchItemRow,
  DispatchRow,
  DispatchServiceRow,
  DispatchStatus,
} from "@/lib/dispatches";
import { dispatchTone } from "@/lib/state-tone";
import { formatDay } from "@/lib/dates";
import { lossReasonLabel } from "@/lib/loss-reason";
import { ViewSwitch } from "@/components/ui-ext/view-switch";
import type { ListView } from "@/lib/view";
import { cn } from "@/lib/utils";
import { useArrivedIds } from "@/hooks/use-arrived";

/**
 * The dispatches screen and the drawer it opens, built the same way as
 * quotations (DESIGN §2: work happens in a drawer over the list).
 *
 * A status is a word with a dot in its tone (DESIGN §1, §6). There are only
 * three of them here and one of them, Approved, is the whole month — so it says
 * Approved.
 *
 * The list carries metres and never money. A dispatch is goods, and what it is
 * worth is on the drawer, from the same function its form adds it up with; a
 * figure in a column would be a second definition of a number finance already
 * owns (S31).
 */


/** What a status chip that finds nothing says: a sentence each, in lower case. */
const EMPTY_KEYS: Record<DispatchStatus, string> = {
  submitted: "dispatches.emptySubmitted",
  approved: "dispatches.emptyApproved",
  refused: "dispatches.emptyRefused",
};

const FILTERS: DispatchStatus[] = ["submitted", "approved", "refused"];

/**
 * The board's columns: every status, off the map above. Today it is the same
 * three the chips offer, and it is written this way so it stays true — the
 * quotations board was built from its chips and lost every withdrawn request
 * the day one existed.
 */
const BOARD_STATUSES = Object.keys(STATUS_KEYS) as DispatchStatus[];

/**
 * The same list is two screens: the rep's dispatches and the coordinator's
 * queue. Every link it builds stays on the screen it was built from.
 */
function listHref(
  base: string,
  param: string,
  q: string,
  status: DispatchStatus | null,
  open?: string | null,
  view?: ListView,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (open) params.set(param, open);
  // Written whenever a caller names one — "list" included, because it has to be
  // sayable in a URL or the cookie wins and the board never goes away.
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function StatusBadge({ status, className }: { status: DispatchStatus; className?: string }) {
  const t = useTranslations();
  return (
    <StateBadge tone={dispatchTone(status)} className={className}>
      {t(STATUS_KEYS[status])}
    </StateBadge>
  );
}

/**
 * The load is not what its quotation said (SPEC §3, P13) — a word with the
 * amber dot of "somebody will look at this", never the tone alone. What differs
 * is the drawer's to say; the row only has to be found.
 */
function DiffersChip() {
  const t = useTranslations();
  return (
    <span data-slot="differs-chip" className="flex">
      <StateBadge tone="wait">{t("dispatches.differsChip")}</StateBadge>
    </span>
  );
}

/**
 * The job a load is for, and the word for a load with none — never an empty
 * cell (SPEC §3, P13). The project was marked lost after this was raised
 * (D138): a dead project is not work to price, and nothing on her desk said so.
 */
function ProjectOf({ row }: { row: DispatchRow }) {
  const t = useTranslations();
  return (
    <>
      <span className="flex min-w-0">
        <Clip text={row.projectName ?? t("dispatches.noProject")} />
      </span>
      {row.projectLostOn ? (
        <ToneNote tone="bad" slot="project-lost" className="text-xs text-foreground">
          {t("common.projectLost")}
        </ToneNote>
      ) : null}
    </>
  );
}

/**
 * The quotation a load is against, named the way the quotations list leads
 * (P12-11): SMAC's number, with Kladra's under it where there are two. A
 * cross-reference is looked up, so it says the number she will search for.
 * Where there is none, the word for a direct load (SPEC §3, P13).
 *
 * `desk` is the coordinator's queue, where this sits under the load's own number
 * in a smaller face rather than in a column of its own, and the "differs" chip
 * goes to the customer's cell, which is the one with the width to wrap it.
 */
function PaperOf({ row, desk = false }: { row: DispatchRow; desk?: boolean }) {
  const t = useTranslations();
  const face = desk ? "block text-xs text-muted-foreground" : "text-sm";
  return (
    <>
      {row.quotationLabel ? (
        <Ref slot="row-quotation" className={face}>
          {row.smacNumber ?? row.quotationLabel}
        </Ref>
      ) : (
        <span data-slot="row-direct" className={face}>
          {t("dispatches.direct")}
        </span>
      )}
      {row.smacNumber ? (
        <Ref slot="row-quotation-second" className="block text-xs text-muted-foreground">
          {row.quotationLabel}
        </Ref>
      ) : null}
      {desk && row.superseded ? (
        <ToneNote tone="wait" slot="revised-since" className="text-xs text-foreground">
          {t("dispatches.revisedSince")}
        </ToneNote>
      ) : null}
      {row.differs && !desk ? (
        <span className="mt-1 flex">
          <DiffersChip />
        </span>
      ) : null}
    </>
  );
}

export function DispatchesTable({
  base,
  param = "open",
  rows,
  q,
  status,
  openId,
  view = "list",
  remembered,
  showFilters = true,
  showSearch = true,
  waiting,
  hidden = 0,
}: {
  /** "/dispatches" or "/queue" — locale-free, the way @/i18n/navigation wants it. */
  base: string;
  /**
   * Which query parameter carries the open row. "open" everywhere except the
   * coordinator's queue, which shows both chains at once and would otherwise
   * open a quotation and a dispatch on the same word.
   */
  param?: string;
  rows: DispatchRow[];
  q: string;
  status: DispatchStatus | null;
  openId: string | null;
  /** List or board (DESIGN §6). The queue has one state and shows neither. */
  view?: ListView;
  /**
   * The view this person had remembered when the page was drawn, passed
   * through to the switch so it writes only when he changes it (D164). The
   * queue shows no switch and passes none.
   */
  remembered?: string;
  showFilters?: boolean;
  /** The queue draws ONE box over both its lists, so its tables draw none. */
  showSearch?: boolean;
  /** How long each row has waited, by id. The queue passes it; nothing else
   *  does — see the same prop on QuotationsTable (D59). */
  waiting?: Record<string, Waited>;
  /**
   * How many dispatches the chosen status chip is hiding, counted by the page
   * only when it hides every one of them — the number the filtered-out sentence
   * says (DESIGN §8: a filter that hides every row says how many).
   */
  hidden?: number;
}) {
  const t = useTranslations();
  // Rows somebody else touched in the last two seconds (D105): the companies
  // and projects lists had this since P8; these two, and the queue built from
  // them, did not — so a request that landed while the desk was watching looked
  // like one that had always been there. The clock starts when these rows are
  // on screen, which the hook reports from `rows`.
  const arrived = useArrivedIds(rows);
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  // The box is `ListSearch` now; what is left here is the way OUT of a search
  // from the empty list, which is a navigation and not a second search box.
  // Where the SCREEN owns the search, the way out is the screen's own address
  // and not this table's status (D137).
  function clearTerm() {
    go(listHref(base, param, "", showSearch ? status : null));
  }

  /** The three states a dispatch can be in, in the order it moves through them. */
  const columns: BoardColumn[] = BOARD_STATUSES.map((value) => ({
    key: value,
    label: t(STATUS_KEYS[value]),
    tone: dispatchTone(value),
    cards: rows
      .filter((row) => row.status === value)
      .map((row) => ({
        id: row.id,
        href: listHref(base, param, q, null, row.id, "board"),
        // The number anybody says out loud, which is SMAC's once there is one
        // (P12-11). A board card has room for one number and this is it; the
        // list beside it carries both, and the drawer carries both.
        label: row.smacDispatchNumber ?? row.label,
        title: row.companyName,
        // A direct load has no job: the card says what it is instead (SPEC §3, P13).
        subtitle: row.projectName ?? (row.quotationId ? null : t("dispatches.direct")),
        sqm: row.totalSqm,
        day: row.approvedOn ?? row.createdOn,
        current: openId === row.id,
      })),
  }));

  return (
    <div className="flex flex-col gap-4">
      {showFilters ? (
        <FilterRow
          lead={
            <ViewSwitch
              screen="dispatches"
              view={view}
              remembered={remembered}
              listHref={listHref(base, param, q, status, null, "list")}
              boardHref={listHref(base, param, q, null, null, "board")}
            />
          }
          all={
            view === "board" ? null : (
              <FilterChip href={listHref(base, param, q, null)} active={status === null}>
                {t("common.all")}
              </FilterChip>
            )
          }
        >
          {view === "board"
            ? null
            : FILTERS.map((value) => (
                <FilterChip
                  key={value}
                  href={listHref(base, param, q, status === value ? null : value)}
                  active={status === value}
                >
                  {t(STATUS_KEYS[value])}
                </FilterChip>
              ))}
        </FilterRow>
      ) : null}

      {showSearch ? (
        <ListSearch
          q={q}
          keep={{ status }}
          label={t("dispatches.searchLabel")}
          placeholder={t("dispatches.searchPlaceholder")}
          clearLabel={t("common.clear")}
          className="max-w-md sm:max-w-md"
        />
      ) : null}

      <div
        className={cn("transition-opacity duration-150", pending && "opacity-60")}
        aria-busy={pending}
      >
        {rows.length === 0 ? (
          // Before the board: three empty columns say nothing about why (P11G).
          <EmptyDispatches
            base={base}
            q={q}
            status={status}
            fixed={!showFilters}
            hidden={hidden}
            onClear={clearTerm}
          />
        ) : view === "board" && showFilters ? (
          <Board columns={columns} />
        ) : (
          <>
            {/* 375: cards. Six columns on a phone is a horizontal scroll. And on
                her desk between `lg` and `xl`, where the two halves sit side by
                side and half of that screen is a phone's width (SPEC §3 P13). */}
            <div className={cn("flex flex-col gap-2 md:hidden", waiting && "lg:flex xl:hidden")}>
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={listHref(base, param, q, status, row.id)}
                  className={cn(
                    "card-face hover-tint flex items-start gap-3 p-3",
                    arrived.has(row.id) && "row-arrived",
                  )}
                >
                  {/* The company's face at a card's size (DESIGN §1b: 32 in a
                      card, a company square), so a column of loads reads as
                      the customers they are for before a word is read. */}
                  <Avatar id={row.companyId} name={row.companyName} kind="company" size="md" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Ref className="font-medium">{row.smacDispatchNumber ?? row.label}</Ref>
                        <LinkPending />
                      </span>
                      {waiting?.[row.id] ? (
                        <WaitedFor waited={waiting[row.id]} className="shrink-0" />
                      ) : (
                        <StatusBadge status={row.status} className="shrink-0" />
                      )}
                    </span>
                    {/* The name at its own end (Clip): an Arabic customer on an
                        English card kept its last word and lost its first. */}
                    <span className="flex min-w-0 text-sm">
                      <Clip text={row.companyName} />
                    </span>
                    {/* On the queue the row is somebody's request (S54, D116). */}
                    {waiting ? (
                      <span data-slot="row-rep" className="flex min-w-0 text-xs text-muted-foreground">
                        <Clip text={row.repName} />
                      </span>
                    ) : null}
                    <RaisedBy name={row.raisedByName} className="truncate" />
                    {/* The paper was revised after this was raised: approval would
                        refuse it (D85), so the row says it first (P11E). */}
                    {waiting && row.superseded ? (
                      <ToneNote tone="wait" slot="revised-since" className="text-xs">
                        {t("dispatches.revisedSince")}
                      </ToneNote>
                    ) : null}
                    {row.projectName || !row.quotationId ? (
                      <span className="flex min-w-0 text-xs text-muted-foreground">
                        <Clip text={row.projectName ?? t("dispatches.direct")} />
                      </span>
                    ) : null}
                    {/* The load is not what its paper said (SPEC §3, P13): a word
                        and a dot, on the row the desk scans. */}
                    {row.differs ? <DiffersChip /> : null}
                    {/* The project was marked lost after this was raised (D138). A dead
                        project is not work to price, and nothing on her desk said so. */}
                    {row.projectLostOn ? (
                      <ToneNote tone="bad" slot="project-lost" className="text-xs">
                        {t("common.projectLost")}
                      </ToneNote>
                    ) : null}
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Sqm value={row.totalSqm} className="text-sm" />
                      {waiting ? null : (
                        <DayText
                          day={row.approvedOn ?? row.createdOn}
                          locale={locale}
                          className="text-xs text-muted-foreground"
                        />
                      )}
                    </span>
                    <SplitNames names={row.creditNames} />
                  </span>
                </Link>
              ))}
            </div>

            <div className={cn("card-face hidden md:block", waiting && "lg:hidden xl:block")}>
              <Table label={t("common.dispatches")}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3">
                      {t("common.dispatch")}
                    </TableHead>
                    <TableHead className="px-3">
                      {t("common.company")}
                    </TableHead>
                    {/* On her desk the job folds under its customer and the paper
                        under the load's own number: half a screen wide from `lg`
                        (SPEC §3 P13), six columns scrolled the wait off its edge. */}
                    {waiting ? null : (
                      <TableHead className="px-3">
                        {t("common.project")}
                      </TableHead>
                    )}
                    {waiting ? null : (
                      <TableHead className="px-3">
                        {t("common.quotation")}
                      </TableHead>
                    )}
                    <TableHead className="px-3 text-end">
                      {t("common.sqm")}
                    </TableHead>
                    <TableHead className="px-3">
                      {waiting ? t("queue.waited") : t("common.status")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={openId === row.id ? "selected" : undefined}
                      // The whole row opens the record, not only the first cell
                      // (P12-11): `row-door` stretches that cell's own link over
                      // the row, so it stays one anchor and one tab stop.
                      className={cn("row-door", arrived.has(row.id) && "row-arrived")}
                    >
                      <TableCell className="p-0">
                        <Link
                          data-door
                          href={listHref(base, param, q, status, row.id)}
                          aria-current={openId === row.id ? "true" : undefined}
                          className="block px-3 py-2"
                        >
                          {/* SMAC's number leads where there is one, and Kladra's own
                              goes quietly under it (P12-11) — the same swap the
                              quotations list makes, and for the same reason. */}
                          <span className="flex items-center gap-2">
                            <Ref slot="row-number" className="font-medium">
                              {row.smacDispatchNumber ?? row.label}
                            </Ref>
                            <LinkPending />
                          </span>
                          {row.smacDispatchNumber ? (
                            <Ref
                              slot="row-second-number"
                              className="block text-xs text-muted-foreground"
                            >
                              {row.label}
                            </Ref>
                          ) : null}
                          {/* On the desk, the paper under the load's own number:
                              the half is too narrow for a column of its own. */}
                          {waiting ? <PaperOf row={row} desk /> : null}
                        </Link>
                      </TableCell>
                      {/* The one cell on the desk that may wrap: the customer's
                          name is what the row is FOR, so it is the column that
                          takes the width rather than gives it up (DESIGN §5). On
                          the list it keeps one line and is cut at its own end. */}
                      <TableCell
                        className={cn("px-3 py-2", waiting ? "whitespace-normal" : "max-w-[18rem]")}
                      >
                        <span className={cn("flex min-w-0 gap-2", waiting ? "items-start" : "items-center")}>
                          <Avatar id={row.companyId} name={row.companyName} kind="company" size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            {waiting ? (
                              <span className="min-w-0 break-words">
                                <bdi>{row.companyName}</bdi>
                              </span>
                            ) : (
                              <Clip text={row.companyName} column />
                            )}
                            {waiting ? (
                              <span
                                data-slot="row-rep"
                                className="block text-xs text-muted-foreground"
                              >
                                {row.repName}
                              </span>
                            ) : null}
                            <RaisedBy name={row.raisedByName} />
                            {waiting ? (
                              <>
                                <span className="flex min-w-0 flex-col text-xs text-muted-foreground">
                                  <ProjectOf row={row} />
                                </span>
                                {row.differs ? (
                                  <span className="mt-1 flex">
                                    <DiffersChip />
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                          </span>
                        </span>
                      </TableCell>
                      {waiting ? null : (
                        <TableCell className="max-w-[16rem] px-3 py-2 text-muted-foreground">
                          <span className="flex min-w-0 flex-col">
                            <ProjectOf row={row} />
                          </span>
                        </TableCell>
                      )}
                      {waiting ? null : (
                        <TableCell className="px-3 py-2">
                          <PaperOf row={row} />
                        </TableCell>
                      )}
                      <TableCell className="px-3 py-2 text-end">
                        <span dir="ltr" className="num">
                          {formatSqm(row.totalSqm)}
                        </span>
                        <SplitNames names={row.creditNames} />
                      </TableCell>
                      <TableCell className={cn("px-3 py-2", waiting && "whitespace-normal")}>
                        <span className="flex flex-col items-start gap-1">
                          {waiting?.[row.id] ? (
                            <WaitedFor waited={waiting[row.id]} className="font-medium" />
                          ) : (
                            <StatusBadge status={row.status} />
                          )}
                          <DayText
                            day={row.approvedOn ?? row.createdOn}
                            locale={locale}
                            className="text-xs text-muted-foreground"
                          />
                        </span>
                      </TableCell>
                    </TableRow>
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
 * Nothing to draw, and the kinds of nothing are different sentences (DESIGN §8).
 *
 * - **No results**: the words matched nothing, and the way out is to clear them.
 * - **Filtered out**: the chip is hiding every dispatch there is, so the sentence
 *   says how many and the button shows them.
 * - **A status the page fixed** (the queue) offers no "All" to go to (P11G).
 * - **First use**: nothing at all yet, and where a load comes from. It never
 *   draws Request dispatch a second time (§2); it is at the top already.
 * - **Could not load** is not an empty list; the screen's error card draws it.
 */
function EmptyDispatches({
  base,
  q,
  status,
  fixed,
  hidden,
  onClear,
}: {
  base: string;
  q: string;
  status: DispatchStatus | null;
  /** The page chose the status (the queue): there is no "All" to go to (P11G). */
  fixed: boolean;
  hidden: number;
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
        {t("dispatches.emptySearch", { q })}
      </Empty>
    );
  }

  if (status) {
    // A sentence per state, not a state's label dropped mid-sentence: the label
    // is a capitalised chip word and read "Nothing is Refused right now".
    const words = t(EMPTY_KEYS[status]);
    return fixed || hidden === 0 ? (
      <Empty>{words}</Empty>
    ) : (
      <Empty
        action={
          <Button asChild variant="outline">
            {/* A chip hides rows only on the list (the board shows every
                state), so the way back is the list, whatever was remembered. */}
            <Link href={listHref(base, "open", "", null, null, "list")}>{t("dispatches.showAll")}</Link>
          </Button>
        }
      >
        {words} {t("dispatches.hiddenByFilter", { count: hidden })}
      </Empty>
    );
  }

  // A dispatch is raised from an issued quotation or direct (S38, SPEC §3 P13),
  // and the button that raises one is at the top of the screen.
  return <Empty>{t("dispatches.empty")}</Empty>;
}

/* -------------------------------------------------------------------------- */
/* The drawer the URL opens. Its data is read by the server component in       */
/* dispatch-drawer.tsx; everything interactive lives here.                     */
/* -------------------------------------------------------------------------- */

/** Closing the drawer drops `?open=` and leaves the search and status alone. */
export function useCloseDrawer(param: string): () => void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return () => {
    const next = new URLSearchParams(params.toString());
    next.delete(param);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}

export type DispatchSheetProps = {
  dispatch: DispatchRow & {
    /** Which stores the load leaves from (SPEC §3, P12-9, P14). */
    warehouses: { id: number; name: string }[];
    /** Its services, in their own section as on the quotation (SPEC §3, P13). */
    services: DispatchServiceRow[];
  };
  /**
   * Who its metres count for (D148). Drawn only when it is worth saying —
   * more than one name, or one name that is not the man who raised it — so an
   * ordinary dispatch is not made to answer a question nobody asked.
   */
  credit: CreditLine[];
  /**
   * What happened to it, oldest first (D143). A node rather than data, for the
   * reason `QuotationSheetProps.history` gives.
   */
  history: ReactNode;
  /**
   * "Differs from Q-12", in words (SPEC §3, P13) — null where it matches its
   * paper or has none. A node for the same reason the trail is one.
   */
  difference: ReactNode;
  /** "Add report", opening on this customer and this load (SPEC §3, P13). */
  report?: ReactNode;
  items: DispatchItemRow[];
  draft: DispatchDraft;
  scope: DispatchScope;
  /**
   * Whether the reader is the person the load counts for. His own name on his
   * own load is a word to read past (D116), so the head names him only to
   * somebody else.
   */
  mine: boolean;
  /** The parameter that opened it, so closing drops the right one. */
  param?: string;
};

/**
 * **A drawer has a hierarchy** (DESIGN §6; P13-G6, S12.5), the one the company's
 * and the project's drawers were given. At the top, who: the customer's own
 * square beside the load's number and where it stands, with the customer and the
 * job under them. Then the figures the load is opened for — its square metres
 * first, because they are the month (S41), then the paper it loads, its day and
 * SMAC's number for it. Then what stops it, and the actions. Under the actions,
 * what happened to it. Then the load itself: its lines, its services, what it
 * comes to, and how it travels and is paid for.
 *
 * It opened on a bare row of facts, with its metres three screens down in the
 * totals block and its trail last, under the payment note.
 */
export function DispatchSheet({
  dispatch,
  credit,
  history,
  difference,
  report,
  items,
  draft,
  scope,
  mine,
  param = "open",
}: DispatchSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const close = useCloseDrawer(param);
  // What the load comes to, by the function the form adds it up with while the
  // rep types (money.ts) — on the stored figures, so the two agree to the halala.
  const totals = loadTotals(items, dispatch.services);
  const split = credit.length > 0 && (credit.length > 1 || credit[0].userId !== dispatch.repId);
  // Whom it counts for, where the reader is not him; "For" where the
  // coordinator raised it on his behalf, with her name on the line under it
  // (SPEC §3 P13).
  const person = mine
    ? null
    : t(dispatch.raisedByName ? "dispatches.forName" : "common.onBehalf.raisedBy", {
        name: dispatch.repName,
      });

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <RecordPanel className="scroller">
        <SheetHeader className="gap-4 border-b border-line p-4">
          {/* Who: the customer's own square (DESIGN §1b: 40 at a drawer's head),
              the load's number and where it stands, then the customer and the
              job it is going to. */}
          <div className="flex items-start gap-3 pe-10">
            <Avatar id={dispatch.companyId} name={dispatch.companyName} kind="company" size="lg" />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* Kladra's own name for its own record (D161): SMAC's is a figure below. */}
                <SheetTitle className="text-lg leading-tight font-semibold">
                  <Ref>{dispatch.label}</Ref>
                </SheetTitle>
                <StatusBadge status={dispatch.status} />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  <bdi>{dispatch.companyName}</bdi>
                </span>
                {/* The job, where there is one. A direct load says Direct once,
                    where its quotation would be named, in the strip below. */}
                {/* Each separator travels with the value after it, so a line that
                    wraps starts with its dot rather than leaving one hanging. */}
                {dispatch.projectName ? (
                  <span data-slot="who-project">
                    <span aria-hidden="true" className="me-2 text-faint">
                      ·
                    </span>
                    <bdi>{dispatch.projectName}</bdi>
                  </span>
                ) : null}
                {person ? (
                  <span data-slot="who-for">
                    <span aria-hidden="true" className="me-2 text-faint">
                      ·
                    </span>
                    {person}
                  </span>
                ) : null}
              </SheetDescription>
              <RaisedBy name={dispatch.raisedByName} place="drawer" />
            </div>
          </div>

          {/* What the drawer is opened to check, before anything about how it
              was raised (DESIGN §6): how much, against which paper, which day,
              and the number SMAC gave it. */}
          <StandingStrip
            items={[
              {
                label: t("common.sqm"),
                value: (
                  <span data-slot="figure-sending">
                    {/* The label above already says m². */}
                    <Sqm value={dispatch.totalSqm} unit={false} />
                  </span>
                ),
              },
              {
                label: t("common.quotation"),
                value: dispatch.quotationId ? (
                  <Link
                    href={`/quotations?open=${dispatch.quotationId}`}
                    className="underline decoration-line-strong underline-offset-4 hover:decoration-current"
                  >
                    {/* The number she would search SMAC for (P12-11). */}
                    <Ref>{dispatch.smacNumber ?? dispatch.quotationLabel}</Ref>
                  </Link>
                ) : (
                  // No paper behind it: the word, never a dead link (SPEC §3, P13).
                  <span data-slot="fact-direct">{t("dispatches.direct")}</span>
                ),
                // And Kladra's own quietly under SMAC's, as every row names it.
                caption:
                  dispatch.quotationId && dispatch.smacNumber ? (
                    <Ref>{dispatch.quotationLabel}</Ref>
                  ) : undefined,
              },
              {
                label: t("common.date"),
                value: <DayText day={dispatch.approvedOn ?? dispatch.createdOn} locale={locale} />,
              },
              {
                label: t("common.smacDispatchNumber"),
                value: dispatch.smacDispatchNumber ? (
                  <Ref slot="figure-smac">{dispatch.smacDispatchNumber}</Ref>
                ) : (
                  <span className="text-faint">—</span>
                ),
              },
            ]}
          />

          {/* The project is lost and this material is still going out to it
              (D138): a band in the tone of an ending, across the head, with the
              day and why. A dispatch is not withdrawn by anybody's decision the
              way a request can be, so the one thing the desk can do about it is
              know before approving. */}
          {dispatch.projectLostOn ? (
            <p
              data-slot="project-lost"
              className="rounded-xl bg-state-bad px-3 py-2 text-sm text-state-bad-fg"
            >
              <span className="font-medium">
                {t("common.projectLostOn", { date: formatDay(dispatch.projectLostOn, locale) })}
              </span>
              {dispatch.projectLostReason ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <bdi>{lossReasonLabel(dispatch.projectLostReason, t)}</bdi>
                </>
              ) : null}
            </p>
          ) : null}

          {/* Why she sent it back, in her words, where he reads it before he
              corrects it (S53). */}
          {dispatch.status === "refused" && dispatch.refuseReason ? (
            <NoteBlock
              title={t("dispatches.refusedReason")}
              text={dispatch.refuseReason}
              slot="refused-reason"
            />
          ) : null}

          {/* Above the buttons, so the desk reads what differs before she
              approves it and the rep reads it before he corrects it. */}
          {difference}

          <DispatchActions
            dispatch={{
              id: dispatch.id,
              label: dispatch.label,
              status: dispatch.status,
              companyName: dispatch.companyName,
              smacDispatchNumber: dispatch.smacDispatchNumber,
              superseded: dispatch.superseded,
              draft,
            }}
            scope={scope}
            report={report}
          />
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          {/* What happened to it, straight under what can be done about it
              (DESIGN §6): the refusal and its reason, the edit that answered
              it, the approval and the number. It was the last thing on the
              drawer, under the payment note. */}
          {history}

          {/* The whole sheet per line, as the quotation drawer draws its own
              (SPEC §3, P13): a direct load has no paper to open, so this card is
              the paper the desk approves — every input the rep typed, what the
              line comes to, and on a carried line her check against what was
              quoted (D112, D12). */}
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="dispatch-item"
                data-position={item.position}
                className="card-face flex flex-col gap-2 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">
                    {t("quotations.itemNumber", { number: item.position })}
                  </h4>
                  <span className="text-sm" data-slot="figure-line-total">
                    <Money value={lineTotal(item)} currency={false} />
                  </span>
                </div>
                {/* A line the rep added to a load that has a paper: said in a
                    sentence of its own, never as a fact whose value repeats its
                    label. A direct load's lines are all its own, and say nothing. */}
                {item.quotedQty === null && dispatch.quotationId ? (
                  <p data-slot="line-not-on-paper" className="text-xs text-muted-foreground">
                    {t("dispatches.lineNotOnPaper")}
                  </p>
                ) : null}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <Fact label={t("common.colourCode")}>
                    <span dir="ltr" className="num">
                      {item.colourCode}
                    </span>
                  </Fact>
                  <Fact label={t("common.supplier")}>{item.supplier}</Fact>
                  <Fact label={t("common.fireRating")}>{item.fireRating}</Fact>
                  <Fact label={t("common.class")}>{item.className}</Fact>
                  <Fact label={t("common.thickness")}>
                    <span dir="ltr" className="num">
                      {item.thickness}
                    </span>
                  </Fact>
                  <Fact label={t("quotations.sheet")}>
                    <span dir="ltr" className="num">
                      {item.width} × {item.length}
                    </span>
                  </Fact>
                  <Fact label={t("dispatches.sending")}>
                    <span dir="ltr" className="num">
                      {item.qty}
                    </span>
                  </Fact>
                  <Fact label={t("common.pricePerSqm")}>
                    <span dir="ltr" className="num" data-slot="figure-line-price">
                      {formatMoney(item.pricePerSqm)}
                    </span>
                  </Fact>
                  <Fact label={t("common.sqm")}>
                    <span dir="ltr" className="num" data-slot="figure-line-sqm">
                      {formatSqm(item.sqm)}
                    </span>
                  </Fact>
                  {/* What the paper asked for, what other loads hold and what is
                      left — only where there is a quotation line behind it. */}
                  {item.quotedQty !== null ? (
                    <>
                      <Fact label={t("dispatches.quoted")}>
                        <span dir="ltr" className="num">
                          {item.quotedQty}
                        </span>
                      </Fact>
                      <Fact label={t("dispatches.elsewhere")}>
                        <span dir="ltr" className="num" data-slot="figure-elsewhere">
                          {item.elsewhereQty}
                        </span>
                      </Fact>
                      <Fact label={t("dispatches.remaining")}>
                        <span dir="ltr" className="num" data-slot="figure-left-after">
                          {item.leftAfter}
                        </span>
                      </Fact>
                    </>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>

          {/* The services on this load, as on its quotation: which one, the m²
              it is done over, its price per m², what it comes to, and their
              subtotal (SPEC §3, P13). Its m² is money and never metres, so it is
              not in the figure below (D173). */}
          {dispatch.services.length > 0 ? (
            <section aria-labelledby="dispatch-services-heading" className="flex flex-col gap-2">
              <h3 id="dispatch-services-heading" className="text-sm font-medium">
                {t("quotations.services")}
              </h3>
              <ul className="flex flex-col gap-2">
                {dispatch.services.map((service) => (
                  <li
                    key={service.id}
                    data-slot="dispatch-service"
                    className="card-face flex flex-col gap-2 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="flex min-w-0 text-sm font-medium">
                        <Clip text={service.name} />
                      </h4>
                      <span className="text-sm" data-slot="figure-service-total">
                        <Money value={serviceTotal(service)} currency={false} />
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <Fact label={t("common.sqm")}>
                        <span dir="ltr" className="num">
                          {formatSqm(service.sqm)}
                        </span>
                      </Fact>
                      <Fact label={t("common.pricePerSqm")}>
                        <span dir="ltr" className="num">
                          {formatMoney(service.pricePerSqm)}
                        </span>
                      </Fact>
                    </dl>
                  </li>
                ))}
              </ul>
              <p
                data-slot="services-subtotal"
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <span className="text-muted-foreground">{t("quotations.servicesSubtotal")}</span>
                <span>
                  <span dir="ltr" className="num font-medium">
                    {formatMoney(totals.services)}
                  </span>{" "}
                  {t("common.sar")}
                </span>
              </p>
            </section>
          ) : null}

          <dl data-slot="totals" className="card-face flex flex-col gap-2 p-3 text-sm">
            {/* The figure the load puts on the month (S41), as the form's own
                totals lead with it, then who it counts for, then what it comes
                to. A label in the sentence's case (DESIGN §8): the capitals and
                the tracking were the PDF's eyebrow, and in Arabic tracking pulls
                the joins apart. */}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs text-muted-foreground">{t("common.sqm")}</dt>
              <dd className="num text-xl leading-none font-semibold" dir="ltr">
                {formatSqm(dispatch.totalSqm)}
              </dd>
            </div>
            {split ? (
              // Why his target moved by less than the figure above it. A rep
              // who cannot see this on the row has to be told (D148).
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{t("common.credit.label")}</dt>
                <dd className="flex flex-col gap-1" data-slot="credit-lines">
                  {credit.map((line) => (
                    <span key={line.userId} className="flex items-baseline justify-between gap-4">
                      <bdi>{line.name}</bdi>
                      <span dir="ltr" className="num">
                        {formatSqm(line.sqm)}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            <div className="border-t border-line" />
            {/* What the load comes to, the five figures a quotation's totals
                are, from the same function (money.ts): the panels and the
                services apart where there are services, then before VAT, VAT
                and the total (SPEC §3, P13, D169). */}
            {dispatch.services.length > 0 ? (
              <>
                <Row label={t("quotations.panelsSubtotal")} slot="figure-panels">
                  <Amount value={totals.panels} sar={t("common.sar")} />
                </Row>
                <Row label={t("quotations.servicesSubtotal")} slot="figure-services">
                  <Amount value={totals.services} sar={t("common.sar")} />
                </Row>
              </>
            ) : null}
            <Row label={t("common.totalExclVat")} slot="figure-subtotal">
              <Amount value={totals.subtotal} sar={t("common.sar")} />
            </Row>
            <Row label={t("common.vatRate")} slot="figure-vat">
              <Amount value={totals.vat} sar={t("common.sar")} />
            </Row>
            <div className="border-t border-line pt-2">
              <Row label={t("common.grandTotal")} slot="figure-total" strong>
                <Amount value={totals.total} sar={t("common.sar")} />
              </Row>
            </div>
          </dl>

          {/* How it leaves and how it is paid for: the labelled group (DESIGN
              §8), each label in the drawer's one label column and its value
              beside it (§1b). Where it leaves from, before how it travels and
              where it goes, which is the order the load happens in (SPEC §3,
              P12-9); then the terms, and on credit the rep's own words, which
              finance reads (SPEC §3 P13). */}
          <section aria-labelledby="dispatch-terms-heading" className="flex flex-col gap-2">
            <h3 id="dispatch-terms-heading" className="text-xs font-medium text-muted-foreground">
              {t("dispatches.terms")}
            </h3>
            <dl
              data-slot="terms"
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm"
            >
              {/* One store on almost every load, and the rare second beside
                  it, each its own run (rules/words.md). */}
              <Term label={t("common.warehouse")}>
                {dispatch.warehouses.map((store, index) => (
                  <Fragment key={store.id}>
                    {index > 0 ? <span aria-hidden="true"> · </span> : null}
                    <bdi>{store.name}</bdi>
                  </Fragment>
                ))}
              </Term>
              <Term label={t("common.shipment")}>{dispatch.shipmentMethod}</Term>
              <Term label={t("common.destination")}>
                <bdi>{dispatch.destination}</bdi>
              </Term>
              {/* The choice, then the answer it asked for, with a mark between
                  them rather than a gap: a gap says nothing (§5 #181). */}
              <Term label={t("common.paymentTerms")}>
                {paymentTermsLabel(dispatch.paymentTerms, t)}
                {dispatch.paymentDetail ? (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      {" · "}
                    </span>
                    {paymentDetailLabel(dispatch.paymentDetail, t)}
                  </>
                ) : null}
              </Term>
              {dispatch.paymentNote ? (
                <Term label={t("common.paymentNote")}>
                  <Prose line text={dispatch.paymentNote} slot="payment-note" />
                </Term>
              ) : null}
            </dl>
          </section>
        </div>
      </RecordPanel>
    </Sheet>
  );
}

/**
 * The names a split dispatch's metres go to, under the figure itself (D148).
 *
 * Only when there is more than one, which is the only case anybody needs told:
 * a rep reading 151 m² here and 75 against his target can see why without
 * opening anything, and the manager can read a shared job down the column.
 *
 * Each name in its own bdi. The separator is neutral, so in an Arabic page it
 * would otherwise settle against the paragraph rather than against the name
 * beside it (rules/words.md).
 */
function SplitNames({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <span data-slot="split-names" className="block text-xs text-balance text-muted-foreground">
      {names.map((name, index) => (
        <Fragment key={name}>
          {/* A non-breaking space BEFORE the separator: the caption wraps now,
              and a break there would start a line with a bare middot. */}
          {index > 0 ? " · " : null}
          <bdi>{name}</bdi>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A label and its figure on one line, the figure at the end: a column of money
 * reads as a column (DESIGN §1b, numbers end).
 */
function Row({
  label,
  slot,
  strong = false,
  children,
}: {
  label: string;
  /** Names the figure for a spec, the way the quotation's totals block does. */
  slot?: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("shrink-0", strong ? "font-medium" : "text-muted-foreground")}>{label}</dt>
      <dd data-slot={slot} className={cn("min-w-0 text-end", strong && "font-semibold")}>
        {children}
      </dd>
    </div>
  );
}

/**
 * A label in the drawer's one label column and its words beside it (DESIGN §1b:
 * `w-28` on every drawer). The value WRAPS: a shipment method, a destination or
 * a payment note is words somebody typed, and at 375 "TT — a Technopanel truck"
 * was cut at the panel's edge with nothing to say so (DESIGN §5: anything whose
 * job is to be exact wraps rather than clips).
 */
function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/** A sum of money and its currency, in the figure face with the digits isolated. */
function Amount({ value, sar }: { value: number; sar: string }) {
  return (
    <>
      <span dir="ltr" className="num">
        {formatMoney(value)}
      </span>{" "}
      {sar}
    </>
  );
}

/** A small label over its value, for the facts of one line of the load. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/**
 * Never a blank panel while the query runs (DESIGN §2), and in the drawer's own
 * shape (§1b): the customer's square and two lines, the strip of four figures,
 * the action row, then the trail and a line of the load at its own height.
 * Standing still.
 */
export function DispatchSheetSkeleton({ param = "open" }: { param?: string }) {
  const t = useTranslations();
  const close = useCloseDrawer(param);
  return (
    // Closable while it loads: a drawer somebody opened by mistake is closed at
    // once, not after the record arrives and opens anyway.
    <Sheet open onOpenChange={(next) => (next ? undefined : close())}>
      <RecordPanel className="scroller" aria-busy="true">
        <SheetHeader data-slot="dispatch-skeleton" className="gap-4 border-b border-line p-4">
          <SheetTitle className="sr-only">{t("dispatches.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("dispatches.requestHint")}</SheetDescription>
          <div className="flex items-start gap-3 pe-10">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-xl sm:h-16" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 max-md:h-11" />
            <Skeleton className="h-8 w-28 max-md:h-11" />
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </RecordPanel>
    </Sheet>
  );
}
