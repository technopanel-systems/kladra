"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FormLookups } from "@/actions/forms";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * A company's own fields, in the founder's order, shared by Add company and
 * Edit company the way ContactFields is shared by Add company and Add contact.
 *
 * One definition on purpose. Two copies of this form would drift the first time
 * a field moved, and the rep who learned the order in one dialog would have to
 * learn it again in the other.
 *
 * The field NAMES are fixed, not passed in: the create and update schemas in
 * `@/actions/companies` read the same seven, so a rename here that did not
 * reach both would be a silently ignored field rather than an error.
 *
 * Saudi Arabia picks its city from the seeded list; anywhere else the city is a
 * box to type in (SPEC §3). An empty city list is what tells the form to
 * switch, so it never has to carry a country code of its own.
 */

export type CompanyDraft = {
  name: string;
  categoryId: string;
  leadSourceId: string;
  countryId: string;
  cityId: string;
  cityText: string;
  notes: string;
};

/** What Add company opens on: Saudi Arabia and Riyadh, the answer nine times in ten. */
export function blankCompany(lookups: FormLookups): CompanyDraft {
  return {
    name: "",
    categoryId: "",
    leadSourceId: "",
    countryId: lookups.saudiCountry ?? "",
    cityId: lookups.defaultCity ?? "",
    cityText: "",
    notes: "",
  };
}

export function CompanyFields({
  idPrefix,
  lookups,
  value,
  onChange,
  errors,
  disabled,
  belowName,
}: {
  idPrefix: string;
  lookups: FormLookups;
  value: CompanyDraft;
  onChange: (patch: Partial<CompanyDraft>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** The duplicate warning, when the parent has one to show. */
  belowName?: ReactNode;
}) {
  const t = useTranslations();
  const id = (field: string) => `${idPrefix}-${field}`;
  const error = (field: string) => errors?.[field];

  const inSaudi = lookups.saudiCountry !== null && value.countryId === lookups.saudiCountry;

  function pickCountry(next: string) {
    // The picked city goes with the country it belonged to (SPEC §3): leaving
    // it behind would file a company in Dubai under Riyadh.
    if (lookups.saudiCountry !== null && next === lookups.saudiCountry) {
      onChange({ countryId: next, cityText: "", cityId: lookups.defaultCity ?? "" });
    } else {
      onChange({ countryId: next, cityId: "" });
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("name")}>
          {t("common.company")}
          <span aria-hidden="true" className="text-brand">
            *
          </span>
        </Label>
        <Input
          id={id("name")}
          name="name"
          required
          autoComplete="off"
          disabled={disabled}
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={t("forms.companyNamePlaceholder")}
          className="h-9"
          aria-invalid={error("name") ? true : undefined}
          aria-describedby={error("name") ? id("name-error") : undefined}
        />
        {error("name") ? (
          <p id={id("name-error")} role="alert" className="text-xs text-destructive">
            {error("name")}
          </p>
        ) : null}
        {belowName}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("category")}>{t("common.category")}</Label>
          <SearchableSelect
            id={id("category")}
            value={value.categoryId}
            onChange={(next) => onChange({ categoryId: next })}
            options={lookups.categories}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
            disabled={disabled}
            invalid={Boolean(error("categoryId"))}
            aria-describedby={error("categoryId") ? id("category-error") : undefined}
          />
          <input type="hidden" name="categoryId" value={value.categoryId} />
          {error("categoryId") ? (
            <p id={id("category-error")} role="alert" className="text-xs text-destructive">
              {error("categoryId")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("lead-source")}>{t("common.leadSource")}</Label>
          <SearchableSelect
            id={id("lead-source")}
            value={value.leadSourceId}
            onChange={(next) => onChange({ leadSourceId: next })}
            options={lookups.leadSources}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
            disabled={disabled}
            invalid={Boolean(error("leadSourceId"))}
            aria-describedby={error("leadSourceId") ? id("lead-source-error") : undefined}
          />
          <input type="hidden" name="leadSourceId" value={value.leadSourceId} />
          {error("leadSourceId") ? (
            <p id={id("lead-source-error")} role="alert" className="text-xs text-destructive">
              {error("leadSourceId")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("country")}>{t("common.country")}</Label>
          <SearchableSelect
            id={id("country")}
            value={value.countryId}
            onChange={pickCountry}
            options={lookups.countries}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
            disabled={disabled}
            invalid={Boolean(error("countryId"))}
          />
          <input type="hidden" name="countryId" value={value.countryId} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("city")}>{t("common.city")}</Label>
          {inSaudi ? (
            <>
              <SearchableSelect
                id={id("city")}
                value={value.cityId}
                onChange={(next) => onChange({ cityId: next })}
                options={lookups.cities}
                placeholder={t("forms.choose")}
                searchPlaceholder={t("forms.searchList")}
                emptyText={t("forms.noMatch")}
                disabled={disabled}
                invalid={Boolean(error("cityId"))}
              />
              <input type="hidden" name="cityId" value={value.cityId} />
            </>
          ) : (
            <Input
              id={id("city")}
              name="cityText"
              autoComplete="off"
              disabled={disabled}
              value={value.cityText}
              onChange={(event) => onChange({ cityText: event.target.value })}
              placeholder={t("forms.cityPlaceholder")}
              className="h-9"
              aria-invalid={error("cityText") ? true : undefined}
            />
          )}
          {error("cityId") || error("cityText") ? (
            <p role="alert" className="text-xs text-destructive">
              {error("cityId") ?? error("cityText")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("notes")}>{t("common.notes")}</Label>
        <Textarea
          id={id("notes")}
          name="notes"
          rows={2}
          disabled={disabled}
          value={value.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder={t("forms.notesPlaceholder")}
        />
      </div>
    </>
  );
}
