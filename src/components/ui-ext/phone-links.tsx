"use client";

import { Copy, MessageCircle, Phone as PhoneIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Ref } from "@/components/ui-ext/figures";
import { formatPhone, telHref, whatsappHref, type E164 } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * A phone number on screen is a message and a call (D98).
 *
 * One shape for the customer list, the drawer's contacts and the day's call
 * cards, which each drew their own WhatsApp link and none of them a call: the
 * number is the WhatsApp link and stays readable as itself, and the handset
 * beside it dials. A list called "Calls due" that could only message was
 * missing the verb in its own name.
 *
 * `chip` draws the pair as a card's raised control, above the card's own
 * stretched link; the plain shape sits in a table cell or a contact row.
 */

/** Long enough not to fire on a tap, short enough to feel deliberate. */
const HELD_MS = 500;

/** A press that travels this far is a scroll, not a hold. */
const SLIP_PX = 8;

export function PhoneLinks({
  name,
  phone,
  chip = false,
  className,
}: {
  /** Whose number, for the spoken label — the contact, or the company when it has none. */
  name: string;
  phone: E164;
  chip?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  /** A hold has already answered this press, so the tap after it must not. */
  const held = useRef(false);

  const readable = formatPhone(phone);

  function drop() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    from.current = null;
  }

  /*
   * Tapping opens WhatsApp; holding, or a secondary press, shows the number
   * (SPEC §3). The number is the label here, so what the hold really gives him
   * is a way to take it: a tap on a phone opens WhatsApp before any of it can
   * be selected, and the browser's own menu would have offered to copy the
   * wa.me address rather than the number in it.
   *
   * `contextmenu` covers three ways in at once — the right button, the trackpad's
   * two fingers, and the keyboard's own menu key, which is the reason this is
   * not bound to `mousedown`: a number a keyboard cannot reach is a number half
   * this floor cannot copy.
   */
  const reveal = {
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      drop();
      setOpen(true);
    },
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      held.current = false;
      from.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        held.current = true;
        setOpen(true);
      }, HELD_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const start = from.current;
      if (!start) return;
      if (Math.abs(event.clientX - start.x) > SLIP_PX) drop();
      else if (Math.abs(event.clientY - start.y) > SLIP_PX) drop();
    },
    onPointerUp: drop,
    onPointerCancel: drop,
    onClick: (event: React.MouseEvent) => {
      // The tap that ends a hold is the hold's, not WhatsApp's.
      if (!held.current) return;
      held.current = false;
      event.preventDefault();
    },
  };

  const link = cn(
    "touch relative z-10 inline-flex items-center gap-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    chip
      ? "rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface"
      : "rounded-sm text-muted-foreground transition-colors hover:text-foreground hover:underline",
  );
  const icon = chip ? "size-3.5 shrink-0" : "size-3 shrink-0";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <a
            ref={anchor}
            href={whatsappHref(phone)}
            target="_blank"
            rel="noopener noreferrer"
            // iOS answers a long press on a link with its own preview card,
            // which would arrive on top of this one.
            className={cn(link, "[-webkit-touch-callout:none]")}
            {...reveal}
          >
            <MessageCircle aria-hidden="true" className={icon} />
            <Ref>{readable}</Ref>
            {/* The number is the visible label, so it stays IN the accessible name
                and this extends it (DESIGN §5). */}
            <span className="sr-only">{t("companies.whatsappContact", { name })}</span>
          </a>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          className="w-auto min-w-56 gap-2"
          aria-label={t("companies.numberOf", { name })}
          // There is no trigger to hand the caret back to — the anchor is a
          // link, and Radix returns focus to a TRIGGER — so it is handed back
          // by name, and the hold ends where it started.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchor.current?.focus();
          }}
        >
          <Ref className="text-base font-medium tracking-wide">{readable}</Ref>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(readable);
                toast.success(t("common.numberCopied"));
              } catch {
                // A browser that refuses the clipboard leaves the number on
                // screen, where it can be read out or written down.
                toast.error(t("common.somethingWrong"));
              }
              setOpen(false);
            }}
          >
            <Copy aria-hidden="true" />
            {t("common.copyNumber")}
          </Button>
        </PopoverContent>
      </Popover>

      {/* A handset and nothing else: the number is already on the line, and
          the label says whom it calls. Padded to a thumb's width on a card. */}
      <a
        href={telHref(phone)}
        aria-label={t("companies.callContact", { name })}
        className={cn(link, "justify-center", chip ? "px-2.5" : "p-1")}
      >
        <PhoneIcon aria-hidden="true" className={icon} />
      </a>
    </span>
  );
}
