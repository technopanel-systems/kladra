"use client";

import { useEffect } from "react";

const GUARD = "kladraBackGuard";

/**
 * While `active`, the phone's back gesture does not leave the screen (D96).
 *
 * A bottom sheet with a sentence typed in it sits on a route, and the back
 * gesture is a route change: the drawer unmounted and the words went with it —
 * D84's tap beside the sheet, by another thumb. So one history entry is pushed
 * the moment the form is dirty; going back lands on the entry before it, which
 * is the same URL, so nothing unmounts, and the entry is pushed again. Cancel,
 * Escape and Save still close the sheet, and the entry goes with it, so a
 * deliberate back after closing leaves the screen as it always did.
 *
 * Next's router copies its own state onto entries pushed from outside it, so
 * the entry is one it restores without a reload.
 */
export function useBackGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    window.history.pushState({ [GUARD]: true }, "");
    const keep = () => {
      window.history.pushState({ [GUARD]: true }, "");
    };
    window.addEventListener("popstate", keep);
    return () => {
      window.removeEventListener("popstate", keep);
      // Only its own entry: when something else has navigated since, the
      // history is that navigation's to keep.
      if (window.history.state?.[GUARD]) window.history.back();
    };
  }, [active]);
}
