"use client";

import { CalendarClock, NotebookPen, Pencil, Plus } from "lucide-react";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { setCompanyFollowUpAction } from "@/actions/companies";
import { LogDialog, type LogContact, type LogProject } from "@/components/activities/log-dialog";
import { ArchiveCompanyDialog } from "@/components/companies/archive-company-dialog";
import { HandOverDialog } from "@/components/companies/hand-over-dialog";
import {
  EditCompanyDialog,
  type CompanyEditable,
} from "@/components/companies/edit-company-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { usePathname, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { focusTheDrawerItself } from "@/components/ui-ext/drawer-focus";
import { formatDay, todayRiyadh } from "@/lib/dates";
import type { PickerOption } from "@/lib/picker-option";
import type { CompanyStanding } from "@/lib/standing";
import { followUpClass, TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The company drawer's client chrome: the sheet it lives in, and the header at
 * the top of it. Everything below the header — tabs, activity, contacts,
 * projects — is server rendered and arrives here as `children`, so the client
 * bundle carries only what actually needs a browser.
 *
 * Two rules from DESIGN §2 shape this file: work happens in a drawer over the
 * list, and the primary action sits at the TOP. The next-follow-up date sits
 * above the actions because it is the one thing a rep changes on nearly every
 * visit (SPEC §3 / D9).
 */

/* ---- the sheet ----------------------------------------------------------- */

const COMPACT = "(max-width: 639px)";

let compactQuery: MediaQueryList | null = null;
function media(): MediaQueryList {
  compactQuery ??= window.matchMedia(COMPACT);
  return compactQuery;
}
function subscribeCompact(onChange: () => void) {
  const query = media();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readCompact = () => media().matches;
/** The server has no viewport; the phone corrects itself right after hydration. */
const readCompactOnServer = () => false;

/**
 * Driven by `?open=<id>` (SPEC §3: the open drawer lives in the URL, so a
 * refresh and a shared link land in the same place). Closing removes only that
 * parameter — the list's `?q=` and `?filter=` survive.
 *
 * The push runs inside a transition: the old tree stays on screen while the
 * next one renders, which is exactly long enough for the sheet to animate out
 * before the parent stops rendering it.
 */
export function CompanyDrawerFrame({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  const compact = useSyncExternalStore(subscribeCompact, readCompact, readCompactOnServer);

  // A drawer belongs on the inline-end edge; `side` is physical, so Arabic
  // takes the mirror image. At 375 it is a bottom sheet instead.
  const side = compact ? "bottom" : locale === "ar" ? "left" : "right";

  function onOpenChange(next: boolean) {
    if (next) return;
    setOpen(false);
    const rest = new URLSearchParams(params.toString());
    rest.delete("open");
    const query = rest.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={focusTheDrawerItself}
        side={side}
        className={cn(
          "gap-0 p-0",
          side === "bottom" ? "max-h-[88svh] rounded-t-xl" : "sm:max-w-lg!",
          // side="left" borders its outer edge; in Arabic the content-facing
          // edge is the inline-start one.
          side === "left" && "border-s",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---- the header ---------------------------------------------------------- */

export type DrawerCompany = {
  id: string;
  name: string;
  /** The city as a word — a picked Saudi city or the free text for elsewhere. */
  city: string | null;
  category: string;
  leadSource: string;
  repName: string;
  /** The same company as form values, so Edit opens on what is already there. */
  editable: CompanyEditable;
  /** A Riyadh day, "YYYY-MM-DD". */
  nextFollowUp: string | null;
};

export function CompanyHeader({
  company,
  contacts,
  projects,
  standing,
  mine,
  handOverTo,
}: {
  company: DrawerCompany;
  contacts: readonly LogContact[];
  projects: readonly LogProject[];
  /** The four figures under the title (P8.5). */
  standing: CompanyStanding;
  /**
   * Whether the person reading this owns the floor it is on. A manager reads
   * every company and works none (S8, D42): he gets the same header with the
   * date as a sentence instead of a picker and no action row under it, rather
   * than a row of buttons that answer "Not allowed" (DESIGN §5).
   */
  mine: boolean;
  /**
   * The people this company can be handed to, or null for a reader who may not
   * move it. Whose customer this is and what happened with him are two
   * questions (D42, D50): the manager answers the first and writes none of the
   * second, so this can be here while the action row below is not.
   */
  handOverTo: PickerOption[] | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState<string | null>(company.nextFollowUp);

  const followUpLabelId = `${ids}-follow-up`;
  const today = todayRiyadh();
  const overdue = day !== null && day < today;
  const dueToday = day === today;

  // Row colour is how long something has waited (DESIGN §1, §6): late is red,
  // due today is amber, otherwise faint. The word beside it carries the same
  // meaning for anyone who does not see colour.
  const tone = followUpClass(day, today);

  function save(next: string | null) {
    const previous = day;
    setDay(next);
    startTransition(async () => {
      const result = await setCompanyFollowUpAction(company.id, next);
      if (!result.ok) {
        setDay(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next
          ? t("drawer.followUpSet", { date: formatDay(next, locale) })
          : t("drawer.followUpCleared"),
      );
      router.refresh();
    });
  }

  // Context, not news. It stays a quiet line under the name — and the rep's
  // own name comes off it when he is reading his own company, because he knows.
  const meta: { label: string; value: string | null }[] = [
    { label: t("common.city"), value: company.city },
    { label: t("common.category"), value: company.category },
    { label: t("common.leadSource"), value: company.leadSource },
    { label: t("common.rep"), value: mine ? null : company.repName },
  ];

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 pt-4 pb-3">
      <div className="flex flex-col gap-1 pe-10">
        <SheetTitle className="text-lg leading-tight font-semibold">{company.name}</SheetTitle>
        <SheetDescription className="sr-only">{t("drawer.aboutCompany")}</SheetDescription>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {meta
            .filter((item) => Boolean(item.value))
            .map((item, index) => (
              <span key={item.label} className="inline-flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                ) : null}
                <span>
                  <span className="sr-only">{item.label}: </span>
                  {item.value}
                </span>
              </span>
            ))}
        </p>
      </div>

      {/* How this customer is GOING, before anything about what he is
          (DESIGN §6): what is still open, what has been won, and how long it
          has been since anybody spoke to him. */}
      <StandingStrip
        items={[
          {
            label: t("drawer.pipeline"),
            value: <Sqm value={standing.pipelineSqm} />,
          },
          {
            label: t("drawer.approved"),
            value: <Sqm value={standing.approvedSqm} />,
          },
          {
            label: t("drawer.openQuotations"),
            value: (
              <span dir="ltr" className="num">
                {standing.openQuotations}
              </span>
            ),
          },
          {
            label: t("drawer.lastActivity"),
            value: standing.lastActivityOn ? (
              <DayText day={standing.lastActivityOn} locale={locale} />
            ) : (
              <span className="text-muted-foreground">{t("common.never")}</span>
            ),
            tone: standing.lastActivityOn ? null : "open",
          },
        ]}
      />

      {/* The follow-up date, at the top, with its picker (SPEC §3 / D9). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
        <span id={followUpLabelId} className="text-sm font-medium">
          {t("common.nextFollowUp")}
        </span>
        {day ? (
          <DayText day={day} locale={locale} className={cn("text-sm", tone)} />
        ) : (
          <span className={cn("text-sm", tone)}>{t("drawer.noFollowUp")}</span>
        )}
        {overdue ? (
          <span className={cn("text-xs font-medium", TONE_TEXT.bad)}>{t("common.overdue")}</span>
        ) : null}
        {dueToday ? (
          <span className={cn("text-xs font-medium", TONE_TEXT.wait)}>{t("common.dueToday")}</span>
        ) : null}
        {mine ? (
          <div
            role="group"
            aria-labelledby={followUpLabelId}
            aria-busy={pending || undefined}
            className="ms-auto"
          >
            <DatePicker value={day} onChange={save} />
          </div>
        ) : null}
      </div>

      {handOverTo ? (
        <div className="flex items-center gap-2">
          <HandOverDialog
            companyId={company.id}
            companyName={company.name}
            people={handOverTo}
          />
        </div>
      ) : null}

      {mine ? (
      <div
        role="group"
        aria-label={t("drawer.companyActions")}
        className="flex flex-wrap items-center gap-2"
      >
        {/* One primary action, and the one brand gradient with it (DESIGN §1). */}
        <LogDialog
          companyId={company.id}
          companyName={company.name}
          contacts={contacts}
          projects={projects}
          trigger={
            <Button className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow) hover:opacity-90">
              <NotebookPen aria-hidden="true" />
              {t("common.log")}
            </Button>
          }
        />

        <NewProjectDialog
          companyId={company.id}
          trigger={
            <Button variant="outline">
              <Plus aria-hidden="true" />
              {t("drawer.newProject")}
            </Button>
          }
        />

        {/* Requesting a quotation is NOT here. It needs a project and a set of
            lines, so it belongs beside the quotations it makes — the Quotations
            tab below, and the project drawer. Four buttons is already the most
            this row can carry on a phone. */}

        <EditCompanyDialog
          company={company.editable}
          trigger={
            <Button variant="ghost">
              <Pencil aria-hidden="true" />
              {t("common.edit")}
            </Button>
          }
        />

        {/* Last, and quiet: archiving is rare, and it is the one action here
            that takes the company off the floor (SPEC §3 — archive, never
            delete). */}
        <ArchiveCompanyDialog companyId={company.id} companyName={company.name} />
      </div>
      ) : null}
    </div>
  );
}
