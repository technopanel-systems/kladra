/**
 * The "For" field's answers, as the two request dialogs and their actions spell
 * them (SPEC §3 P13). Pure, so a client dialog can import the value
 * (rules/data.md: a value crosses to the browser, a type does not).
 */
import {
  splitOption,
  type DispatchTargets,
  type PickerOption,
  type QuotationTargets,
} from "@/lib/picker-option";

/**
 * "Nobody — Internal Sales": the coordinator's own paper. A word rather than an
 * empty value, for the reason `CREDIT_SPLIT` is one — a searchable select has no
 * way back to its placeholder, and "nobody" is an answer she gives on purpose.
 */
export const RAISED_FOR_NOBODY = "none";

/** One person she may raise for, as the field offers him: named, with his role as the quiet line. */
export type RaisedForPerson = PickerOption;

/**
 * What the quotation dialog's "For" field needs: who may be chosen, and for each
 * answer — her own included, under `RAISED_FOR_NOBODY` — what that person may
 * raise on, read by the same `quotationTargets` his own screen reads.
 */
export type QuotationOnBehalf = {
  people: RaisedForPerson[];
  targets: Record<string, QuotationTargets>;
};

/**
 * The dispatch dialog's: the papers each may send against and the customers
 * each may load direct (`dispatchTargets`, `directDispatchCompanies`), and — when
 * the dialog was opened on one quotation — who may send against that paper,
 * and whose paper it is.
 */
export type DispatchOnBehalf = {
  people: RaisedForPerson[];
  targets: Record<string, DispatchTargets & { direct: PickerOption[] }>;
  /** On one quotation's drawer: the answers `mayRaiseFor` allows on it, her own included. */
  eligible: string[] | null;
  /** And the one the field opens on when she may not send it herself: the paper's own rep. */
  suggested: string | null;
};

/**
 * The answer the field opens on (SPEC §3 P13): nobody — hers, under Internal
 * Sales — wherever she may raise it herself; otherwise the person the paper
 * already belongs to; otherwise the only person there is. Empty when there are
 * several and none of them is obvious, which the field then asks.
 */
export function openingFor(eligible: readonly string[], suggested: string | null = null): string {
  if (eligible.includes(RAISED_FOR_NOBODY)) return RAISED_FOR_NOBODY;
  if (suggested && eligible.includes(suggested)) return suggested;
  return eligible.length === 1 ? eligible[0] : "";
}

/**
 * Who may be chosen on the quotation dialog, at the door it was opened from:
 * anybody with a job to raise on from the Quotations screen; on a customer's
 * drawer, anybody who may raise on one of that customer's jobs; on a job's,
 * anybody who may raise on that job. Her own answer is among them exactly when
 * her own targets allow it. In the order the read gave them: hers, then by name.
 */
export function quotationEligible(
  onBehalf: QuotationOnBehalf,
  at: { companyId: string | null; projectId: string | null },
): string[] {
  return Object.entries(onBehalf.targets)
    .filter(([, targets]) =>
      targets.projects.some((option) => {
        const split = splitOption(option.value);
        if (!split) return false;
        if (at.projectId) return split.id === at.projectId;
        if (at.companyId) return split.companyId === at.companyId;
        return true;
      }),
    )
    .map(([key]) => key);
}

/**
 * Who may be chosen on the dispatch dialog: on one quotation's drawer, whoever
 * the action found may send against it; from the Dispatches screen, anybody
 * with a paper to send against or a customer to load direct.
 */
export function dispatchEligible(onBehalf: DispatchOnBehalf): string[] {
  if (onBehalf.eligible) return onBehalf.eligible;
  return Object.entries(onBehalf.targets)
    .filter(([, targets]) => targets.quotations.length > 0 || targets.direct.length > 0)
    .map(([key]) => key);
}
