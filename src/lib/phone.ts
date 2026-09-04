/**
 * Phone numbers (SPEC §3): stored normalized as E.164 (+966501234567),
 * displayed local (050 123 4567). Input accepts 05x…, +966…, 00966…, 966…,
 * with spaces, dashes or brackets. Non-Saudi numbers keep their + prefix.
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

export function normalizePhone(input: string): E164 | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) {
    const rest = d.slice(1).replace(/\D/g, "");
    return rest.length >= 8 ? storedE164("+" + rest) : null;
  }
  d = d.replace(/\D/g, "");
  if (d.startsWith("966")) return d.length >= 11 ? storedE164("+" + d) : null;
  if (d.startsWith("0")) return d.length === 10 ? storedE164("+966" + d.slice(1)) : null;
  if (d.length === 9 && d.startsWith("5")) return storedE164("+966" + d);
  return d.length >= 8 ? storedE164("+" + d) : null;
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
