"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useSlotChild } from "@/components/ui/use-slot-child"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const children = useSlotChild(props.children)
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  )
}

/**
 * A wheel inside a popover belongs to the popover (P14, 14F).
 *
 * "Dropdowns open now but scroll badly" was the founder's third round, and the
 * cause is the page's scroll lock. A dialog locks scrolling with
 * `react-remove-scroll`, which listens for `wheel` on the DOCUMENT and cancels
 * any that did not start inside the dialog's own subtree. A popover is
 * portalled to the body, so a long list inside a dialog — every country, every
 * customer — was one the wheel did nothing to at all.
 *
 * The listener is on `document` and it does not capture, so an event stopped at
 * the popover never reaches it, and the browser scrolls the list as it would
 * anywhere else. Nothing is prevented here: the event is simply not the page's
 * business.
 *
 * Native, not React's `onWheel`: the popover is portalled outside the app's
 * root, and only a listener on the element itself is certain to run before the
 * document's.
 */
function useOwnWheel() {
  return React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const keep = (event: Event) => event.stopPropagation();
    node.setAttribute("data-own-wheel", "true");
    node.addEventListener("wheel", keep, { passive: true });
    node.addEventListener("touchmove", keep, { passive: true });
    return () => {
      node.removeEventListener("wheel", keep);
      node.removeEventListener("touchmove", keep);
    };
  }, []);
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const own = useOwnWheel();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={own}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "motion-float z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md border border-line outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
