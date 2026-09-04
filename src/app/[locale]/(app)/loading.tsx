import { Skeleton } from "@/components/ui/skeleton";

/**
 * Never a blank screen (DESIGN §2): the rail and the bar are already painted,
 * so this only stands in for the content column — a title, its action, and the
 * shape of a list.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
