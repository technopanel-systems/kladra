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

import { useEffect, useMemo } from "react";
import { useLiveOptional } from "@/components/live/live-provider";

const NONE: ReadonlySet<string> = new Set<string>();

export function useArrived(id: string | null | undefined): boolean {
  const live = useLiveOptional();
  if (!live || !id) return false;
  return live.arrivedIds.has(id);
}

/**
 * A list reports that its rows are on screen. The highlight's two seconds
 * start from this report, not from the event (D105): a refresh changes what
 * the list's rows SAY exactly when the refreshed tree has painted, which is
 * the first moment a highlight can be seen. Every list that marks arrived rows
 * calls it once, with the rows the server gave it.
 *
 * Keyed on what the rows say, not on the array that holds them: a re-render
 * that hands the list the same data again is not a landing.
 */
export function useLanded(rows: readonly unknown[]): void {
  const landed = useLiveOptional()?.landed;
  const said = useMemo(() => JSON.stringify(rows), [rows]);
  useEffect(() => {
    landed?.();
  }, [said, landed]);
}

/**
 * The two together, for a list that reads the set itself rather than per row:
 *
 *   const arrived = useArrivedIds(rows);
 *   <TableRow className={cn(arrived.has(row.id) && "row-arrived")}>
 */
export function useArrivedIds(rows: readonly unknown[]): ReadonlySet<string> {
  useLanded(rows);
  return useLiveOptional()?.arrivedIds ?? NONE;
}
