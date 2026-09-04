"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
 *
 * It cannot help with the other failure, though, and that one is why
 * `useSubmitAction` below exists: an effect never runs at all if the save takes
 * its own component off the screen. Use this only where the thing that opened
 * the dialog is still there afterwards.
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

/**
 * Runs a server action and answers on its result even if the save has taken the
 * form off the screen in the meantime.
 *
 * `useActionState` plus an effect cannot do that. Raising a revision is the
 * case: the moment it lands, the quotation it was raised from stops being the
 * latest one, so its Revise button — and the dialog hanging off it — is gone
 * from the next render. The effect that was going to say "Revision raised" and
 * open the new quotation belongs to a component that no longer exists, so it
 * never runs, and the rep is left looking at the old paper wondering whether
 * the press worked.
 *
 * A promise continuation is not an effect. It is a closure, it runs when the
 * action answers, and React unmounting the component around it changes nothing.
 * Storing the refusal afterwards is a no-op, which is correct: there is nothing
 * to show it on. The toast and the navigation are global and still happen.
 *
 * It hands back the WHOLE refusal. It used to keep `result.error` and drop
 * `result.fieldErrors`, so every form built on it answered a rejected box with
 * one sentence at the bottom of the dialog and nothing at the box — an admin
 * filling in a lookup row in two languages was told "Required" with no way to
 * see which language was missing. One rejected input, one sentence, at the
 * input (DESIGN §5, D43).
 */
export type Refusal = {
  /** The whole-form sentence: shown only when nothing else showed a field's. */
  error: string | null;
  /** One sentence per refused field, keyed by the field's `name`. */
  fieldErrors: Record<string, string>;
  /**
   * A fresh object for every refused attempt, and null while nothing is
   * refused. `useFocusFirstError` watches it, which is what moves the caret
   * again when the second try is refused the same way as the first.
   */
  answer: unknown;
};

export function useSubmitAction<T>(
  action: (prev: ActionResult<T> | null, form: FormData) => Promise<ActionResult<T>>,
  onSuccess: (data: T | undefined) => void,
): { submit: (form: FormData) => void; pending: boolean } & Refusal {
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<
    { error: string; fieldErrors?: Record<string, string> } | null
  >(null);

  // Read through a ref for the same reason as above: next-intl's router makes a
  // new object every render, so anything closing over it changes identity.
  const run = useRef(onSuccess);
  useEffect(() => {
    run.current = onSuccess;
  });

  const submit = useCallback(
    (form: FormData) => {
      setRefused(null);
      startTransition(async () => {
        const result = await action(null, form);
        if (!result.ok) {
          setRefused({ error: result.error, fieldErrors: result.fieldErrors });
          return;
        }
        setRefused(null);
        run.current(result.data);
      });
    },
    [action],
  );

  const fieldErrors = refused?.fieldErrors ?? {};

  return {
    submit,
    pending,
    // The footer carries the sentence only when no field is carrying one, so
    // the same words never appear twice on one dialog.
    error: refused && Object.keys(fieldErrors).length === 0 ? refused.error : null,
    fieldErrors,
    answer: refused,
  };
}
