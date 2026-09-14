"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Focus back to what opened a dialog the screen hosts, when it closes.
 *
 * A dialog with a trigger of its own hands focus back to it (ResponsiveDialog).
 * A hosted one has none, and Radix then hands focus to nothing: after "Reset
 * password" the keyboard was at the top of the page, a screen of rows away from
 * the row it had been working on (DESIGN §5, keyboard). So the screen remembers
 * the button that asked — the row's menu button, or its own Edit — and gives
 * focus back once the dialog has let go of it: in an effect, after the commit
 * that stopped the dialog trapping focus, so the trap cannot pull it back in.
 *
 * Returns the function to call with the opener as the dialog is opened.
 */
export function useOpener(open: boolean): (opener: HTMLElement | null) => void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      const target = opener.current;
      opener.current = null;
      // A row the dialog removed has no button to come back to.
      if (target?.isConnected) target.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return useCallback((element: HTMLElement | null) => {
    opener.current = element;
  }, []);
}
