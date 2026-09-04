"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Option } from "@/actions/forms";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizePhone } from "@/lib/phone";

/**
 * Name · Phone · Position · Email · Notes — the five fields a contact is,
 * written once and used twice: inside Add company, where the first contact is
 * captured in the same popup (SPEC §3), and inside Add contact.
 *
 * Everything is controlled. React resets an uncontrolled form as soon as its
 * action returns, and a rep who mistyped one field would get all ten back
 * blank — on a phone, standing in a lobby.
 *
 * The phone is the only mandatory one, because the company itself has no phone
 * (SPEC §3) and the number is the strongest sign two records are the same
 * company (S14). It accepts every shape a rep writes — 05x, +966, 00966, 9665 —
 * and shows quietly underneath what will actually be stored, so the E.164 rule
 * is visible rather than a surprise on the drawer later.
 */

export type ContactDraft = {
  name: string;
  phone: string;
  position: string;
  email: string;
  notes: string;
};

export const EMPTY_CONTACT: ContactDraft = {
  name: "",
  phone: "",
  position: "",
  email: "",
  notes: "",
};

/** What each field is called in the FormData the server action reads. */
export type ContactFieldNames = {
  name: string;
  phone: string;
  position: string;
  email: string;
  notes: string;
};

export function ContactFields({
  idPrefix,
  names,
  positions,
  value,
  onChange,
  errors,
  disabled,
  belowPhone,
}: {
  idPrefix: string;
  names: ContactFieldNames;
  positions: Option[];
  value: ContactDraft;
  onChange: (patch: Partial<ContactDraft>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** The duplicate warning, when the parent has one to show. */
  belowPhone?: ReactNode;
}) {
  const t = useTranslations();
  const [phoneTouched, setPhoneTouched] = useState(false);

  const normalized = normalizePhone(value.phone);
  const typedSomething = value.phone.trim() !== "";
  const badPhone = phoneTouched && typedSomething && normalized === null;
  const phoneError = errors?.[names.phone] ?? (badPhone ? t("forms.phoneInvalid") : undefined);

  // The seeded list is a suggestion, not a constraint: a contact stores the
  // words, so the value IS the label and the rep may type his own (SPEC D21).
  const positionOptions = useMemo(
    () => positions.map((option) => ({ value: option.label, label: option.label })),
    [positions],
  );

  const id = (field: string) => `${idPrefix}-${field}`;
  const helpId = `${idPrefix}-phone-help`;
  const errorId = `${idPrefix}-phone-error`;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("name")}>{t("common.name")}</Label>
        <Input
          id={id("name")}
          name={names.name}
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={disabled}
          autoComplete="off"
          className="h-9"
          aria-invalid={errors?.[names.name] ? true : undefined}
          aria-describedby={errors?.[names.name] ? `${idPrefix}-name-error` : undefined}
        />
        {errors?.[names.name] ? (
          <p id={`${idPrefix}-name-error`} role="alert" className="text-xs text-destructive">
            {errors[names.name]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("phone")}>
          {t("common.phone")}
          <span aria-hidden="true" className="text-brand">
            *
          </span>
        </Label>
        <Input
          id={id("phone")}
          name={names.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={value.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          onBlur={() => setPhoneTouched(true)}
          disabled={disabled}
          // A phone number is digits and reads left to right in both locales.
          dir="ltr"
          className="h-9 text-start"
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={phoneError ? errorId : helpId}
        />
        {phoneError ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {phoneError}
          </p>
        ) : normalized ? (
          <p className="flex items-center gap-1.5 text-xs text-faint">
            {t("forms.phoneStoredAs")}
            <span dir="ltr" className="num">
              {normalized}
            </span>
          </p>
        ) : (
          <p id={helpId} className="text-xs text-faint">
            {t("forms.phoneHelp")}
          </p>
        )}
        {belowPhone}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("position")}>{t("common.position")}</Label>
        <SearchableSelect
          id={id("position")}
          value={value.position}
          onChange={(next) => onChange({ position: next })}
          options={positionOptions}
          placeholder={t("forms.choose")}
          searchPlaceholder={t("forms.searchList")}
          emptyText={t("forms.noMatch")}
          disabled={disabled}
          allowCustom
        />
        <input type="hidden" name={names.position} value={value.position} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("email")}>{t("common.email")}</Label>
        <Input
          id={id("email")}
          name={names.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          disabled={disabled}
          dir="ltr"
          className="h-9 text-start"
          aria-invalid={errors?.[names.email] ? true : undefined}
          aria-describedby={errors?.[names.email] ? `${idPrefix}-email-error` : undefined}
        />
        {errors?.[names.email] ? (
          <p id={`${idPrefix}-email-error`} role="alert" className="text-xs text-destructive">
            {errors[names.email]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("notes")}>{t("common.notes")}</Label>
        <Textarea
          id={id("notes")}
          name={names.notes}
          rows={2}
          value={value.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          disabled={disabled}
          placeholder={t("forms.notesPlaceholder")}
        />
      </div>
    </>
  );
}
