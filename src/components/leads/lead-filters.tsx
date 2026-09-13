"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { leadsHref, type LeadQuery } from "@/components/leads/lead-view";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { useRouter } from "@/i18n/navigation";

/**
 * What the leads list is narrowed by (SPEC §3 P13): whether the person it was
 * given to has acknowledged it, and who that person is.
 *
 * Both in the address (D145), built by `leadsHref` so choosing one keeps the
 * other. The state is two chips and All, in the one chip row the app has; the
 * person is the searchable picker every long list of people is (DESIGN §2),
 * with "everyone" as an answer that can be given again. Pressing a chip that is
 * already pressed lets go of it.
 */
const ALL = "__all__";

export function LeadFilters({
  query,
  people,
}: {
  query: LeadQuery;
  /** Everybody a lead can sit with, in the reader's script. */
  people: readonly SelectOption[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));

  return (
    <div data-slot="lead-filters" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
      <div role="group" aria-label={t("leads.state")}>
        <FilterRow
          all={
            <FilterChip href={leadsHref(query, { state: null })} active={query.state === null}>
              {t("common.all")}
            </FilterChip>
          }
        >
          <FilterChip
            href={leadsHref(query, { state: query.state === "waiting" ? null : "waiting" })}
            active={query.state === "waiting"}
          >
            {t("leads.notAcknowledged")}
          </FilterChip>
          <FilterChip
            href={leadsHref(query, {
              state: query.state === "acknowledged" ? null : "acknowledged",
            })}
            active={query.state === "acknowledged"}
          >
            {t("leads.acknowledged")}
          </FilterChip>
        </FilterRow>
      </div>

      <div className="flex w-full flex-col gap-1 sm:w-64">
        <span id="lead-filter-with" className="text-xs text-muted-foreground">
          {t("leads.with")}
        </span>
        <SearchableSelect
          aria-labelledby="lead-filter-with"
          options={[{ value: ALL, label: t("leads.everyone") }, ...people]}
          value={query.with ?? ALL}
          onChange={(value) => go(leadsHref(query, { with: value === ALL ? null : value }))}
          placeholder={t("leads.everyone")}
          searchPlaceholder={t("forms.searchList")}
          emptyText={t("forms.noMatch")}
        />
      </div>
    </div>
  );
}
