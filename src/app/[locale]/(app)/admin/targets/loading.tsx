import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of the targets screen while it reads (DESIGN §1b: a skeleton is the
 * shape of the thing it stands in for, drawn once, still). The title, this
 * month's heading and its hint, the company's box in a card of its own and the
 * people's boxes as rows of one card — each led by an avatar — then the earlier
 * months' table in its card.
 */
export default function TargetsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <Skeleton className="h-7 w-32" />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full max-w-prose" />
        <div className="card-face flex h-10 items-center gap-3 px-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ms-auto h-8 w-52 rounded-lg" />
        </div>
        <div className="card-face flex flex-col">
          {[0, 1, 2, 3, 4, 5].map((box) => (
            <div key={box} className="flex h-10 items-center gap-3 border-b border-line px-4 last:border-0">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ms-auto h-8 w-52 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-36" />
        <div className="card-face flex flex-col gap-3 p-3">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
