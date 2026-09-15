import { WORK_CARD, WORK_ROW, WORK_ROWS } from "@/components/team/work-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The shapes a home screen stands in with while it reads (DESIGN §1b: a skeleton
 * is the shape of what it stands in for, drawn once, still — nothing here
 * pulses, and nothing loops).
 *
 * Two moments, two pieces. A `loading.tsx` draws before anybody knows which tab
 * a person keeps, so it draws the title, the tabs and the work tab's body — the
 * one nobody has chosen away from. Once the page knows the tab, it draws the tab
 * itself at once and stands the body in with that tab's own shape while its
 * figures read (S12.7): the metrics tab was drawn as a month card and three
 * lists, and then became six bars, chips and pies.
 */
export function WorkTabSkeleton({ tabs, strip = false }: { tabs: number; strip?: boolean }) {
  return (
    <div data-slot="work-skeleton" className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        {/* The tabs' own row: 44px tall on the hairline they sit on. */}
        <div className="flex h-11 items-center gap-1 border-b border-line">
          {Array.from({ length: tabs }, (_, tab) => (
            <div key={tab} className="px-3">
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <WorkBodySkeleton strip={strip} bare />
    </div>
  );
}

/**
 * The work tab's body: the month card across the page, the strip where the
 * manager has one, and two stacks of cards — a long list beside a short one and
 * another under it, which is what the day and the stuck list both draw.
 */
export function WorkBodySkeleton({ strip = false, bare = false }: { strip?: boolean; bare?: boolean }) {
  return (
    <div
      data-slot="work-body-skeleton"
      className="flex flex-col gap-6"
      {...(bare ? {} : { "aria-busy": true, role: "status" })}
    >
      {/* The month card: three figures, then the one bar and its caption. */}
      <div className="card-face flex flex-col gap-3 p-3 md:p-4">
        <Skeleton className="h-4 w-36" />
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-28" />
          </div>
          {[0, 1].map((figure) => (
            <div key={figure} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>

      {strip ? <Skeleton className="h-20 w-full rounded-xl" /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <CardSkeleton rows={4} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <CardSkeleton rows={2} />
          <CardSkeleton rows={1} />
        </div>
      </div>
    </div>
  );
}

/** A work card: its title and rows of the row's own height, each with its face. */
function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className={WORK_CARD}>
      <Skeleton className="h-4 w-32" />
      <div className={WORK_ROWS}>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className={cn(WORK_ROW, "flex items-start gap-3")}>
            <Skeleton className="size-6 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The metrics tab's body (S12.7): whose figures where the manager picks, the six
 * months as a card of columns, the window's three chips, the cards measured over
 * it two by two, and the builder where the manager has one. Heights are the real
 * ones at a desk, so nothing below jumps when the figures land.
 */
export function MetricsBodySkeleton({
  picker = false,
  cards = 2,
  builder = false,
}: {
  picker?: boolean;
  cards?: number;
  builder?: boolean;
}) {
  return (
    <div data-slot="metrics-skeleton" className="flex flex-col gap-6" aria-busy="true" role="status">
      {picker ? (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-lg sm:w-56" />
        </div>
      ) : null}

      {/* Six months: a title and its sentence, six columns on one baseline. */}
      <div className="card-face flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex h-36 items-end justify-around gap-4">
          {["h-16", "h-20", "h-20", "h-24", "h-28", "h-12"].map((height, column) => (
            <Skeleton key={column} className={cn("w-8 rounded-md", height)} />
          ))}
        </div>
        <Skeleton className="h-3 w-56" />
      </div>

      {/* The window: three chips, one line. */}
      <div className="flex items-center gap-2">
        {["w-20", "w-24", "w-20"].map((width, chip) => (
          <Skeleton key={chip} className={cn("h-8 shrink-0 rounded-md max-md:h-11", width)} />
        ))}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        {Array.from({ length: cards }, (_, card) => (
          <div key={card} className="card-face flex flex-col gap-4 p-4">
            <Skeleton className="h-4 w-36" />
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Skeleton className="size-46 max-w-full shrink-0 rounded-full" />
              <div className="flex w-full min-w-0 flex-col gap-3">
                {[0, 1, 2, 3].map((line) => (
                  <Skeleton key={line} className="h-4 w-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {builder ? (
        <div className="card-face flex flex-col gap-4 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-72 max-w-full" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((line) => (
              <div key={line} className="flex items-center gap-2 overflow-hidden">
                {["w-24", "w-28", "w-24", "w-20"].map((width, chip) => (
                  <Skeleton key={chip} className={cn("h-8 shrink-0 rounded-md", width)} />
                ))}
              </div>
            ))}
          </div>
          <Skeleton className="h-48 w-full max-w-2xl" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The team tab's body: the one line over the table, and the table of people —
 * a face, a name and a row of figures to the end.
 */
export function PeopleBodySkeleton() {
  return (
    <div data-slot="people-skeleton" className="flex flex-col gap-3" aria-busy="true" role="status">
      <Skeleton className="h-3 w-full max-w-lg" />
      <div className="card-face flex flex-col divide-y divide-line">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="hidden items-center gap-8 md:flex">
              {[0, 1, 2, 3, 4].map((figure) => (
                <Skeleton key={figure} className="h-4 w-10" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
