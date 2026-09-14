import { Skeleton } from "@/components/ui/skeleton";

/**
 * The use screen while it reads (DESIGN §1b: the shape, standing still). The
 * title, the band of two figures, and the people: a table of 40px rows on a
 * desk — the person, when they last opened it, the count at the end — and one
 * card of rows on a phone.
 */
export default function UseLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <Skeleton className="h-7 w-24" />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface-2 p-3">
          {[0, 1].map((figure) => (
            <div key={figure} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          ))}
        </div>

        <div className="card-face flex flex-col md:hidden">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-start gap-3 border-b border-line p-3 last:border-0">
              <Skeleton className="size-6 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
            </div>
          ))}
        </div>

        <div className="card-face hidden flex-col md:flex">
          <div className="flex h-10 items-center border-b border-line px-3">
            <Skeleton className="h-3 w-16" />
          </div>
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="flex h-10 items-center gap-3 border-b border-line px-3 last:border-0">
              <span className="flex w-1/3 items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-36" />
              </span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ms-auto h-4 w-6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
