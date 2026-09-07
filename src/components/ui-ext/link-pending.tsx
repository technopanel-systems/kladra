"use client";

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
 * The live region is always in the link and only ever says "Loading…" while
 * the answer is out: a screen reader hears that the press was taken, which the
 * glyph alone would not tell it. It is there before it speaks, because a live
 * region added and filled in the same breath is not reliably read.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  const t = useTranslations("common");
  return (
    <>
      <span aria-live="polite" className="sr-only">
        {pending ? t("loading") : ""}
      </span>
      {pending ? (
        <span aria-hidden="true" data-slot="link-pending" className={cn("link-pending", className)}>
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        </span>
      ) : null}
    </>
  );
}
