import type { ReactNode } from "react";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The band of figures under a drawer's title: how this thing is standing
 * (DESIGN §6, P8.5).
 *
 * Jerom's word for the old panels was "thin". They opened on a flat list of
 * fields — city, category, lead source, rep — which is what the record HAS, not
 * how it is GOING. This is the answer to the second question, and it comes
 * first because it is the one a person opened the drawer to ask.
 *
 * Two to four items. More than four and it stops being a glance, and on a phone
 * they wrap to two rows rather than shrink to nothing.
 */
export function StandingStrip({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; tone?: StateTone | null }[];
  className?: string;
}) {
  return (
    <dl
      data-slot="standing"
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 sm:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="truncate text-[0.6875rem] leading-none font-medium tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className={cn("truncate text-sm leading-tight", item.tone && TONE_TEXT[item.tone])}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
