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
 * Afterwards the drawer has nothing left to show, so this navigates back to the
 * plain list rather than refreshing into a company that is no longer in it.
 */
export function ArchiveCompanyDialog({
  companyId,
  companyName,
  open,
  onOpenChange,
}: {
  companyId: string;
  companyName: string;
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
      title={t("drawer.archiveTitle", { name: companyName })}
      description={t("drawer.archiveWarning")}
      confirmLabel={t("drawer.archive")}
      successMessage={t("drawer.archived", { name: companyName })}
      onConfirm={() => archiveCompanyAction(companyId, reason)}
      onDone={() => {
        router.push("/companies");
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
