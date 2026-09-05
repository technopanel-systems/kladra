"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { archiveActivityAction } from "@/actions/activities";
import { LogDialog, type LogContact, type LogEdit, type LogProject } from "./log-dialog";
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
  companyName,
  contacts,
  projects,
  dayOpen,
}: {
  entry: LogEdit;
  companyId: string;
  companyName?: string;
  contacts: readonly LogContact[];
  projects: readonly LogProject[];
  /** Its day is still open, so the words can still be changed (D58, D70). */
  dayOpen: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <span className="flex items-center gap-1">
      {dayOpen ? (
        <LogDialog
          companyId={companyId}
          companyName={companyName}
          contacts={contacts}
          projects={projects}
          entry={entry}
          trigger={
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              {t("drawer.correct")}
            </Button>
          }
        />
      ) : null}

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
