"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Puts the caret on the first refused field after a save comes back.
 *
 * A dialog can be taller than the screen — Add company is — so a message that
 * only appears beside a field is a message a rep may never scroll to. He
 * presses Save, nothing visibly happens, and he presses it again. Moving focus
 * scrolls that field into view and, for a screen reader, reads its label and
 * the message under it.
 *
 * It finds the field by `aria-invalid`, which every control here already sets
 * from the same `fieldErrors`, so there is no second list of field names to
 * keep in step with the form.
 *
 * `answer` is whatever the action returned: a new object identity per attempt,
 * which is what makes a second refusal move focus again.
 */
export function useFocusFirstError(
  form: RefObject<HTMLFormElement | null>,
  answer: unknown,
): void {
  // The first render has no answer yet; focusing then would steal the caret
  // from whatever the rep was typing in.
  const seen = useRef(false);

  useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      return;
    }
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    invalid?.focus();
  }, [answer, form]);
}
