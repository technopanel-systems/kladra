"use client";

import { useTranslations } from "next-intl";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * A project's fields, shared by New project and Edit project — one definition,
 * so the two cannot drift and a rep learns the order once.
 *
 * There is no state field. A project starts simply open; "Mark lost" with its
 * reason is a later, separate act on the project (SPEC §3, D11), and offering a
 * status dropdown here would invite a rep to close a job without saying why.
 */

export type ProjectDraft = {
  name: string;
  expectedSqm: string;
  nextFollowUp: string | null;
  notes: string;
};

export const BLANK_PROJECT: ProjectDraft = {
  name: "",
  expectedSqm: "",
  nextFollowUp: null,
  notes: "",
};

export function ProjectFields({
  idPrefix,
  value,
  onChange,
  errors,
  disabled,
}: {
  idPrefix: string;
  value: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const id = (field: string) => `${idPrefix}-${field}`;
  const error = (field: string) => errors?.[field];

  return (
    <FieldGroup>
      <Field data-invalid={error("name") ? true : undefined}>
        <FieldLabel htmlFor={id("name")}>{t("common.name")}</FieldLabel>
        <Input
          id={id("name")}
          name="name"
          value={value.name}
          autoComplete="off"
          disabled={disabled}
          aria-invalid={!!error("name")}
          placeholder={t("projects.namePlaceholder")}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <FieldError>{error("name")}</FieldError>
      </Field>

      <Field data-invalid={error("expectedSqm") ? true : undefined}>
        <FieldLabel htmlFor={id("sqm")}>{t("common.expectedSqm")}</FieldLabel>
        {/* dir="ltr" is right here and only here: the value is digits, a
            decimal point and separators, with no letters to take a direction
            from. A formatted DATE must never carry it (DESIGN §1). */}
        <Input
          id={id("sqm")}
          name="expectedSqm"
          className="num"
          inputMode="decimal"
          dir="ltr"
          value={value.expectedSqm}
          autoComplete="off"
          disabled={disabled}
          aria-invalid={!!error("expectedSqm")}
          onChange={(event) => onChange({ expectedSqm: event.target.value })}
        />
        <FieldDescription>{t("projects.expectedSqmHint")}</FieldDescription>
        <FieldError>{error("expectedSqm")}</FieldError>
      </Field>

      <Field data-invalid={error("nextFollowUp") ? true : undefined}>
        <FieldLabel htmlFor={id("follow-up")}>{t("common.nextFollowUp")}</FieldLabel>
        <DatePicker
          id={id("follow-up")}
          value={value.nextFollowUp}
          disabled={disabled}
          onChange={(day: string | null) => onChange({ nextFollowUp: day })}
        />
        <FieldError>{error("nextFollowUp")}</FieldError>
      </Field>

      <Field data-invalid={error("notes") ? true : undefined}>
        <FieldLabel htmlFor={id("notes")}>{t("common.notes")}</FieldLabel>
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          value={value.notes}
          disabled={disabled}
          placeholder={t("projects.notesPlaceholder")}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
        <FieldError>{error("notes")}</FieldError>
      </Field>
    </FieldGroup>
  );
}
