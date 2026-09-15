import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The dispatches screen while it reads (DESIGN §1b: the shape of the thing it
 * stands in for, standing still; P13-G6 S12.5).
 *
 * It borrowed the app's generic list — a title, a button and six tiles — which
 * is the shape of no screen: this one has the list/board switch and its four
 * chips on one line, a search box, and one neutral block where the rows or the
 * three columns will be, since the view is remembered per person (D164) and a
 * skeleton cannot know which one he keeps. Each piece is the height the real one
 * is at that width: a phone's controls are a thumb's 44 (D130).
 *
 * No action beside the title: Request dispatch is for the people who can raise
 * one, and a button shape the manager watches vanish is a promise the screen
 * breaks.
 */
export default function DispatchesLoading() {
  return (
    <div data-slot="dispatches-skeleton" className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex items-center">
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-8 w-36 rounded-lg max-md:h-12" />
            <span aria-hidden="true" className="hidden h-4 w-px bg-line md:inline-block" />
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden md:flex-1">
            {["w-12", "w-20", "w-24", "w-20"].map((width, chip) => (
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
