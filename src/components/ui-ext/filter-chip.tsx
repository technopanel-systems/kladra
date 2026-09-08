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
 */
export function FilterChip({
  href,
  active,
  tone,
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
  children: ReactNode;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "h-8 rounded-full px-3 text-xs",
        tone === "bad" && cn(TONE_CLASS.bad, "hover:bg-state-bad"),
        tone === "wait" && cn(TONE_CLASS.wait, "hover:bg-state-wait"),
      )}
    >
      <Link href={href} data-slot="filter-chip" aria-current={active ? "true" : undefined}>
        {children}
        <LinkPending />
      </Link>
    </Button>
  );
}
