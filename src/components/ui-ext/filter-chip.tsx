import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * One chip in a row of them: a status filter on the quotations and dispatches
 * lists, and which list is open on the admin's Lookups screen.
 *
 * It was written three times, and the three disagreed. Quotations filled the
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
  children,
}: {
  href: string;
  /** Selected, which the browser is told through `aria-current`, not colour. */
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className="h-8 rounded-full px-3 text-xs"
    >
      <Link href={href} aria-current={active ? "true" : undefined}>
        {children}
      </Link>
    </Button>
  );
}
