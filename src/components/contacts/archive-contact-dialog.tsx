"use client";

import { useTranslations } from "next-intl";
import { archiveContactAction } from "@/actions/contacts";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
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
 */
export function ArchiveContactDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title={t("drawer.archiveContactTitle", { name: contactName })}
      description={t("drawer.archiveContactWarning")}
      confirmLabel={t("drawer.archive")}
      successMessage={t("drawer.archived", { name: contactName })}
      onConfirm={() => archiveContactAction(contactId)}
      onDone={() => router.refresh()}
    />
  );
}
