"use client";

import { Fragment, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { QuotationActions, type ActionScope } from "@/components/quotations/quotation-actions";
import { QuotationTotals } from "@/components/quotations/quotation-totals";
import { STATUS_KEYS } from "@/components/quotations/status-words";
import type { QuotationDraft } from "@/components/quotations/request-quotation-dialog";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { DayText } from "@/components/ui-ext/day-text";
import { Money, Ref, Sqm } from "@/components/ui-ext/figures";
import { NoteBlock } from "@/components/ui-ext/note-block";
import { RaisedBy } from "@/components/ui-ext/raised-by";
import { RecordPanel } from "@/components/ui-ext/record-panel";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDay } from "@/lib/dates";
import { lossReasonLabel } from "@/lib/loss-reason";
import { formatMoney, formatSqm } from "@/lib/money";
import type {
  QuotationItemRow,
  QuotationRow,
  QuotationServiceRow,
  QuotationStatus,
} from "@/lib/quotations";
import type { QuotationStanding } from "@/lib/standing";
import { quotationTone } from "@/lib/state-tone";

/**
 * The quotation drawer's client half. Its data is read by the server component in
 * quotation-drawer.tsx; everything interactive lives here.
 *
 * **A drawer has a hierarchy** (DESIGN §6), and this one is drawn in the shape
 * the company's and the project's are (P13-G6, S12.4). At the top, who this is:
 * the company with its own face, the job, and then the paper — its number beside
 * the word for where it stands. It led with the number ("Q-3/2 Waiting") and put
 * the company small under it, which is the app talking about its own record
 * rather than the reader's customer. The number stays the drawer's NAME, the
 * title a screen reader reads and every spec opens the drawer by: a drawer title
 * keeps Kladra's own name (§5), and what changed is which line is loudest.
 *
 * Then how big it is and how much of it is left, the facts of who it is for, why
 * it is where it is, and the actions. Then **what happened**, directly under the
 * actions, because it is what a coordinator reads before she presses anything
 * and what a rep reads after — it came last, after the lines, the totals, the
 * dispatches and the revisions, where nobody scrolled to it. Then the detail:
 * the note to the desk, what a revision changed (above the lines it describes),
 * the lines, the services, the totals, the dispatches and the other revisions.
 */

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

function StatusBadge({ status }: { status: QuotationStatus }) {
  const t = useTranslations();
  return <StateBadge tone={quotationTone(status)}>{t(STATUS_KEYS[status])}</StateBadge>;
}

