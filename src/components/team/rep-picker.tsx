"use client";

import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { useRouter } from "@/i18n/navigation";

/**
 * Whose figures the metrics tab is showing (D152).
 *
 * The manager reads the floor's numbers and then asks the only question that
 * follows: whose. He could already drill into a rep's companies from the team
 * table, and `?rep=` is the parameter that does it (src/app/companies) — so
 * this is the same parameter on the same kind of screen rather than a second
 * way of saying "this person", and a link works whichever screen it was copied
 * from.
 *
 * It scopes the WHOLE tab and not one card on it. A picker that changes half a
 * screen is a picker nobody trusts, and two cards measuring two different
 * people is the same defect as two cards measuring two different windows.
 *
 * A dropdown rather than a row of chips: fourteen names is a wrapping row that
 * pushes the figures under the fold, which is the complaint the tabs were drawn
 * for in the first place. It navigates rather than filtering in place, because
 * the answer is a place — the address carries who and what window, and a
 * manager can send it.
 */
export function RepPicker({
  value,
  options,
  hrefs,
}: {
  /** The rep being read, or "" for the whole floor. */
  value: string;
  options: { value: string; label: string }[];
  /** Where each choice lives, keyed by its value: the page owns the address. */
  hrefs: Record<string, string>;
}) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* A dropdown reading "The whole team" says what it is SET to and not what
          it changes; on a screen of figures that could be read as one of them.
          The label answers it in two words and gives the control its accessible
          name at the same time. */}
      <span id="rep-picker" className="text-xs text-muted-foreground">
        {t("team.whose")}
      </span>
      <SearchableSelect
        id="rep-picker-select"
        /* Both ids, and the second is the control's own: `aria-labelledby`
           REPLACES an element's content rather than adding to it, so naming it
           by the label alone announced "Whose figures, combobox" and never the
           person it was set to. Naming it by the label and itself gives a
           screen reader both halves, in that order. */
        aria-labelledby="rep-picker rep-picker-select"
        value={value}
        onChange={(next) => {
          const href = hrefs[next];
          if (href) router.push(href);
        }}
        options={options}
        placeholder={t("team.everybody")}
        searchPlaceholder={t("forms.searchList")}
        emptyText={t("forms.noMatch")}
        className="w-full sm:w-56"
      />
    </div>
  );
}
