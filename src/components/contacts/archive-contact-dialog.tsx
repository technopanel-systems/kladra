"use client";

import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { archiveContactAction } from "@/actions/contacts";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * Archive a contact (SPEC §3, S16). The person leaves the drawer and the
 * duplicate check and stays on every activity they were named in, so a visit
 * logged two years ago still says who the rep met.
 *
 * Quiet, and last in the row: a rep archives a contact perhaps twice a year,
 * when someone leaves the customer.
 */
export function ArchiveContactDialog({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Archive aria-hidden="true" className="size-3.5" />
          {t("drawer.archive")}
        </Button>
      }
      title={t("drawer.archiveContactTitle", { name: contactName })}
      description={t("drawer.archiveContactWarning")}
      confirmLabel={t("drawer.archive")}
      successMessage={t("drawer.archived", { name: contactName })}
      onConfirm={() => archiveContactAction(contactId)}
      onDone={() => router.refresh()}
    />
  );
}
