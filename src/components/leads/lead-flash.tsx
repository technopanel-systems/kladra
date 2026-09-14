"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";

/**
 * The arrived flash on the lead the reader's own save just filed or moved
 * (DESIGN §2, §8: a success is a toast that names it AND the row that changed).
 *
 * The form that files a lead sits in the heading and the table it lands in sits
 * under the filters, two branches of a server page with nothing shared between
 * them, so the flash is held here, above both, and each asks for it. Outside
 * the host both answer nothing, which is what a row with no save behind it
 * should do.
 */
type Flash = ReturnType<typeof useRowFlash>;

const LeadFlash = createContext<Flash | null>(null);

export function LeadFlashHost({ children }: { children: ReactNode }) {
  const flash = useRowFlash();
  return <LeadFlash.Provider value={flash}>{children}</LeadFlash.Provider>;
}

export function useLeadFlash(): Flash | null {
  return useContext(LeadFlash);
}
