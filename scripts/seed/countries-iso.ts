/**
 * The country list for the `countries` lookup (SPEC D7).
 *
 * FACET carried nine countries with hand-written Arabic spellings the founder
 * reads every day ("السعودية", not CLDR's "المملكة العربية السعودية"); those
 * nine win. Everything else in ISO 3166-1 alpha-2 is named from `Intl.DisplayNames`
 * in `en` and `ar` — Node 24 ships full ICU, so both languages are complete and
 * we carry no 249-row translation table of our own.
 *
 * The codes are the officially assigned alpha-2 set, written out rather than
 * derived: iterating AA…ZZ through `Intl` also yields EU, UN, QO, ZZ, XA, XB and
 * the exceptional reservations (AC, CP, DG, EA, IC, TA, EZ, XK), none of which is
 * a country a Riyadh rep picks from a dropdown.
 *
 * DATA ONLY — nothing here touches the database.
 */

/** ISO 3166-1 alpha-2, officially assigned (249 codes). */
export const ISO_ALPHA2: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW",
  "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT",
  "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
];

export type CountryRow = {
  code: string;
  nameEn: string;
  nameAr: string;
  /** 1..6 for the pinned Gulf states, null for everything else. */
  pinned: number | null;
};

/**
 * The rows to insert, in insert order: the pinned six in their pinned order,
 * then everything else alphabetically by English name. `overrides` (FACET's
 * nine) replace the CLDR name in both languages; a code in `overrides` that is
 * not in ISO is added rather than dropped, so the caller's list always survives.
 */
export function buildCountries(
  overrides: readonly { code: string; en: string; ar: string }[],
  pinnedCodes: readonly string[],
): CountryRow[] {
  const en = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const ar = new Intl.DisplayNames(["ar"], { type: "region", fallback: "none" });
  const byCode = new Map<string, CountryRow>();

  for (const code of ISO_ALPHA2) {
    const nameEn = en.of(code);
    const nameAr = ar.of(code);
    if (!nameEn || !nameAr) {
      // Full ICU is a hard requirement here: a small-icu Node would silently
      // seed 249 rows named "FR" and nobody would notice until the dropdown.
      throw new Error(`Intl.DisplayNames has no name for ${code} — Node was built without full ICU.`);
    }
    byCode.set(code, { code, nameEn, nameAr, pinned: null });
  }

  for (const o of overrides) {
    byCode.set(o.code, { code: o.code, nameEn: o.en, nameAr: o.ar, pinned: null });
  }

  for (const [i, code] of pinnedCodes.entries()) {
    const row = byCode.get(code);
    if (!row) throw new Error(`pinned country ${code} is not in the list`);
    row.pinned = i + 1;
  }

  const rows = [...byCode.values()];
  const pinnedRows = rows
    .filter((r) => r.pinned !== null)
    .sort((a, b) => (a.pinned as number) - (b.pinned as number));
  const rest = rows
    .filter((r) => r.pinned === null)
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"));
  return [...pinnedRows, ...rest];
}
