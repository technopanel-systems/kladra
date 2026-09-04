/**
 * The reference lists an admin edits, and what each one is made of.
 *
 * A module of its own, with no database in it, because the admin's lookup
 * SCREEN is a client component and needs this vocabulary: importing it from
 * `@/lib/admin` dragged `pg` into the browser bundle and the build said so.
 * Reading the rows still lives in `@/lib/admin`, where the database belongs.
 */

/**
 * The lists an admin edits.
 *
 * Countries and cities are NOT here. They are ISO reference data — 249 and 171
 * rows seeded from a standard — and the pinned few at the top are a design
 * decision, not an opinion about the world. Renaming Saudi Arabia is not a
 * thing an admin needs at 10pm; adding a company category is (D39).
 *
 * A quotation line's four lists are here even though nothing translates them:
 * the code IS the name until somebody types a real one (D3), so the admin needs
 * a way to type it.
 */
export const LOOKUP_KINDS = [
  "categories",
  "leadSources",
  "positions",
  "suppliers",
  "fireRatings",
  "classes",
  "thicknesses",
  "shipmentMethods",
] as const;

export type LookupKind = (typeof LOOKUP_KINDS)[number];

export function isLookupKind(value: unknown): value is LookupKind {
  return typeof value === "string" && (LOOKUP_KINDS as readonly string[]).includes(value);
}

/**
 * The boxes one list's rows are made of.
 *
 * Every list has a different shape and pretending otherwise is what breaks:
 * suppliers carry a code AND a full name (D3), shipment methods carry a code
 * and both languages, a fire rating is one word in both, and a thickness is a
 * number. The columns come from here and never from what arrived in a form, so
 * the only string this file interpolates into SQL is one it chose itself
 * (rules/data.md).
 */
export type LookupField = {
  /** The form field's name, `f_<key>`. */
  key: string;
  /** The physical column. Chosen here, never by a caller. */
  column: string;
  /** What the box is called on screen. */
  labelKey: string;
  /** A number, so the box is validated as one (thickness in mm). */
  numeric?: boolean;
};

export const LOOKUP_FIELDS: Record<LookupKind, LookupField[]> = {
  categories: [
    { key: "en", column: "name_en", labelKey: "admin.inEnglish" },
    { key: "ar", column: "name_ar", labelKey: "admin.inArabic" },
  ],
  leadSources: [
    { key: "en", column: "name_en", labelKey: "admin.inEnglish" },
    { key: "ar", column: "name_ar", labelKey: "admin.inArabic" },
  ],
  positions: [
    { key: "en", column: "name_en", labelKey: "admin.inEnglish" },
    { key: "ar", column: "name_ar", labelKey: "admin.inArabic" },
  ],
  shipmentMethods: [
    { key: "code", column: "code", labelKey: "admin.code" },
    { key: "en", column: "name_en", labelKey: "admin.inEnglish" },
    { key: "ar", column: "name_ar", labelKey: "admin.inArabic" },
  ],
  // The code is what a rep says out loud; the name is the company behind it,
  // and it equals the code until somebody types a real one (D3).
  suppliers: [
    { key: "code", column: "code", labelKey: "admin.code" },
    { key: "en", column: "name", labelKey: "common.supplier" },
  ],
  fireRatings: [{ key: "value", column: "name", labelKey: "common.fireRating" }],
  classes: [{ key: "value", column: "name", labelKey: "common.class" }],
  thicknesses: [
    { key: "value", column: "mm", labelKey: "common.thickness", numeric: true },
  ],
};

export type LookupRow = {
  id: number;
  /** One value per field of this kind, in the same order as LOOKUP_FIELDS. */
  values: string[];
  /** What the row reads as on one line — the first value, then the rest. */
  label: string;
  active: boolean;
};

/** The physical table behind a kind. Never built from user input. */
export function tableName(kind: LookupKind): string {
  switch (kind) {
    case "categories":
      return "company_categories";
    case "leadSources":
      return "lead_sources";
    case "positions":
      return "positions";
    case "suppliers":
      return "suppliers";
    case "fireRatings":
      return "fire_ratings";
    case "classes":
      return "classes";
    case "thicknesses":
      return "thicknesses";
    case "shipmentMethods":
      return "shipment_methods";
  }
}

