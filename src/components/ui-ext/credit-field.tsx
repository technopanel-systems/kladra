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
 * **But it says where the metres went** (P14, founder: "make this visible
 * wherever credit is chosen, so nobody wonders where the metres went"). A rep
 * whose target is nought earns no share of anything, which means he is not on
 * this list — and a name quietly missing from a list is exactly the wondering
 * the founder is describing. So the people on the job who earn nothing this
 * month are named under it, and where the person filling the form is one of
 * them the field says so with no control at all: the work is raised, and it
 * counts for nobody.
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
  withoutTarget = [],
  earnsNothing = false,
  soleEarner = null,
  id = "credit",
}: {
  /** Everybody on the job who may earn. Fewer than two and no control is drawn. */
  people: { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  /** People on the job with no target this month, named, so their absence is said. */
  withoutTarget?: string[];
  /** The person this paper is for has no target, so it does not count for him. */
  earnsNothing?: boolean;
  /** The one person it counts for instead, when there is exactly one (`creditDefault`). */
  soleEarner?: string | null;
  /**
   * What this record is worth as it stands, so a split can say what it comes
   * to before it is saved rather than after. Optional: a quotation's m² is an
   * offer and is never divided, so its dialog passes nothing.
   */
  sqm?: number;
  id?: string;
}) {
  const t = useTranslations();
  const asked = people.length >= 2;
  // Nothing to choose and nothing to explain: the founder's silent case.
  if (!asked && !earnsNothing && withoutTarget.length === 0) return null;

  // No control, one sentence: the metres of this paper are nobody's. Said in
  // the place the question would have been, so the answer is where the reader
  // looks for it.
  if (!asked) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{t("common.credit.label")}</FieldLabel>
        {/* Somebody else on the job earns and he does not: the metres are that
            person's, and the form names him rather than saying "nobody" (§3 P14:
            "without it counting FOR HIM"). */}
        {soleEarner ? (
          <p data-slot="credit-other" id={id} className="text-sm">
            {t("common.credit.forOther", { name: soleEarner })}
          </p>
        ) : (
          <p data-slot="credit-none" id={id} className="text-sm">
            {earnsNothing ? t("common.credit.earnsNothing") : t("common.credit.forNobody")}
          </p>
        )}
        {withoutTarget.length > 0 ? <WithoutTarget names={withoutTarget} /> : null}
      </Field>
    );
  }

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
      {withoutTarget.length > 0 ? <WithoutTarget names={withoutTarget} /> : null}
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

/**
 * Who on this job earns nothing this month, by name (P14).
 *
 * The names are separate runs with a mark between them, never joined into one
 * string: a dot is neutral and settles against the paragraph, so two Arabic
 * names with only a space between them read in the wrong order on an English
 * screen (rules/words.md).
 */
function WithoutTarget({ names }: { names: string[] }) {
  const t = useTranslations();
  return (
    <FieldDescription data-slot="credit-without-target">
      {t("common.credit.withoutTarget", { count: names.length })}{" "}
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-faint">
              {" · "}
            </span>
          ) : null}
          <bdi>{name}</bdi>
        </span>
      ))}
    </FieldDescription>
  );
}
