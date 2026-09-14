import { WORK_CARD, WORK_ROW, WORK_ROWS, WorkGrid } from "@/components/team/work-grid";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of a work tab while it reads (DESIGN §1b: a skeleton is the shape of
 * what it stands in for, drawn once, still). The day and the team screen both
 * open on it, because both open on the same three things: a title with its tabs,
 * the month card across the page, and today's cards in the grid.
 *
 * A `loading.tsx` cannot read the address, so it cannot know a manager last left
 * his screen on the team tab; it draws the work tab, which is the one nobody has
 * chosen away from.
 */
export function WorkTabSkeleton({ tabs, strip = false }: { tabs: number; strip?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-6">
          {Array.from({ length: tabs }, (_, tab) => (
            <Skeleton key={tab} className="h-5 w-20" />
          ))}
        </div>
      </div>

      {/* The month card: three figures, then the one bar and its caption. */}
      <div className="card-face flex flex-col gap-3 p-3 md:p-4">
        <Skeleton className="h-4 w-36" />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[0, 1, 2].map((figure) => (
            <div key={figure} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>

      {strip ? <Skeleton className="h-16 w-full rounded-xl" /> : null}

      <WorkGrid>
        {[4, 3, 2].map((rows, card) => (
          <div key={card} className={WORK_CARD}>
            <Skeleton className="h-4 w-32" />
            <div className={WORK_ROWS}>
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className={`${WORK_ROW} flex flex-col gap-2`}>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </WorkGrid>
    </div>
  );
}
