import { Skeleton } from "@/components/ui/skeleton";

/**
 * Holidays and leave while they read (DESIGN §1b: the shape, standing still).
 * The heading with Add a day at its end, the one sentence under it, and one
 * card of 40px rows — a lead column (a person, or a date), what follows it, and
 * Remove at the end.
 */
export default function HolidaysLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-full max-w-prose" />

      <div className="card-face flex flex-col">
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-0 md:h-10 md:px-4 md:py-0"
          >
            <span className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <span className="flex items-center gap-2 md:w-56">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </span>
              <Skeleton className="ms-8 h-3 w-40 md:ms-0 md:h-4" />
            </span>
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
