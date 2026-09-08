"use client";

import { useTranslations } from "next-intl";
import { CREDIT_SPLIT, creditShares } from "@/lib/credit";
import { formatSqm } from "@/lib/money";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * "Who does this count for?" — asked once, on the record that carries metres
 * (SPEC §3, D148).
 *
 * Here rather than beside either dialog because both ask it, in the same words,
 * with the same answers: a quotation and a dispatch each choose their own
 * credit and neither inherits the other's. Two copies of one question is how
 * two screens end up asking it differently.
 *
 * It draws nothing when there is nobody to choose between. A job one rep works
 * has one possible answer, and a control with one option is a tap he pays for
 * every day and never uses — the founder's line is that the question is not
 * asked at all there.
 *
 * The value is a person's id, or the word `split`. `split` is not a person and
 * cannot be one: it means everybody on the job at the moment of the raise, and
 * the server resolves it then, so a rep put on the job between opening this
 * dialog and saving it is included by the transaction rather than by whatever
 * this list happened to be fetched with.
 */

export function CreditField({
  people,
  value,
  onChange,
  sqm,
  id = "credit",
}: {
  /** Everybody on the job, named. Fewer than two and nothing is drawn. */
  people: { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  /**
   * What this record is worth as it stands, so a split can say what it comes
   * to before it is saved rather than after. Optional: a quotation's m² is an
   * offer and is never divided, so its dialog passes nothing.
   */
  sqm?: number;
  id?: string;
}) {
  const t = useTranslations();
  if (people.length < 2) return null;

  // The same division the database will do, on the figure showing above this
  // field — `creditShares` is the one function and it is pure, so the browser
  // and Postgres cannot disagree about the odd hundredth (D148).
  const named = new Map(people.map((person) => [person.value, person.label]));
  const shares =
    value === CREDIT_SPLIT && sqm !== undefined && sqm > 0
      ? creditShares(sqm, [...named.keys()])
          .map((share) => ({ ...share, name: named.get(share.userId) ?? "" }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("common.credit.label")}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" data-slot="credit-field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {people.map((person) => (
            <SelectItem key={person.value} value={person.value}>
              {person.label}
            </SelectItem>
          ))}
          <SelectItem value={CREDIT_SPLIT}>{t("common.credit.split")}</SelectItem>
        </SelectContent>
      </Select>
      {shares.length > 0 ? (
        <FieldDescription data-slot="credit-preview" className="flex flex-col gap-0.5">
          {shares.map((share) => (
            <span key={share.userId} className="flex items-baseline justify-between gap-4">
              <bdi>{share.name}</bdi>
              <span dir="ltr" className="num">
                {formatSqm(share.sqm)}
              </span>
            </span>
          ))}
        </FieldDescription>
      ) : null}
      <FieldDescription>{t("common.credit.help")}</FieldDescription>
    </Field>
  );
}
