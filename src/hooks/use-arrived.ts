"use client";

/**
 * True for two seconds after somebody else touched this record, so a row can
 * carry the `row-arrived` highlight from globals.css (DESIGN §2).
 *
 *   <tr className={cn("…", useArrived(quotation.id) && "row-arrived")}>
 *
 * Outside <LiveProvider> it is simply false — a list rendered in a test or on a
 * signed-out page should not explode over a highlight.
 */

import { useLiveOptional } from "@/components/live/live-provider";

export function useArrived(id: string | null | undefined): boolean {
  const live = useLiveOptional();
  if (!live || !id) return false;
  return live.arrivedIds.has(id);
}
