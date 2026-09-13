"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { KIND_ICON, KINDS } from "@/components/activities/kinds";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { useRouter } from "@/i18n/navigation";
import { reportsHref, type ReportQuery } from "@/lib/report-view";

/**
 * What a list of reports is narrowed by (SPEC §3 P13, 13.8): what happened,
 * what came of it, which customer — and, on the manager's screen, whose.
 *
 * All of it is in the address (D145), so a manager can send "Faisal's calls
 * that reached nobody" as a link. The two short closed lists are chips in the
 * one chip row the app has; the two long open ones — customers and people —
 * are the searchable picker every other long list in the app is (DESIGN §2),
 * each with its "all" as an answer that can be given again.
 *
 * Pressing a chip that is already pressed lets go of it, which is what a person
 * pressing it a second time means.
 */
const ALL = "__all__";

export function ReportFilters({
  query,
  outcomes,
  companies,
  people,
}: {
  query: ReportQuery;
  outcomes: readonly { id: number; name: string }[];
  companies: readonly SelectOption[];
  /** The people the manager can read, or null on a screen that is one person's. */
  people: readonly SelectOption[] | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));

  return (
    <div data-slot="report-filters" className="flex flex-col gap-3">
      <div role="group" aria-label={t("reports.dialog.kind")}>
        <FilterRow
          all={
            <FilterChip href={reportsHref(query, { kind: null })} active={query.kind === null}>
              {t("common.all")}
            </FilterChip>
          }
        >
          {KINDS.map((kind) => {
            const Icon = KIND_ICON[kind];
            const active = query.kind === kind;
            return (
              <FilterChip
                key={kind}
                href={reportsHref(query, { kind: active ? null : kind })}
                active={active}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {t(`common.${kind}`)}
              </FilterChip>
            );
          })}
        </FilterRow>
      </div>

      <div role="group" aria-label={t("reports.dialog.outcome")}>
        <FilterRow
          all={
            <FilterChip
              href={reportsHref(query, { outcome: null })}
              active={query.outcome === null}
            >
              {t("common.all")}
            </FilterChip>
          }
        >
          {outcomes.map((outcome) => {
            const active = query.outcome === outcome.id;
            return (
              <FilterChip
                key={outcome.id}
                href={reportsHref(query, { outcome: active ? null : outcome.id })}
                active={active}
              >
                <bdi>{outcome.name}</bdi>
              </FilterChip>
            );
          })}
        </FilterRow>
      </div>

      <div className="grid gap-2 sm:max-w-2xl sm:grid-cols-2">
        {people ? (
          <div className="flex flex-col gap-1">
            <span id="report-filter-person" className="text-xs text-muted-foreground">
              {t("reports.person")}
            </span>
            <SearchableSelect
              aria-labelledby="report-filter-person"
              options={[{ value: ALL, label: t("reports.everyone") }, ...people]}
              value={query.person ?? ALL}
              onChange={(value) =>
                go(reportsHref(query, { person: value === ALL ? null : value, month: null, day: null }))
              }
              placeholder={t("reports.everyone")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span id="report-filter-company" className="text-xs text-muted-foreground">
            {t("common.company")}
          </span>
          <SearchableSelect
            aria-labelledby="report-filter-company"
            options={[{ value: ALL, label: t("reports.allCompanies") }, ...companies]}
            value={query.company ?? ALL}
            onChange={(value) => go(reportsHref(query, { company: value === ALL ? null : value }))}
            placeholder={t("reports.allCompanies")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("reports.noCompanies")}
          />
        </div>
      </div>
    </div>
  );
}
