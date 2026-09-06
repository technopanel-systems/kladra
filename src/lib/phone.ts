/**
 * Phone numbers (SPEC §3): stored normalized as E.164 (+966501234567),
 * displayed local (050 123 4567). Input accepts 05x…, +966…, 00966…, 966…,
 * with spaces, dashes or brackets. Non-Saudi numbers keep their + prefix.
 *
 * Read in the company's country (D89). A rep in Riyadh adding a Dubai customer
 * types the number the way the customer's card shows it — 050 123 4567 — and
 * that is a UAE number, not a Saudi one with the wrong code in front. Every
 * caller has the country in scope, so every caller passes it; the default is
 * Saudi only for the search box, where there is no company yet.
 *
 * Every contact carries TWO numbers: `phone`, as the rep typed it, which exists
 * only to fill the edit form back in, and `phone_normalized`, which is the
 * number. Passing the typed one to a formatter looks like it works — the drawer
 * did it and showed 0551204477 beside a grouped 055 331 8842 — and quietly
 * breaks the WhatsApp link, which needs the country code the rep did not type.
 *
 * So the storage form is its own type. `formatPhone` and `whatsappHref` accept
 * nothing else, and `normalizePhone` is the only way to make one out of thin
 * air, which puts the whole class of mistake in front of `npm run typecheck`
 * instead of in front of a rep with an unreachable customer.
 */

declare const E164_BRAND: unique symbol;

/** A number in storage form: "+" then digits, nothing else. */
export type E164 = string & { readonly [E164_BRAND]: true };

/**
 * A number read back out of `contacts.phone_normalized`.
 *
 * Only `normalizePhone` ever writes that column (src/actions/contacts.ts and
 * src/actions/companies.ts both refuse the insert without it), so what comes
 * back is E.164 by construction. This is the one place that says so.
 */
export function storedE164(value: string): E164 {
  return value as E164;
}

/**
 * Country calling codes for the countries a Technopanel customer is in: the
 * nine FACET carried, the Gulf six, and the neighbours that turn up. ISO
 * 3166-1 alpha-2 → E.164 country code. Deliberately not every country: for one
 * that is not here a number is accepted with its + and refused without one,
 * which is the honest answer when the trunk prefix is not known.
 */
const DIAL: Record<string, string> = {
  SA: "966",
  AE: "971",
  BH: "973",
  KW: "965",
  QA: "974",
  OM: "968",
  EG: "20",
  JO: "962",
  SY: "963",
  IQ: "964",
  LB: "961",
  YE: "967",
  TR: "90",
  IN: "91",
  PK: "92",
  BD: "880",
  LK: "94",
  PH: "63",
  GB: "44",
  US: "1",
  CA: "1",
  DE: "49",
  FR: "33",
  IT: "39",
  ES: "34",
  CN: "86",
  MY: "60",
  ID: "62",
  SD: "249",
  MA: "212",
  TN: "216",
  DZ: "213",
};

/** Longest first, so 212 (Morocco) is tried before 21 would be, and 966 before 9. */
const KNOWN_DIALS = [...new Set(Object.values(DIAL))].sort((a, b) => b.length - a.length);

/** A run of digits that begins with this country code and is a plausible length after it. */
function withDial(d: string, dial: string): boolean {
  return d.startsWith(dial) && d.length >= dial.length + 7 && d.length <= dial.length + 10;
}

/** The Saudi shapes a rep types: 05x xxx xxxx, or the nine digits without the 0. */
function saudiLocal(d: string): E164 | null {
  if (d.startsWith("0")) return d.length === 10 ? storedE164("+966" + d.slice(1)) : null;
  if (d.length === 9 && d.startsWith("5")) return storedE164("+966" + d);
  return null;
}

/** A local number elsewhere: an optional trunk 0, then seven to ten digits. */
function localWith(d: string, dial: string): E164 | null {
  const rest = d.startsWith("0") ? d.slice(1) : d;
  return rest.length >= 7 && rest.length <= 10 ? storedE164("+" + dial + rest) : null;
}

/**
 * `country` is the ISO code of the company the number belongs to. Order of
 * reading: an explicit + or 00 wins; then the country's own code typed without
 * the +; then the local shape for that country; then any other known code
 * typed without the + (a Dubai number on a Saudi card). Anything else is null,
 * and the form says so — including the old fallback that turned any eight
 * digits into an "international" number nobody could ring.
 */
/** Whether the guidance beside a phone field should give Saudi shapes or "as on the card, or with its code". */
export function isSaudi(country?: string): boolean {
  return (country ?? "SA") === "SA";
}

export function normalizePhone(input: string, country: string = "SA"): E164 | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) {
    const rest = d.slice(1).replace(/\D/g, "");
    return rest.length >= 8 ? storedE164("+" + rest) : null;
  }
  d = d.replace(/\D/g, "");

  const own = DIAL[country];
  if (own && withDial(d, own)) return storedE164("+" + d);
  const local = country === "SA" ? saudiLocal(d) : own ? localWith(d, own) : null;
  if (local) return local;
  // Only codes of two digits or more: with "1" in the list, any eight digits
  // that happened to start with 1 became a North American number.
  const other = KNOWN_DIALS.find((dial) => dial.length > 1 && withDial(d, dial));
  return other ? storedE164("+" + d) : null;
}

/** +966501234567 → 050 123 4567; other countries → +971 50 123 4567 grouped. */
export function formatPhone(e164: E164 | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("+966") && e164.length === 13) {
    const local = "0" + e164.slice(4);
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return e164.replace(/(\+\d{1,3})(\d{2})(\d{3})(\d+)/, "$1 $2 $3 $4");
}

/** wa.me wants digits only, no plus. */
export function whatsappHref(e164: E164): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

/** The same number as a call: on a phone this dials, which "Calls due" never offered (D98). */
export function telHref(e164: E164): string {
  return `tel:${e164}`;
}
