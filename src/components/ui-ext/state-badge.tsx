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
 * A dot and the word, since the restyle (DESIGN §1b): the tone is the dot, the
 * word is in the text colour inside a hairline, so a status column reads as a
 * column of words with a mark each rather than a column of coloured lozenges.
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
      className={cn("gap-1.5 border-line font-normal text-foreground", className)}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {children}
    </Badge>
  );
}
