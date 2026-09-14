"use client";

import { useId, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Archive, CalendarClock, CircleOff, Pencil, UsersRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setProjectFollowUpAction } from "@/actions/projects";
import { ArchiveProjectDialog } from "@/components/projects/archive-project-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { MarkLostDialog } from "@/components/projects/mark-lost-dialog";
import { useFlashProject } from "@/components/projects/project-flash";
import { STAGE_KEYS } from "@/components/projects/stage-words";
import {
  ShareProjectDialog,
  shareProjectOffered,
} from "@/components/projects/share-project-dialog";
import { ReportButton } from "@/components/reports/report-dialog";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { DayText } from "@/components/ui-ext/day-text";
import { Sqm } from "@/components/ui-ext/figures";
import { NoteBlock } from "@/components/ui-ext/note-block";
import { RecordPanel } from "@/components/ui-ext/record-panel";
import { RowMenu, type RowMenuEnd, type RowMenuItem } from "@/components/ui-ext/row-menu";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { useOpener } from "@/components/ui-ext/use-opener";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDay } from "@/lib/dates";
import type { FollowUpState } from "@/lib/followups";
import { lossReasonLabel } from "@/lib/loss-reason";
import type { PickerOption } from "@/lib/picker-option";
import type { ProjectStage } from "@/lib/project-stage";
import type { Sharer } from "@/lib/shares";
import type { ProjectStanding } from "@/lib/standing";
import { projectStageTone } from "@/lib/state-tone";

/**
 * The project drawer's client half. Its data is read by the server component in
 * project-drawer.tsx; everything interactive lives here.
 *
 * **A drawer has a hierarchy** (DESIGN §6, P13-G6). At the top, who this is: the
 * job, its company with the company's own face beside it, and where the job
 * stands. Then how it is going — the four figures — and the one date a rep
 * changes on nearly every visit. Then the actions, and the actions have a
 * hierarchy too: Add report is the one brand button and the only one in sight,
 * because it is what a rep does to a job every day. Edit and Sharing sit in the
 * menu at the row's end, and the two acts that take a job away — Mark lost,
 * which ends it with a reason (S20), and Archive, which tidies away one that was
 * never real — go last in it, apart and in the tint. Mark lost stood in the row
 * at the weight of Edit, one finger's width from Add report.
 *
 * Every dialog the menu opens is hosted here, because a menu item is gone the
 * moment the menu closes; each hands focus back to the menu's button when it
 * closes (`useOpener`).
 */

export type ProjectSheetProps = {
  projectId: string;
  name: string;
  companyId: string;
  companyName: string;
  cityName: string | null;
  expectedSqm: string | null;
  /** Where the job stands in its own life (D170): the list's word, in its tone. */
  stage: ProjectStage;
  /** The figures under the title (P8.5). */
  standing: ProjectStanding;
  nextFollowUp: string | null;
  followUpState: FollowUpState | null;
  lostOn: string | null;
  lostReason: string | null;
  /** As stored, so Edit opens on the project's own notes rather than a summary. */
  notes: string | null;
  /**
   * Whether the person reading this WORKS the job: its own rep, and anybody it
   * has been shared with (D147). A manager reads every project and works none
   * (S8, D42), so he gets the date as words and the history, and no picker.
   */
  mine: boolean;
  /**
   * Whether he may write a report about this job: the customer over it is his,
   * or shared with him (`mayReportOn`, D147). A lost job takes no new report
   * (S20), which the sheet says by not offering one.
   */
  reports: boolean;
  /**
   * Whether he owns the row itself — the person who added the project. Editing
   * it, marking it lost and archiving it are decisions about the record rather
   * than work on the job, and an item belongs to whoever created it (SPEC §3).
   */
  owns: boolean;
  /** Who else is on it, in the reader's language, without its own rep (D147). */
  sharers: Sharer[];
  /** Who can still be put on it, or null for a reader who may not grant a share. */
  shareWith: PickerOption[] | null;
  /** The reader, for the one row on the sharing list that may be his own. */
  me: string;
  /** The rendered activity list, empty state and all. */
  activity: ReactNode;
  /** The rendered quotations panel, empty state and all. */
  quotations: ReactNode;
};

type Act = "edit" | "share" | "lost" | "archive";

/** Closing the drawer drops `?open=` and leaves `?q=` and `?filter=` alone. */
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

