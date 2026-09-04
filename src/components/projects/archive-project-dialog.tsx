"use client";

import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { archiveProjectAction } from "@/actions/projects";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * Archive a project (SPEC §3, S16) — and it is NOT "mark lost".
 *
 * Lost is a judgement about the customer: it carries a reason, it belongs in
 * the record, and the project stays visible with that reason on it (S20).
 * Archiving is tidying — a duplicate, a typo, a job that was never real — and
 * the row simply goes. Two different acts, two different buttons, and the
 * warning here says which one this is so nobody uses it to close a real job.
 */
export function ArchiveProjectDialog({
  projectId,
  projectName,
  onArchived,
}: {
  projectId: string;
  projectName: string;
  /** The project drawer closes itself; the company drawer just re-reads. */
  onArchived?: () => void;
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
      title={t("drawer.archiveProjectTitle", { name: projectName })}
      description={t("drawer.archiveProjectWarning")}
      confirmLabel={t("drawer.archive")}
      successMessage={t("drawer.archived", { name: projectName })}
      onConfirm={() => archiveProjectAction(projectId)}
      onDone={() => {
        onArchived?.();
        router.refresh();
      }}
    />
  );
}
