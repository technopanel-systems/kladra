"use client";

import { Archive } from "lucide-react";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { archiveCompanyAction } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Button } from "@/components/ui/button";
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
 * Afterwards the drawer has nothing left to show, so this navigates back to the
 * plain list rather than refreshing into a company that is no longer in it.
 */
export function ArchiveCompanyDialog({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [reason, setReason] = useState("");

  return (
    <ConfirmDialog
      onOpenChange={(open) => {
        if (open) setReason("");
      }}
      trigger={
        <Button variant="ghost" className="text-muted-foreground">
          <Archive aria-hidden="true" />
          {t("drawer.archive")}
        </Button>
      }
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
      <div className="flex flex-col gap-1.5">
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
