"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { archiveProjectAction } from "@/actions/projects";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 * It asks why, since P14 14.8, and the answer is mandatory: a job leaving the
 * floor is a decision about a customer's work, and the sales manager cannot
 * answer a request that does not say what it is for. The same sentence is what
 * the archive screen reads back two years later.
 *
 * And the same button is two different acts depending on who presses it (14.8).
 * A rep ASKS: the title, the warning and the toast all say so, and the job stays
 * exactly where it is until somebody answers — so this refreshes into the
 * project he is looking at rather than navigating away from it, and the notice
 * at the top of the drawer is what he sees appear. The sales manager and the
 * admin archive at once, and for them nothing about the wording changes. Which
 * of the two it is belongs to `answersArchiveRequests`, read on the server and
 * handed down as `asks`, so the button never promises what the action refuses.
 *
 * Hosted by the drawer, whose menu holds it (P13-G6); the confirm button is in
 * the tint, because the act takes the row off every list.
 */
export function ArchiveProjectDialog({
  projectId,
  projectName,
  asks,
  open,
  onOpenChange,
  onArchived,
}: {
  projectId: string;
  projectName: string;
  /** Whether pressing it files a request rather than archiving the job. */
  asks: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project drawer closes itself once its project is off the list. */
  onArchived?: () => void;
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
      title={t(asks ? "drawer.requestArchiveTitle" : "drawer.archiveProjectTitle", {
        name: projectName,
      })}
      description={t(asks ? "drawer.requestArchiveWarning" : "drawer.archiveProjectWarning")}
      confirmLabel={t(asks ? "drawer.requestArchive" : "drawer.archive")}
      successMessage={t(asks ? "drawer.archiveAsked" : "drawer.archived", { name: projectName })}
      onConfirm={() => archiveProjectAction(projectId, reason)}
      onDone={() => {
        // A request leaves the job on the list, so the drawer stays open on it.
        if (!asks) onArchived?.();
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
          placeholder={t("drawer.archiveReasonProjectPlaceholder")}
        />
      </div>
    </ConfirmDialog>
  );
}
