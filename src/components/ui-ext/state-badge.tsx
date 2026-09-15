import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TONE_DOT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A state, said and shown (DESIGN §6).
 *
 * The word is the badge's own content and is never optional — the colour is a
 * second channel on top of it, not a replacement for it. Quotations and
 * dispatches each had a private copy of this that painted every status the same
 * quiet grey, so the screen said what had happened but never how it was going.
 *
 * A dot and the word, since the restyle (DESIGN §1b, §6): the tone is the dot
 * and the word is in the muted text colour, with no box. A hairline round it
 * vanished on a dark card and showed on a light one, so the one badge read as
 * two different things from screen to screen (P4 consistency pass).
 */
export function StateBadge({
  tone,
  children,
  className,
}: {
  tone: StateTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    // `data-tone` is how tests read the colour without reading a class name:
    // the mapping is the thing under test, not the hex behind it.
    <Badge
      data-tone={tone}
      variant="outline"
      className={cn("gap-1.5 border-transparent px-0 font-normal text-muted-foreground", className)}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {children}
    </Badge>
  );
}
