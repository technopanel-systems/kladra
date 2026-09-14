import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of the Reports screen while it reads (DESIGN §1b: a skeleton is the
 * shape of the thing it stands in for, drawn once, still). The title, two
 * labelled lines of chips and the company picker, the month's calendar with its
 * legend beside a day of reports and its lane — the rep's screen, which is also
 * what a manager's drill opens on.
 *
 * Each line of chips is one line, as the rows it stands in for are since S12.K:
 * a shape that wraps where the screen scrolls sideways is a shape that jumps.
 */
export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-32" />
        {[7, 6].map((chips, row) => (
          <div key={row} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-24" />
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: chips }, (_, chip) => (
                <Skeleton key={chip} className="h-8 w-20 shrink-0 rounded-md" />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1 sm:max-w-sm">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="card-face flex flex-col gap-3 p-4">
          <Skeleton className="mx-auto h-4 w-28" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, cell) => (
              <Skeleton key={cell} className="h-11 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
