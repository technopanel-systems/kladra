import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link } from "@/i18n/navigation";
import { TONE_CLASS } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * One chip in a row of them: a status filter on the quotations and dispatches
 * lists, and which list is open on the admin's Lookups screen.
 *
 * It was written FOUR times, and the four disagreed. Quotations filled the
 * selected chip with the brand red; dispatches and lookups used the quiet
 * secondary. Two screens a coordinator moves between all day looked like two
 * products, and the loud one was wrong: DESIGN §1 keeps the brand for the
 * primary action, and choosing a filter is a state, not the thing to press.
 *
 * The chip is a Link, not a button that navigates. The filter lives in the URL
 * (SPEC §3), so it is a place, and a rep can send somebody "the ones waiting"
 * as an address.
 *
 * **Three states, and none of them is a colour alone** (P13-G6, DESIGN §8).
 * The unchosen chip was the kit's ghost button — no edge and no surface — so a
 * row of chips read as a row of words until the pointer found one, and the
 * chosen one differed from it by a fill two steps up a brown ladder. Now:
 *
 * - **Idle** stands on the page as a thing that can be pressed: a hairline, a
 *   quiet surface, the muted word.
 * - **Chosen** is filled: the wash that marks what is current everywhere in the
 *   app (DESIGN §5), a drawn edge, the word at full strength and a heavier
 *   weight — and `aria-current`, which is the word a screen reader hears.
 * - **Disabled** is dimmed and is not a link: a door onto nothing is not a door
 *   (§5, "a count is a door"), so there is nothing behind it to press.
 *
 * `chipClass` is the look alone, for a chip that is not an address — the
 * board's stage picker, which changes what a phone shows and not the list.
 */
export function chipClass({
  active,
  tone,
  disabled = false,
}: {
  active: boolean;
  tone?: "bad" | "wait";
  disabled?: boolean;
}): string {
  return cn(
    // One height everywhere (tests/filters.spec.ts) and a pill. `shrink-0`: a
    // chip in a line that scrolls keeps its word whole rather than squeezing.
    "h-8 shrink-0 rounded-full border px-3 text-xs",
    // A lateness chip keeps its tint in every state (the tone's own classes,
    // state-tone.ts) and says which state it is in by its edge and its weight.
    tone === "bad"
      ? cn(
          TONE_CLASS.bad,
          active ? "border-state-bad-fg font-semibold" : "border-state-bad-fg/25",
          !disabled && "hover:bg-state-bad hover:text-state-bad-fg",
        )
      : tone === "wait"
        ? cn(
            TONE_CLASS.wait,
            active ? "border-state-wait-fg font-semibold" : "border-state-wait-fg/25",
            !disabled && "hover:bg-state-wait hover:text-state-wait-fg",
          )
        : active
          ? "border-foreground/40 bg-surface-2 font-semibold text-foreground hover:bg-surface-2"
          : cn(
              "border-line bg-surface text-muted-foreground",
              !disabled && "hover:bg-surface-2 hover:text-foreground",
            ),
    disabled && "cursor-default opacity-50",
  );
}

export function FilterChip({
  href,
  active,
  tone,
  disabled = false,
  children,
}: {
  href: string;
  /** Selected, which the browser is told through `aria-current`, not colour. */
  active: boolean;
  /**
   * A colour, on the two chips in the app that count lateness rather than name
   * a state: overdue and due-today on the projects list. It is the same red and
   * the same amber the dates under them carry (DESIGN §6), which is the only
   * reason a filter is allowed one — the fourth copy of this chip had them, and
   * they are the one thing it had that this did not.
   */
  tone?: "bad" | "wait";
  /**
   * Nothing behind it — a band with no rows in it. Drawn dimmed and not as a
   * link, with its word still there, so the row keeps its shape and nobody
   * presses into an empty list.
   */
  disabled?: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span
        data-slot="filter-chip"
        aria-disabled="true"
        className={cn(
          "inline-flex items-center justify-center gap-1 font-medium whitespace-nowrap",
          chipClass({ active: false, tone, disabled: true }),
        )}
      >
        {children}
      </span>
    );
  }
  // `secondary` rather than the kit's ghost: ghost carries a dark-theme hover
  // of its own that no class here can merge away, and it would have swapped
  // the chosen chip's wash for a paler one under the pointer.
  return (
    <Button asChild size="sm" variant="secondary" className={chipClass({ active, tone })}>
      <Link href={href} data-slot="filter-chip" aria-current={active ? "true" : undefined}>
        {children}
        <LinkPending />
      </Link>
    </Button>
  );
}
