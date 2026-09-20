"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { archiveContactAction } from "@/actions/contacts";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";

/**
 * Archive a contact (SPEC §3, S16). The person leaves the drawer and the
 * duplicate check and stays on every activity they were named in, so a visit
 * logged two years ago still says who the rep met.
 *
 * Last in the contact's menu, behind its divider, in the tint (P13-G6): a rep
 * archives a contact perhaps twice a year, when someone leaves the customer,
 * and it sat as a button beside Edit on every card. The list hosts it, so it
 * has no trigger of its own.
 *
 * It asks why, since P14 14.8, and the answer is mandatory. This was the one
 * archive of the three that asked for nothing at all — a company was asked and
 * a person was not — and a request the sales manager cannot read the reason for
 * is a request he cannot answer. The same sentence is what the archive screen
 * reads back two years later.
 *
 * And the same button is two different acts depending on who presses it (14.8).
 * A rep ASKS: the title, the warning, the button and the toast all say so, and
 * the person stays on the card until somebody answers — which is why both acts
 * end in a refresh here and neither goes anywhere: the card is already on the
 * screen, and what changes on it is the notice appearing under his details. The
 * sales manager and the admin archive at once, and for them nothing about the
 * wording changes. Which of the two it is belongs to `answersArchiveRequests`,
 * read on the server and handed down as `asks`, so the button never promises
 * what the action refuses.
 */
export function ArchiveContactDialog({
  contactId,
  contactName,
  asks,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  /** Whether pressing it files a request rather than archiving the person. */
  asks: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [reason, setReason] = useState("");
  // A fresh box on every opening — adjusted while rendering, the way React asks
  // for state that follows a prop, so the last reason never flashes back in.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title={t(asks ? "drawer.requestArchiveTitle" : "drawer.archiveContactTitle", {
        name: contactName,
      })}
      description={t(asks ? "drawer.requestArchiveWarning" : "drawer.archiveContactWarning")}
      confirmLabel={t(asks ? "drawer.requestArchive" : "drawer.archive")}
      successMessage={t(asks ? "drawer.archiveAsked" : "drawer.archived", { name: contactName })}
      onConfirm={() => archiveContactAction(contactId, reason)}
      onDone={() => router.refresh()}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-reason`}>{t("drawer.archiveReason")}</Label>
        <Textarea
          id={`${ids}-reason`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("drawer.archiveReasonContactPlaceholder")}
        />
      </div>
    </ConfirmDialog>
  );
}
