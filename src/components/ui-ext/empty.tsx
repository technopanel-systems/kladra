import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Nothing here, and why (DESIGN §1b, D31, D127).
 *
 * One sentence of at most two short lines. It never draws the screen's primary
 * action a second time — that button is already at the top (§2) — so `action`
 * is for the one way OUT of an empty result, "clear the search", and nothing
 * else.
 *
 * A dashed edge rather than a card: a card is a thing at rest, and this is the
 * space where things will be. `role="status"` so a search that empties a list
 * says so to a reader who cannot see the rows go.
 */
export function Empty({
  children,
  action,
  size = "list",
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  /** A whole list, or a panel inside a drawer or a card. */
  size?: "list" | "panel";
  className?: string;
}) {
  return (
    <div
      role="status"
      data-slot="empty"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong text-center",
        size === "list" ? "px-6 py-16" : "px-4 py-8",
        className,
      )}
    >
      <p className="max-w-[40ch] text-sm text-balance text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
