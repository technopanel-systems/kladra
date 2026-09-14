/**
 * The address of a door: what a pressed slice, bar or row asks a list to show
 * (SPEC §3 P13, D117).
 *
 * A figure on the metrics tab counts a window, a person and sometimes a kind of
 * customer, and the list behind it has to be narrowed by exactly those — so the
 * narrowing travels in the URL, like every other choice a list makes (§3), and a
 * door is a link somebody can send. The words are the list's own: `from` and
 * `to` are the days of the event the list is about (approved, for a dispatch;
 * raised, for a quotation), `credited` is whose it is (D148), and `segment`,
 * `source` and `city` are the customer's.
 *
 * Pure — no database — so a card draws its doors, a page reads them back and a
 * spec builds one, all through these two functions. What each narrowing MEANS
 * in SQL is `src/lib/counted.ts`, read by the figure and by the list alike.
 */
import type { Day } from "@/lib/dates";

export type Narrowing = {
  from: Day;
  /** Null: up to today. */
  to: Day | null;
  credited: string | null;
  segment: number[];
  source: number[];
  city: string[];
  /**
   * Where a quotation got to (D62) — the quotations list only. Words, checked
   * against `CHAIN_STAGES` where they are turned into statuses (src/lib/chain.ts),
   * so this file keeps no second copy of the list.
   */
  ended: string[];
  /** Has a dispatch against it (D152) — the quotations list only. */
  dispatched: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A city's id, a typed name folded, or none — `cityKey` in counted.ts. */
const CITY = /^(\d+|t:.+|-)$/;

type Params = Record<string, string | string[] | undefined>;

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter(Boolean);
}

function one(value: string | string[] | undefined): string | null {
  return all(value)[0] ?? null;
}

/**
 * The narrowing in an address, or null when the address names none. Anything
 * malformed is dropped rather than refused: a link with a mangled day opens the
 * whole list, never an error page, the rule every other filter here follows.
 */
export function parseNarrowing(params: Params): Narrowing | null {
  const from = one(params.from);
  if (!from || !DAY.test(from)) return null;
  const to = one(params.to);
  const credited = one(params.credited);
  return {
    from,
    to: to && DAY.test(to) ? to : null,
    credited: credited && UUID.test(credited) ? credited : null,
    segment: all(params.segment).filter((v) => /^\d+$/.test(v)).map(Number),
    source: all(params.source).filter((v) => /^\d+$/.test(v)).map(Number),
    city: all(params.city).filter((v) => CITY.test(v)),
    ended: all(params.ended).filter((v) => /^[a-zA-Z]+$/.test(v)),
    dispatched: one(params.dispatched) === "1",
  };
}

/** The query string of a door, members repeated rather than joined (a city may hold a comma). */
export function narrowingQuery(narrowing: Partial<Narrowing> & { from: Day }): string {
  const query = new URLSearchParams();
  query.set("from", narrowing.from);
  if (narrowing.to) query.set("to", narrowing.to);
  if (narrowing.credited) query.set("credited", narrowing.credited);
  for (const id of narrowing.segment ?? []) query.append("segment", String(id));
  for (const id of narrowing.source ?? []) query.append("source", String(id));
  for (const key of narrowing.city ?? []) query.append("city", key);
  for (const stage of narrowing.ended ?? []) query.append("ended", stage);
  if (narrowing.dispatched) query.set("dispatched", "1");
  return query.toString();
}
