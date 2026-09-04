/**
 * Money and m² (SPEC D6): two decimals, thousands separators, Western digits in
 * both languages, half-up rounding per line. Everything is numeric(12,2) in the
 * database and arrives as a string; keep it a string until display.
 */

export const VAT_RATE = 0.15;

/** Half-up to 2 decimals, avoiding float drift on .005 boundaries. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 12345.6 → "12,345.60". Always Western digits, ASCII comma. */
export function formatNumber(v: string | number | null | undefined, decimals = 2): string {
  const n = toNumber(v);
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-" : "") + grouped + (frac ? "." + frac : "");
}

export const formatMoney = (v: string | number | null | undefined) => formatNumber(v, 2);
export const formatSqm = (v: string | number | null | undefined) => formatNumber(v, 2);

/** Whole metres for targets and totals on cards ("1,250 m²"). */
export const formatSqmWhole = (v: string | number | null | undefined) => formatNumber(v, 0);

export type LineInput = { width: string | number; length: string | number; qty: string | number; pricePerSqm: string | number };

export function lineSqm(l: LineInput): number {
  return round2(toNumber(l.width) * toNumber(l.length) * toNumber(l.qty));
}

export function lineTotal(l: LineInput): number {
  return round2(lineSqm(l) * toNumber(l.pricePerSqm));
}

export function quotationTotals(lines: LineInput[]) {
  const sqm = round2(lines.reduce((s, l) => s + lineSqm(l), 0));
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const vat = round2(subtotal * VAT_RATE);
  const total = round2(subtotal + vat);
  return { sqm, subtotal, vat, total };
}