export type QuotationSheetProps = {
  quotation: QuotationRow & {
    notes: string | null;
    isLatest: boolean;
    selfIssued: boolean;
    /** Where it was priced out of, and who it is for (SPEC §3, P12-9, P14). */
    warehouses: { id: number; name: string }[];
    contactName: string | null;
  };
  /**
   * Who it counts for (D148). Said only when it is worth saying — more than one
   * name, or one name that is not the man who raised it — so the ordinary
   * quotation is not made to answer a question nobody asked.
   */
  credit: { userId: string; name: string }[];
  items: QuotationItemRow[];
  /** Its services, drawn in their own section under the lines when there are any (SPEC §3, P13). */
  services: QuotationServiceRow[];
  revisions: { id: string; label: string; revision: number; status: QuotationStatus }[];
  draft: QuotationDraft;
  scope: ActionScope;
  /** The figures under the head (P8.5). */
  standing: QuotationStanding;
  /**
   * Whether the reader may write a report about this paper (SPEC §3, P13) —
   * decided on the server, which asks the sentence the report's action asks.
   */
  reportable: boolean;
  /**
   * The company's and the job's own drawers, where this reader may open them
   * (D139: a door is a property of the record AND the reader). Null draws the
   * name as words: the coordinator reads every quotation and holds no rep's floor.
   */
  companyHref: string | null;
  projectHref: string | null;
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
  services,
  revisions,
  draft,
  scope,
  standing,
  reportable,
  companyHref,
  projectHref,
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
        <SheetHeader className="gap-4 border-b border-line p-4">
          {/* Who: the company, with its own face (DESIGN §1b: 40 at the head of
              a drawer, a company square), the job, and the paper by its number
              beside the word for where it stands. */}
          <div className="flex items-start gap-3 pe-10">
            <Avatar id={quotation.companyId} name={quotation.companyName} kind="company" size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p data-slot="quotation-company" className="text-lg leading-tight font-semibold">
                {companyHref ? (
                  <Link
                    href={companyHref}
                    aria-label={t("projects.openCompany", { name: quotation.companyName })}
                    className="hover:underline"
                  >
                    <bdi>{quotation.companyName}</bdi>
                  </Link>
                ) : (
                  <bdi>{quotation.companyName}</bdi>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span data-slot="quotation-project">
                  {projectHref ? (
                    <Link
                      href={projectHref}
                      aria-label={t("projects.openProject", { name: quotation.projectName })}
                      className="hover:underline"
                    >
                      <bdi>{quotation.projectName}</bdi>
                    </Link>
                  ) : (
                    <bdi>{quotation.projectName}</bdi>
                  )}
                </span>
                <span aria-hidden="true" className="text-faint">
                  ·
                </span>
                <SheetTitle className="text-sm font-medium">
                  <Ref>{quotation.label}</Ref>
                </SheetTitle>
                <StatusBadge status={quotation.status} />
                {/* Overtaken by a later revision: finished, and no longer the
                    paper the customer holds (§6, state-over). */}
                {!quotation.isLatest ? (
                  <StateBadge tone="over">{t("quotations.supersededBadge")}</StateBadge>
                ) : null}
                {/* One person asked for this paper and put it out (SPEC §3). Said
                    here rather than only in the trail below, because the trail is
                    read after a question has been asked and this is what makes
                    somebody ask it. Everyone who may open the quotation sees it:
                    a flag only one role can see is a flag nobody trusts. */}
                {quotation.selfIssued ? (
                  <Badge variant="outline" className="border-line font-normal">
                    {t("quotations.selfIssuedBadge")}
                  </Badge>
                ) : null}
              </div>
              <SheetDescription className="sr-only">
                {t("quotations.drawerDescription", {
                  company: quotation.companyName,
                  project: quotation.projectName,
                })}
              </SheetDescription>
            </div>
          </div>

          {/* What this drawer is opened to check, before who typed it
              (DESIGN §6): how big it is, how much of it is still available to
              send (D12), when it went out, and SMAC's number for it. */}
          <StandingStrip
            items={[
              { label: t("common.sqm"), value: <Sqm value={quotation.totalSqm} /> },
              { label: t("dispatches.remaining"), value: <Sqm value={standing.remainingSqm} /> },
              {
                label: t("common.date"),
                value: <DayText day={quotation.issuedOn ?? quotation.createdOn} locale={locale} />,
              },
              {
                label: t("common.smacNumber"),
                value: quotation.smacNumber ? (
                  <Ref>{quotation.smacNumber}</Ref>
                ) : (
                  <span className="text-faint">—</span>
                ),
              },
            ]}
          />

          {/* The project is lost and this paper is still open on it (D138):
              the drawer says so with the day and the reason, in the band of an
              ending, so nobody prices or ships against a decision that has
              already been taken. A sentence, so a reason somebody typed runs its
              own way inside it (rules/words.md). */}
          {quotation.projectLostOn ? (
            <p
              data-slot="project-lost"
              className="rounded-xl bg-state-bad px-3 py-2 text-sm text-state-bad-fg"
            >
              <span className="font-medium">
                {t("common.projectLostOn", { date: formatDay(quotation.projectLostOn, locale) })}
              </span>
              {quotation.projectLostReason ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <bdi>{lossReasonLabel(quotation.projectLostReason, t)}</bdi>
                </>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {/* Whose paper this is. "Raised by" on everything a rep raised
                  himself; "For" where the coordinator raised it on his behalf,
                  because then the man named did not raise it — she did, and the
                  line under these facts says so (SPEC §3 P13). */}
              <Fact label={t(quotation.raisedByName ? "common.onBehalf.for" : "common.raisedBy")}>
                {quotation.repName}
              </Fact>
              {/* Who at the customer this went to, and which store it was
                  priced out of (SPEC §3, P12-9). The name only when there is
                  one: a price raised for the company rather than for a person is
                  addressed to nobody by design, not by omission. */}
              {quotation.contactName ? (
                <Fact label={t("common.contact")}>
                  <bdi>{quotation.contactName}</bdi>
                </Fact>
              ) : null}
              {/* One store on almost every paper; the rare second and third
                  beside it, each its own run, separated by a mark rather than
                  by a comma that would settle the wrong way (rules/words.md). */}
              <Fact label={t("common.warehouse")}>
                <span data-slot="stores">
                  {quotation.warehouses.map((store, index) => (
                    <Fragment key={store.id}>
                      {index > 0 ? <span aria-hidden="true"> · </span> : null}
                      <bdi>{store.name}</bdi>
                    </Fragment>
                  ))}
                </span>
              </Fact>
              {credit.length > 0 && (credit.length > 1 || credit[0].userId !== quotation.repId) ? (
                <Fact label={t("common.credit.label")}>
                  {/* Each name in its own bdi: the separator is neutral and
                      would otherwise settle against the paragraph rather than
                      against the name beside it (rules/words.md). */}
                  {credit.map((line, index) => (
                    <Fragment key={line.userId}>
                      {index > 0 ? (
                        <span aria-hidden="true" className="text-faint">
                          {" · "}
                        </span>
                      ) : null}
                      <bdi>{line.name}</bdi>
                    </Fragment>
                  ))}
                </Fact>
              ) : null}
            </dl>
            <RaisedBy name={quotation.raisedByName} place="drawer" />
          </div>

          {/* Why it is where it is, above the act that answers it: her words
              before he presses Edit request, the customer's before anybody
              revises. */}
          {quotation.status === "returned" && quotation.returnReason ? (
            <NoteBlock title={t("quotations.sentBackReason")} text={quotation.returnReason} />
          ) : null}
          {quotation.status === "rejected" && quotation.decisionReason ? (
            <NoteBlock title={t("quotations.rejectedReason")} text={quotation.decisionReason} />
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
            reportable={reportable}
          />
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          {/* What happened, straight under the actions (DESIGN §6). */}
          {history}

          {/* The detail, from here down. The note to the desk first, because
              it is what she reads before the lines. */}
          {quotation.notes ? (
            <NoteBlock title={t("quotations.notesToCoordinator")} text={quotation.notes} />
          ) : null}

          {/* Directly above the lines, because it is what she reads before
              them: on a revision the only question she has is which line is not
              what she already priced (D76). */}
          {changes}

          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id} data-slot="quotation-item" className="card-face flex flex-col gap-3 p-3">
                  {/* The line's m² is its headline and its money the support
                      (DESIGN §6, P8), each saying what it is once — a total with
                      no unit beside a totals block that says SAR read as a
                      different figure. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h4 className="text-sm font-medium">
                      {t("quotations.itemNumber", { number: item.position })}
                    </h4>
                    <span className="flex items-baseline gap-4 text-sm">
                      <Sqm value={item.sqm} />
                      <Money value={item.lineTotal} />
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <Fact label={t("common.colourCode")}>
                      <Ref>{item.colourCode}</Ref>
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

            {/* The services, in a section of their own under the panels, and
                subtotalled apart from them (SPEC §3, P13). Only when there are
                any: most paper has none, and a heading over nothing is a field a
                reader has to decide is empty. */}
            {services.length > 0 ? (
              <section
                data-slot="quotation-services"
                aria-labelledby="quotation-services-heading"
                className="flex flex-col gap-2"
              >
                <h3 id="quotation-services-heading" className="text-sm font-medium">
                  {t("quotations.services")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {services.map((service) => (
                    <li
                      key={service.id}
                      data-slot="quotation-service"
                      className="card-face flex flex-col gap-3 p-3"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <h4 className="flex min-w-0 text-sm font-medium">
                          <Clip text={service.name} />
                        </h4>
                        <Money value={service.total} className="text-sm" />
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                        {/* Typed, and counted toward nothing (D173): a figure
                            under its label, never a headline. */}
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
                  <Money value={quotation.servicesSubtotal} className="font-medium text-foreground" />
                </p>
              </section>
            ) : null}

            <QuotationTotals
              sqm={quotation.totalSqm}
              split={
                services.length > 0
                  ? { panels: quotation.panelsSubtotal, services: quotation.servicesSubtotal }
                  : undefined
              }
              subtotal={quotation.subtotal}
              vat={quotation.vat}
              total={quotation.total}
            />
          </div>

          {dispatches}

          {revisions.length > 1 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("quotations.revisions")}</h3>
              <ul className="flex flex-wrap gap-2">
                {revisions.map((revision) => (
                  <li key={revision.id}>
                    {/* The one open is a wash, never a ring (§5). */}
                    <Button
                      asChild
                      variant={revision.id === quotation.id ? "secondary" : "outline"}
                      size="sm"
                    >
                      <Link
                        href={`/quotations?open=${revision.id}`}
                        aria-current={revision.id === quotation.id ? "page" : undefined}
                      >
                        <Ref>{revision.label}</Ref>
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </RecordPanel>
    </Sheet>
  );
}

/** A label over its value: the shape every fact on a drawer is read in. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Never a blank while the drawer's data is on its way (DESIGN §2), and in the
 * drawer's own shape (§1b): the company's square and two lines, the strip of
 * four figures, the facts, the action row with its menu at the end; then the
 * trail, and item cards at a card's height. Standing still.
 */
export function QuotationSheetSkeleton() {
  const t = useTranslations();
  const close = useCloseDrawer();
  return (
    // Closable while it loads: a drawer somebody opened by mistake is closed at
    // once, not after the record arrives and opens anyway.
    <Sheet open onOpenChange={(next) => (next ? undefined : close())}>
      <RecordPanel className="scroller" aria-busy="true">
        <SheetHeader className="gap-4 border-b border-line p-4">
          <SheetTitle className="sr-only">{t("quotations.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("common.loading")}</SheetDescription>
          <div className="flex items-start gap-3 pe-10">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-xl sm:h-16" />
          <div className="flex gap-6">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-lg max-md:h-11" />
            <Skeleton className="h-8 w-28 rounded-lg max-md:h-11" />
            <Skeleton className="ms-auto size-8 rounded-lg max-md:size-11" />
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1].map((card) => (
              <Skeleton key={card} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </RecordPanel>
    </Sheet>
  );
}
