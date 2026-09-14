import { Skeleton } from "@/components/ui/skeleton";

/**
 * The export screen while it reads (DESIGN §1b: the shape, standing still). The
 * title, the sentence that labels the group, and the group: three rows, each a
 * mark, a name over what the file holds, and Download at the end.
 */
export default function ExportLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status">
      <Skeleton className="h-7 w-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="card-face flex flex-col">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-0 md:px-4"
            >
              <Skeleton className="size-6 rounded-lg" />
              <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-11 w-28 rounded-lg md:h-8 md:w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
