"use client";

import { useOptimistic, useTransition } from "react";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setProjectFollowUpAction } from "@/actions/projects";
import { Empty } from "@/components/ui-ext/empty";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { ReportButton } from "@/components/reports/report-dialog";
import { ArchiveProjectDialog } from "@/components/projects/archive-project-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { MarkLostDialog } from "@/components/projects/mark-lost-dialog";
import { lossReasonLabel } from "@/lib/loss-reason";
import { Sqm } from "@/components/ui-ext/figures";
import { Board, type BoardColumn } from "@/components/ui-ext/board";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { ListSearch } from "@/components/ui-ext/list-search";
import { NoteBlock } from "@/components/ui-ext/note-block";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { ViewSwitch } from "@/components/ui-ext/view-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { useArrived, useLanded } from "@/hooks/use-arrived";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { RecordPanel } from "@/components/ui-ext/record-panel";
import { formatDay } from "@/lib/dates";
import type { FollowUpFilter, FollowUpState } from "@/lib/followups";
import type { ProjectCard as ProjectBoardCard, ProjectRow } from "@/lib/projects";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/project-stage";
import type { ProjectStanding } from "@/lib/standing";
import { projectStageTone, TONE_TEXT } from "@/lib/state-tone";
import type { ListView } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * The projects screen's client island. One file holds the three things that
 * read and write the URL — the search box (`?q=`), the follow-up strip
 * (`?filter=`) and the sheet the URL opens (`?open=`) — so a refresh or a
 * shared link lands on the same screen (SPEC §3), and there is one place to
 * look when it does not.
 *
 * Nothing here decides what a row means. The rows arrive already filtered,
 * ordered and state-tagged from `listProjects`: "overdue" is computed once, in
 * SQL, against Riyadh's today (src/lib/followups.ts). A second opinion drawn
 * from the browser's clock is exactly the drift the data rules forbid.
 */

export type FollowUpStripCounts = { overdue: number; today: number };

/** Colour says how long something has waited, and nothing else (DESIGN §1). */
const WAITING_TEXT: Record<FollowUpState, string> = {
  overdue: TONE_TEXT.bad,
  today: TONE_TEXT.wait,
  future: "text-faint",
};

function listHref(
  q: string,
  filter: FollowUpFilter | null,
  open?: string | null,
  view?: ListView,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter) params.set("filter", filter);
  if (open) params.set("open", open);
  // Written whenever a caller names one, "list" included: without it the
  // remembered board would come straight back (the same rule as quotations).
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

/**
 * The five words of a project's life (D170), literal so both locales are held
 * to each. The same word on the board's column and in the list's status cell,
 * so "Open" is one thing on one screen (rules/words.md).
 */
const STAGE_KEYS: Record<ProjectStage, string> = {
  open: "projects.stageOpen",
  quoted: "projects.stageQuoted",
  dispatching: "projects.stageDispatching",
  won: "projects.stageWon",
  lost: "projects.stageLost",
};

/** A stored reason is one of the nine codes, or the rep's own words for "Other". */
function useLossReasonLabel(): (stored: string | null) => string | null {
  const t = useTranslations();
  return (stored) => lossReasonLabel(stored, t);
}

function FollowUp({ day, state }: { day: string | null; state: FollowUpState | null }) {
  const locale = useLocale();
  if (!day || !state) return <span className="text-faint">—</span>;
  return <DayText day={day} locale={locale} className={WAITING_TEXT[state]} />;
}

/**
 * Where the job stands, in the board's word and tone (D170) — never a colour
 * alone (DESIGN §1), and a lost one carries its reason with it.
 */
function StateCell({ stage, lostReason }: { stage: ProjectStage; lostReason: string | null }) {
  const t = useTranslations();
  const label = useLossReasonLabel();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StateBadge tone={projectStageTone(stage)}>{t(STAGE_KEYS[stage])}</StateBadge>
      {stage === "lost" ? (
        <span className="truncate text-xs text-muted-foreground">{label(lostReason)}</span>
      ) : null}
    </span>
  );
}

function ProjectTableRow({
  row,
  href,
  openId,
}: {
  row: ProjectRow;
  href: string;
  openId: string | null;
}) {
  const t = useTranslations();
  const arrived = useArrived(row.id);
  return (
    <TableRow
      data-state={openId === row.id ? "selected" : undefined}
      className={cn("row-door cursor-pointer", arrived && "row-arrived")}
    >
      <TableCell className="max-w-[16rem] truncate p-3 font-medium">
        {/* The whole row opens the drawer while middle-click and "copy link"
            still work (globals.css `row-door`). */}
        <Link data-door href={href} className="hover:underline">
          <span className="sr-only">{t("projects.openProject", { name: row.name })}</span>
          <span aria-hidden="true">{row.name}</span>
          <LinkPending className="ms-1.5 align-middle" />
        </Link>
      </TableCell>
      <TableCell className="max-w-[14rem] truncate p-3 text-muted-foreground">
        {row.companyName}
      </TableCell>
      <TableCell className="p-3 text-end">
        <Sqm value={row.expectedSqm} />
      </TableCell>
      <TableCell className="p-3">
        <FollowUp day={row.nextFollowUp} state={row.followUpState} />
      </TableCell>
      <TableCell className="p-3">
        <StateCell stage={row.stage} lostReason={row.lostReason} />
      </TableCell>
    </TableRow>
  );
}

