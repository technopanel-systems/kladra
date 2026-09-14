"use client";

import { useTranslations } from "next-intl";
import { archiveProjectAction } from "@/actions/projects";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { useRouter } from "@/i18n/navigation";

/**
 * Archive a project (SPEC §3, S16) — and it is NOT "mark lost".
 *
 * Lost is a judgement about the customer: it carries a reason, it belongs in
 * the record, and the project stays visible with that reason on it (S20).
 * Archiving is tidying — a duplicate, a typo, a job that was never real — and
 * the row simply goes. Two different acts, and the warning here says which one
 * this is so nobody uses it to close a real job.
 *
 * Hosted by the drawer, whose menu holds it (P13-G6); the confirm button is in
 * the tint, because the act takes the row off every list.
 */
export function ArchiveProjectDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  onArchived,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project drawer closes itself once its project is off the list. */
  onArchived?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
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
