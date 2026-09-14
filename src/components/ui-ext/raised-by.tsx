"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * "Raised by Rawan" — said where the person who pressed the button is not the
 * person the paper counts for (SPEC §3 P13).
 *
 * In words, never a tint or an icon alone: a quiet line on a row of a list, and
 * a quiet line under the facts of a drawer. Nothing at all on the paper a rep
 * raised himself, which is nearly all of it — a caption that never varies is a
 * word to read past on every row (DESIGN §5).
 *
 * One component for the two quotation and dispatch lists and their two drawers,
 * so the four places cannot say it four ways.
 */
export function RaisedBy({
  name,
  place = "row",
  className,
}: {
  /** In the reader's script (D68); null when nobody else raised it. */
  name: string | null;
  place?: "row" | "drawer";
  className?: string;
}) {
  const t = useTranslations();
  if (!name) return null;
  const words = t("common.onBehalf.raisedBy", { name });
  return place === "row" ? (
    <span data-slot="row-raised-by" className={cn("block text-xs text-muted-foreground", className)}>
      {words}
    </span>
  ) : (
    <p data-slot="raised-by" className={cn("text-xs text-muted-foreground", className)}>
      {words}
    </p>
  );
}
