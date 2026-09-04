"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { restoreAction } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { DayText } from "@/components/ui-ext/day-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ArchivedRow } from "@/lib/admin";
import type { ActionResult } from "@/lib/types";

/**
 * Everything taken off the floor, and the way back (SPEC S16, D24).
 *
 * This screen is what makes "archive, never delete" true. Without it archiving
 * IS deleting with extra steps, which is the promise D24 makes to a rep who
 * presses Archive on the wrong row.
 *
 * Restoring a contact or a project brings its company back with it: putting one
 * back on an archived company would leave it on a row that appears on no list,
 * which is the same disappearance by another route.
 */
export function ArchivePanel({ rows }: { rows: ArchivedRow[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  if (rows.length === 0) {
    return (
      <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
        {t("admin.emptyArchive")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={`${row.kind}-${row.id}`}
          className="card-face flex flex-wrap items-center gap-3 p-3"
        >
          <Badge variant="secondary">{t(`admin.kind.${row.kind}`)}</Badge>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{row.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.kind === "company" ? row.repName : `${row.companyName} · ${row.repName}`}
            </span>
          </span>
          <span className="flex flex-col text-xs text-muted-foreground">
            {t("admin.archivedOn")}
            <DayText day={row.archivedOn} locale={locale} />
          </span>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                {t("admin.restore")}
              </Button>
            }
            title={t("admin.restoreTitle", { name: row.name })}
            description={
              row.kind === "company" ? t("admin.restoreHint") : t("admin.restoreHintInside")
            }
            confirmLabel={t("admin.restore")}
            successMessage={t("admin.restored", { name: row.name })}
            onConfirm={() => send({ kind: row.kind, id: row.id })}
            onDone={refresh}
          />
        </li>
      ))}
    </ul>
  );
}

function send(values: Record<string, string>): Promise<ActionResult<unknown>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return restoreAction(null, form);
}

