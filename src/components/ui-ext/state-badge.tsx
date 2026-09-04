import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TONE_CLASS, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A state, said and shown (DESIGN §6).
 *
 * The word is the badge's own content and is never optional — the colour is a
 * second channel on top of it, not a replacement for it. Quotations and
 * dispatches each had a private copy of this that painted every status the same
 * quiet grey, so the screen said what had happened but never how it was going.
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
    <Badge data-tone={tone} variant="secondary" className={cn(TONE_CLASS[tone], className)}>
      {children}
    </Badge>
  );
}
