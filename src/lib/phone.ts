/**
 * Phone numbers (SPEC §3): stored normalized as E.164 (+966501234567),
 * displayed local (050 123 4567). Input accepts 05x…, +966…, 00966…, 966…,
 * with spaces, dashes or brackets. Non-Saudi numbers keep their + prefix.
 */

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) {
    const rest = d.slice(1).replace(/\D/g, "");
    return rest.length >= 8 ? "+" + rest : null;
  }
  d = d.replace(/\D/g, "");
  if (d.startsWith("966")) return d.length >= 11 ? "+" + d : null;
  if (d.startsWith("0")) return d.length === 10 ? "+966" + d.slice(1) : null;
  if (d.length === 9 && d.startsWith("5")) return "+966" + d;
  return d.length >= 8 ? "+" + d : null;
}

/** +966501234567 → 050 123 4567; other countries → +971 50 123 4567 grouped. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("+966") && e164.length === 13) {
    const local = "0" + e164.slice(4);
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return e164.replace(/(\+\d{1,3})(\d{2})(\d{3})(\d+)/, "$1 $2 $3 $4");
}

/** wa.me wants digits only, no plus. */
export function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}
