import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of the leads screen while it reads (DESIGN §1b: a skeleton is the
 * shape of the thing it stands in for, drawn once, still): the title and its
 * one action, the state chips beside the person picker, and rows of the list's
 * own height with an avatar at the start of each.
 */
export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((chip) => (
            <Skeleton key={chip} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-full rounded-lg sm:w-64" />
      </div>
      <div className="card-face flex flex-col">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
            <Skeleton className="size-6 shrink-0 rounded-md" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="hidden h-4 flex-1 md:block" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
