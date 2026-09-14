"use client";

import { Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { DuplicateHit } from "@/actions/forms";
import { Prose } from "@/components/ui-ext/prose";
import { Link } from "@/i18n/navigation";
import { formatDay } from "@/lib/dates";
import { TONE_CLASS } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * "Looks like a company already on file" — on the lead form, exactly as Add
 * company says it (SPEC D8, D158; P13: "duplicate warnings as Add company has
 * them").
 *
 * The same sentences from the same keys, over the same read
 * (`duplicateCheckAction`): a live match names the company and who holds it,
 * where it is and when it was last worked; an archived one says when it left
 * and why (D109). It never blocks the save (S15) — a lead filed onto a number
 * somebody already holds is flagged for the manager by the action itself.
 *
 * Its own component because the lead form draws its own fields (it has no notes
 * box, which the shared company and contact fields always carry). Add company
 * draws the same warning inline; the two are held to one another by their keys.
 */
export function DuplicateWarning({ hit }: { hit: DuplicateHit }) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div
      role="status"
      data-slot="duplicate-warning"
      className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-xs", TONE_CLASS.wait)}
    >
      <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        {hit.archived ? (
          <span>
            {t("forms.duplicateArchived", {
              name: hit.name,
              rep: hit.rep,
              date: formatDay(hit.archived.on, locale),
            })}
          </span>
        ) : (
          <>
            <span>{t("forms.duplicateCompany", { name: hit.name, rep: hit.rep })}</span>
            {/* A city NAME beside a sentence, each its own run with a dot
                between them (rules/words.md). */}
            <span className="opacity-80">
              {hit.city ? (
                <>
                  <bdi>{hit.city}</bdi>
                  {" · "}
                </>
              ) : null}
              <bdi>
                {hit.lastActivityOn
                  ? t("forms.duplicateLastActivity", {
                      date: formatDay(hit.lastActivityOn, locale),
                    })
                  : t("forms.duplicateNeverContacted")}
              </bdi>
            </span>
          </>
        )}
        {hit.archived?.reason ? (
          <Prose line text={hit.archived.reason} className="opacity-80" />
        ) : null}
        {/* A door only onto the asker's own floor (D121, S8). Marketing rarely
            holds the match, and when it does the drawer opens over the form. */}
        {hit.mine ? (
          <Link
            href={`/companies?open=${hit.id}`}
            scroll={false}
            data-slot="open-match"
            className="w-fit underline underline-offset-2 hover:text-foreground"
          >
            {t("forms.openMatch", { name: hit.name })}
          </Link>
        ) : null}
      </span>
    </div>
  );
}
