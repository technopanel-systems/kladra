"use client";

import {
  Archive,
  CalendarClock,
  Pencil,
  Plus,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { Component, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { setCompanyFollowUpAction } from "@/actions/companies";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { ReportButton } from "@/components/reports/report-dialog";
import { ArchiveCompanyDialog } from "@/components/companies/archive-company-dialog";
import { useFailureToast } from "@/components/companies/failure-toast";
import { HandOverDialog } from "@/components/companies/hand-over-dialog";
import { ShareCompanyDialog } from "@/components/companies/share-company-dialog";
import {
  EditCompanyDialog,
  type CompanyEditable,
} from "@/components/companies/edit-company-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui-ext/avatar";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { usePathname, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { Sqm } from "@/components/ui-ext/figures";
import { NoteBlock } from "@/components/ui-ext/note-block";
import { RowMenu, type RowMenuEnd, type RowMenuItem } from "@/components/ui-ext/row-menu";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { RecordPanel } from "@/components/ui-ext/record-panel";
import { useOpener } from "@/components/ui-ext/use-opener";
import { formatDay, todayRiyadh } from "@/lib/dates";
import type { PickerOption } from "@/lib/picker-option";
import type { Sharer } from "@/lib/shares";
import type { CompanyStanding } from "@/lib/standing";
import { followUpClass, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The company drawer's client chrome: the sheet it lives in, and the header at
 * the top of it. Everything below the header — tabs, activity, contacts,
 * projects — is server rendered and arrives here as `children`, so the client
 * bundle carries only what actually needs a browser.
 *
 * The header is DESIGN §6's drawer hierarchy, in that order (P13-G6): who this
 * is — the company's avatar, its name, its city, category and source — and how
 * it is standing; the follow-up date, the one fact a rep changes on nearly
 * every visit (SPEC §3, D9); then the actions — Add report, the one brand
 * button, Add project beside it, and everything rarer in one menu, last and
 * apart, with Archive after its divider. What happened last is the tabs below.
 */

/* ---- the sheet ----------------------------------------------------------- */

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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();

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
      {/* The one drawer that becomes a bottom sheet on a phone: it opens
          over a list of cards a rep keeps his place in (D128). */}
      <RecordPanel phoneSheet>
        <div className="flex min-h-0 flex-1 flex-col scroller">
          <DrawerTrouble>{children}</DrawerTrouble>
        </div>
      </RecordPanel>
    </Sheet>
  );
}

/**
 * A company that could not be read fails in its own panel (DESIGN §8: a part
 * that failed says so in its own place and does not blank the whole screen).
 *
 * Without it a query that threw inside the drawer reached the screen's boundary
 * and replaced the LIST with the error card, so the rep lost his place, his
 * search and his chip over one customer. Try again re-reads the page in a
 * transition and lets the drawer render again when the answer is in. A redirect
 * or a not-found is the router's, not a failure, and is passed on.
 */
function DrawerTrouble({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const boundary = useRef<TroubleBoundary>(null);
  return (
    <TroubleBoundary
      ref={boundary}
      retry={() =>
        startTransition(() => {
          router.refresh();
          boundary.current?.reset();
        })
      }
    >
      {children}
    </TroubleBoundary>
  );
}

function isRouterSignal(error: unknown): boolean {
  const digest = typeof error === "object" && error !== null && "digest" in error ? error.digest : null;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

class TroubleBoundary extends Component<
  { retry: () => void; children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (isRouterSignal(error)) throw error;
    return <DrawerFailed retry={this.props.retry} />;
  }
}

function DrawerFailed({ retry }: { retry: () => void }) {
  const t = useTranslations();
  return (
    <div role="alert" data-slot="drawer-failed" className="flex flex-col items-start gap-4 p-4 pe-12">
      <div className="flex flex-col gap-2">
        <SheetTitle className="text-base">{t("drawer.companyFailed")}</SheetTitle>
        <SheetDescription>{t("shell.failedBody")}</SheetDescription>
      </div>
      <Button type="button" variant="brand" onClick={retry}>
        {t("shell.tryAgain")}
      </Button>
    </div>
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
  /** Whether the customer is in SMAC, in a word (SPEC §3, P14). */
  smac: string;
  repName: string;
  /** What the rep wrote about this customer, shown back to him (D136). */
  notes: string | null;
  /** The same company as form values, so Edit opens on what is already there. */
  editable: CompanyEditable;
  /** A Riyadh day, "YYYY-MM-DD". */
  nextFollowUp: string | null;
  /** The earliest open project's date, when one is set — what the list may be showing instead (D94). */
  projectFollowUp: { day: string; project: string } | null;
  /** A lead its holder has not yet said he has (D157): the amber ring and its word. */
  leadWaiting: boolean;
  /** Off the floor already: nothing to archive. */
  archived: boolean;
};

type Act = "edit" | "share" | "handOver" | "archive";

export function CompanyHeader({
  company,
  standing,
  mine,
  reports,
  handOverTo,
  sharers,
  shareWith,
  me,
}: {
  company: DrawerCompany;
  /** The four figures under the title (P8.5). */
  standing: CompanyStanding;
  /**
   * Whether the person reading this owns the floor it is on. A manager reads
   * every company and works none (S8, D42): he gets the same header with the
   * date as a sentence instead of a picker and no work in the action row,
   * rather than buttons that answer "Not allowed" (DESIGN §5).
   */
  mine: boolean;
  /**
   * Whether he may write a report on it: his own, or a customer shared with him
   * (`mayReportOn`, D147). Wider than `mine` — a rep put on a colleague's
   * customer reports what he did there — and narrower than reading it.
   */
  reports: boolean;
  /**
   * The people this company can be handed to, or null for a reader who may not
   * move it. Whose customer this is and what happened with him are two
   * questions (D42, D50): the manager answers the first and writes none of the
   * second, so the menu can hold this while the row holds no work.
   */
  handOverTo: PickerOption[] | null;
  /**
   * Who else is on this company (D147). Read for every reader, not only for
   * the people who may change it: a rep who was put on a colleague's customer
   * has to be able to see that he is on it, and a manager reading the floor has
   * to be able to see who else is working it.
   */
  sharers: Sharer[];
  /**
   * The people it can still be shared with, or null for a reader who may not
   * grant it. Its own rep, the manager and the admin may (`mayShare`); a reader
   * who may not still gets the way OFF it if he is on it himself, which is the
   * dialog's own second shape (D147).
   */
  shareWith: PickerOption[] | null;
  /** The reader, for the one row on that list that is his own. */
  me: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();
  const failed = useFailureToast();
  const [day, setDay] = useState<string | null>(company.nextFollowUp);
  const saving = useRef(false);

  const followUpLabelId = `company-follow-up-${company.id}`;
  const today = todayRiyadh();
  const overdue = day !== null && day < today;
  const dueToday = day === today;

  // Row colour is how long something has waited (DESIGN §1, §6): late is red,
  // due today is amber, otherwise faint. The words are beside the avatar.
  const tone = followUpClass(day, today);

  /*
   * The ring the row in the list carries, and the word for it beside the name
   * (DESIGN §1b). Amber for a lead nobody has said he has — it wins over a late
   * date, because a customer nobody has taken yet cannot be late to anybody —
   * and red for a follow-up that is late. Both words stay when both are true.
   */
  const ring: StateTone | undefined = company.leadWaiting ? "wait" : overdue ? "bad" : undefined;

  function save(next: string | null) {
    // Busy is not disabled (DESIGN §8): the picker stays where it is and a
    // second choice while the first is out does nothing.
    if (saving.current) return;
    saving.current = true;
    const previous = day;
    setDay(next);
    startTransition(async () => {
      const result = await guarded(setCompanyFollowUpAction)(company.id, next);
      saving.current = false;
      if (!result.ok) {
        setDay(previous);
        failed(result, () => save(next));
        return;
      }
      // Cleared is only cleared if nothing else drives the row (D94).
      toast.success(
        next
          ? t("drawer.followUpSet", { date: formatDay(next, locale) })
          : company.projectFollowUp
            ? t("drawer.followUpClearedProject", { project: company.projectFollowUp.project })
            : t("drawer.followUpCleared"),
      );
      router.refresh();
    });
  }

  /*
   * One menu for everything rarer than a report and a project (P13-G6, the row
   * menu S12.9 moved into the kit). Edit, then the two facts about belonging —
   * Sharing and Hand over, side by side because a reader comparing them is
   * comparing the right pair: one moves the customer and the other does not
   * (D147). The act that takes something away is last, behind its divider, in
   * the tint: Archive for its rep, Take myself off for somebody put on it. Each
   * item is there exactly when the action behind it would accept the press, from
   * the same predicates the drawer was already asking.
   */
  const [act, setAct] = useState<Act | null>(null);
  const remember = useOpener(act !== null);
  const choose = (next: Act) => (opener: HTMLElement | null) => {
    remember(opener);
    setAct(next);
  };
  const closeTo = (open: boolean) => {
    if (!open) setAct(null);
  };

  const onIt = sharers.some((person) => person.id === me);
  const items: RowMenuItem[] = [];
  if (mine) items.push({ label: t("common.edit"), icon: Pencil, onSelect: choose("edit") });
  if (shareWith) {
    items.push({ label: t("drawer.share.action"), icon: UsersRound, onSelect: choose("share") });
  }
  if (handOverTo) {
    items.push({ label: t("drawer.handOver"), icon: UserRoundPlus, onSelect: choose("handOver") });
  }
  const end: RowMenuEnd | undefined =
    mine && !company.archived
      ? { label: t("drawer.archive"), icon: Archive, destructive: true, onSelect: choose("archive") }
      : shareWith === null && onIt
        ? {
            label: t("drawer.share.leave"),
            icon: UserRoundMinus,
            destructive: true,
            onSelect: choose("share"),
          }
        : undefined;
  const menu = items.length > 0 || end !== undefined;

  // Context, not news. It stays a quiet line under the name — and the rep's
  // own name comes off it when he is reading his own company, because he knows.
  const meta: { label: string; value: string | null }[] = [
    { label: t("common.city"), value: company.city },
    { label: t("common.category"), value: company.category },
    { label: t("common.leadSource"), value: company.leadSource },
    // The office's other system, on the quiet line rather than as a badge: it
    // is true of most companies for a while, and a badge on all of them is a
    // badge on none (P14, DESIGN §1 Stone).
    { label: t("common.smac"), value: company.smac },
    { label: t("common.rep"), value: mine ? null : company.repName },
  ];

  return (
    <div className="flex flex-col gap-4 border-b border-line p-4">
      {/* Who: the company's own square, in its own tint, with the ring the
          list's row carries and the word for it beside the name. */}
      <div className="flex items-start gap-3 pe-10">
        <Avatar id={company.id} name={company.name} kind="company" size="lg" ring={ring} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SheetTitle className="text-lg leading-tight font-semibold">{company.name}</SheetTitle>
            {company.leadWaiting ? (
              <StateBadge tone="wait">{t("leads.notAcknowledged")}</StateBadge>
            ) : null}
            {overdue ? <StateBadge tone="bad">{t("common.overdue")}</StateBadge> : null}
            {dueToday ? <StateBadge tone="wait">{t("common.dueToday")}</StateBadge> : null}
          </div>
          <SheetDescription className="sr-only">{t("drawer.aboutCompany")}</SheetDescription>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                    <bdi>{item.value}</bdi>
                  </span>
                </span>
              ))}
          </p>
          {/* Who else is on it: a fact about belonging, read by everybody who
              can open the drawer (D147). The controls that change it are in
              the menu below. */}
          {sharers.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("drawer.share.onCompany")}:{" "}
              {sharers.map((person, index) => (
                <span key={person.id}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-faint">
                      {" · "}
                    </span>
                  ) : null}
                  <bdi>{person.name}</bdi>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      {/* How this customer is GOING, before anything about what he is
          (DESIGN §6): what is still open, what has been won, and how long it
          has been since anybody spoke to him. */}
      <StandingStrip
        items={[
          {
            label: t("drawer.pipeline"),
            value: <Sqm value={standing.pipelineSqm} whole />,
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

      {/* The follow-up date, at the top, with its picker (SPEC §3 / D9). For
          its rep the picker IS the date — one control that says the day and
          changes it, where there were a date and a second button that said
          it again; everybody else reads it as a sentence. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
        <span id={followUpLabelId} className="text-sm font-medium">
          {t("common.nextFollowUp")}
        </span>
        {mine ? (
          <div
            role="group"
            aria-labelledby={followUpLabelId}
            aria-busy={pending || undefined}
            className="ms-auto"
          >
            <DatePicker
              value={day}
              onChange={save}
              className={cn("w-auto", day ? tone : null)}
            />
          </div>
        ) : day ? (
          <DayText day={day} locale={locale} className={cn("ms-auto text-sm", tone)} />
        ) : (
          <span className="ms-auto text-sm text-muted-foreground">{t("drawer.noFollowUp")}</span>
        )}
        {/* The list colours the row by the earlier of the company's date and
            its projects' (least(...) in followups.ts). When a project's is the
            earlier, say so here, or the picker above looks like it lies (D94). */}
        {company.projectFollowUp && (day === null || company.projectFollowUp.day < day) ? (
          <p className="basis-full text-xs text-muted-foreground">
            {t("drawer.projectDrivesFollowUp", {
              project: company.projectFollowUp.project,
              date: formatDay(company.projectFollowUp.day, locale),
            })}
          </p>
        ) : null}
      </div>

      {reports || mine || menu ? (
        <div
          role="group"
          aria-label={t("drawer.companyActions")}
          className="flex items-center gap-2"
        >
          {/* One primary action, and the one brand gradient with it (DESIGN §1):
              a report on this customer, the popup opening on him (SPEC §3 P13). */}
          {reports ? (
            <ReportButton
              companyId={company.id}
              companyName={company.name}
              variant="brand"
              icon
            >
              {t("common.addReport")}
            </ReportButton>
          ) : null}

          {/* Secondary, beside it. Named in the title: on a phone the sheet
              covers the drawer, and "Add project" alone says nothing about
              where (P11H). Requesting a quotation is not here — it needs a
              project and lines, so it belongs on the Quotations tab. */}
          {mine ? (
            <NewProjectDialog
              companyId={company.id}
              companyName={company.name}
              trigger={
                <Button variant="outline">
                  <Plus aria-hidden="true" />
                  {t("drawer.newProject")}
                </Button>
              }
            />
          ) : null}

          {menu ? (
            <span className="ms-auto flex">
              <RowMenu
                label={t("common.moreFor", { name: company.name })}
                items={items}
                end={end}
                size="head"
              />
            </span>
          ) : null}
        </div>
      ) : null}

      {/* What he wrote about this customer, read back to him (D136). Below the
          actions, because the primary action is at the top of a drawer
          (DESIGN §2) and a note of four thousand characters would otherwise
          push Add report off an 88dvh sheet; and clamped for the same reason,
          with Edit in the menu above as the way to the whole of it. */}
      <NoteBlock
        title={t("common.notes")}
        text={company.notes}
        slot="company-notes"
        className="line-clamp-4"
      />

      {/* The dialogs the menu opens, mounted once and told which (DESIGN §5). */}
      {mine ? (
        <EditCompanyDialog company={company.editable} open={act === "edit"} onOpenChange={closeTo} />
      ) : null}
      {shareWith || onIt ? (
        <ShareCompanyDialog
          companyId={company.id}
          companyName={company.name}
          sharers={sharers}
          people={shareWith}
          me={me}
          open={act === "share"}
          onOpenChange={closeTo}
        />
      ) : null}
      {handOverTo ? (
        <HandOverDialog
          companyId={company.id}
          companyName={company.name}
          people={handOverTo}
          open={act === "handOver"}
          onOpenChange={closeTo}
        />
      ) : null}
      {mine && !company.archived ? (
        <ArchiveCompanyDialog
          companyId={company.id}
          companyName={company.name}
          open={act === "archive"}
          onOpenChange={closeTo}
        />
      ) : null}
    </div>
  );
}
