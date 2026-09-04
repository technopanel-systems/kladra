"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Pencil, SearchIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { setProjectFollowUpAction } from "@/actions/projects";
import { LogDialog } from "@/components/activities/log-dialog";
import { ArchiveProjectDialog } from "@/components/projects/archive-project-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { MarkLostDialog, isLossReasonCode } from "@/components/projects/mark-lost-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
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
import { useArrived } from "@/hooks/use-arrived";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { formatDay } from "@/lib/dates";
import type { FollowUpFilter, FollowUpState } from "@/lib/followups";
import { formatSqm } from "@/lib/money";
import type { ProjectRow } from "@/lib/projects";
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
  overdue: "text-tone-red-fg",
  today: "text-tone-amber-fg",
  future: "text-faint",
};

const DEBOUNCE_MS = 200;

function listHref(q: string, filter: FollowUpFilter | null, open?: string | null): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter) params.set("filter", filter);
  if (open) params.set("open", open);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

/** A stored reason is one of the nine codes, or the rep's own words for "Other". */
function useLossReasonLabel(): (stored: string | null) => string | null {
  const t = useTranslations();
  return (stored) => {
    if (!stored) return null;
    return isLossReasonCode(stored) ? t(`projects.lossReason.${stored}`) : stored;
  };
}

function Sqm({ value }: { value: string | null }) {
  const t = useTranslations();
  if (value === null || value === "") return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span dir="ltr" className="num">
        {formatSqm(value)}
      </span>
      <span className="text-xs text-muted-foreground">{t("common.sqm")}</span>
    </span>
  );
}

function FollowUp({ day, state }: { day: string | null; state: FollowUpState | null }) {
  const locale = useLocale();
  if (!day || !state) return <span className="text-faint">—</span>;
  return <DayText day={day} locale={locale} className={WAITING_TEXT[state]} />;
}

