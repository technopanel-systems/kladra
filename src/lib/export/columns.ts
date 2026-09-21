/**
 * Every word that can stand at the top of a column (SPEC §3, P14 14.10).
 *
 * One vocabulary for all the files, not one list per file, because the same
 * thing has the same name wherever it appears: the customer is `company` on the
 * companies file, on the quotations file and on the leave file, and §5's rule
 * about one word per thing does not stop at the edge of a screen.
 *
 * The key is what a row is built under and the word is what a reader sees, and
 * they are two different things since the files began coming in both languages
 * (`messages/<locale>/export.json`). A column with no word fails the build:
 * `scripts/lib/message-families.ts` reads this list and demands one in each
 * locale, the way it does for every other family a screen computes.
 *
 * Pure, and its own file, so a builder can name its columns without pulling the
 * database in behind them.
 */
export const EXPORT_COLUMNS = [
  // Who the record is about
  "company",
  "project",
  "rep",
  "city",
  "country",
  "category",
  "lead_source",
  "main_contact",
  "phone",
  "email",
  "position",
  // When
  "added",
  "requested",
  "issued",
  "approved",
  "archived",
  // The papers
  "quotation",
  "smac_number",
  "status",
  "dispatch",
  "smac_dispatch_number",
  "source",
  "quotation_smac_number",
  "warehouse",
  "shipment",
  "destination",
  "payment_terms",
  "payment_detail",
  "payment_note",
  "difference",
  // A line on a paper
  "line",
  "item",
  "service",
  "colour_code",
  "supplier",
  "fire_rating",
  "class",
  "thickness_mm",
  "width_m",
  "length_m",
  "qty",
  "quoted_qty",
  "sent_qty",
  "sqm",
  "service_sqm",
  "price_per_sqm",
  "line_total",
  // The people at a customer
  "contact",
  "main",
  "notes",
  // A job
  "stage",
  "expected_sqm",
  "next_follow_up",
  "lost_reason",
  // A report
  "day",
  "channel",
  "outcome",
  "note",
  // A lead
  "query",
  "found_by",
  "given_to",
  "passed",
  "acknowledged",
  // A month against a name
  "month",
  "person",
  "target_sqm",
  "achieved_sqm",
  "shares",
  // An account
  "role",
  "active",
  // A day nobody is at work
  "kind",
  "from",
  "to",
  "days",
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
