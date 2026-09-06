"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { archiveActivityAction } from "@/actions/activities";
import { LogButton, type LogEdit } from "./log-dialog";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * The two corrections a person may make to their own entry (SPEC D70).
 *
 * A client island rather than part of `ActivityList`: the list renders on the
 * server inside the company drawer, and `ConfirmDialog` takes a function prop,
 * which cannot cross that boundary. Everything here is plain data.
 *
 * Quiet on purpose, and at the end of the row. They appear only on entries the
 * reader wrote — a manager reads every rep's log and may not touch it — so a
 * floor sees them on its own words and nowhere else.
 */
export function ActivityActions({
  entry,
  companyId,
  dayOpen,
}: {
  entry: LogEdit;
  companyId: string;
  /** Its day is still open, so it can still be corrected or unfiled (D58, D70, D87). */
  dayOpen: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  // Both actions take the same window (D58, D70, D87). Unfile used to be offered
  // on any day while the server refused only the correction; an entry that
  // vanishes from a reported day rewrites a figure the same way rewording it does.
  if (!dayOpen) return null;

  return (
    <span className="flex items-center gap-1">
      <LogButton
        companyId={companyId}
        entry={entry}
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
      >
        {t("drawer.correct")}
      </LogButton>

      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            {t("drawer.unfile")}
          </Button>
        }
        title={t("drawer.unfileTitle")}
        description={t("drawer.unfileWarning")}
        confirmLabel={t("drawer.unfile")}
        successMessage={t("drawer.unfiled")}
        onConfirm={() => {
          const fields = new FormData();
          fields.set("activityId", entry.id);
          return archiveActivityAction(null, fields);
        }}
        onDone={() => router.refresh()}
      />
    </span>
  );
}
