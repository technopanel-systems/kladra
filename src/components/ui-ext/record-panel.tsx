"use client";

import type { ComponentProps, ReactNode } from "react";
import { useLocale } from "next-intl";
import { SheetContent } from "@/components/ui/sheet";
import { focusTheDrawerItself } from "@/components/ui-ext/drawer-focus";
import { useIsPhone } from "@/hooks/use-is-phone";
import { cn } from "@/lib/utils";

/**
 * The panel a record opens in, written once (DESIGN §6, P12-14).
 *
 * Work happens in a drawer over the list (DESIGN §2), and four screens drew
 * that drawer themselves. They agreed about none of it. A company came in at
 * 32rem, a project at 36rem and a quotation at 42rem, so the surface changed
 * size as a rep walked one job from the customer to the paper — a panel that
 * resizes says these are different KINDS of thing, when they are all "the
 * record beside its list". They are one width now, the widest of the three,
 * because the quotation's line table is what actually needs the room.
 *
 * Two defects came out of the same drift. The skeleton that stands in while a
 * drawer's query runs was pinned to `side="right"` on two screens, so in Arabic
 * the loading panel slid in from the right and the record replacing it arrived
 * from the left — the same panel, on the other side of the screen, half a
 * second apart. And the border: a drawer's edge should be the one FACING the
 * page, which is the inline-start edge in both languages, because the drawer
 * always comes from the inline-end one. Three of the four bordered the outer
 * edge in Arabic, where nothing can see it.
 *
 * `phoneSheet` is the company drawer's own rule and nobody else's (D128): it
 * becomes a bottom sheet on a phone, on the same line the shell and every form
 * change on. The other three stay full-screen panels there, which is what a
 * line table wants on 375 pixels.
 */
export function RecordPanel({
  className,
  phoneSheet = false,
  children,
  ...props
}: Omit<ComponentProps<typeof SheetContent>, "side"> & {
  /** Bottom sheet below the phone line instead of a full-screen panel. */
  phoneSheet?: boolean;
  children: ReactNode;
}) {
  const locale = useLocale();
  const phone = useIsPhone();

  // Radix's sides are physical, so Arabic takes the mirror image: the drawer
  // still slides in from the end of the line, which is the left in Arabic.
  const bottom = phoneSheet && phone;
  const side = bottom ? "bottom" : locale === "ar" ? "left" : "right";

  return (
    <SheetContent
      onOpenAutoFocus={focusTheDrawerItself}
      side={side}
      className={cn(
        "gap-0 p-0",
        bottom
          ? "max-h-[88svh] rounded-t-xl pb-[env(safe-area-inset-bottom)]"
          : "sm:max-w-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </SheetContent>
  );
}
