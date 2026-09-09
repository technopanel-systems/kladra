/**
 * How a load is paid for (SPEC §3, P12-10) — the founder's four answers, and
 * the second question two of them ask.
 *
 * "Payment terms are a choice plus notes, not free text. Bank transfer → full
 * amount or part. Cash → on delivery or at the office. Credit and tasaheel → a
 * note from the rep explaining the terms is mandatory, for finance to review."
 * That sentence is a decision tree, so this is a tree and not a list: the shape
 * is written once here, the database's checks are written from it, the form
 * draws itself from it, and the action refuses from it.
 *
 * A union in code rather than a lookup the admin edits, unlike the shipment
 * methods beside it on the same form. These four are not words on a picker,
 * they are four rules — two ask a second question, two make a note mandatory —
 * and a list somebody can rename beside a `case` that cannot see the rename is
 * the drift trap rules/words.md is about.
 *
 * Pure: no database and no `server-only`, for two reasons. The dialog is a
 * client component, and a VALUE imported from a module that touches `@/db`
 * drags the whole graph into the browser bundle (rules/data.md). And
 * `src/db/schema.ts` builds its two enums from these lists the way it already
 * builds the role enum from `ROLES`, so the column and the code cannot drift —
 * the import there is relative, because drizzle-kit reads that file outside
 * Next and does not know the alias.
 */

export const PAYMENT_TERMS = ["bankTransfer", "cash", "credit", "tasaheel"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_DETAILS = ["fullAmount", "partAmount", "onDelivery", "atOffice"] as const;
export type PaymentDetail = (typeof PAYMENT_DETAILS)[number];

/**
 * The second question's answers, and empty where there is no second question.
 *
 * The two questions are different questions — an amount for a transfer, a
 * moment for cash — so each is asked in its own words rather than under one
 * heading that fits neither.
 */
const DETAILS: Record<PaymentTerms, readonly PaymentDetail[]> = {
  bankTransfer: ["fullAmount", "partAmount"],
  cash: ["onDelivery", "atOffice"],
  credit: [],
  tasaheel: [],
};

export function detailsFor(terms: PaymentTerms): readonly PaymentDetail[] {
  return DETAILS[terms];
}

/**
 * The two finance reviews, so the rep writes down what was agreed (SPEC §3).
 *
 * Its own list rather than "the ones with no second question", which is true
 * today and true by accident: a fifth way to pay that asked nothing and needed
 * no note would make that shortcut quietly wrong.
 */
const NOTE_REQUIRED: readonly PaymentTerms[] = ["credit", "tasaheel"];

export function needsNote(terms: PaymentTerms): boolean {
  return NOTE_REQUIRED.includes(terms);
}

export function isPaymentTerms(value: unknown): value is PaymentTerms {
  return PAYMENT_TERMS.includes(value as PaymentTerms);
}

export function isPaymentDetail(value: unknown): value is PaymentDetail {
  return PAYMENT_DETAILS.includes(value as PaymentDetail);
}

/**
 * The words for one answer, in the reader's language.
 *
 * Takes the translator rather than calling a hook, so the one mapping serves
 * the server drawer and the client dialog alike (`lossReasonLabel` is the same
 * shape, for the same reason). The keys are computed, and
 * `scripts/lib/message-families.ts` reads these two lists back so both locales
 * are held to every member of them.
 */
export function paymentTermsLabel(terms: PaymentTerms, t: (key: string) => string): string {
  return t(`dispatches.payment.${terms}`);
}

export function paymentDetailLabel(detail: PaymentDetail, t: (key: string) => string): string {
  return t(`dispatches.payment.${detail}`);
}

/** "How much" for a transfer, "When" for cash — the legend over the chips. */
export function detailLegendKey(terms: PaymentTerms): string {
  return terms === "cash" ? "dispatches.payment.when" : "dispatches.payment.amount";
}
