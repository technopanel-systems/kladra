"use client";

import { useTranslations } from "next-intl";
import { TONE_TEXT } from "@/lib/state-tone";
import type { Waited } from "@/lib/waiting";
import { cn } from "@/lib/utils";

/**
 * How long this one has been sitting (SPEC D59).
 *
 * The coordinator's queue used to show each row's DATE, which is the right fact
 * asked the wrong way round: a date makes the reader work out the answer, and
 * over a Riyadh weekend the arithmetic they do in their head is wrong by two.
 * The question on that screen is "how long has this been waiting", so the answer
 * is a length, in working days, and red once it is past the line the manager's
 * screen has called stuck since P8.
 *
 * A client component because both tables are, and it takes a plain `Waited`
 * rather than the days and the holiday table: the RULE stays in
 * `src/lib/waiting.ts` where the manager's screen reads it too, and this only
 * says it out loud.
 */
export function WaitedFor({ waited, className }: { waited: Waited; className?: string }) {
  const t = useTranslations("queue");

  return (
    <span
      data-slot="waited"
      data-late={waited.late ? "true" : undefined}
      className={cn("text-xs", waited.late ? TONE_TEXT.bad : "text-muted-foreground", className)}
    >
      {t("workingDays", { days: waited.days })}
    </span>
  );
}
