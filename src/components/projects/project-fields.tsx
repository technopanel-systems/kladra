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
  /*
   * The sentence a control is refused with has to be reachable FROM the
   * control, not only announced when it appears: somebody who tabs back to the
   * box a minute later hears the label and nothing else. `FieldError` carries
   * `role="alert"`, which is the announcement; this is the association.
   *
   * Derived from the same `id` rather than typed twice, so the pair cannot
   * drift — a hand-written id beside a hand-written describedby is two copies
   * of one fact, which is what DESIGN §5 keeps refusing everywhere else.
   */
  const errorId = (field: string) => (error(field) ? `${id(field)}-error` : undefined);

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
          aria-invalid={error("name") ? true : undefined}
          aria-describedby={errorId("name")}
          placeholder={t("projects.namePlaceholder")}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <FieldError id={errorId("name")}>{error("name")}</FieldError>
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
          aria-invalid={error("expectedSqm") ? true : undefined}
          aria-describedby={errorId("sqm")}
          onChange={(event) => onChange({ expectedSqm: event.target.value })}
        />
        <FieldDescription>{t("projects.expectedSqmHint")}</FieldDescription>
        <FieldError id={errorId("sqm")}>{error("expectedSqm")}</FieldError>
      </Field>

      <Field data-invalid={error("nextFollowUp") ? true : undefined}>
        <FieldLabel htmlFor={id("follow-up")}>{t("common.nextFollowUp")}</FieldLabel>
        <DatePicker
          id={id("follow-up")}
          value={value.nextFollowUp}
          disabled={disabled}
          aria-describedby={errorId("follow-up")}
          onChange={(day: string | null) => onChange({ nextFollowUp: day })}
        />
        <FieldError id={errorId("follow-up")}>{error("nextFollowUp")}</FieldError>
      </Field>

      <Field data-invalid={error("notes") ? true : undefined}>
        <FieldLabel htmlFor={id("notes")}>{t("common.notes")}</FieldLabel>
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          value={value.notes}
          disabled={disabled}
          aria-invalid={error("notes") ? true : undefined}
          aria-describedby={errorId("notes")}
          placeholder={t("projects.notesPlaceholder")}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
        <FieldError id={errorId("notes")}>{error("notes")}</FieldError>
      </Field>
    </FieldGroup>
  );
}
