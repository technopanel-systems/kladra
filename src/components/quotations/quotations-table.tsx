"use client";

import { useTransition, type AnimationEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuotationFlashOf } from "@/components/quotations/quotation-flash";
import { STATUS_KEYS } from "@/components/quotations/status-words";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { Empty } from "@/components/ui-ext/empty";
import { RaisedBy } from "@/components/ui-ext/raised-by";
import { ListSearch } from "@/components/ui-ext/list-search";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { Ref, Money, Sqm } from "@/components/ui-ext/figures";
import { Board, type BoardColumn } from "@/components/ui-ext/board";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { WaitedFor } from "@/components/ui-ext/waited-for";
import type { QuotationRow, QuotationStatus } from "@/lib/quotations";
import type { Waited } from "@/lib/waiting";
import { quotationTone, TONE_DOT } from "@/lib/state-tone";
import { ViewSwitch } from "@/components/ui-ext/view-switch";
import type { ListView } from "@/lib/view";
import { cn } from "@/lib/utils";
import { useArrivedIds } from "@/hooks/use-arrived";

/**
 * The quotations screen's list and board, and the coordinator's queue built from
 * the same list (DESIGN §2: work happens in a drawer over the list, and the list
 * stays where it was). The drawer is quotation-sheet.tsx.
 *
 * Search, status and the open drawer all live in the URL, so a link somebody
 * sends reopens exactly what they were looking at (SPEC §3).
 *
 * A row leads with the paper's number — SMAC's where there is one (P12-11) — and
 * says whose it is with the company's own face beside its name (DESIGN §1b: 24 in
 * a row, 32 on a card, a company square), the way the companies and projects
 * lists do, so one customer is one colour on every screen.
 */

// The drawer lives in its own file; the queue still reads its skeleton from here.
export { QuotationSheetSkeleton } from "@/components/quotations/quotation-sheet";

/** The filters the list offers, in the order the work moves through them. */
const FILTERS: QuotationStatus[] = ["requested", "returned", "issued", "accepted", "rejected"];

/**
 * The board's columns: EVERY status, taken off the map of words rather than
 * written out again.
 *
 * The board was built from the chips, and the chips leave out `cancelled` on
 * purpose — a withdrawn request is not work anybody is waiting on, so it is not
 * a filter people want. On a board that same omission deletes the record: it is
 * in the list, it is on no column, and a rep who withdrew a request and pressed
 * Board would find it gone. A state with no column is a record with no home, so
 * the columns come from the Record, which TypeScript makes exhaustive — add a
 * sixth status and it gets a column whether anybody remembers or not.
 */
const BOARD_STATUSES = Object.keys(STATUS_KEYS) as QuotationStatus[];

/**
 * The same list is two screens: the rep's quotations and the coordinator's
 * queue. Every link it builds stays on the screen it was built from, so
 * pressing a row in the queue does not quietly move her to somebody's list.
 */
