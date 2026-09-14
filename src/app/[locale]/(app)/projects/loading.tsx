import { Skeleton } from "@/components/ui/skeleton";

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
 * No action beside the title: Add project is for the people who hold companies,
 * and a button shape the manager watches vanish is a promise the screen breaks.
 */
export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center">
          <Skeleton className="h-8 w-36 rounded-full" />
          <div className="flex flex-wrap items-center gap-2">
            {[0, 1, 2, 3].map((chip) => (
              <Skeleton key={chip} className="h-8 w-20 rounded-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}
