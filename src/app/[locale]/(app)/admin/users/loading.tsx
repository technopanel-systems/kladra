import { Skeleton } from "@/components/ui/skeleton";

/**
 * The users screen while it reads (DESIGN §1b: the shape of what it stands in
 * for, standing still). The heading with Add user at its end, then the list: on
 * a desk a table of 40px rows — a round avatar and a name, the address, the
 * role, the count at the end and the row's two controls; on a phone the same
 * people as rows of one card.
 */
export default function UsersLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>

      <div className="card-face flex flex-col md:hidden">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-start gap-3 border-b border-line p-3 last:border-0">
            <Skeleton className="size-6 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>

      <div className="card-face hidden flex-col md:flex">
        <div className="flex h-10 items-center gap-6 border-b border-line px-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div key={row} className="flex h-10 items-center gap-6 border-b border-line px-3 last:border-0">
            <span className="flex w-56 items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </span>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-24" />
            <span className="ms-auto flex items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-lg" />
              <Skeleton className="size-6 rounded-lg" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
