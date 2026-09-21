"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Inside a Link: a small mark that appears once the click has been taken and
 * the screen has not yet answered (DESIGN §2: loading states always; never a
 * blank). A row that opens a drawer, a filter chip, a view switch and a board
 * card are all navigations to a search parameter, and between the click and
 * the streamed answer nothing on the page used to change — on a slow phone,
 * long enough to press again (P11G).
 *
 * It stays invisible for the first 150 ms (`link-pending` in globals.css), so
 * an answer that comes fast shows nothing at all. The glyph is the one loop
 * the app allows itself, because it says "working" rather than decorating;
 * under reduced motion the loop stops and the glyph stays.
 *
 * `useLinkStatus` is the one thing imported from next/link directly: it reads
 * the Link it sits in and carries no URL, so the locale prefix (H5) is not its
 * business.
 *
 * What a screen reader hears is said by `LinkPendingAnnouncer` below, not
 * here: this mark only tells it how many presses are waiting.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    waiting += 1;
    tell();
    return () => {
      waiting -= 1;
      tell();
    };
  }, [pending]);

  return pending ? (
    <span aria-hidden="true" data-slot="link-pending" className={cn("link-pending", className)}>
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
    </span>
  ) : null;
}

/**
 * The one live region every pressed link speaks through: "Loading…" while any
 * answer is out, nothing otherwise. A screen reader hears that the press was
 * taken, which the glyph alone would not tell it. It is mounted once, in the
 * root layout beside the toasts, so it is there before it speaks — a live
 * region added and filled in the same breath is not reliably read.
 *
 * It lived inside every link until P14.5, and that is what the drawers' first
 * axe reading found. A drawer is a modal Radix dialog, which hides the page
 * behind it from a screen reader with `aria-hidden` (the `aria-hidden`
 * package's `hideOthers`) — except every `[aria-live]` element, and every
 * ancestor of one, which it leaves exposed so a toast is still heard over a
 * dialog. With a live region in each row's door, each door stayed exposed
 * while the words inside it were hidden: behind an open drawer the list read
 * as forty links with no name. Here, a direct child of `<body>`, it keeps
 * nothing exposed but itself.
 */
export function LinkPendingAnnouncer() {
  const busy = useSyncExternalStore(subscribe, isWaiting, nothingWaitsOnTheServer);
  const t = useTranslations("common");
  return (
    <span aria-live="polite" className="sr-only">
      {busy ? t("loading") : ""}
    </span>
  );
}

// How many pressed links are waiting for their answer, and who wants to know.
// A count rather than a flag: one link's answer landing must not silence
// another's that is still out.
let waiting = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function tell(): void {
  for (const listener of listeners) listener();
}

function isWaiting(): boolean {
  return waiting > 0;
}

function nothingWaitsOnTheServer(): boolean {
  return false;
}
