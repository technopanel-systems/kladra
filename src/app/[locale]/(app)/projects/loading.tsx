import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The projects screen while it reads (DESIGN §1b: the shape of the thing it
 * stands in for, standing still).
 *
 * One shape for both views, because the view is remembered per person (D164)
 * and this is drawn before anybody is asked which one he keeps: the title, the
 * row with the list/board switch and its chips, the search, and one neutral
 * block where the list's rows or the board's columns will be. Rows here would
 * be a list turning into a board for everybody who reads the board, and five
 * columns a board turning into a list for everybody else.
 *
 * The chips are ONE line, as `FilterRow` draws them since S12.K: beside the
 * switch behind a divider on a desk, under it on a phone, and cut at the edge
 * rather than wrapped — a skeleton that wraps into a second row stands in for a
 * screen that does not. Each piece is the height the real one is at that
 * width: a phone's controls are a thumb's 44 (D130).
 *
 * No action beside the title: Add project is for the people who hold companies,
 * and a button shape the manager watches vanish is a promise the screen breaks.
 */
export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex items-center">
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-8 w-36 rounded-full max-md:h-12" />
            <span aria-hidden="true" className="hidden h-4 w-px bg-line md:inline-block" />
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden md:flex-1">
            {["w-12", "w-24", "w-24", "w-20"].map((width, chip) => (
              <Skeleton key={chip} className={cn("h-8 shrink-0 rounded-full max-md:h-11", width)} />
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-full max-w-md rounded-lg max-md:h-11" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}
