"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { DispatchActions, type DispatchScope } from "@/components/dispatches/dispatch-actions";
import type { DispatchDraft } from "@/components/dispatches/request-dispatch-dialog";
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
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { formatSqm } from "@/lib/money";
import type { DispatchItemRow, DispatchRow, DispatchStatus } from "@/lib/dispatches";
import { cn } from "@/lib/utils";

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

const DEBOUNCE_MS = 200;

const STATUS_KEYS: Record<DispatchStatus, string> = {
  submitted: "dispatches.statusSubmitted",
  approved: "dispatches.statusApproved",
  refused: "dispatches.statusRefused",
};

const FILTERS: DispatchStatus[] = ["submitted", "approved", "refused"];

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
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (open) params.set(param, open);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function StatusBadge({ status }: { status: DispatchStatus }) {
  const t = useTranslations();
  return <Badge variant="secondary">{t(STATUS_KEYS[status])}</Badge>;
}

export function DispatchesTable({
  base,
  param = "open",
  rows,
  q,
  status,
  openId,
  showFilters = true,
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
    timer.current = setTimeout(() => go(listHref(base, param, value.trim(), status)), DEBOUNCE_MS);
  }

  function clearTerm() {
    setTerm("");
    if (timer.current) clearTimeout(timer.current);
    go(listHref(base, param, "", status));
  }

  return (
    <div className="flex flex-col gap-4">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((value) => (
            <FilterChip
              key={value}
              href={listHref(base, param, term.trim(), status === value ? null : value)}
              active={status === value}
            >
              {t(STATUS_KEYS[value])}
            </FilterChip>
          ))}
          <span aria-hidden="true" className="h-4 w-px bg-line" />
          <FilterChip href={listHref(base, param, term.trim(), null)} active={status === null}>
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
          aria-label={t("dispatches.searchLabel")}
          placeholder={t("dispatches.searchPlaceholder")}
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
          <EmptyDispatches base={base} q={q} status={status} onClear={clearTerm} />
        ) : (
          <>
            {/* 375: cards. Six columns on a phone is a horizontal scroll. */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={listHref(base, param, q, status, row.id)}
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
                    <span dir="ltr" className="num">
                      {formatSqm(row.totalSqm)}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">{t("common.sqm")}</span>
                  </span>
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
                    <TableHead className="p-3">{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-state={openId === row.id ? "selected" : undefined}>
                      <TableCell className="p-0">
                        <Link
                          href={listHref(base, param, q, status, row.id)}
                          aria-current={openId === row.id ? "true" : undefined}
                          className="block p-3"
                        >
                          <span dir="ltr" className="num font-medium">
                            {row.label}
                          </span>
                          {row.smacDispatchNumber ? (
                            <span dir="ltr" className="num block text-xs text-muted-foreground">
                              {row.smacDispatchNumber}
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="p-3">{row.companyName}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">
                        {row.projectName ?? "—"}
                      </TableCell>
                      <TableCell className="p-3">
                        <span dir="ltr" className="num text-sm">
                          {row.quotationLabel}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 text-end">
                        <span dir="ltr" className="num">
                          {formatSqm(row.totalSqm)}
                        </span>
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="flex flex-col gap-1">
                          <StatusBadge status={row.status} />
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
  onClear,
}: {
  base: string;
  q: string;
  status: DispatchStatus | null;
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
        <Button asChild variant="outline">
          <Link href={base}>{t("common.all")}</Link>
        </Button>
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
  dispatch: DispatchRow;
  items: DispatchItemRow[];
  draft: DispatchDraft;
  scope: DispatchScope;
  /** The parameter that opened it, so closing drops the right one. */
  param?: string;
};

export function DispatchSheet({
  dispatch,
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
        // Radix's sides are physical; in Arabic the drawer comes from the other
        // edge so it still slides in from the end of the line.
        side={locale === "ar" ? "left" : "right"}
        className="w-full gap-0 overflow-y-auto overscroll-contain p-0 data-[side=left]:sm:max-w-2xl data-[side=right]:sm:max-w-2xl"
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
              {dispatch.projectName
                ? `${dispatch.companyName} · ${dispatch.projectName}`
                : dispatch.companyName}
            </SheetDescription>

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
              <Fact label={t("common.rep")}>{dispatch.repName}</Fact>
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
              quotationId: dispatch.quotationId,
              quotationLabel: dispatch.quotationLabel,
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
                  <span className="text-sm whitespace-nowrap">
                    <span dir="ltr" className="num">
                      {formatSqm(item.sqm)}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">{t("common.sqm")}</span>
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
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
            <Row label={t("common.sqm")}>
              <span dir="ltr" className="num font-semibold" data-slot="figure-sending">
                {formatSqm(dispatch.totalSqm)}
              </span>
            </Row>
            <Row label={t("common.shipment")}>{dispatch.shipmentMethod}</Row>
            <Row label={t("common.destination")}>{dispatch.destination}</Row>
            <Row label={t("common.paymentTerms")}>{dispatch.paymentTerms}</Row>
          </dl>
        </div>
      </SheetContent>
    </Sheet>
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
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/** Never a blank panel while the query runs (DESIGN §2). */
export function DispatchSheetSkeleton() {
  const t = useTranslations();
  return (
    <Sheet open>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <SheetTitle className="sr-only">{t("dispatches.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("dispatches.requestHint")}</SheetDescription>
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
