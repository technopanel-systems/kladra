"use client";

import { useTranslations } from "next-intl";
import { unfileReportAction } from "@/actions/reports";
import { ReportButton, type ReportEdit } from "@/components/reports/report-dialog";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * The two corrections a person may make to their own report (SPEC D70).
 *
 * A client island rather than part of `ActivityList`'s markup: `ConfirmDialog`
 * takes a function prop, which cannot cross from a server component.
 *
 * Quiet on purpose, and at the end of the row. They appear only on reports the
 * reader wrote — a manager reads every rep's reports and may not touch them — so
 * a floor sees them on its own words and nowhere else.
 */
export function ActivityActions({
  entry,
  dayOpen,
}: {
  entry: ReportEdit;
  /** Its day is still open, so it can still be corrected or unfiled (D58, D70, D87). */
  dayOpen: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  // Both actions take the same window (D58, D70, D87): an entry that vanishes
  // from a reported day rewrites a figure the same way rewording it does.
  if (!dayOpen) return null;

  return (
    <span className="flex items-center gap-1">
      <ReportButton
        entry={entry}
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
      >
        {t("drawer.correct")}
      </ReportButton>

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
          return unfileReportAction(null, fields);
        }}
        onDone={() => router.refresh()}
      />
    </span>
  );
}
