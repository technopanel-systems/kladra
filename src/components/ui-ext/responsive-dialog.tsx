"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One dialog that is a bottom sheet on a phone (DESIGN §2 — "on a phone the
 * sidebar is a bottom bar and dialogs are bottom sheets; the thumb reaches the
 * bottom"). Everything the forms need is the same on both: a title, a
 * description a screen reader announces, and a body that scrolls with a footer
 * pinned under it.
 *
 * The switch is a media query read through `useSyncExternalStore`, so the server
 * and the browser's first render agree (both say "not a phone") and the swap
 * happens after hydration, while the thing is still closed and nothing is on
 * screen to flicker.
 */

const PHONE = "(max-width: 640px)";

let query: MediaQueryList | null = null;
function media(): MediaQueryList {
  if (query === null) query = window.matchMedia(PHONE);
  return query;
}
function subscribe(onChange: () => void): () => void {
  const list = media();
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}
const readWidth = () => media().matches;
const onTheServer = () => false;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, readWidth, onTheServer);
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const phone = useIsPhone();

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[92dvh]">
          {/* The kit centres a bottom sheet's header; a form reads better
              aligned with its own fields. */}
          <DrawerHeader className="gap-1 p-4 pb-3 text-start!">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-lg">
        {/* pe-8 keeps the title clear of the close button in both directions. */}
        <DialogHeader className="gap-1 p-4 pb-3 pe-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </DialogContent>
    </Dialog>
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
