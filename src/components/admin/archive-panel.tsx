"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { restoreAction } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";
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
 * A contact or a project comes back onto its company, and only if the company
 * is on the floor: restored under an archived company it would sit on a row
 * that appears on no list, which is the same disappearance by another route.
 * It used to drag the company back with it instead — a company archived on
 * purpose was on the floor again because of a stray contact (D92). Such a row
 * shows the sentence and no button: no work a screen offers that the action
 * would refuse (DESIGN §5).
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
          className="card-face flex flex-wrap items-start gap-3 p-3"
        >
          <Badge variant="secondary">{t(`admin.kind.${row.kind}`)}</Badge>
          {/* Wide enough to read a name and its reason on a phone: below ten
              rems the date and the button wrap under it rather than squeeze it. */}
          <div className="flex min-w-[10rem] flex-1 flex-col">
            <span className="font-medium">{row.name}</span>
            <span className="text-xs text-muted-foreground">
              {/* Two names either side of a neutral separator: <bdi> keeps each
                  one's direction to itself, so an English project under an
                  Arabic company does not drag the · across (D46). */}
              {row.kind === "company" ? (
                row.repName
              ) : (
                <>
                  <bdi>{row.companyName}</bdi> · <bdi>{row.repName}</bdi>
                </>
              )}
            </span>
            {/* Why, in the words of whoever did it (S16, D87) — typed text, so
                it takes its own direction; under the name, where it is read. */}
            {row.reason ? (
              <Prose text={row.reason} className="text-xs text-muted-foreground" />
            ) : null}
          </div>
          <span className="flex flex-col text-xs text-muted-foreground">
            {t("admin.archivedOn")}
            <DayText day={row.archivedOn} locale={locale} />
          </span>
          {row.companyArchived ? (
            <span className="text-xs text-muted-foreground">
              {row.kind === "contact"
                ? t("admin.restoreCompanyFirstContact")
                : t("admin.restoreCompanyFirstProject")}
            </span>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  {t("admin.restore")}
                </Button>
              }
              title={t("admin.restoreTitle", { name: row.name })}
              description={
                row.kind === "company"
                  ? t("admin.restoreHint")
                  : row.kind === "contact"
                    ? t("admin.restoreHintContact")
                    : t("admin.restoreHintProject")
              }
              confirmLabel={t("admin.restore")}
              successMessage={t("admin.restored", { name: row.name })}
              onConfirm={() => send({ kind: row.kind, id: row.id })}
              onDone={refresh}
            />
          )}
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

