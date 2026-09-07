"use client";

import { useRef, useState, type ReactNode } from "react";
import { Slot } from "radix-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useSlotChild } from "@/components/ui/use-slot-child";
import { useIsPhone } from "@/hooks/use-is-phone";

/**
 * One dialog that is a bottom sheet on a phone (DESIGN §2 — "on a phone the
 * sidebar is a bottom bar and dialogs are bottom sheets; the thumb reaches the
 * bottom"). Everything the forms need is the same on both: a title, a
 * description a screen reader announces, and a body that scrolls with a footer
 * pinned under it.
 *
 * Every form in the app comes through here (P11H, §5 #28). Six called the raw
 * Dialog — new and edit project, mark lost, the log, confirm and prompt — and
 * stayed centred boxes on a phone, their buttons at the top of the thumb's
 * reach instead of the bottom of it; the log had written its own bottom sheet
 * in CSS, one pixel off the shell's line. The line is the shell's now
 * (src/lib/breakpoint.ts, useIsPhone), read after hydration while the thing
 * is still closed and nothing is on screen to flicker.
 */

export function ResponsiveDialog({
  open,
  onOpenChange,
  trigger,
  title,
  context,
  description,
  guardOutside = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What opens it. A dialog its host opens by state has none. */
  trigger?: ReactNode;
  title: string;
  /**
   * Whose record this is, between the title and the sentence — the customer's
   * name, so a number is typed against a company and not a bare label (D98).
   */
  context?: string;
  description: string;
  /**
   * Something the form knows is worth keeping that no input event says —
   * the log's chips, dates and picks (D84). Anything TYPED into any form
   * holds the sheet by itself, below.
   */
  guardOutside?: boolean;
  children: ReactNode;
}) {
  const phone = useIsPhone();
  // A sentence typed is held whichever form it is in: a tap beside the sheet
  // does nothing and, on a phone, the sheet does not drag away; Cancel and
  // Escape — deliberate — still close it (D84, D129). The first cut held the
  // log alone, and a New project half-typed could be swiped into nothing.
  // `onInput` bubbles from every text field, including a picker's search.
  const [typed, setTyped] = useState(false);
  // Forgotten on the next open — adjusted while rendering, the way React asks
  // for state that follows a prop, rather than in an effect a frame late.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTyped(false);
  }
  const held = guardOutside || typed;
  const keep = held ? (event: Event) => event.preventDefault() : undefined;

  // The trigger stands OUTSIDE the two faces. Inside them it was a Radix
  // Trigger of the Dialog on the server and of the Drawer a moment after
  // hydration, and the swap replaced the button under a finger already on it:
  // a press in that moment opened nothing (three gates, a phone width each,
  // §5 #127). A plain button that sets `open` is the same to a screen reader
  // and cannot be swapped away; focus still returns to it on close, because
  // both faces remember what was focused when they opened.
  const openerRef = useRef<HTMLElement>(null);
  // Resolved first, as every trigger in the kit resolves its child: a button
  // built in a server component — the drawer's own "Add contact" — crosses to
  // the client as a lazy wrapper, and a raw Slot throws on it whenever the
  // chunk has not landed yet, which under a loaded gate was one drawer in two
  // hundred, in one locale (use-slot-child.ts).
  const openerChild = useSlotChild(trigger);
  const opener = openerChild ? (
    <Slot.Root
      ref={openerRef}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => onOpenChange(true)}
    >
      {openerChild}
    </Slot.Root>
  ) : null;
  // Radix hands focus back to ITS trigger on close and to nothing when there is
  // none; the opener is ours, so the hand-back is too (keyboard, DESIGN §5).
  const backToOpener = (event: Event) => {
    if (!openerRef.current) return;
    event.preventDefault();
    openerRef.current.focus();
  };
  // The first line OF the description, not a paragraph between it and the
  // title: Radix wires only those two to the dialog, and a screen reader heard
  // "Issue Q-12" and the sentence and never whose it was (D98).
  const contextLine = context ? (
    <span data-slot="dialog-context" className="block text-sm font-medium text-foreground">
      <bdi>{context}</bdi>
    </span>
  ) : null;

  if (phone) {
    return (
      // `handleOnly` with no handle rendered is "no dragging": vaul has no
      // per-gesture switch, and `dismissible` would take Escape with it.
      <>
        {opener}
        <Drawer open={open} onOpenChange={onOpenChange} handleOnly={held}>
        {/* vaul reads `onPointerDownOutside` first and stops when it is
            prevented; Radix's `onInteractOutside` never gets the chance. */}
        <DrawerContent
          // The kit's own cap is 80vh and outranks a plain class; 88, like the
          // company drawer, and dvh so the phone's bars are counted. Important
          // because the kit's rule is an attribute selector.
          className="max-h-[88dvh]!"
          // The kit hides its handle while the sheet is held: a pill that
          // invites a swipe the sheet will not answer is a lie.
          data-drag={held ? "off" : "on"}
          onPointerDownOutside={keep}
          onCloseAutoFocus={backToOpener}
        >
          {/* The kit centres a bottom sheet's header; a form reads better
              aligned with its own fields. */}
          <DrawerHeader className="gap-1 p-4 pb-3 text-start!">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              {contextLine}
              {description}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col" onInput={() => setTyped(true)}>
            {children}
          </div>
        </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {opener}
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-lg"
        onInteractOutside={keep}
        onCloseAutoFocus={backToOpener}
      >
        {/* pe-12 keeps the title clear of the close button in both directions. */}
        <DialogHeader className="gap-1 p-4 pb-3 pe-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {contextLine}
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col" onInput={() => setTyped(true)}>
          {children}
        </div>
      </DialogContent>
      </Dialog>
    </>
  );
}

/** What the body shows while the dropdown lists are on their way (DESIGN §2). */
export function DialogFormSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 px-4 pb-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
