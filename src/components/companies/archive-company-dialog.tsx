"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { archiveCompanyAction } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";

/**
 * Archive, never delete (SPEC §3, S16). The company leaves every list and its
 * history stays, so a customer who resurfaces in two years still shows what
 * happened last time; an admin can put it back.
 *
 * It asks why (S16, D87). The answer is kept on the company and in the audit
 * line, and the admin's archive screen shows it under the name — which is what
 * "the record shows why someone gave up on it" means two years later.
 *
 * Opened from the last item of the drawer's menu, behind its divider, so the
 * drawer hosts it (P13-G6): a menu item is gone the moment the menu closes and
 * cannot own a trigger. The confirm button is in the destructive tint, never
 * the brand, and Cancel is beside it.
 *
 * And the same button is two different acts depending on who presses it (P14
 * 14.8). A rep ASKS: the title, the warning, the button and the toast all say
 * so, and the customer stays exactly where he is until the sales manager
 * answers — so that press refreshes the list he is already on and the notice at
 * the top of the drawer is what he sees appear. Navigating him back to
 * `/companies` would have closed the drawer on a company still in it and told
 * him the opposite of what happened. The sales manager and the admin archive at
 * once, and for them nothing about the wording changes and the drawer has
 * nothing left to show, so that press goes back to the plain list rather than
 * refreshing into a company that is no longer in it. Which of the two it is
 * belongs to `answersArchiveRequests`, read on the server and handed down as
 * `asks`, so the button never promises what the action refuses.
 */
export function ArchiveCompanyDialog({
  companyId,
  companyName,
  asks,
  open,
  onOpenChange,
}: {
  companyId: string;
  companyName: string;
  /** Whether pressing it files a request rather than archiving the customer. */
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
      destructive
      onOpenChange={onOpenChange}
      title={t(asks ? "drawer.requestArchiveTitle" : "drawer.archiveTitle", {
        name: companyName,
      })}
      description={t(asks ? "drawer.requestArchiveWarning" : "drawer.archiveWarning")}
      confirmLabel={t(asks ? "drawer.requestArchive" : "drawer.archive")}
      successMessage={t(asks ? "drawer.archiveAsked" : "drawer.archived", { name: companyName })}
      onConfirm={() => archiveCompanyAction(companyId, reason)}
      onDone={() => {
        // An asking leaves the customer on the list, so the drawer stays open
        // on him and the notice he has just raised is what arrives.
        if (!asks) router.push("/companies");
        router.refresh();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-reason`}>{t("drawer.archiveReason")}</Label>
        <Textarea
          id={`${ids}-reason`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("drawer.archiveReasonPlaceholder")}
        />
      </div>
    </ConfirmDialog>
  );
}
