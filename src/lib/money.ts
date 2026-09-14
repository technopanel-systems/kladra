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

/**
 * The m² of a quantity on one line, rounded ONCE at the end.
 *
 * Not width × length rounded and then multiplied: 1.24 × 5.8 is 7.192, which
 * rounds to 7.19, and thirty of those is 215.70 where the real answer is
 * 215.76. SQL rounds once (`round(width * length * qty, 2)`), so this rounds
 * once, and tests/dispatches.spec.ts checks the two against each other rather
 * than trusting them — it caught exactly that six-halala gap.
 *
 * The width and the length go in as the database will HOLD them, though. Each is
 * numeric(12,2) and the action rounds what was typed before it writes it, and
 * the generated column multiplies the stored figures — so a width typed 1.245 is
 * 1.25 by the time anything reads it, and a hundred sheets of 1.245 × 5 are
 * 625.00 m² in the drawer. Multiplied as typed they were 622.50 under the rep's
 * thumb. That is the quantity-rounding trap turned inside out: rounding the
 * inputs is what the column does, rounding the product early is what it does
 * not (tests/quotations.spec.ts compares the two on a stored row).
 */
export function lineSqm(l: Pick<LineInput, "width" | "length" | "qty">): number {
  return round2(round2(toNumber(l.width)) * round2(toNumber(l.length)) * toNumber(l.qty));
}

/** A line's money: its m² as above, times its price as the column will hold it. */
export function lineTotal(l: LineInput): number {
  return round2(lineSqm(l) * round2(toNumber(l.pricePerSqm)));
}

/** A service on a quotation as the arithmetic sees it: the m² typed and its price (SPEC §3, P13). */
export type ServiceInput = { sqm: string | number; pricePerSqm: string | number };

/**
 * What one service comes to: its m² times its price, rounded once.
 *
 * The two figures are taken as the database will HOLD them — each is
 * numeric(12,2), and the action rounds what was typed before it writes it — so a
 * rep who types 12.345 m² sees the total of the 12.35 that is stored, and the
 * figure under his thumb is the one SQL reads back (`round(sqm * price, 2)` in
 * src/lib/quotations.ts). A service's m² is typed rather than derived from a
 * sheet, which is why this is not the line's formula.
 */
export function serviceTotal(s: ServiceInput): number {
  return round2(round2(toNumber(s.sqm)) * round2(toNumber(s.pricePerSqm)));
}

/**
 * The figures a quotation comes to, one definition each (rules/data.md).
 *
 * - `sqm` — the PANELS' m² and nothing else. A service's m² is the area it is done
 *   over, not panel sold, and it never counts toward a target or any achieved or
 *   pipeline figure (D173): it is money, and shows in the money.
 * - `panels` — the lines, each rounded before it is summed (S31, D6).
 * - `services` — the services, each rounded before it is summed, apart from the
 *   panels (SPEC §3, P13).
 * - `subtotal` — the two together, before VAT: what "Total excl. VAT" has always
 *   said, and still says with services on the paper.
 * - `vat`, `total` — 15% of that, and the two added.
 *
 * `src/lib/quotations.ts` does the same arithmetic in SQL on the stored rows, and
 * tests/services.spec.ts compares the two on a real quotation.
 */
export function quotationTotals(lines: readonly LineInput[], services: readonly ServiceInput[] = []) {
  const sqm = round2(lines.reduce((s, l) => s + lineSqm(l), 0));
  const panels = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const servicesSubtotal = round2(services.reduce((s, service) => s + serviceTotal(service), 0));
  const subtotal = round2(panels + servicesSubtotal);
  const vat = round2(subtotal * VAT_RATE);
  const total = round2(subtotal + vat);
  return { sqm, panels, services: servicesSubtotal, subtotal, vat, total };
}

/**
 * What a LOAD comes to — the same five figures, by the same function (SPEC §3,
 * P13: a dispatch carries the quotation's inputs, lines with a price per m² and
 * services, D169). A name for the drawer that reads it, never a second formula:
 * the desk compares a load's money with its paper's, and two arithmetics would
 * be two answers to one question (rules/data.md).
 */
export function loadTotals(lines: readonly LineInput[], services: readonly ServiceInput[] = []) {
  return quotationTotals(lines, services);
}
