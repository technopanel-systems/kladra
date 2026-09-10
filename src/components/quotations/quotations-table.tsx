"use client";

import { Fragment, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { QuotationActions, type ActionScope } from "@/components/quotations/quotation-actions";
import { QuotationTotals } from "@/components/quotations/quotation-totals";
import { ListSearch } from "@/components/ui-ext/list-search";
import { formatDay } from "@/lib/dates";
import { lossReasonLabel } from "@/lib/loss-reason";
import { NoteBlock } from "@/components/ui-ext/note-block";
import type { QuotationDraft } from "@/components/quotations/request-quotation-dialog";
import type { Waited } from "@/lib/waiting";
import { Badge } from "@/components/ui/badge";
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
import { Ref, Money, Sqm } from "@/components/ui-ext/figures";
import { Board, type BoardColumn } from "@/components/ui-ext/board";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { WaitedFor } from "@/components/ui-ext/waited-for";
import { formatMoney } from "@/lib/money";
import type { QuotationItemRow, QuotationRow, QuotationStatus } from "@/lib/quotations";
import type { QuotationStanding } from "@/lib/standing";
import { quotationTone, TONE_TEXT } from "@/lib/state-tone";
import { ViewSwitch } from "@/components/ui-ext/view-switch";
import type { ListView } from "@/lib/view";
import { cn } from "@/lib/utils";
import { useArrivedIds } from "@/hooks/use-arrived";

/**
 * The quotations screen and the drawer it opens (DESIGN §2: work happens in a
 * drawer over the list, and the list stays where it was).
 *
 * A status is a word, never a colour. DESIGN §4 keeps a colour-per-status map
 * out of this app on purpose: five statuses in five colours is a legend to
 * learn, and the word is already the answer.
 *
 * Search, status and the open drawer all live in the URL, so a link somebody
 * sends reopens exactly what they were looking at (SPEC §3).
 */

const STATUS_KEYS: Record<QuotationStatus, string> = {
  requested: "quotations.statusRequested",
  returned: "quotations.statusReturned",
  issued: "quotations.statusIssued",
  accepted: "quotations.statusAccepted",
  rejected: "quotations.statusRejected",
  cancelled: "quotations.statusCancelled",
};

/** The filters the list offers, in the order the work moves through them. */
const FILTERS: QuotationStatus[] = ["requested", "returned", "issued", "accepted", "rejected"];

/**
 * The board's columns: EVERY status, taken off the map above rather than
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

function StatusBadge({ status }: { status: QuotationStatus }) {
  const t = useTranslations();
  return <StateBadge tone={quotationTone(status)}>{t(STATUS_KEYS[status])}</StateBadge>;
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
  // Where the SCREEN owns the search, the way out is the screen's own address:
  // the queue does not read `?status=`, and each of its two tables was writing
  // its own over the other's on the way out (D137).
  function clearTerm() {
    go(listHref(base, "", showSearch ? status : null));
  }

  /**
   * The board's columns: the same five states the chips filter by, in the order
   * the work moves through them. A column carries its count and a card carries
   * the day it arrived, because without those two a board is a list in a wider
   * shape (DESIGN §6).
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
                  href={listHref(base, q, status, row.id)}
                  className={cn(
                    "card-face flex flex-col gap-1.5 p-3",
                    arrived.has(row.id) && "row-arrived",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <Ref className="font-medium">
                        {row.smacNumber ?? row.label}
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
                  {/* On the queue the row is somebody's request, and the
                      conversation about it is with him (S54, D116). */}
                  {waiting ? (
                    <span data-slot="row-rep" className="truncate text-xs text-muted-foreground">
                      {row.repName}
                    </span>
                  ) : null}
                  <span className="truncate text-xs text-muted-foreground">
                    {row.projectName}
                  </span>
                  {/* The project was marked lost after this was raised (D138). A dead
                      project is not work to price, and nothing on her desk said so. */}
                  {row.projectLostOn ? (
                    <span data-slot="project-lost" className={cn("truncate text-xs", TONE_TEXT.bad)}>
                      {t("common.projectLost")}
                    </span>
                  ) : null}
                  {/* m² is the headline and SAR the support (DESIGN §6):
                      a rep's month is metres, and SMAC owns the money. */}
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <Sqm value={row.totalSqm} />
                    <Money value={row.total} className="text-xs" />
                  </span>
                </Link>
              ))}
            </div>

            <div className="card-face hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="p-3">{t("common.quotation")}</TableHead>
                    <TableHead className="p-3">{t("common.company")}</TableHead>
                    <TableHead className="p-3">{t("common.project")}</TableHead>
                    <TableHead className="p-3 text-end">{t("common.sqm")}</TableHead>
                    <TableHead className="p-3 text-end">{t("common.grandTotal")}</TableHead>
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
                          href={listHref(base, q, status, row.id)}
                          aria-current={openId === row.id ? "true" : undefined}
                          className="block p-3"
                        >
                          {/* SMAC's number leads where there is one, and Kladra's own
                              goes quietly under it (P12-11). It was the other way round:
                              the paper the customer holds and finance files is the one
                              anybody says out loud, and it was the small grey line. */}
                          <span className="flex items-center gap-1.5">
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
                        {row.projectName}
                        {/* The project was marked lost after this was raised (D138). A dead
                            project is not work to price, and nothing on her desk said so. */}
                        {row.projectLostOn ? (
                          <span data-slot="project-lost" className={cn("block text-xs", TONE_TEXT.bad)}>
                            {t("common.projectLost")}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="p-3 text-end">
                        <Sqm value={row.totalSqm} unit={false} />
                      </TableCell>
                      <TableCell className="p-3 text-end">
                        <Money value={row.total} currency={false} />
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="flex flex-col gap-1">
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
function EmptyQuotations({
  base,
  q,
  status,
  fixed,
  onClear,
}: {
  base: string;
  q: string;
  status: QuotationStatus | null;
  /** The page chose the status (the queue): there is no "All" to go to (P11G). */
  fixed: boolean;
  onClear: () => void;
}) {
  const t = useTranslations();

  if (q) {
    return (
      <EmptyCard sentence={t("quotations.emptySearch", { q })}>
        <Button type="button" variant="outline" onClick={onClear}>
          {t("common.clear")}
        </Button>
      </EmptyCard>
    );
  }

  if (status) {
    return (
      <EmptyCard sentence={t("quotations.emptyStatus", { status: t(STATUS_KEYS[status]) })}>
        {fixed ? null : (
          <Button asChild variant="outline">
            <Link href={base}>{t("common.all")}</Link>
          </Button>
        )}
      </EmptyCard>
    );
  }

  // A quotation is raised from inside a company or a project (§3), so that is
  // where the sentence sends the rep.
  return (
    <EmptyCard sentence={t("quotations.empty")}>
      <Button asChild variant="outline">
        <Link href="/companies">{t("projects.openCompanies")}</Link>
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
/* quotation-drawer.tsx; everything interactive lives here.                    */
/* -------------------------------------------------------------------------- */

/** Closing the drawer drops `?open=` and leaves the search and status alone. */
function useCloseDrawer(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}

export type QuotationSheetProps = {
  quotation: QuotationRow & {
    notes: string | null;
    isLatest: boolean;
    selfIssued: boolean;
    /** Where it was priced out of, and who it is for (SPEC §3, P12-9). */
    warehouseName: string;
    contactName: string | null;
  };
  /**
   * Who it counts for (D148). Said only when it is worth saying — more than one
   * name, or one name that is not the man who raised it — so the ordinary
   * quotation is not made to answer a question nobody asked.
   */
  credit: { userId: string; name: string }[];
  items: QuotationItemRow[];
  revisions: { id: string; label: string; revision: number; status: QuotationStatus }[];
  draft: QuotationDraft;
  scope: ActionScope;
  /** The figures under the title (P8.5). */
  standing: QuotationStanding;
  /**
   * What has gone out against this quotation, and the button that sends more —
   * built on the server, because both need the reader's own scope (S38).
   */
  dispatches: ReactNode;
  /**
   * What happened to it, oldest first (D72). A node rather than data for the
   * same reason `dispatches` is one: it is built on the server, where the
   * audit log and the reader's own language both live.
   */
  history: ReactNode;
  /**
   * On a revision, what it changed from the one it was raised on (D76). Null on
   * a first ask, which is most of them.
   */
  changes: ReactNode;
};

export function QuotationSheet({
  quotation,
  credit,
  items,
  revisions,
  draft,
  scope,
  standing,
  dispatches,
  history,
  changes,
}: QuotationSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const close = useCloseDrawer();

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
                <Ref>{quotation.label}</Ref>
              </SheetTitle>
              <StatusBadge status={quotation.status} />
              {!quotation.isLatest ? (
                <Badge variant="outline">{t("quotations.supersededBadge")}</Badge>
              ) : null}
              {/* One person asked for this paper and put it out (SPEC §3). Said
                  here rather than only in the trail below, because the trail is
                  read after a question has been asked and this is what makes
                  somebody ask it. Everyone who may open the quotation sees it:
                  a flag only one role can see is a flag nobody trusts. */}
              {quotation.selfIssued ? (
                <Badge variant="outline">{t("quotations.selfIssuedBadge")}</Badge>
              ) : null}
            </div>
            <SheetDescription>
              {t("quotations.drawerDescription", {
                company: quotation.companyName,
                project: quotation.projectName,
              })}
            </SheetDescription>

            {/* The project is lost and this paper is still open on it (D138):
                the drawer says so with the day and the reason, so nobody prices
                or ships against a decision that has already been taken. */}
            {quotation.projectLostOn ? (
              <p data-slot="project-lost" className={cn("text-sm", TONE_TEXT.bad)}>
                {t("common.projectLostOn", { date: formatDay(quotation.projectLostOn, locale) })}
                {quotation.projectLostReason ? (
                  <>
                    {" — "}
                    <bdi>{lossReasonLabel(quotation.projectLostReason, t)}</bdi>
                  </>
                ) : null}
              </p>
            ) : null}

            {/* What this drawer is opened to check, before who typed it
                (DESIGN §6): how big it is, how much of it is still available to
                send (D12), when it went out, and SMAC's number for it. */}
            <StandingStrip
              items={[
                { label: t("common.sqm"), value: <Sqm value={quotation.totalSqm} /> },
                { label: t("dispatches.remaining"), value: <Sqm value={standing.remainingSqm} /> },
                {
                  label: t("common.date"),
                  value: (
                    <DayText day={quotation.issuedOn ?? quotation.createdOn} locale={locale} />
                  ),
                },
                {
                  label: t("common.smacNumber"),
                  value: quotation.smacNumber ? (
                    <Ref>{quotation.smacNumber}</Ref>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                },
              ]}
            />

            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Fact label={t("common.raisedBy")}>{quotation.repName}</Fact>
              {/* Who at the customer this went to, and which store it was
                  priced out of (SPEC §3, P12-9). The name only when there is
                  one: a dash under a heading is a field a reader has to decide
                  is empty, and a price raised for the company rather than for a
                  person is addressed to nobody by design, not by omission. */}
              {quotation.contactName ? (
                <Fact label={t("common.contact")}>
                  <bdi>{quotation.contactName}</bdi>
                </Fact>
              ) : null}
              <Fact label={t("common.warehouse")}>
                <bdi>{quotation.warehouseName}</bdi>
              </Fact>
              {credit.length > 0 && (credit.length > 1 || credit[0].userId !== quotation.repId) ? (
                <Fact label={t("common.credit.label")}>
                  {/* Each name in its own bdi: the separator is neutral and
                      would otherwise settle against the paragraph rather than
                      against the name beside it (rules/words.md). */}
                  {credit.map((line, index) => (
                    <Fragment key={line.userId}>
                      {index > 0 ? " · " : null}
                      <bdi>{line.name}</bdi>
                    </Fragment>
                  ))}
                </Fact>
              ) : null}
            </dl>
          </div>

          {quotation.status === "returned" && quotation.returnReason ? (
            <NoteBlock title={t("quotations.sentBackReason")} text={quotation.returnReason} />
          ) : null}
          {quotation.status === "rejected" && quotation.decisionReason ? (
            <NoteBlock title={t("quotations.rejectedReason")} text={quotation.decisionReason} />
          ) : null}
          {quotation.notes ? (
            <NoteBlock title={t("quotations.notesToCoordinator")} text={quotation.notes} />
          ) : null}

          <QuotationActions
            quotation={{
              id: quotation.id,
              label: quotation.label,
              status: quotation.status,
              companyId: quotation.companyId,
              companyName: quotation.companyName,
              projectId: quotation.projectId,
              isLatest: quotation.isLatest,
              smacNumber: quotation.smacNumber,
              draft,
            }}
            scope={scope}
          />

          {/* Above the lines, because it is what she reads before them: on a
              revision the only question she has is which line is not what she
              already priced (D76). */}
          {changes}

          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="card-face flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">
                    {t("quotations.itemNumber", { number: item.position })}
                  </h4>
                  <span className="text-sm">
                    <Money value={item.lineTotal} currency={false} />
                  </span>
                </div>
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
                  <Fact label={t("common.qty")}>
                    <span dir="ltr" className="num">
                      {item.qty}
                    </span>
                  </Fact>
                  <Fact label={t("common.pricePerSqm")}>
                    <span dir="ltr" className="num">
                      {formatMoney(item.pricePerSqm)}
                    </span>
                  </Fact>
                </dl>
              </li>
            ))}
          </ul>

          <QuotationTotals
            sqm={quotation.totalSqm}
            subtotal={quotation.subtotal}
            vat={quotation.vat}
            total={quotation.total}
          />

          {dispatches}

          {revisions.length > 1 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("quotations.revisions")}</h3>
              <ul className="flex flex-wrap gap-2">
                {revisions.map((revision) => (
                  <li key={revision.id}>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/quotations?open=${revision.id}`}>
                        <span dir="ltr" className="num">
                          {revision.label}
                        </span>
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {history}
        </div>
      </RecordPanel>
    </Sheet>
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

/** Never a blank panel while the query runs (DESIGN §2). */
export function QuotationSheetSkeleton() {
  const t = useTranslations();
  return (
    <Sheet open>
      <RecordPanel className="scroller">
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <SheetTitle className="sr-only">{t("quotations.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("quotations.requestHint")}</SheetDescription>
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
