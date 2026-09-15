"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";

/**
 * The arrived flash on the row the reader's own act changed (DESIGN §8: a success
 * is a toast that names it AND the row that changed), across the two halves of the
 * quotations screen — the drawer where the act is pressed, and the list behind it
 * where the row is.
 *
 * The live channel flashes what somebody ELSE touched and never the writer's own
 * change, so after "Q-12 withdrawn" the rep closed the drawer onto a list that
 * said nothing about which row had moved. The two halves are siblings the server
 * renders, so the screen holds one `useRowFlash` above both and hands it down
 * (the projects screen's `ProjectFlash`, for the same reason). Outside it — a
 * request raised from a company's drawer, the coordinator's queue, where an
 * answered request leaves the list — there is no row to light, and a save
 * flashes nothing rather than failing.
 */

type Flash = ReturnType<typeof useRowFlash>;

const QuotationFlashContext = createContext<Flash | null>(null);

export function QuotationFlash({ children }: { children: ReactNode }) {
  const flash = useRowFlash();
  return <QuotationFlashContext.Provider value={flash}>{children}</QuotationFlashContext.Provider>;
}

/** Mark a quotation's row; nothing, where no quotations list is on the screen. */
export function useFlashQuotation(): (id: string) => void {
  const flash = useContext(QuotationFlashContext)?.flash;
  return (id) => flash?.([id]);
}

/** The class and the end of its animation, for one row. */
export function useQuotationFlashOf(): Flash["flashOf"] | null {
  return useContext(QuotationFlashContext)?.flashOf ?? null;
}
