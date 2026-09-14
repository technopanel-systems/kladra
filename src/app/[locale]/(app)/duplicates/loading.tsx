import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of the duplicates desk while it reads (DESIGN §1b: a skeleton is the
 * shape of the thing it stands in for, drawn once, still). It fell through to
 * the shell's generic shape, which is a list — and this screen is two cards of
 * two records each, side by side from `sm`, with the third answer under both.
 */
export default function DuplicatesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-4">
        {[0, 1].map((pair) => (
          <div key={pair} className="card-face flex flex-col gap-4 p-3 md:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((side) => (
                <div key={side} className="flex flex-col gap-3 rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 shrink-0 rounded-md" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 shrink-0 rounded-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <div className="flex gap-2">
                    <Skeleton className="h-7 w-28 rounded-md" />
                    <Skeleton className="h-7 w-28 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="h-7 w-44 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
