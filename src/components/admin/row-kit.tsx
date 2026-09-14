"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type AnimationEvent,
} from "react";
import { toast } from "sonner";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionResult } from "@/lib/types";

/**
 * What the admin's lists share: the menu at the end of a row, the question a
 * row's menu asks, and the flash a row takes when the admin's own save lands
 * (P13-G6, S12.9).
 *
 * Users was a schema browser: four plain-text actions at one weight on every
 * row, Deactivate among them, and rows forced to seventy pixels to hold them.
 * The lookups rows put "Take out of use" at the weight of Edit. So a row keeps
 * its frequent action visible, and everything else is in one menu, with the
 * act that ends something last, apart behind a divider, in the tint (DESIGN
 * §1, §8; lists-navigation "Menus").
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
 * The trigger is 24px on a desk, which is what keeps a row at 40 (DESIGN §1b),
 * and 44 on a phone through the kit's `touch` (D130). Both actions stay drawn
 * at every width: nothing here is reached by hover alone.
 */
export function RowMenu({
  label,
  items,
  end,
}: {
  /** Names the row: "More for Faisal Al-Harbi". */
  label: string;
  items: RowMenuItem[];
  end?: RowMenuEnd;
}) {
  const next = useRef<RowMenuItem["onSelect"] | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const refusedId = useId();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={button} variant="ghost" size="icon-xs" aria-label={label} data-slot="row-menu">
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
        {end ? (
          <>
            {/* A divider marks a line between two groups, so a menu holding
                only the last act draws none (D145). */}
            {items.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={end.destructive ? "destructive" : "default"}
              disabled={end.refused ? true : undefined}
              aria-describedby={end.refused ? refusedId : undefined}
              onSelect={() => {
                next.current = end.onSelect;
              }}
            >
              <end.icon
                aria-hidden="true"
                className={end.destructive ? undefined : "text-muted-foreground"}
              />
              {end.label}
            </DropdownMenuItem>
            {end.refused ? (
              <p id={refusedId} className="max-w-56 px-2 pb-2 text-xs text-muted-foreground">
                {end.refused}
              </p>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Are you sure?" for a question a row's MENU asks.
 *
 * The kit's `ConfirmDialog` opens from a trigger it owns, and a menu item is
 * gone the moment the menu closes, so it cannot own one. This is the same
 * confirmation opened by state from the screen that mounts it once — the host
 * shape DESIGN §5 already asks of a list — with two differences the admin's
 * questions need: a refusal is written in the footer, where the eye is and the
 * dialog stays open (DESIGN §8: a refused submit goes in the footer), and the
 * act that takes something away presses a button in the tint, never the brand.
 */
export function HostedConfirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  successMessage,
  onConfirm,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  successMessage: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
  /** Runs after the action succeeds: refresh, and mark the row. */
  onDone?: () => void;
}) {
  const guarded = useWireGuard();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    if (pending) return;
    setRefusal(null);
    onOpenChange(next);
  }

  function confirm() {
    startTransition(async () => {
      // Guarded: no answer at all is a refusal too, not the error card (D132).
      const result = await guarded(onConfirm)();
      if (!result.ok) {
        setRefusal(result.error);
        return;
      }
      toast.success(successMessage);
      setRefusal(null);
      onOpenChange(false);
      onDone?.();
    });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={change} title={title} description={description}>
      {/* A form, so Enter confirms it (D114). */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) confirm();
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <FormFooter
          error={refusal}
          pending={pending}
          onCancel={() => change(false)}
          confirmLabel={confirmLabel}
          confirmVariant={destructive ? "destructive" : "brand"}
        />
      </form>
    </ResponsiveDialog>
  );
}

/**
 * Focus back to what opened a dialog the screen hosts, when it closes.
 *
 * A dialog with a trigger of its own hands focus back to it (ResponsiveDialog).
 * A hosted one has none, and Radix then hands focus to nothing: after "Reset
 * password" the keyboard was at the top of the page, a screen of rows away from
 * the row it had been working on (DESIGN §5, keyboard). So the screen remembers
 * the button that asked — the row's menu button, or its own Edit — and gives
 * focus back once the dialog has let go of it: in an effect, after the commit
 * that stopped the dialog trapping focus, so the trap cannot pull it back in.
 *
 * Returns the function to call with the opener as the dialog is opened.
 */
export function useOpener(open: boolean): (opener: HTMLElement | null) => void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      const target = opener.current;
      opener.current = null;
      // A row the dialog removed has no button to come back to.
      if (target?.isConnected) target.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return useCallback((element: HTMLElement | null) => {
    opener.current = element;
  }, []);
}

/** How long a mark waits for its row to be drawn before it is forgotten. */
const MARK_WAITS_MS = 10_000;

const NO_MARKS: ReadonlySet<string> = new Set<string>();

/**
 * The arrived flash on the row the admin's own save changed (DESIGN §2, §8: a
 * success is a toast that names it AND the row that changed).
 *
 * The live channel flashes what somebody ELSE touched; nothing flashed what the
 * admin had just done, so after "Saved." he hunted for the row. The mark is
 * keyed on what the form knew — an id, an email, a day — because the actions
 * hand back no row, and it is cleared when the row's own animation ends, so the
 * two seconds start when the refreshed row is on screen (D105), not when the
 * answer came.
 */
export function useRowFlash(): {
  flash: (keys: string[]) => void;
  /** Spread on the row: the class while marked, and the end of its animation. */
  flashOf: (key: string) => {
    className: string | undefined;
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void;
  };
} {
  const [marks, setMarks] = useState<ReadonlySet<string>>(NO_MARKS);

  const flash = useCallback((keys: string[]) => setMarks(new Set(keys)), []);

  useEffect(() => {
    if (marks.size === 0) return;
    const timer = setTimeout(() => setMarks(NO_MARKS), MARK_WAITS_MS);
    return () => clearTimeout(timer);
  }, [marks]);

  const flashOf = useCallback(
    (key: string) => ({
      className: marks.has(key) ? "row-arrived" : undefined,
      onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
        // Only the row's own flash: a mark inside it animates too, and bubbles.
        if (event.target !== event.currentTarget || !marks.has(key)) return;
        setMarks((current) => {
          const rest = new Set(current);
          rest.delete(key);
          return rest;
        });
      },
    }),
    [marks],
  );

  return { flash, flashOf };
}

/** Turns a plain object into the FormData every action takes. */
export function sendForm(
  action: (
    prev: ActionResult<undefined> | null,
    form: FormData,
  ) => Promise<ActionResult<undefined>>,
  values: Record<string, string>,
): Promise<ActionResult<unknown>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return action(null, form);
}
