"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";

/**
 * The arrived flash on the row the rep's own save changed (DESIGN §8: a success
 * is a toast that names it AND the row that changed), across the two halves of
 * the projects screen.
 *
 * The save happens in the drawer and the row is in the list behind it, and the
 * two are siblings the server renders, so neither can hold the other's state.
 * The screen holds one `useRowFlash` above both and hands it down. Outside it —
 * Add project inside a company's drawer — there is no row to light, and a save
 * there flashes nothing rather than failing.
 */

type Flash = ReturnType<typeof useRowFlash>;

const ProjectFlashContext = createContext<Flash | null>(null);

export function ProjectFlash({ children }: { children: ReactNode }) {
  const flash = useRowFlash();
  return <ProjectFlashContext.Provider value={flash}>{children}</ProjectFlashContext.Provider>;
}

/** Mark a project's row; nothing, where no projects list is on the screen. */
export function useFlashProject(): (id: string) => void {
  const flash = useContext(ProjectFlashContext)?.flash;
  return (id) => flash?.([id]);
}

/** The class and the end of its animation, for one row. */
export function useProjectFlashOf(): Flash["flashOf"] | null {
  return useContext(ProjectFlashContext)?.flashOf ?? null;
}