function listHref(
  base: string,
  q: string,
  status: QuotationStatus | null,
  open?: string | null,
  view?: ListView,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (open) params.set("open", open);
  // Written whenever a caller names one. The view switch names both, because
  // "list" has to be sayable in a URL: without it, pressing List left an
  // address with no view on it, the cookie still said board, and the board came
  // straight back. Ordinary row links pass nothing and stay clean.
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function StatusBadge({ status, className }: { status: QuotationStatus; className?: string }) {
  const t = useTranslations();
  return (
    <StateBadge tone={quotationTone(status)} className={className}>
      {t(STATUS_KEYS[status])}
    </StateBadge>
  );
}

/** The arrived flash, from somebody else's change (live) or the reader's own act. */
function useRowMark(
  arrived: ReadonlySet<string>,
): (id: string) => { className?: string; onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void } {
  const own = useQuotationFlashOf();
  return (id) => {
    const mine = own?.(id);
    if (mine?.className) return mine;
    return { className: arrived.has(id) ? "row-arrived" : undefined };
  };
}

export function QuotationsTable({
  base,
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
  canRequest = false,
}: {
  /** "/quotations" or "/queue" — locale-free, the way @/i18n/navigation wants it. */
  base: string;
  rows: QuotationRow[];
  q: string;
  status: QuotationStatus | null;
  openId: string | null;
  /** List or board (DESIGN §6). The queue has one state and shows neither. */
  view?: ListView;
  /**
   * The view this person had remembered when the page was drawn, passed
   * through to the switch so it writes only when he changes it (D164). The
   * queue shows no switch and passes none.
   */
  remembered?: string;
  /** The coordinator's queue is one status by definition; it needs no chips. */
  showFilters?: boolean;
  /** The queue draws ONE box over both its lists, so its tables draw none. */
  showSearch?: boolean;
  /**
   * How long each row has been waiting, by id — the coordinator's queue passes
   * it, every other screen does not. Where it is given the status cell says the
   * wait instead of the status, because on a screen where every row has the
   * same status the badge says nothing and the wait is the whole question
   * (D59).
   */
  waiting?: Record<string, Waited>;
  /**
   * How many quotations the chosen chip is hiding, counted by the page only
   * when it hides every one of them — the number the filtered-out sentence says
   * (DESIGN §8).
   */
  hidden?: number;
  /** Whether this reader has the screen's Request button, which the first-use sentence points at. */
  canRequest?: boolean;
}) {
  const t = useTranslations();
  // Rows somebody else touched in the last two seconds (D105), and the one the
  // reader's own act changed (QuotationFlash). The clock starts when these rows
  // are on screen, which the hook reports from `rows`.
  const arrived = useArrivedIds(rows);
  const mark = useRowMark(arrived);
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
  // Where the SCREEN owns the search, the way out is the screen's own address:
  // the queue does not read `?status=`, and each of its two tables was writing
  // its own over the other's on the way out (D137).
  function clearTerm() {
    go(listHref(base, "", showSearch ? status : null));
  }

  /**
   * The board's columns: the six states, in the order the work moves through
   * them. A column carries its count and a card carries the day it arrived,
   * because without those two a board is a list in a wider shape (DESIGN §6).
   */
  const columns: BoardColumn[] = BOARD_STATUSES.map((value) => ({
    key: value,
    label: t(STATUS_KEYS[value]),
    tone: quotationTone(value),
    cards: rows
      .filter((row) => row.status === value)
      .map((row) => ({
        id: row.id,
        href: listHref(base, q, null, row.id, "board"),
        // The number anybody says out loud, which is SMAC's once there is one
        // (P12-11). A board card has room for one number and this is it; the
        // list beside it carries both, and the drawer carries both.
        label: row.smacNumber ?? row.label,
        title: row.companyName,
        subtitle: row.projectName,
        sqm: row.totalSqm,
        day: row.issuedOn ?? row.createdOn,
        current: openId === row.id,
      })),
  }));

  return (
    <div className="flex flex-col gap-4">
      {showFilters ? (
        <FilterRow
          lead={
            <ViewSwitch
              screen="quotations"
              view={view}
              remembered={remembered}
              listHref={listHref(base, q, status, null, "list")}
              boardHref={listHref(base, q, null, null, "board")}
            />
          }
          all={
            view === "board" ? null : (
              <FilterChip href={listHref(base, q, null)} active={status === null}>
                {t("common.all")}
              </FilterChip>
            )
          }
        >
          {/* A board of states IS the status view, so the chips would be a
              filter that leaves one column standing. They come back with the
              list. */}
          {view === "board"
            ? null
            : FILTERS.map((value) => (
                <FilterChip
                  key={value}
                  // Pressing the chip you are on takes the filter off again.
                  href={listHref(base, q, status === value ? null : value)}
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
          label={t("quotations.searchLabel")}
          placeholder={t("quotations.searchPlaceholder")}
          clearLabel={t("common.clear")}
          className="max-w-md sm:max-w-md"
        />
      ) : null}

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {rows.length === 0 ? (
          // Before the board: six empty columns say nothing about why (P11G).
          <EmptyQuotations
            base={base}
            q={q}
            status={status}
            fixed={!showFilters}
            hidden={hidden}
            canRequest={canRequest}
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
              {rows.map((row) => {
                const rowMark = mark(row.id);
                return (
                  <Link
                    key={row.id}
                    href={listHref(base, q, status, row.id)}
                    aria-current={openId === row.id ? "true" : undefined}
                    onAnimationEnd={rowMark.onAnimationEnd}
                    className={cn(
                      "card-face hover-tint flex items-start gap-3 p-3",
                      openId === row.id && "bg-surface-2",
                      rowMark.className,
                    )}
                  >
                    <Avatar id={row.companyId} name={row.companyName} kind="company" size="md" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Ref slot="row-number" className="font-medium">{row.smacNumber ?? row.label}</Ref>
                          <LinkPending />
                        </span>
                        {waiting?.[row.id] ? (
                          <WaitedFor waited={waiting[row.id]} className="shrink-0" />
                        ) : (
                          <StatusBadge status={row.status} className="shrink-0" />
                        )}
                      </span>
                      <span className="flex min-w-0 text-sm">
                        <Clip text={row.companyName} />
                      </span>
                      {/* On the queue the row is somebody's request, and the
                          conversation about it is with him (S54, D116). */}
                      {waiting ? (
                        <span data-slot="row-rep" className="flex min-w-0 text-xs text-muted-foreground">
                          <Clip text={row.repName} />
                        </span>
                      ) : null}
                      <RaisedBy name={row.raisedByName} />
                      <span className="flex min-w-0 text-xs text-muted-foreground">
                        <Clip text={row.projectName} />
                      </span>
                      <ProjectLostMark lostOn={row.projectLostOn} />
                      {/* m² is the headline and SAR the support (DESIGN §6):
                          a rep's month is metres, and SMAC owns the money. */}
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <Sqm value={row.totalSqm} />
                        <Money value={row.total} className="text-xs" />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className={cn("card-face hidden md:block", waiting && "lg:hidden xl:block")}>
              <Table label={t("common.quotations")}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3">{t("common.quotation")}</TableHead>
                    <TableHead className="px-3">{t("common.company")}</TableHead>
                    {/* On her desk the job folds under its customer and the money
                        under its metres: the desk is half the screen wide from
                        `lg` (SPEC §3 P13), and six columns in half a screen
                        scrolled the wait — the one column she reads the row
                        for — off its edge. */}
                    {waiting ? null : <TableHead className="px-3">{t("common.project")}</TableHead>}
                    <TableHead className="px-3 text-end">{t("common.sqm")}</TableHead>
                    {waiting ? null : (
                      <TableHead className="px-3 text-end">{t("common.grandTotal")}</TableHead>
                    )}
                    <TableHead className="px-3">
                      {waiting ? t("queue.waited") : t("common.status")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const rowMark = mark(row.id);
                    return (
                      <TableRow
                        key={row.id}
                        data-state={openId === row.id ? "selected" : undefined}
                        onAnimationEnd={rowMark.onAnimationEnd}
                        // The whole row opens the record, not only the first cell
                        // (P12-11): `row-door` stretches that cell's own link over
                        // the row, so it stays one anchor and one tab stop.
                        className={cn("row-door", rowMark.className)}
                      >
                        <TableCell className="px-3 py-2">
                          <Link
                            data-door
                            href={listHref(base, q, status, row.id)}
                            aria-current={openId === row.id ? "true" : undefined}
                            className="block"
                          >
                            {/* SMAC's number leads where there is one, and Kladra's own
                                goes quietly under it (P12-11): the paper the customer
                                holds and finance files is the one anybody says out loud. */}
                            <span className="flex items-center gap-2">
                              <Ref slot="row-number" className="font-medium">
                                {row.smacNumber ?? row.label}
                              </Ref>
                              <LinkPending />
                            </span>
                            {row.smacNumber ? (
                              <Ref
                                slot="row-second-number"
                                className="block text-xs text-muted-foreground"
                              >
                                {row.label}
                              </Ref>
                            ) : null}
                          </Link>
                        </TableCell>
                        {/* The customer, with its face. On her desk the name may
                            wrap, because it is what the row is FOR (DESIGN §5);
                            on the list it is cut at its own end (Clip). */}
                        <TableCell
                          className={cn("px-3 py-2", waiting ? "whitespace-normal" : "max-w-[18rem]")}
                        >
                          <span className={cn("flex min-w-0 gap-2", waiting ? "items-start" : "items-center")}>
                            <Avatar id={row.companyId} name={row.companyName} kind="company" size="sm" />
                            <span className="flex min-w-0 flex-col">
                              {waiting ? (
                                <span>
                                  <bdi>{row.companyName}</bdi>
                                </span>
                              ) : (
                                <span className="flex min-w-0">
                                  <Clip text={row.companyName} />
                                </span>
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
                                  <span className="block text-xs text-muted-foreground">
                                    <bdi>{row.projectName}</bdi>
                                  </span>
                                  <ProjectLostMark lostOn={row.projectLostOn} />
                                </>
                              ) : null}
                            </span>
                          </span>
                        </TableCell>
                        {waiting ? null : (
                          <TableCell className="max-w-[16rem] px-3 py-2 text-muted-foreground">
                            <span className="flex min-w-0">
                              <Clip text={row.projectName} />
                            </span>
                            <ProjectLostMark lostOn={row.projectLostOn} />
                          </TableCell>
                        )}
                        <TableCell className="px-3 py-2 text-end">
                          <Sqm value={row.totalSqm} unit={false} />
                          {waiting ? (
                            <span className="block text-xs">
                              <Money value={row.total} currency={false} />
                            </span>
                          ) : null}
                        </TableCell>
                        {waiting ? null : (
                          <TableCell className="px-3 py-2 text-end">
                            <Money value={row.total} currency={false} />
                          </TableCell>
                        )}
                        <TableCell className={cn("px-3 py-2", waiting && "whitespace-normal")}>
                          <span className="flex flex-col items-start gap-1">
                            {waiting?.[row.id] ? (
                              <WaitedFor waited={waiting[row.id]} className="font-medium" />
                            ) : (
                              <StatusBadge status={row.status} />
                            )}
                            <DayText
                              day={row.issuedOn ?? row.createdOn}
                              locale={locale}
                              className="text-xs text-muted-foreground"
                            />
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
 * The project was marked lost after this was raised (D138). A dead project is
 * not work to price, and nothing on her desk said so. The word, with the tone as
 * a dot beside it: red is the mark, never the whole of the sentence (DESIGN §1).
 */
function ProjectLostMark({ lostOn }: { lostOn: string | null }) {
  const t = useTranslations();
  if (!lostOn) return null;
  return (
    <span
      data-slot="project-lost"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT.bad)} />
      {t("common.projectLost")}
    </span>
  );
}

/**
 * Nothing to draw, and the kinds of nothing are different sentences (DESIGN §8).
 *
 * - **Filtered out**: the chip is hiding every quotation there is — or every one
 *   the search found — so the sentence says how many and the button shows them
 *   with the search kept. "Nothing is waiting" over a floor of forty papers read
 *   like a floor of none, and "Nothing matched" under a search that matched was
 *   simply false.
 * - **No results**: the words matched nothing, and the way out is to clear them.
 * - **The desk's own status** (the queue): the page chose it, so there is no
 *   "All" to go to (P11G).
 * - **First use**: nothing at all yet. It never draws Request quotation a second
 *   time (§2) — the one at the top is where the work starts, and the sentence
 *   says so to the reader who has it and says where quotations come from to the
 *   one who does not. It used to offer "Open companies", a door out of an empty
 *   list that nobody was looking for.
 * - **Could not load** is not an empty list; the screen's error card draws it.
 */
function EmptyQuotations({
  base,
  q,
  status,
  fixed,
  hidden,
  canRequest,
  onClear,
}: {
  base: string;
  q: string;
  status: QuotationStatus | null;
  /** The page chose the status (the queue): there is no "All" to go to (P11G). */
  fixed: boolean;
  hidden: number;
  canRequest: boolean;
  onClear: () => void;
}) {
  const t = useTranslations();

  // Before the search's own sentence: when the search found rows and the chip
  // hid them all, "Nothing matched" is false. The way out takes the chip off
  // and keeps the search, so the count is the rows it will show.
  if (status && hidden > 0) {
    return (
      <Empty
        action={
          <Button asChild variant="outline">
            <Link href={listHref(base, q, null)}>{t("quotations.showAll")}</Link>
          </Button>
        }
      >
        {q ? null : `${t("quotations.emptyStatus", { status: t(STATUS_KEYS[status]) })} `}
        {t("quotations.hiddenByFilter", { count: hidden })}
      </Empty>
    );
  }

  if (q) {
    return (
      <Empty
        action={
          <Button type="button" variant="outline" onClick={onClear}>
            {t("common.clear")}
          </Button>
        }
      >
        {t("quotations.emptySearch", { q })}
      </Empty>
    );
  }

  if (status && fixed) {
    return <Empty>{t("quotations.emptyStatus", { status: t(STATUS_KEYS[status]) })}</Empty>;
  }

  return <Empty>{t(canRequest ? "quotations.empty" : "quotations.emptyReadOnly")}</Empty>;
}
