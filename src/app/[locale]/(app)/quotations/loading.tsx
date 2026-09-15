import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The quotations screen while it reads (DESIGN §1b: the shape of the thing it
 * stands in for, standing still).
 *
 * It had none, so pressing Quotations in the rail left the last screen standing
 * with nothing but the link's pending mark to say anything was coming.
 *
 * One shape for both views, because the view is remembered per person (D164) and
 * this is drawn before anybody is asked which one he keeps: the title and the
 * place of the Request button, the row with the list/board switch and its five
 * chips as one line — cut at the edge, never wrapped (S12.K) — the search, and
 * one neutral block where the rows or the columns will be. Each piece is the
 * height the real one is at that width: a phone's controls are a thumb's 44
 * (D130).
 */
export default function QuotationsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-8 w-40 rounded-lg max-md:h-11" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-8 w-36 rounded-lg max-md:h-12" />
            <span aria-hidden="true" className="hidden h-4 w-px bg-line md:inline-block" />
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden md:flex-1">
            {["w-12", "w-20", "w-24", "w-16", "w-20", "w-20"].map((width, chip) => (
              <Skeleton key={chip} className={cn("h-8 shrink-0 rounded-md max-md:h-11", width)} />
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-full max-w-md rounded-lg max-md:h-11" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}
