"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import { Fragment, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The menu at the end of a row, or at a drawer's head: the frequent action stays
 * in sight and everything else is here, with the act that ends something last,
 * apart behind a divider, in the tint (DESIGN §1, §8; lists-navigation "Menus").
 *
 * Built for admin's users and lookups in P13-G6 (S12.9), where four plain-text
 * actions stood at one weight on every row with Deactivate among them, and moved
 * into the kit before the drawers needed the same shape, so there is one of it.
 * A dialog an item opens is hosted by the screen: `ConfirmDialog` with `open`,
 * and `useOpener` to hand focus back to this menu's button when it closes.
 */

export type RowMenuItem = {
  label: string;
  icon: LucideIcon;
  /** Given the menu's own button, so the dialog it opens can hand focus back to it. */
  onSelect: (opener: HTMLElement | null) => void;
};

export type RowMenuEnd = RowMenuItem & {
  /** The act that ends or takes away something: drawn in the destructive tint. */
  destructive?: boolean;
  /**
   * The sentence the action would refuse with. The item is then not pressable
   * and the sentence is written under it, before the press (D119) — never a
   * live item that fails.
   */
  refused?: string;
};

/**
 * The menu at the end of a row.
 *
 * A dialog chosen from it opens once the menu has CLOSED, not while it is
 * closing: opened in the same breath as the menu's exit, two modal layers
 * overlap and each thinks it owns the page's pointer and focus. The item is
 * handed the menu's button, and the screen gives focus back to it when the
 * dialog closes (`useOpener`) — Escape from "Reset password" lands on the row's
 * own menu button, not at the top of the page.
 *
 * The trigger is 24px in a row on a desk, which is what keeps a row at 40
 * (DESIGN §1b), and 32 at a drawer's head (`size="head"`), where it stands in a
 * row of 32px buttons and a 24px mark read as an afterthought beside them. On a
 * phone both are 44 through the kit's `touch` (D130). Nothing here is reached
 * by hover alone.
 *
 * `end` is the act that takes the record away, or the acts: a live project
 * ends by Mark lost or goes by Archive, and both belong apart, in the tint,
 * after the divider (S12.3).
 */
export function RowMenu({
  label,
  items,
  end,
  size = "row",
}: {
  /** Names the row: "More for Faisal Al-Harbi". */
  label: string;
  items: RowMenuItem[];
  end?: RowMenuEnd | RowMenuEnd[];
  size?: "row" | "head";
}) {
  const next = useRef<RowMenuItem["onSelect"] | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const refusedId = useId();
  const ends = end === undefined ? [] : Array.isArray(end) ? end : [end];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={button}
          variant="ghost"
          size={size === "head" ? "icon" : "icon-xs"}
          aria-label={label}
          data-slot="row-menu"
        >
          {/* The kit draws an extra-small button's glyph at 12px, where three
              dots on a warm-black row are a smudge; 16, like every row glyph. */}
          <Ellipsis aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-48"
        onCloseAutoFocus={() => {
          const chosen = next.current;
          next.current = null;
          chosen?.(button.current);
        }}
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onSelect={() => {
              next.current = item.onSelect;
            }}
          >
            <item.icon aria-hidden="true" className="text-muted-foreground" />
            {item.label}
          </DropdownMenuItem>
        ))}
        {/* A divider marks a line between two groups, so a menu holding only
            its last acts draws none (D145). */}
        {ends.length > 0 && items.length > 0 ? <DropdownMenuSeparator /> : null}
        {ends.map((last, index) => (
          <Fragment key={last.label}>
            <DropdownMenuItem
              variant={last.destructive ? "destructive" : "default"}
              disabled={last.refused ? true : undefined}
              aria-describedby={
                last.refused ? `${refusedId}-${index}` : undefined
              }
              onSelect={() => {
                next.current = last.onSelect;
              }}
            >
              <last.icon
                aria-hidden="true"
                className={
                  last.destructive ? undefined : "text-muted-foreground"
                }
              />
              {last.label}
            </DropdownMenuItem>
            {last.refused ? (
              <p
                id={`${refusedId}-${index}`}
                className="max-w-56 px-2 pb-2 text-xs text-muted-foreground"
              >
                {last.refused}
              </p>
            ) : null}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
