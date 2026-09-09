"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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

/**
 * Wraps a server action so that a call the wire refused answers as a refusal.
 *
 * A server action's promise has three ends: a result that is ok, a result that
 * refuses (every action guards its own work and answers with the app's
 * sentence), and a rejection when nothing came back at all — no signal in a
 * lobby, a deploy in the second Save was pressed. React 19 hands that third
 * end to the nearest error boundary, whether the action was a form's
 * `useActionState` or awaited inside `startTransition`: the whole screen
 * became the error card with the rep's sentence still inside the form it
 * replaced (P11I, D132).
 *
 * So no client code calls an action bare. `const guarded = useWireGuard()`,
 * then `guarded(someAction)(…)` — the rejection becomes `{ ok: false, error:
 * common.unreachable }`, which every site already shows where the eye is (the
 * footer, under the question, a toast), with the form as it was and Save
 * alive. `tests/unhappy.spec.ts` cuts the wire under three of them.
 */
export function useWireGuard(): <A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
) => (...args: A) => Promise<ActionResult<T>> {
  const t = useTranslations("common");
  const unreachable = t("unreachable");
  const somethingWrong = t("somethingWrong");
  return useCallback(
    <A extends unknown[], T>(action: (...args: A) => Promise<ActionResult<T>>) =>
      (...args: A) =>
        action(...args).catch(
          (error: unknown): ActionResult<T> =>
            // A rejection carrying a digest was thrown ON the server, which was
            // therefore reached and may have written; only the bare failure is
            // the wire, and only that one may claim nothing was saved.
            typeof error === "object" && error !== null && "digest" in error
              ? { ok: false, error: somethingWrong }
              : { ok: false, error: unreachable, reason: "unreachable" },
        ),
    [unreachable, somethingWrong],
  );
}

export function useSubmitAction<T>(
  action: (prev: ActionResult<T> | null, form: FormData) => Promise<ActionResult<T>>,
  onSuccess: (data: T | undefined) => void,
): { submit: (form: FormData) => void; pending: boolean } & Refusal {
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<
    { error: string; fieldErrors?: Record<string, string> } | null
  >(null);
  const guarded = useWireGuard();

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
        // Guarded: a call the wire refused is a refusal like any other (D132).
        const result = await guarded(action)(null, form);
        if (!result.ok) {
          setRefused({ error: result.error, fieldErrors: result.fieldErrors });
          return;
        }
        setRefused(null);
        run.current(result.data);
      });
    },
    [action, guarded],
  );

  const fieldErrors = refused?.fieldErrors ?? {};

  return {
    submit,
    pending,
    // The footer carries the sentence only when no field is carrying one, so
    // the same words never appear twice on one dialog.
    error: refused && Object.keys(fieldErrors).length === 0 ? refused.error : null,
    fieldErrors,
    /*
     * Null while the submit is still in flight, and only then the refusal
     * (§5 #169).
     *
     * `isPending` stays true for the whole of an async transition, and the
     * `setRefused` that lands after the await is committed inside it — so at
     * the render where the refused field first carries `aria-invalid`, every
     * control on these dialogs is still `disabled={pending}`. A disabled input
     * cannot take the caret, so `useFocusFirstError` fired at the one moment
     * its target could not receive it, found nothing to do, and never ran
     * again, because the answer it watches had not changed since.
     *
     * Held back one commit, it changes identity when `pending` goes false and
     * the fields come back to life, which is when there is something to focus.
     * `error` and `fieldErrors` above are deliberately NOT held back: the
     * sentence should appear the moment it is known.
     */
    answer: pending ? null : refused,
  };
}
