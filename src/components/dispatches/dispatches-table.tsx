"use client";

import { Fragment, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { DispatchActions, type DispatchScope } from "@/components/dispatches/dispatch-actions";
import { ListSearch } from "@/components/ui-ext/list-search";
import { Prose } from "@/components/ui-ext/prose";
import type { DispatchDraft } from "@/components/dispatches/request-dispatch-dialog";
import type { Waited } from "@/lib/waiting";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
import { focusTheDrawerItself } from "@/components/ui-ext/drawer-focus";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { Board, type BoardColumn } from "@/components/ui-ext/board";
import { Sqm } from "@/components/ui-ext/figures";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { WaitedFor } from "@/components/ui-ext/waited-for";
import { formatSqm } from "@/lib/money";
import type { CreditLine } from "@/lib/credit-rows";
import type { DispatchItemRow, DispatchRow, DispatchStatus } from "@/lib/dispatches";
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

export function DispatchesTable({
  base,
  param = "open",
  rows,
  q,
  status,
  openId,
  view = "list",
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
        label: row.label,
        title: row.companyName,
        subtitle: row.projectName,
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
                      <span dir="ltr" className="num font-medium">
                        {row.label}
                      </span>
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
                  {row.projectName ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {row.projectName}
                    </span>
                  ) : null}
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

            <div className="card-face hidden md:block">
              <Table>
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
                      className={cn(arrived.has(row.id) && "row-arrived")}
                    >
                      <TableCell className="p-0">
                        <Link
                          href={listHref(base, param, q, status, row.id)}
                          aria-current={openId === row.id ? "true" : undefined}
                          className="block p-3"
                        >
                          <span className="flex items-center gap-1.5">
                            <span dir="ltr" className="num font-medium">
                              {row.label}
                            </span>
                            <LinkPending />
                          </span>
                          {row.smacDispatchNumber ? (
                            <span dir="ltr" className="num block text-xs text-muted-foreground">
                              {row.smacDispatchNumber}
                            </span>
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
                        {row.projectName ?? "—"}
                        {/* The project was marked lost after this was raised (D138). A dead
                            project is not work to price, and nothing on her desk said so. */}
                        {row.projectLostOn ? (
                          <span data-slot="project-lost" className={cn("block text-xs", TONE_TEXT.bad)}>
                            {t("common.projectLost")}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="p-3">
                        <span dir="ltr" className="num text-sm">
                          {row.quotationLabel}
                        </span>
                        {waiting && row.superseded ? (
                          <span
                            data-slot="revised-since"
                            className={cn("block text-xs", TONE_TEXT.wait)}
                          >
                            {t("dispatches.revisedSince")}
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
  return (
    <div className="card-face flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="max-w-prose text-sm text-muted-foreground">{sentence}</p>
      {children}
    </div>
  );
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
  items,
  draft,
  scope,
  param = "open",
}: DispatchSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const close = useCloseDrawer(param);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent
        onOpenAutoFocus={focusTheDrawerItself}
        // Radix's sides are physical; in Arabic the drawer comes from the other
        // edge so it still slides in from the end of the line.
        side={locale === "ar" ? "left" : "right"}
        className="w-full gap-0 scroller p-0 data-[side=left]:sm:max-w-2xl data-[side=right]:sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle dir="ltr" className="num text-lg">
                {dispatch.label}
              </SheetTitle>
              <StatusBadge status={dispatch.status} />
            </div>
            <SheetDescription>
              {dispatch.projectName ? (
                <>
                  <bdi>{dispatch.companyName}</bdi> · <bdi>{dispatch.projectName}</bdi>
                </>
              ) : (
                <bdi>{dispatch.companyName}</bdi>
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
                <Link
                  href={`/quotations?open=${dispatch.quotationId}`}
                  className="hover:underline"
                >
                  <span dir="ltr" className="num">
                    {dispatch.quotationLabel}
                  </span>
                </Link>
              </Fact>
              <Fact label={t("common.raisedBy")}>{dispatch.repName}</Fact>
              <Fact label={t("common.date")}>
                <DayText day={dispatch.createdOn} locale={locale} />
              </Fact>
              {dispatch.smacDispatchNumber ? (
                <Fact label={t("common.smacDispatchNumber")}>
                  <span dir="ltr" className="num">
                    {dispatch.smacDispatchNumber}
                  </span>
                </Fact>
              ) : null}
            </dl>
          </div>

          {dispatch.status === "refused" && dispatch.refuseReason ? (
            <Reason title={t("dispatches.refusedReason")} text={dispatch.refuseReason} />
          ) : null}

          <DispatchActions
            dispatch={{
              id: dispatch.id,
              label: dispatch.label,
              status: dispatch.status,
              companyName: dispatch.companyName,
              quotationId: dispatch.quotationId,
              quotationLabel: dispatch.quotationLabel,
              smacDispatchNumber: dispatch.smacDispatchNumber,
              superseded: dispatch.superseded,
              draft,
            }}
            scope={scope}
          />

          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="card-face flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">
                    {t("quotations.itemNumber", { number: item.position })}
                    {" · "}
                    <span dir="ltr" className="num">
                      {item.colourCode}
                    </span>
                  </h4>
                  <Sqm value={item.sqm} className="text-sm" />
                </div>
                {/* Her check on a partial dispatch: what is going now, against
                    what the quotation asked for, what other dispatches already
                    hold, and what is left once this one is counted — one
                    definition, the dialog's (D112, D12). */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
                  <Fact label={t("dispatches.sending")}>
                    <span dir="ltr" className="num">
                      {item.qty}
                    </span>
                  </Fact>
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
                  <Fact label={t("quotations.sheet")}>
                    <span dir="ltr" className="num">
                      {item.width} × {item.length}
                    </span>
                  </Fact>
                </dl>
              </li>
            ))}
          </ul>

          <dl className="card-face flex flex-col gap-2 p-3 text-sm">
            {/* The one figure this request is about: what it puts on the
                month (S41). Everything under it is how and where. */}
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
            <Row label={t("common.destination")}>{dispatch.destination}</Row>
            <Row label={t("common.paymentTerms")}>{dispatch.paymentTerms}</Row>
          </dl>

          {/* Last, as on the quotation sheet: what the drawer is opened to do
              is at the top, and what has already happened is what you scroll
              to (D143). */}
          {history}
        </div>
      </SheetContent>
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
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
      <SheetContent onOpenAutoFocus={focusTheDrawerItself} side="right" className="w-full gap-0 scroller p-0 sm:max-w-2xl">
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <SheetTitle className="sr-only">{t("dispatches.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("dispatches.requestHint")}</SheetDescription>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-24 w-full rounded-[calc(var(--radius)+4px)]" />
          <Skeleton className="h-24 w-full rounded-[calc(var(--radius)+4px)]" />
          <Skeleton className="h-32 w-full rounded-[calc(var(--radius)+4px)]" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