export function ProjectSheet({
  projectId,
  name,
  companyId,
  companyName,
  cityName,
  expectedSqm,
  stage,
  standing,
  nextFollowUp,
  followUpState,
  lostOn,
  lostReason,
  notes,
  mine,
  reports,
  owns,
  sharers,
  shareWith,
  me,
  activity,
  quotations,
}: ProjectSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const close = useCloseDrawer();
  const flash = useFlashProject();
  const ids = useId();
  const [saving, startTransition] = useTransition();
  const guarded = useWireGuard();
  // The picked date shows at once and the server stays the source of truth: the
  // optimistic value falls back to the prop when the transition settles, so a
  // refused save, a report that moved the date, or somebody else's edit
  // arriving live all win over what was last drawn — with no copy to re-sync.
  const [day, showDay] = useOptimistic(nextFollowUp);

  // Which dialog the menu opened, and the button to give focus back to.
  const [act, setAct] = useState<Act | null>(null);
  const remember = useOpener(act !== null);
  const choose = (next: Act) => (opener: HTMLElement | null) => {
    remember(opener);
    setAct(next);
  };
  const hosted = (which: Act) => ({
    open: act === which,
    onOpenChange: (open: boolean) => {
      if (!open) setAct(null);
    },
  });

  const lost = lostOn !== null;
  const reason = lossReasonLabel(lostReason, t);
  const followUpLabel = `${ids}-follow-up`;

  function pick(next: string | null) {
    // Busy, not disabled: the picker keeps its place and its focus while the
    // date is on its way, and a second choice waits for the first answer.
    if (saving) return;
    startTransition(async () => {
      showDay(next);
      const outcome = await guarded(setProjectFollowUpAction)(projectId, next);
      if (!outcome.ok) {
        // A failure he has to act on stays until it is closed, and a wire that
        // dropped offers the same choice again (DESIGN §8).
        toast.error(outcome.error, {
          duration: Infinity,
          action:
            outcome.reason === "unreachable"
              ? { label: t("shell.tryAgain"), onClick: () => pick(next) }
              : undefined,
          cancel: { label: t("common.close"), onClick: () => {} },
        });
        return;
      }
      toast.success(
        next
          ? t("projects.followUpSet", { date: formatDay(next, locale) })
          : t("projects.followUpCleared"),
      );
      flash(projectId);
      // Re-read, so the row's colour and the strip's counts come from the one
      // definition in SQL rather than from a second guess in the browser.
      router.refresh();
    });
  }

  // The menu at the end of the action row: what changes the record, then —
  // apart, in the tint — the act that takes it away. A lost job has already
  // ended, so Archive is its last act; a live one ends by Mark lost.
  const items: RowMenuItem[] = [];
  let end: RowMenuEnd | undefined;
  if (owns) items.push({ label: t("common.edit"), icon: Pencil, onSelect: choose("edit") });
  if (shareProjectOffered(sharers, shareWith, me)) {
    items.push({ label: t("drawer.share.action"), icon: UsersRound, onSelect: choose("share") });
  }
  if (owns && lost) {
    end = { label: t("drawer.archive"), icon: Archive, destructive: true, onSelect: choose("archive") };
  } else if (owns) {
    items.push({ label: t("drawer.archive"), icon: Archive, onSelect: choose("archive") });
    end = { label: t("common.markLost"), icon: CircleOff, destructive: true, onSelect: choose("lost") };
  }
  const menu =
    items.length > 0 || end ? (
      <RowMenu label={t("projects.moreFor", { name })} items={items} end={end} />
    ) : null;
  const reportable = reports && !lost;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <RecordPanel className="scroller">
        <SheetHeader className="gap-4 border-b border-line p-4">
          {/* Who this is: the job, and the company it is at with the company's
              own face (DESIGN §1b: 40 at the head of a drawer, a company square). */}
          <div className="flex items-start gap-3 pe-10">
            <Avatar id={companyId} name={companyName} kind="company" size="lg" />
            <div className="flex min-w-0 flex-col gap-1">
              <SheetTitle className="text-lg leading-tight font-semibold">{name}</SheetTitle>
              <SheetDescription className="sr-only">
                {t("projects.drawerDescription", { company: companyName })}
              </SheetDescription>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Link
                  href={`/companies?open=${companyId}`}
                  aria-label={t("projects.openCompany", { name: companyName })}
                  className="font-medium text-foreground hover:underline"
                >
                  <bdi>{companyName}</bdi>
                </Link>
                {cityName ? (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    <span>
                      <bdi>{cityName}</bdi>
                    </span>
                  </>
                ) : null}
                {/* A lost job says so below, with its day and its reason. */}
                {lost ? null : (
                  <StateBadge tone={projectStageTone(stage)}>{t(STAGE_KEYS[stage])}</StateBadge>
                )}
              </p>
            </div>
          </div>

          {/* How the job is going, before what it is (DESIGN §6): the rep's own
              estimate, what has actually been quoted on it, what has been
              approved against it, and when anybody last spoke to anybody. */}
          <StandingStrip
            items={[
              { label: t("common.expectedSqm"), value: <Sqm value={expectedSqm} /> },
              { label: t("drawer.quoted"), value: <Sqm value={standing.quotedSqm} /> },
              { label: t("drawer.approved"), value: <Sqm value={standing.approvedSqm} /> },
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

          {lost && lostOn ? (
            // The word, its day and why, in the tone of an ending (DESIGN §6).
            // A sentence, not a flex row: a reason somebody typed runs its own
            // way inside it and wraps where the line does (rules/words.md).
            <p className="rounded-xl bg-state-bad px-3 py-2 text-sm text-state-bad-fg">
              <span className="font-medium">
                {t("projects.lostOn", { date: formatDay(lostOn, locale) })}
              </span>
              {reason ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <bdi>{reason}</bdi>
                </>
              ) : null}
            </p>
          ) : null}

          {/* The next-follow-up date, at the top, in the same inset strip the
              company's drawer draws it in (SPEC §3, D9). */}
          <div
            role="group"
            aria-labelledby={followUpLabel}
            aria-busy={saving || undefined}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
          >
            <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
            <span id={followUpLabel} className="text-sm font-medium">
              {t("common.nextFollowUp")}
            </span>
            {mine ? (
              <DatePicker
                id="project-drawer-follow-up"
                placeholder={t("projects.noFollowUp")}
                value={day}
                onChange={(next: string | null) => pick(next)}
                className="w-auto"
              />
            ) : day ? (
              <DayText day={day} locale={locale} className="text-sm" />
            ) : (
              <span className="text-sm text-muted-foreground">{t("projects.noFollowUp")}</span>
            )}
            {followUpState === "overdue" ? (
              <StateBadge tone="bad">{t("common.overdue")}</StateBadge>
            ) : null}
            {followUpState === "today" ? (
              <StateBadge tone="wait">{t("common.dueToday")}</StateBadge>
            ) : null}
            {saving ? <span className="text-xs text-muted-foreground">{t("common.saving")}</span> : null}
          </div>

          {/* Who else is on this job, in words, for every reader (D147). The
              control that changes it is Sharing, in the menu below. */}
          {sharers.length > 0 ? (
            <p className="min-w-0 text-xs text-muted-foreground">
              {t("drawer.share.onProject")}:{" "}
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

          {/* One primary action in sight, and the rest in the menu at the end
              of the row (DESIGN §2, §6). */}
          {reportable || menu ? (
            <div
              role="group"
              aria-label={t("projects.projectActions")}
              className="flex items-center gap-2"
            >
              {/* A report about this job, the popup opening on its customer and
                  on it (SPEC §3 P13). Not on a lost one: finished work (S20). */}
              {reportable ? (
                <ReportButton
                  companyId={companyId}
                  companyName={companyName}
                  projectId={projectId}
                  variant="brand"
                  icon
                >
                  {t("common.addReport")}
                </ReportButton>
              ) : null}
              {menu ? <span className="ms-auto flex">{menu}</span> : null}
            </div>
          ) : null}

          {/* What was written about this job, read back on it (D136). Below the
              actions and clamped, for the reason the company's note is. */}
          <NoteBlock
            title={t("common.notes")}
            text={notes}
            slot="project-notes"
            className="line-clamp-4"
          />
        </SheetHeader>

        <Tabs defaultValue="activity" className="p-4">
          <TabsList>
            <TabsTrigger value="activity">{t("drawer.activity")}</TabsTrigger>
            <TabsTrigger value="quotations">{t("common.quotations")}</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="pt-4">
            {activity}
          </TabsContent>

          <TabsContent value="quotations" className="pt-4">
            {quotations}
          </TabsContent>
        </Tabs>

        {owns ? (
          <>
            <EditProjectDialog
              project={{ id: projectId, name, expectedSqm, nextFollowUp, notes }}
              {...hosted("edit")}
            />
            {lost ? null : (
              <MarkLostDialog projectId={projectId} projectName={name} {...hosted("lost")} />
            )}
            <ArchiveProjectDialog
              projectId={projectId}
              projectName={name}
              onArchived={close}
              {...hosted("archive")}
            />
          </>
        ) : null}
        <ShareProjectDialog
          projectId={projectId}
          projectName={name}
          sharers={sharers}
          people={shareWith}
          me={me}
          {...hosted("share")}
        />
      </RecordPanel>
    </Sheet>
  );
}

/**
 * Never a blank while the drawer's data is on its way (DESIGN §2), and in the
 * drawer's own shape (§1b): the company's square and two lines, the strip of
 * four figures, the follow-up strip, the action row with its menu at the end,
 * the tabs, and entries at an entry's height. Standing still.
 */
export function ProjectSheetSkeleton() {
  const t = useTranslations();
  return (
    <Sheet open>
      <RecordPanel showCloseButton={false} aria-busy="true">
        <SheetHeader className="gap-4 border-b border-line p-4">
          <SheetTitle className="sr-only">{t("common.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("common.loading")}</SheetDescription>
          <div className="flex items-start gap-3 pe-10">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-28 w-full rounded-xl sm:h-16" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 max-md:h-11" />
            <Skeleton className="ms-auto size-6 rounded-md max-md:size-11" />
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-9 w-48 rounded-lg" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </RecordPanel>
    </Sheet>
  );
}
