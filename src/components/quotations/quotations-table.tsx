"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { QuotationActions, type ActionScope } from "@/components/quotations/quotation-actions";
import { QuotationTotals } from "@/components/quotations/quotation-totals";
import type { QuotationDraft } from "@/components/quotations/request-quotation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { focusTheDrawerItself } from "@/components/ui-ext/drawer-focus";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { formatMoney, formatSqm } from "@/lib/money";
import type { QuotationItemRow, QuotationRow, QuotationStatus } from "@/lib/quotations";
import { cn } from "@/lib/utils";

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

const DEBOUNCE_MS = 200;

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
 * The same list is two screens: the rep's quotations and the coordinator's
 * queue. Every link it builds stays on the screen it was built from, so
 * pressing a row in the queue does not quietly move her to somebody's list.
 */
function listHref(
  base: string,
  q: string,
  status: QuotationStatus | null,
  open?: string | null,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (open) params.set("open", open);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function StatusBadge({ status }: { status: QuotationStatus }) {
  const t = useTranslations();
  return <Badge variant="secondary">{t(STATUS_KEYS[status])}</Badge>;
}

/** A figure with a unit, in a run of digits that reads left to right either way. */
function Money({ value }: { value: string }) {
  const t = useTranslations();
  return (
    <span className="whitespace-nowrap">
      <span dir="ltr" className="num">
        {formatMoney(value)}
      </span>{" "}
      <span className="text-xs text-muted-foreground">{t("common.sar")}</span>
    </span>
  );
}

export function QuotationsTable({
  base,
  rows,
  q,
  status,
  openId,
  showFilters = true,
}: {
  /** "/quotations" or "/queue" — locale-free, the way @/i18n/navigation wants it. */
  base: string;
  rows: QuotationRow[];
  q: string;
  status: QuotationStatus | null;
  openId: string | null;
  /** The coordinator's queue is one status by definition; it needs no chips. */
  showFilters?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [term, setTerm] = useState(q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function go(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function onTerm(value: string) {
    setTerm(value);
    if (timer.current) clearTimeout(timer.current);
    // A new search drops whatever the URL had open — that row may be gone.
    timer.current = setTimeout(() => go(listHref(base, value.trim(), status)), DEBOUNCE_MS);
  }

  function clearTerm() {
    setTerm("");
    if (timer.current) clearTimeout(timer.current);
    go(listHref(base, "", status));
  }

  return (
    <div className="flex flex-col gap-4">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((value) => (
            <FilterChip
              key={value}
              // Pressing the chip you are on takes the filter off again.
              href={listHref(base, term.trim(), status === value ? null : value)}
              active={status === value}
            >
              {t(STATUS_KEYS[value])}
            </FilterChip>
          ))}
          <span aria-hidden="true" className="h-4 w-px bg-line" />
          <FilterChip href={listHref(base, term.trim(), null)} active={status === null}>
            {t("common.all")}
          </FilterChip>
        </div>
      ) : null}

      <div className="relative max-w-md">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
        />
        <Input
          type="search"
          value={term}
          onChange={(event) => onTerm(event.target.value)}
          aria-label={t("quotations.searchLabel")}
          placeholder={t("quotations.searchPlaceholder")}
          className="h-10 px-10"
        />
        {term ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={clearTerm}
            aria-label={t("common.clear")}
            className="absolute inset-y-0 end-1 my-auto"
          >
            <XIcon />
          </Button>
        ) : null}
      </div>

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {rows.length === 0 ? (
          <EmptyQuotations base={base} q={q} status={status} onClear={clearTerm} />
        ) : (
          <>
            {/* 375: cards. Six columns on a phone is a horizontal scroll. */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={listHref(base, q, status, row.id)}
                  className="card-face flex flex-col gap-1.5 p-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="num font-medium">
                      {row.label}
                    </span>
                    <StatusBadge status={row.status} />
                  </span>
                  <span className="truncate text-sm">{row.companyName}</span>
                  {row.projectName ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {row.projectName}
                    </span>
                  ) : null}
                  <span className="text-sm">
                    <Money value={row.total} />
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
                    <TableHead className="p-3">{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-state={openId === row.id ? "selected" : undefined}>
                      <TableCell className="p-0">
                        <Link
                          href={listHref(base, q, status, row.id)}
                          aria-current={openId === row.id ? "true" : undefined}
                          className="block p-3"
                        >
                          <span dir="ltr" className="num font-medium">
                            {row.label}
                          </span>
                          {row.smacNumber ? (
                            <span dir="ltr" className="num block text-xs text-muted-foreground">
                              {row.smacNumber}
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="p-3">{row.companyName}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">
                        {row.projectName ?? "—"}
                      </TableCell>
                      <TableCell className="p-3 text-end">
                        <span dir="ltr" className="num">
                          {formatSqm(row.totalSqm)}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 text-end">
                        <Money value={row.total} />
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="flex flex-col gap-1">
                          <StatusBadge status={row.status} />
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
  onClear,
}: {
  base: string;
  q: string;
  status: QuotationStatus | null;
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
        <Button asChild variant="outline">
          <Link href={base}>{t("common.all")}</Link>
        </Button>
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
  quotation: QuotationRow & { notes: string | null; isLatest: boolean };
  items: QuotationItemRow[];
  revisions: { id: string; label: string; revision: number; status: QuotationStatus }[];
  draft: QuotationDraft;
  scope: ActionScope;
  /**
   * What has gone out against this quotation, and the button that sends more —
   * built on the server, because both need the reader's own scope (S38).
   */
  dispatches: ReactNode;
};

export function QuotationSheet({
  quotation,
  items,
  revisions,
  draft,
  scope,
  dispatches,
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
      <SheetContent
        onOpenAutoFocus={focusTheDrawerItself}
        // Radix's sides are physical; in Arabic the drawer comes from the other
        // edge so it still slides in from the end of the line.
        side={locale === "ar" ? "left" : "right"}
        className="w-full gap-0 overflow-y-auto overscroll-contain p-0 data-[side=left]:sm:max-w-2xl data-[side=right]:sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle dir="ltr" className="num text-lg">
                {quotation.label}
              </SheetTitle>
              <StatusBadge status={quotation.status} />
              {!quotation.isLatest ? (
                <Badge variant="outline">{t("quotations.supersededBadge")}</Badge>
              ) : null}
            </div>
            <SheetDescription>
              {quotation.projectName
                ? t("quotations.drawerDescription", {
                    company: quotation.companyName,
                    project: quotation.projectName,
                  })
                : quotation.companyName}
            </SheetDescription>

            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Fact label={t("common.rep")}>{quotation.repName}</Fact>
              <Fact label={t("common.date")}>
                <DayText day={quotation.createdOn} locale={locale} />
              </Fact>
              {quotation.smacNumber ? (
                <Fact label={t("common.smacNumber")}>
                  <span dir="ltr" className="num">
                    {quotation.smacNumber}
                  </span>
                </Fact>
              ) : null}
            </dl>
          </div>

          {quotation.status === "returned" && quotation.returnReason ? (
            <Reason title={t("quotations.sentBackReason")} text={quotation.returnReason} />
          ) : null}
          {quotation.status === "rejected" && quotation.decisionReason ? (
            <Reason title={t("quotations.rejectedReason")} text={quotation.decisionReason} />
          ) : null}
          {quotation.notes ? (
            <Reason title={t("quotations.notesToCoordinator")} text={quotation.notes} />
          ) : null}

          <QuotationActions
            quotation={{
              id: quotation.id,
              label: quotation.label,
              status: quotation.status,
              companyId: quotation.companyId,
              projectId: quotation.projectId,
              isLatest: quotation.isLatest,
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
                  </h4>
                  <span className="text-sm">
                    <Money value={item.lineTotal} />
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
        </div>
      </SheetContent>
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

function Reason({ title, text }: { title: string; text: string }) {
  return (
    <div className="card-face flex flex-col gap-1 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/** Never a blank panel while the query runs (DESIGN §2). */
export function QuotationSheetSkeleton() {
  const t = useTranslations();
  return (
    <Sheet open>
      <SheetContent onOpenAutoFocus={focusTheDrawerItself} side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <SheetTitle className="sr-only">{t("quotations.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("quotations.requestHint")}</SheetDescription>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
