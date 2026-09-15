import type { AriaRole, ReactNode } from "react";
import { TONE_DOT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A line that carries a state across a row or a drawer: a dot in the tone, then
 * the words in the text colour (DESIGN §1 Stone, §6).
 *
 * "Quotation revised since", "Project marked lost", "Differs from 4541" were
 * each the whole sentence painted amber or red — under Sandstone the loudest
 * thing on a row that also carries a name, a figure and a status. The restyle
 * says a state is a mark and its word, and `TONE_TEXT` is kept for a date or a
 * figure that is late. The dot sits in the run of text, not beside it, so a
 * sentence that wraps to a second line keeps its mark on the first, at any size.
 */
export function ToneNote({
  tone,
  children,
  className,
  slot,
  role,
}: {
  tone: StateTone;
  children: ReactNode;
  className?: string;
  /** `data-slot`, for a spec that names this line rather than reads it. */
  slot?: string;
  role?: AriaRole;
}) {
  return (
    <span data-slot={slot} role={role} className={cn("block", className)}>
      <span
        aria-hidden="true"
        className={cn("me-2 inline-block size-1.5 rounded-full align-middle", TONE_DOT[tone])}
      />
      {children}
    </span>
  );
}
