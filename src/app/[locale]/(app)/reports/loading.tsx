import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of the Reports screen while it reads (DESIGN §1b: a skeleton is the
 * shape of the thing it stands in for, drawn once, still). The title, two rows
 * of chips, the month's calendar beside a day of reports and its lane — the
 * rep's screen, which is also what a manager's drill opens on.
 */
export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-32" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((chip) => (
            <Skeleton key={chip} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((chip) => (
            <Skeleton key={chip} className="h-8 w-24 rounded-full" />
          ))}
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