/** A word, never a colour alone (DESIGN §1) — and the reason travels with it. */
function StateCell({ lostAt, lostReason }: { lostAt: Date | null; lostReason: string | null }) {
  const t = useTranslations();
  const label = useLossReasonLabel();
  if (!lostAt) return <span className="text-faint">{t("projects.open")}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant="destructive">{t("projects.lost")}</Badge>
      <span className="truncate text-xs text-muted-foreground">{label(lostReason)}</span>
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
      className={cn("relative cursor-pointer", arrived && "row-arrived")}
    >
      <TableCell className="max-w-[16rem] truncate p-3 font-medium">
        {/* The link stretches over the row, so the whole row opens the drawer
            while middle-click and "copy link" still work. */}
        <Link href={href} className="after:absolute after:inset-0 hover:underline">
          <span className="sr-only">{t("projects.openProject", { name: row.name })}</span>
          <span aria-hidden="true">{row.name}</span>
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
        <StateCell lostAt={row.lostAt} lostReason={row.lostReason} />
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
        <span className="font-medium">{row.name}</span>
        <StateCell lostAt={row.lostAt} lostReason={row.lostReason} />
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

function FilterChip({
  href,
  active,
  tone,
  children,
}: {
  href: string;
  active: boolean;
  tone?: "red" | "amber";
  children: ReactNode;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className={cn(
        active && "ring-1 ring-line-strong",
        tone === "red" && "bg-tone-red text-tone-red-fg hover:bg-tone-red",
        tone === "amber" && "bg-tone-amber text-tone-amber-fg hover:bg-tone-amber",
      )}
    >
      <Link href={href} aria-current={active ? "true" : undefined}>
        {children}
      </Link>
    </Button>
  );
}

export function ProjectsTable({
  rows,
  counts,
  q,
  filter,
  openId,
}: {
  rows: ProjectRow[];
  counts: FollowUpStripCounts;
  q: string;
  filter: FollowUpFilter | null;
  openId: string | null;
}) {
  const t = useTranslations();
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
    timer.current = setTimeout(() => go(listHref(value.trim(), filter)), DEBOUNCE_MS);
  }

  function clearTerm() {
    setTerm("");
    if (timer.current) clearTimeout(timer.current);
    go(listHref("", filter));
  }

  /** Clicking the chip you are already on takes the filter off again. */
  const chip = (value: FollowUpFilter) =>
    listHref(term.trim(), filter === value ? null : value);

  return (
    <div className="flex flex-col gap-4">
      {/* What is late, what is due, then the list (SPEC D9). */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip href={chip("followups")} active={filter === "followups"}>
          {t("common.followUps")}
        </FilterChip>
        <FilterChip
          href={chip("overdue")}
          active={filter === "overdue"}
          tone={counts.overdue > 0 ? "red" : undefined}
        >
          {t("projects.overdueChip", { count: counts.overdue })}
        </FilterChip>
        <FilterChip
          href={chip("today")}
          active={filter === "today"}
          tone={counts.today > 0 ? "amber" : undefined}
        >
          {t("projects.todayChip", { count: counts.today })}
        </FilterChip>
        <span aria-hidden="true" className="h-4 w-px bg-line" />
        <FilterChip href={listHref(term.trim(), null)} active={filter === null}>
          {t("common.all")}
        </FilterChip>
      </div>

      <div className="relative max-w-md">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
        />
        <Input
          type="search"
          value={term}
          onChange={(event) => onTerm(event.target.value)}
          aria-label={t("projects.searchLabel")}
          placeholder={t("projects.searchPlaceholder")}
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
          <EmptyProjects q={q} filter={filter} onClear={clearTerm} />
        ) : (
          <>
            {/* 375: cards. Five columns on a phone is a horizontal scroll. */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <ProjectCard key={row.id} row={row} href={listHref(q, filter, row.id)} />
              ))}
            </div>

            <div className="card-face hidden md:block">
              <Table>
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
    const sentence = {
      overdue: "projects.emptyOverdue",
      today: "projects.emptyToday",
      followups: "projects.emptyFollowups",
      never: "projects.emptyNever",
    }[filter];
    return (
      <EmptyCard sentence={t(sentence)}>
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
  return (
    <div className="card-face flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="max-w-prose text-sm text-muted-foreground">{sentence}</p>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The drawer the URL opens. Its data is read by the server component in       */
/* project-drawer.tsx; everything interactive lives here, with the rest of     */
/* this screen's URL handling.                                                 */
/* -------------------------------------------------------------------------- */

type LogDialogProps = ComponentProps<typeof LogDialog>;

export type ProjectSheetProps = {
  projectId: string;
  name: string;
  companyId: string;
  companyName: string;
  cityName: string | null;
  expectedSqm: string | null;
  nextFollowUp: string | null;
  followUpState: FollowUpState | null;
  lostOn: string | null;
  lostReason: string | null;
  /** As stored, so Edit opens on the project's own notes rather than a summary. */
  notes: string | null;
  contacts: LogDialogProps["contacts"];
  projects: LogDialogProps["projects"];
  /**
   * Whether the person reading this owns the company the project hangs off. A
   * manager reads every project and works none (S8, D42), so he gets the dates
   * and the history and no controls at all — rather than four buttons that
   * would answer "Not allowed" (DESIGN §5).
   */
  mine: boolean;
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
  nextFollowUp,
  followUpState,
  lostOn,
  lostReason,
  notes,
  contacts,
  projects,
  mine,
  activity,
  quotations,
}: ProjectSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const close = useCloseDrawer();
  const lossLabel = useLossReasonLabel();
  const [saving, startTransition] = useTransition();
  // The picked date shows at once and the server stays the source of truth: the
  // optimistic value falls back to the prop when the transition settles, so a
  // refused save, a Log entry that moved the date, or somebody else's edit
  // arriving live all win over what was last drawn — with no copy to re-sync.
  const [day, showDay] = useOptimistic(nextFollowUp);

  const lost = lostOn !== null;

  function pick(next: string | null) {
    startTransition(async () => {
      showDay(next);
      const outcome = await setProjectFollowUpAction(projectId, next);
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
      <SheetContent
        // Radix's sides are physical; in Arabic the drawer comes from the
        // other edge so it still slides in from the end of the line.
        side={locale === "ar" ? "left" : "right"}
        className="w-full gap-0 overflow-y-auto overscroll-contain p-0 data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl"
      >
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
            <Sqm value={expectedSqm} />
          </div>

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
              <Badge className="bg-tone-red text-tone-red-fg">{t("common.overdue")}</Badge>
            ) : null}
            {followUpState === "today" ? (
              <Badge className="bg-tone-amber text-tone-amber-fg">{t("common.dueToday")}</Badge>
            ) : null}
            {saving ? <span className="text-xs text-faint">{t("common.saving")}</span> : null}
          </div>

          {/* One primary action, at the top (DESIGN §2). */}
          {mine ? (
          <div className="flex flex-wrap items-center gap-2">
            <LogDialog
              companyId={companyId}
              companyName={companyName}
              projectId={projectId}
              contacts={contacts}
              projects={projects}
              trigger={
                <Button className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
                  {t("common.log")}
                </Button>
              }
            />
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
            {/* Last, and not the same act as Mark lost: this one tidies a job
                that was never real, and says so in its own warning. */}
            <ArchiveProjectDialog
              projectId={projectId}
              projectName={name}
              onArchived={close}
            />
          </div>
          ) : null}
        </SheetHeader>

        <Tabs defaultValue="activity" className="p-4">
          <TabsList>
            <TabsTrigger value="activity">{t("projects.activity")}</TabsTrigger>
            <TabsTrigger value="quotations">{t("common.quotations")}</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="pt-3">
            {activity}
          </TabsContent>

          <TabsContent value="quotations" className="pt-3">
            {quotations}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/** Never a blank while the drawer's data is on its way (DESIGN §2). */
export function ProjectSheetSkeleton() {
  const locale = useLocale();
  const t = useTranslations();
  return (
    <Sheet open>
      <SheetContent
        side={locale === "ar" ? "left" : "right"}
        showCloseButton={false}
        className="w-full gap-0 p-0 data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl"
        aria-busy="true"
      >
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
            <Skeleton key={row} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
