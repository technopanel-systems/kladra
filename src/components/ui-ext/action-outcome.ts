"use client";

import { useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/types";

/**
 * Runs `onSuccess` ONCE for each answer a server action gives, never twice for
 * the same one.
 *
 * The once is the whole point. `useActionState` hands back a state object that
 * stays `ok` until the next submit, and the obvious effect —
 *
 *     useEffect(() => { if (state?.ok) toast.success(…) }, [state, router, t])
 *
 * — fires again on every re-render, because next-intl's `useRouter()` returns a
 * NEW object each render and anything closing over it changes identity with it.
 * A `useCallback` built from the router does the same. The dialogs that
 * navigated away on success hid this: they unmounted before the second run.
 * Edit dialogs stay mounted through Radix's close animation, so the second run
 * arrived — two toasts, two refreshes, two of everything.
 *
 * Keying on the answer's own identity fixes it for good, and does not care what
 * else is in the dependency array.
 */
export function useActionOutcome<T>(
  state: ActionResult<T> | null,
  onSuccess: (data: T | undefined) => void,
): void {
  const handled = useRef<ActionResult<T> | null>(null);
  // The callback is read through a ref so the effect never has to list it.
  const run = useRef(onSuccess);
  useEffect(() => {
    run.current = onSuccess;
  });

  useEffect(() => {
    if (!state?.ok || handled.current === state) return;
    handled.current = state;
    run.current(state.data);
  }, [state]);
}
