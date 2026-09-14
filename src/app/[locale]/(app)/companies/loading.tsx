import { Skeleton } from "@/components/ui/skeleton";

/**
 * The companies screen while its queries run, in the screen's own shape
 * (DESIGN §1b): the title and its action, the month card, the chips, the
 * search, and rows of the row's own height — a table on a desk, a card per row
 * on a phone, each with the avatar's square where the avatar will be. Static:
 * a grey shape says "loading" as well as a breathing one (§2).
 *
 * The shell's own skeleton stood in before this: a title and six 64px bars,
 * which is the shape of no list in the app, so the page jumped as the real one
 * arrived — the month card pushing the list a card's height down.
 */
export default function CompaniesLoading() {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <div
      role="status"
      aria-busy="true"
      data-slot="companies-skeleton"
      className="flex flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* The month card. */}
      <div className="card-face flex flex-col gap-4 p-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-8">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-2 overflow-hidden">
          {["w-12", "w-24", "w-20", "w-44"].map((width) => (
            <Skeleton key={width} className={`h-8 shrink-0 rounded-full ${width}`} />
          ))}
        </div>
        <Skeleton className="h-9 w-full max-w-sm rounded-lg" />

        <div className="card-face hidden md:block">
          <div className="border-b border-line px-3 py-3">
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          {rows.map((row) => (
            <div
              key={row}
              className="flex h-14 items-center gap-2 border-b border-line px-3 last:border-0"
            >
              <Skeleton className="size-6 shrink-0 rounded-md" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="ms-auto h-4 w-24" />
            </div>
          ))}
        </div>

        <ul className="flex flex-col gap-2 md:hidden">
          {rows.slice(0, 4).map((row) => (
            <li key={row} className="card-face flex items-start gap-3 p-3">
              <Skeleton className="size-6 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
