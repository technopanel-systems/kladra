"use client";

import { useEffect, useRef } from "react";
import { rememberChoiceAction } from "@/actions/screen-choice";
import type { ChoiceKind } from "@/lib/screen-choice";

/**
 * Tell the server what this person is looking at, once, and only when it is
 * news (SPEC §3, D164).
 *
 * The three choosers — list or board, which tab, which window — each carried
 * their own copy of the same effect writing the same cookie, with the same
 * paragraph explaining why a preference was not worth a table. §3 answered the
 * question the paragraph had not asked: per browser is not per person, and the
 * rep who chose the board at his desk got the list back on his phone. One rule,
 * so one mechanism, and now one effect rather than three.
 *
 * `was` is what the screen would have opened on with no `?view=` at all — the
 * remembered word, or the default when nothing is remembered. Comparing against
 * it is what keeps this quiet: opening a screen you have not changed writes
 * nothing, and pressing the switch writes once. The ref covers the render after
 * the write lands, where `was` is still the old word.
 *
 * Nothing waits for the answer and nothing shows it, so the call is not
 * `useWireGuard`'s business (D132): there is no sentence to put on a screen. It
 * is caught all the same, because an unhandled rejection from a server action
 * reaches the nearest error boundary, and a preference that did not save must
 * never take the screen down with it.
 */
export function useRemembered(
  kind: ChoiceKind,
  screen: string,
  choice: string,
  was: string,
): void {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (choice === was) return;
    const stamp = `${kind}:${screen}=${choice}`;
    if (sent.current === stamp) return;
    sent.current = stamp;
    rememberChoiceAction(kind, screen, choice).catch(() => {
      // Nothing to persist to; the choice still applies to this page, and the
      // next press will try again.
      sent.current = null;
    });
  }, [kind, screen, choice, was]);
}
