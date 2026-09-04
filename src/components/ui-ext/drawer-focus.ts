"use client";

/**
 * What a drawer focuses when it opens: itself.
 *
 * Radix moves focus to the first tabbable control inside the panel. In a form
 * dialog that is right — the first field is where a rep is about to type. In a
 * drawer it is not: the company drawer's first control is the follow-up date
 * picker, so opening a shared `?open=` link put a focus ring on a date nobody
 * had touched and armed Enter to open a calendar. It read as "something is
 * selected" when nothing was.
 *
 * Focusing the panel itself is what a dialog is supposed to do: a screen
 * reader announces its title, the first Tab lands on the first control, and
 * Escape still closes it. Radix gives the content `tabindex="-1"`, so it can
 * take focus without joining the tab order.
 *
 * Only drawers use this. A form dialog keeps the first field.
 */
export function focusTheDrawerItself(event: Event): void {
  // `currentTarget` is only set while the event is being dispatched. If it is
  // ever null, `target` is the same node — and if BOTH are, the default is left
  // alone rather than preventing it and leaving focus outside a trapped panel,
  // which is the one outcome worse than focusing the wrong control.
  const panel = event.currentTarget ?? event.target;
  if (!(panel instanceof HTMLElement)) return;
  event.preventDefault();
  panel.focus();
}
