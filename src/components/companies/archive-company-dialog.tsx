"use client";

import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { archiveCompanyAction } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * Archive, never delete (SPEC §3, S16). The company leaves every list and its
 * history stays, so a customer who resurfaces in two years still shows what
 * happened last time; an admin can put it back.
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

  return (
    <ConfirmDialog
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
      onConfirm={() => archiveCompanyAction(companyId)}
      onDone={() => {
        router.push("/companies");
        router.refresh();
      }}
    />
  );
}
