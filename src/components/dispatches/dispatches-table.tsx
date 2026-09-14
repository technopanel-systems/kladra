"use client";

import { Fragment, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { DispatchActions, type DispatchScope } from "@/components/dispatches/dispatch-actions";
import { Empty } from "@/components/ui-ext/empty";
import { ListSearch } from "@/components/ui-ext/list-search";
import { Prose } from "@/components/ui-ext/prose";
import type { DispatchDraft } from "@/components/dispatches/request-dispatch-dialog";
import type { Waited } from "@/lib/waiting";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
import { Money, Ref } from "@/components/ui-ext/figures";
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
import { dispatchTone, TONE_TEXT } from "@/lib/state-tone";
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
 * A status is a word, never a colour (DESIGN §4). There are only three of them
 * here and one of them, Approved, is the whole month — so it says Approved.
 *
 * Money is not on this screen at all. A dispatch is goods, and what it is worth
 * is on the quotation it came from; showing a figure here would be a second
 * definition of a number finance already owns (S31).
 */

const STATUS_KEYS: Record<DispatchStatus, string> = {
  submitted: "dispatches.statusSubmitted",
  approved: "dispatches.statusApproved",
  refused: "dispatches.statusRefused",
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

function StatusBadge({ status }: { status: DispatchStatus }) {
  const t = useTranslations();
  return <StateBadge tone={dispatchTone(status)}>{t(STATUS_KEYS[status])}</StateBadge>;
}

/**
 * The load is not what its quotation said (SPEC §3, P13) — a word in the amber
 * of "somebody will look at this", never the tone alone. What differs is the
 * drawer's to say; the row only has to be found.
 */
function DiffersChip() {
  const t = useTranslations();
  return (
    <span data-slot="differs-chip">
      <StateBadge tone="wait">{t("dispatches.differsChip")}</StateBadge>
    </span>
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

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {rows.length === 0 ? (
          // Before the board: six empty columns say nothing about why (P11G).
          <EmptyDispatches
            base={base}
            q={q}
            status={status}
            fixed={!showFilters}
            onClear={clearTerm}
          />
        ) : view === "board" && showFilters ? (
          <Board columns={columns} />
        ) : (
          <>
            {/* 375: cards. Six columns on a phone is a horizontal scroll. */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={listHref(base, param, q, status, row.id)}
                  className={cn(
                    "card-face flex flex-col gap-1.5 p-3",
                    arrived.has(row.id) && "row-arrived",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <Ref className="font-medium">
                        {row.smacDispatchNumber ?? row.label}
                      </Ref>
                      <LinkPending />
                    </span>
                    {waiting?.[row.id] ? (
                      <WaitedFor waited={waiting[row.id]} />
                    ) : (
                      <StatusBadge status={row.status} />
                    )}
                  </span>
                  <span className="truncate text-sm">{row.companyName}</span>
                  {/* On the queue the row is somebody's request (S54, D116). */}
                  {waiting ? (
                    <span data-slot="row-rep" className="truncate text-xs text-muted-foreground">
                      {row.repName}
                    </span>
                  ) : null}
                  {/* The paper was revised after this was raised: approval would
                      refuse it (D85), so the row says it first (P11E). */}
                  {waiting && row.superseded ? (
                    <span data-slot="revised-since" className={cn("text-xs", TONE_TEXT.wait)}>
                      {t("dispatches.revisedSince")}
                    </span>
                  ) : null}
                  <span className="truncate text-xs text-muted-foreground">
                    {row.projectName ?? (row.quotationId ? null : t("dispatches.direct"))}
                  </span>
                  {/* The load is not what its paper said (SPEC §3, P13): a word
                      and a tone, on the row the desk scans. */}
                  {row.differs ? <DiffersChip /> : null}
                  {/* The project was marked lost after this was raised (D138). A dead
                      project is not work to price, and nothing on her desk said so. */}
                  {row.projectLostOn ? (
                    <span data-slot="project-lost" className={cn("truncate text-xs", TONE_TEXT.bad)}>
                      {t("common.projectLost")}
                    </span>
                  ) : null}
                  <span className="text-sm">
                    <span dir="ltr" className="num">
                      {formatSqm(row.totalSqm)}
                    </span>
                    <span className="ms-1 text-xs text-muted-foreground">{t("common.sqm")}</span>
                  </span>
                  <SplitNames names={row.creditNames} />
                </Link>
              ))}
            </div>

            <div className="card-face hidden overflow-clip md:block">
              <Table label={t("common.dispatches")}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="p-3">{t("common.dispatch")}</TableHead>
                    <TableHead className="p-3">{t("common.company")}</TableHead>
                    <TableHead className="p-3">{t("common.project")}</TableHead>
                    <TableHead className="p-3">{t("common.quotation")}</TableHead>
                    <TableHead className="p-3 text-end">{t("common.sqm")}</TableHead>
                    <TableHead className="p-3">
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
                          className="block p-3"
                        >
                          {/* SMAC's number leads where there is one, and Kladra's own
                              goes quietly under it (P12-11) — the same swap the
                              quotations list makes, and for the same reason. */}
                          <span className="flex items-center gap-1.5">
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
                        </Link>
                      </TableCell>
                      <TableCell className="p-3">
                        {row.companyName}
                        {waiting ? (
                          <span
                            data-slot="row-rep"
                            className="block text-xs text-muted-foreground"
                          >
                            {row.repName}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">
                        {/* A direct load has no job, and the cell says so rather
                            than standing empty (SPEC §3, P13). */}
                        {row.projectName ?? t("dispatches.noProject")}
                        {/* The project was marked lost after this was raised (D138). A dead
                            project is not work to price, and nothing on her desk said so. */}
                        {row.projectLostOn ? (
                          <span data-slot="project-lost" className={cn("block text-xs", TONE_TEXT.bad)}>
                            {t("common.projectLost")}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="p-3">
                        {/* The quotation this load is against, named the way the
                            quotations list now leads (P12-11): SMAC's number, with
                            Kladra's under it where there are two. A cross-reference
                            is looked up, so it says the number she will search for. */}
                        {row.quotationLabel ? (
                          <Ref slot="row-quotation" className="text-sm">
                            {row.smacNumber ?? row.quotationLabel}
                          </Ref>
                        ) : (
                          // Where a quotation number would be, the word for a
                          // load with none — never an empty cell (SPEC §3, P13).
                          <span data-slot="row-direct" className="text-sm">
                            {t("dispatches.direct")}
                          </span>
                        )}
                        {row.smacNumber ? (
                          <Ref
                            slot="row-quotation-second"
                            className="block text-xs text-muted-foreground"
                          >
                            {row.quotationLabel}
                          </Ref>
                        ) : null}
                        {waiting && row.superseded ? (
                          <span
                            data-slot="revised-since"
                            className={cn("block text-xs", TONE_TEXT.wait)}
                          >
                            {t("dispatches.revisedSince")}
                          </span>
                        ) : null}
                        {row.differs ? (
                          <span className="mt-1 block">
                            <DiffersChip />
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="p-3 text-end">
                        <span dir="ltr" className="num">
                          {formatSqm(row.totalSqm)}
                        </span>
                        <SplitNames names={row.creditNames} />
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="flex flex-col gap-1">
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

/** One sentence, and the action it names — where there is one (SPEC §3, D31). */
function EmptyDispatches({
  base,
  q,
  status,
  fixed,
  onClear,
}: {
  base: string;
  q: string;
  status: DispatchStatus | null;
  /** The page chose the status (the queue): there is no "All" to go to (P11G). */
  fixed: boolean;
  onClear: () => void;
}) {
  const t = useTranslations();

  if (q) {
    return (
      <EmptyCard sentence={t("dispatches.emptySearch", { q })}>
        <Button type="button" variant="outline" onClick={onClear}>
          {t("common.clear")}
        </Button>
      </EmptyCard>
    );
  }

  if (status) {
    return (
      <EmptyCard sentence={t("dispatches.emptyStatus", { status: t(STATUS_KEYS[status]) })}>
        {fixed ? null : (
          <Button asChild variant="outline">
            <Link href={base}>{t("common.all")}</Link>
          </Button>
        )}
      </EmptyCard>
    );
  }

  // A dispatch is raised from an issued quotation (S38), so that is where the
  // sentence sends the rep.
  return (
    <EmptyCard sentence={t("dispatches.empty")}>
      <Button asChild variant="outline">
        <Link href="/quotations">{t("common.quotations")}</Link>
      </Button>
    </EmptyCard>
  );
}

function EmptyCard({ sentence, children }: { sentence: string; children: ReactNode }) {
  return <Empty action={children}>{sentence}</Empty>;
}

/* -------------------------------------------------------------------------- */
/* The drawer the URL opens. Its data is read by the server component in       */
/* dispatch-drawer.tsx; everything interactive lives here.                     */
/* -------------------------------------------------------------------------- */

/** Closing the drawer drops `?open=` and leaves the search and status alone. */
function useCloseDrawer(param: string): () => void {
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
    /** Which store the load leaves from (SPEC §3, P12-9). */
    warehouseName: string;
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
  /** The parameter that opened it, so closing drops the right one. */
  param?: string;
};

export function DispatchSheet({
  dispatch,
  credit,
  history,
  difference,
  report,
  items,
  draft,
  scope,
  param = "open",
}: DispatchSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const close = useCloseDrawer(param);
  // What the load comes to, by the function the form adds it up with while the
  // rep types (money.ts) — on the stored figures, so the two agree to the halala.
  const totals = loadTotals(items, dispatch.services);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <RecordPanel className="scroller">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="text-lg">
                <Ref>{dispatch.label}</Ref>
              </SheetTitle>
              <StatusBadge status={dispatch.status} />
            </div>
            <SheetDescription>
              <bdi>{dispatch.companyName}</bdi> ·{" "}
              {dispatch.projectName ? (
                <bdi>{dispatch.projectName}</bdi>
              ) : (
                t("dispatches.direct")
              )}
            </SheetDescription>

            {/* The project is lost and this material is still going out to it
                (D138). A dispatch is not withdrawn by anybody's decision the
                way a request can be, so the one thing the desk can do about it
                is know before approving. */}
            {dispatch.projectLostOn ? (
              <p data-slot="project-lost" className={cn("text-sm", TONE_TEXT.bad)}>
                {t("common.projectLostOn", { date: formatDay(dispatch.projectLostOn, locale) })}
                {dispatch.projectLostReason ? (
                  <>
                    {" — "}
                    <bdi>{lossReasonLabel(dispatch.projectLostReason, t)}</bdi>
                  </>
                ) : null}
              </p>
            ) : null}

            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Fact label={t("common.quotation")}>
                {dispatch.quotationId ? (
                  <Link
                    href={`/quotations?open=${dispatch.quotationId}`}
                    className="hover:underline"
                  >
                    {/* A fact has room for one number, and it is the one she
                        would search SMAC for (P12-11). */}
                    <Ref>{dispatch.smacNumber ?? dispatch.quotationLabel}</Ref>
                  </Link>
                ) : (
                  // No paper behind it: the word, never a dead link (SPEC §3, P13).
                  <span data-slot="fact-direct">{t("dispatches.direct")}</span>
                )}
              </Fact>
              <Fact label={t("common.raisedBy")}>{dispatch.repName}</Fact>
              <Fact label={t("common.date")}>
                <DayText day={dispatch.createdOn} locale={locale} />
              </Fact>
              {dispatch.smacDispatchNumber ? (
                <Fact label={t("common.smacDispatchNumber")}>
                  <Ref>{dispatch.smacDispatchNumber}</Ref>
                </Fact>
              ) : null}
            </dl>
          </div>

          {dispatch.status === "refused" && dispatch.refuseReason ? (
            <Reason title={t("dispatches.refusedReason")} text={dispatch.refuseReason} />
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
          />
          {report ? <div className="flex flex-wrap gap-2">{report}</div> : null}

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
                      <h4 className="min-w-0 text-sm font-medium break-words">
                        <bdi>{service.name}</bdi>
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
            {/* The one figure this request is about: what it puts on the
                month (S41). Everything under it is what it comes to, then how
                and where. */}
            <div className="flex items-baseline justify-between gap-4 pb-1">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("common.sqm")}
              </dt>
              <dd
                data-slot="figure-sending"
                className="num text-2xl leading-none font-semibold"
                dir="ltr"
              >
                {formatSqm(dispatch.totalSqm)}
              </dd>
            </div>
            <div className="border-t border-line pt-1" />
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
            <Row label={t("common.grandTotal")} slot="figure-total" strong>
              <Amount value={totals.total} sar={t("common.sar")} />
            </Row>
            {credit.length > 0 && (credit.length > 1 || credit[0].userId !== dispatch.repId) ? (
              <>
                <div className="border-t border-line pt-1" />
                {/* Why his target moved by less than the figure above it. A
                    rep who cannot see this on the row has to be told (D148). */}
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("common.credit.label")}
                  </dt>
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
              </>
            ) : null}
            <div className="border-t border-line pt-1" />
            {/* Where it leaves from, before how it travels and where it goes:
                that is the order the load happens in (SPEC §3, P12-9). */}
            <Row label={t("common.warehouse")}>
              <bdi>{dispatch.warehouseName}</bdi>
            </Row>
            <Row label={t("common.shipment")}>{dispatch.shipmentMethod}</Row>
            <Row label={t("common.destination")}>
              <bdi>{dispatch.destination}</bdi>
            </Row>
            {/* The choice, then the answer it asked for, with a mark between
                them rather than a gap: a gap says nothing (§5 #181). */}
            <Row label={t("common.paymentTerms")}>
              {paymentTermsLabel(dispatch.paymentTerms, t)}
              {dispatch.paymentDetail ? (
                <> · {paymentDetailLabel(dispatch.paymentDetail, t)}</>
              ) : null}
            </Row>
            {/* The rep's own words, on their own row: on credit and tasaheel
                they are the terms, and finance is the reader (SPEC §3). */}
            {dispatch.paymentNote ? (
              <Row label={t("common.paymentNote")}>
                <bdi>{dispatch.paymentNote}</bdi>
              </Row>
            ) : null}
          </dl>

          {/* Last, as on the quotation sheet: what the drawer is opened to do
              is at the top, and what has already happened is what you scroll
              to (D143). */}
          {history}
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
          {index > 0 ? " · " : null}
          <bdi>{name}</bdi>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A label and its value on one line, the value at the end. The value WRAPS: a
 * shipment method, a destination or a payment note is words somebody typed, and
 * at 375 "TT — a Technopanel truck" was cut at the panel's edge with nothing to
 * say so (DESIGN §5: anything whose job is to be exact wraps rather than clips).
 * The label keeps its own width and the value takes what is left of the line.
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
      <dd
        data-slot={slot}
        className={cn("min-w-0 text-end break-words", strong && "font-semibold")}
      >
        {children}
      </dd>
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Reason({ title, text }: { title: string; text: string }) {
  return (
    <div className="card-face flex flex-col gap-1 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {/* Typed by the desk, so it runs in her direction and not the page's
          (rules/words.md) — as the trail below already did. */}
      <Prose text={text} className="text-sm" />
    </div>
  );
}

/** Never a blank panel while the query runs (DESIGN §2). */
export function DispatchSheetSkeleton() {
  const t = useTranslations();
  return (
    <Sheet open>
      <RecordPanel className="scroller">
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <SheetTitle className="sr-only">{t("dispatches.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("dispatches.requestHint")}</SheetDescription>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-24 w-full rounded-[calc(var(--radius)+4px)]" />
          <Skeleton className="h-24 w-full rounded-[calc(var(--radius)+4px)]" />
          <Skeleton className="h-32 w-full rounded-[calc(var(--radius)+4px)]" />
        </div>
      </RecordPanel>
    </Sheet>
  );
}