function ProjectCard({ row, href }: { row: ProjectRow; href: string }) {
  const t = useTranslations();
  const arrived = useArrived(row.id);
  return (
    <Link
      href={href}
      className={cn("card-face flex flex-col gap-2 p-3", arrived && "row-arrived")}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{row.name}</span>
          <LinkPending />
        </span>
        <StateCell stage={row.stage} lostReason={row.lostReason} />
      </div>
      <span className="text-xs text-muted-foreground">{row.companyName}</span>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <Sqm value={row.expectedSqm} />
        <span className="inline-flex items-baseline gap-1">
          <span className="text-muted-foreground">{t("common.nextFollowUp")}</span>
          <FollowUp day={row.nextFollowUp} state={row.followUpState} />
        </span>
      </div>
    </Link>
  );
}

export function ProjectsTable({
  rows,
  cards,
  counts,
  q,
  filter,
  openId,
  view,
  remembered,
}: {
  rows: ProjectRow[];
  /** The board's cards, each already in its stage — empty on the list. */
  cards: ProjectBoardCard[];
  counts: FollowUpStripCounts;
  q: string;
  filter: FollowUpFilter | null;
  openId: string | null;
  view: ListView;
  /** What this person had remembered when the page was drawn (D164). */
  remembered?: string;
}) {
  const t = useTranslations();
  // The rows are on screen: whatever arrived while the refresh was in flight
  // starts its two seconds now (D105).
  useLanded(rows);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  // The box is `ListSearch` now; what is left here is the way OUT of a search
  // from the empty list, which is a navigation and not a second search box.
  function clearTerm() {
    go(view === "board" ? listHref("", null, null, "board") : listHref("", filter));
  }

  /** Clicking the chip you are already on takes the filter off again. */
  const chip = (value: FollowUpFilter) =>
    listHref(q, filter === value ? null : value);

  const board = view === "board";

  /**
   * The five columns, in the order a job lives them. The stage was decided in
   * the query, before the cap; this only puts each card under its word, and a
   * column's count is the one the query counted (D80).
   */
  const columns: BoardColumn[] = PROJECT_STAGES.map((stage) => {
    const inStage = cards.filter((card) => card.stage === stage);
    return {
      key: stage,
      label: t(STAGE_KEYS[stage]),
      tone: projectStageTone(stage),
      total: inStage[0]?.inStage ?? 0,
      cards: inStage.map((card) => ({
        id: card.id,
        href: listHref(q, null, card.id, "board"),
        title: card.name,
        subtitle: card.companyName,
        sqm: card.expectedSqm,
        day: card.since,
        person: { id: card.repId, name: card.repName },
        current: openId === card.id,
      })),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {/* What is late, what is due, then the list (SPEC D9). On the board the
          chips step aside: a board of stages is every project. */}
      <FilterRow
        lead={
          <ViewSwitch
            screen="projects"
            view={view}
            remembered={remembered}
            listHref={listHref(q, filter, null, "list")}
            boardHref={listHref(q, null, null, "board")}
          />
        }
        all={
          board ? null : (
            <FilterChip href={listHref(q, null)} active={filter === null}>
              {t("common.all")}
            </FilterChip>
          )
        }
      >
        {board ? null : (
          <>
            <FilterChip href={chip("followups")} active={filter === "followups"}>
              {t("common.followUps")}
            </FilterChip>
            <FilterChip
              href={chip("overdue")}
              active={filter === "overdue"}
              tone={counts.overdue > 0 ? "bad" : undefined}
            >
              {t("projects.overdueChip", { count: counts.overdue })}
            </FilterChip>
            <FilterChip
              href={chip("today")}
              active={filter === "today"}
              tone={counts.today > 0 ? "wait" : undefined}
            >
              {t("projects.todayChip", { count: counts.today })}
            </FilterChip>
          </>
        )}
      </FilterRow>

      <ListSearch
        q={q}
        keep={{ filter: board ? null : filter, view: board ? "board" : null }}
        label={t("projects.searchLabel")}
        placeholder={t("projects.searchPlaceholder")}
        clearLabel={t("common.clear")}
        className="max-w-md sm:max-w-md"
      />

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {board ? (
          cards.length === 0 ? (
            // Before the board: five empty columns say nothing about why (P11G).
            <EmptyProjects q={q} filter={null} onClear={clearTerm} />
          ) : (
            <Board columns={columns} />
          )
        ) : rows.length === 0 ? (
          <EmptyProjects q={q} filter={filter} onClear={clearTerm} />
        ) : (
          <>
            {/* 375: cards. Five columns on a phone is a horizontal scroll. */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <ProjectCard key={row.id} row={row} href={listHref(q, filter, row.id)} />
              ))}
            </div>

            {/* Clipped, not hidden: a card that hides its overflow is what
                `sticky` sticks to, so the table's scrollbar would ride the card
                instead of stopping under the top bar (StickyScroll). */}
            <div className="card-face hidden overflow-clip md:block">
              <Table label={t("common.projects")}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="p-3">{t("common.project")}</TableHead>
                    <TableHead className="p-3">{t("common.company")}</TableHead>
                    <TableHead className="p-3 text-end">{t("common.expectedSqm")}</TableHead>
                    <TableHead className="p-3">{t("common.nextFollowUp")}</TableHead>
                    <TableHead className="p-3">{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <ProjectTableRow
                      key={row.id}
                      row={row}
                      openId={openId}
                      href={listHref(q, filter, row.id)}
                    />
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

/** One sentence and the action it points at — and the action works (SPEC §3). */
function EmptyProjects({
  q,
  filter,
  onClear,
}: {
  q: string;
  filter: FollowUpFilter | null;
  onClear: () => void;
}) {
  const t = useTranslations();

  if (q) {
    return (
      <EmptyCard sentence={t("projects.emptySearch", { q })}>
        <Button type="button" variant="outline" onClick={onClear}>
          {t("common.clear")}
        </Button>
      </EmptyCard>
    );
  }

  if (filter) {
    // `quiet` is a COMPANY band and never reaches a project list — a project
    // with no follow-up is not a customer who has gone silent, it is a job
    // waiting on something else (D63). The record is exhaustive so the day a
    // sixth filter lands this stops compiling rather than rendering a key.
    const sentence: Record<FollowUpFilter, string> = {
      overdue: "projects.emptyOverdue",
      today: "projects.emptyToday",
      followups: "projects.emptyFollowups",
      never: "projects.emptyNever",
      quiet: "projects.emptyFollowups",
    };
    return (
      <EmptyCard sentence={t(sentence[filter])}>
        <Button asChild variant="outline">
          <Link href="/projects">{t("common.all")}</Link>
        </Button>
      </EmptyCard>
    );
  }

  // Nothing at all: a project is born inside its company, so that is where the
  // sentence sends the rep.
  return (
    <EmptyCard sentence={t("projects.empty")}>
      <Button asChild variant="outline">
        <Link href="/companies">{t("projects.openCompanies")}</Link>
      </Button>
    </EmptyCard>
  );
}

function EmptyCard({ sentence, children }: { sentence: string; children: ReactNode }) {
  return <Empty action={children}>{sentence}</Empty>;
}

/* -------------------------------------------------------------------------- */
/* The drawer the URL opens. Its data is read by the server component in       */
/* project-drawer.tsx; everything interactive lives here, with the rest of     */
/* this screen's URL handling.                                                 */
/* -------------------------------------------------------------------------- */

export type ProjectSheetProps = {
  projectId: string;
  name: string;
  companyId: string;
  companyName: string;
  cityName: string | null;
  expectedSqm: string | null;
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
   * (S8, D42), so he gets the dates and the history and no controls at all —
   * rather than buttons that would answer "Not allowed" (DESIGN §5).
   *
   * This is what setting its date takes. Changing the project ROW is a second
   * question, below.
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
   * Two flags rather than one, because two people can now be looking at this
   * drawer with different answers.
   */
  owns: boolean;
  /**
   * Who else is on this job, in words, and the control that changes it — or
   * only the words, for a reader who may neither grant a share nor leave one.
   * Built by the server half, which is where the names are read (D147).
   */
  sharing: ReactNode;
  /** The rendered activity list, empty state and all. */
  activity: ReactNode;
  /** The rendered quotations panel, empty state and all. */
  quotations: ReactNode;
};

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
  standing,
  nextFollowUp,
  followUpState,
  lostOn,
  lostReason,
  notes,
  mine,
  reports,
  owns,
  sharing,
  activity,
  quotations,
}: ProjectSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const close = useCloseDrawer();
  const lossLabel = useLossReasonLabel();
  const [saving, startTransition] = useTransition();
  const guarded = useWireGuard();
  // The picked date shows at once and the server stays the source of truth: the
  // optimistic value falls back to the prop when the transition settles, so a
  // refused save, a report that moved the date, or somebody else's edit
  // arriving live all win over what was last drawn — with no copy to re-sync.
  const [day, showDay] = useOptimistic(nextFollowUp);

  const lost = lostOn !== null;

  function pick(next: string | null) {
    startTransition(async () => {
      showDay(next);
      const outcome = await guarded(setProjectFollowUpAction)(projectId, next);
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      toast.success(
        next
          ? t("projects.followUpSet", { date: formatDay(next, locale) })
          : t("projects.followUpCleared"),
      );
      // Re-read, so the row's colour and the strip's counts come from the one
      // definition in SQL rather than from a second guess in the browser.
      router.refresh();
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <RecordPanel className="scroller">
        <SheetHeader className="gap-3 border-b border-line p-4">
          <SheetTitle className="pe-10 text-base">{name}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("projects.drawerDescription", { company: companyName })}
          </SheetDescription>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <Link
              href={`/companies?open=${companyId}`}
              aria-label={t("projects.openCompany", { name: companyName })}
              className="font-medium text-foreground hover:underline"
            >
              {companyName}
            </Link>
            {cityName ? <span>{cityName}</span> : null}
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

          {lost ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <Badge variant="destructive">
                {t("projects.lostOn", { date: formatDay(lostOn, locale) })}
              </Badge>
              <span>{lossLabel(lostReason)}</span>
            </div>
          ) : null}

          {/* The next-follow-up date sits at the top (SPEC §3). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("common.nextFollowUp")}</span>
            {mine ? (
              <DatePicker
                id="project-drawer-follow-up"
                placeholder={t("projects.noFollowUp")}
                value={day}
                onChange={(next: string | null) => pick(next)}
                disabled={saving}
              />
            ) : (
              <span className="text-sm">
                {day ? (
                  <DayText day={day} locale={locale} />
                ) : (
                  <span className="text-muted-foreground">{t("projects.noFollowUp")}</span>
                )}
              </span>
            )}
            {followUpState === "overdue" ? (
              <StateBadge tone="bad">{t("common.overdue")}</StateBadge>
            ) : null}
            {followUpState === "today" ? (
              <StateBadge tone="wait">{t("common.dueToday")}</StateBadge>
            ) : null}
            {saving ? <span className="text-xs text-faint">{t("common.saving")}</span> : null}
          </div>

          {/* Who else is on this job, beside the facts it is about, in the same
              place the company drawer says it (D147, DESIGN §5). */}
          {sharing}

          {/* One primary action, at the top (DESIGN §2). */}
          {(reports && !lost) || owns ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* A report about this job, the popup opening on its customer and
                on it (SPEC §3 P13). Not on a lost one: finished work (S20). */}
            {reports && !lost ? (
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
            {/* The row itself, and only its own rep — a helper on the job does
                not rename it, close it or take it off the list. */}
            {owns ? (
              <>
                <EditProjectDialog
                  project={{ id: projectId, name, expectedSqm, nextFollowUp, notes }}
                  trigger={
                    <Button variant="outline">
                      <Pencil aria-hidden="true" />
                      {t("common.edit")}
                    </Button>
                  }
                />
                {lost ? null : (
                  <MarkLostDialog
                    projectId={projectId}
                    trigger={
                      <Button variant="ghost" className="text-muted-foreground">
                        {t("common.markLost")}
                      </Button>
                    }
                  />
                )}
                {/* Last, and not the same act as Mark lost: this one tidies a
                    job that was never real, and says so in its own warning. */}
                <ArchiveProjectDialog
                  projectId={projectId}
                  projectName={name}
                  onArchived={close}
                />
              </>
            ) : null}
          </div>
          ) : null}

          {/* What was written about this job, read back on it (D136): the
              only reader until now was the Edit form it was typed in. Below
              the actions and clamped, for the reason the company's note is. */}
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

          <TabsContent value="activity" className="pt-3">
            {activity}
          </TabsContent>

          <TabsContent value="quotations" className="pt-3">
            {quotations}
          </TabsContent>
        </Tabs>
      </RecordPanel>
    </Sheet>
  );
}

/** Never a blank while the drawer's data is on its way (DESIGN §2). */
export function ProjectSheetSkeleton() {
  const t = useTranslations();
  return (
    <Sheet open>
      <RecordPanel showCloseButton={false} aria-busy="true">
        <SheetHeader className="gap-3 border-b border-line p-4">
          <SheetTitle className="sr-only">{t("common.loading")}</SheetTitle>
          <SheetDescription className="sr-only">{t("common.loading")}</SheetDescription>
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-44" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-32" />
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-16 w-full rounded-[calc(var(--radius)+4px)]" />
          ))}
        </div>
      </RecordPanel>
    </Sheet>
  );
}
