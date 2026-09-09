"use client";

import { MessageCircle, Phone as PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const link = cn(
    "touch relative z-10 inline-flex items-center gap-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    chip
      ? "rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface"
      : "rounded-sm text-muted-foreground transition-colors hover:text-foreground hover:underline",
  );
  const icon = chip ? "size-3.5 shrink-0" : "size-3 shrink-0";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" className={link}>
        <MessageCircle aria-hidden="true" className={icon} />
        <Ref>{formatPhone(phone)}</Ref>
        {/* The number is the visible label, so it stays IN the accessible name
            and this extends it (DESIGN §5). */}
        <span className="sr-only">{t("companies.whatsappContact", { name })}</span>
      </a>
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
