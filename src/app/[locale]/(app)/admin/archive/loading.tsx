import { Skeleton } from "@/components/ui/skeleton";

/**
 * The archive while it is read: the title and its one sentence, the search box,
 * and a group of rows the height the rows are — an avatar, three short lines
 * and the Restore button beside them (DESIGN §1b: the shape of what it stands
 * in for, standing still).
 */
export default function ArchiveLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <div className="card-face flex flex-col">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
