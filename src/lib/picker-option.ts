/**
 * The shape of a "which parent?" option, and nothing else.
 *
 * Its own file because the dialogs that render these are client components and
 * the queries that build them are not: one `import { splitOption }` from
 * `@/lib/pickers` pulled the database, then Auth.js, then `server-only` into
 * the browser bundle, and the build said so in eleven places at once.
 *
 * The rule it stands for: a type and a pure helper shared across the boundary
 * live apart from the query that produces them.
 */
export type PickerOption = {
  value: string;
  label: string;
  /** A quieter second line: the company a project belongs to. */
  hint?: string;
};

/**
 * What the Quotations screen's own button may raise something on (P12-9).
 *
 * The chain a rep thinks in is company → project → contact, and the screen used
 * to start in the middle: one flat list of every job on every customer in the
 * building, with the customer as a quieter second line under each. On a real
 * floor that list is hundreds of rows long and the thing he knows first — who
 * he has just been speaking to — was the thing it made him search for.
 *
 * Two lists from ONE read: every quotation names a project (D94), so the
 * customers ARE the customers of those projects, derived rather than fetched.
 * The projects are then filtered to the chosen customer in the browser, which is
 * a list already in hand rather than a second round trip while a rep waits with
 * somebody on the phone.
 */
export type QuotationTargets = {
  companies: PickerOption[];
  /** Every project he may raise on, its value carrying its company (below). */
  projects: PickerOption[];
};

/**
 * The same two lists one step along the chain: what the Dispatches screen's own
 * button may send against (P12-10).
 *
 * A dispatch hangs off a quotation the way a quotation hangs off a job, and the
 * screen asked for it the same way the Quotations screen used to — one flat list
 * of every dispatchable paper in the building, `Q-31` over the name of a job the
 * rep would have to recognise. The customer is what he knows first here too.
 */
export type DispatchTargets = {
  companies: PickerOption[];
  /** Every quotation he may send against, its value carrying its company. */
  quotations: PickerOption[];
};

/**
 * The customers of a set of options, each once, in the order a reader would
 * look for them. `nameOf` says where the customer's name is on one of them: a
 * project option carries it as the hint, a quotation option carries the job
 * there instead and is asked with the company name it was read with.
 *
 * Pure, and here rather than beside the query, because both sides need it: the
 * server builds the list and the dialog narrows the children with the same
 * understanding of what a child option carries.
 */
export function companiesOf(
  options: PickerOption[],
  nameOf: (option: PickerOption) => string = (option) => option.hint ?? option.label,
): PickerOption[] {
  const seen = new Map<string, PickerOption>();
  for (const option of options) {
    const split = splitOption(option.value);
    if (!split || seen.has(split.companyId)) continue;
    seen.set(split.companyId, { value: split.companyId, label: nameOf(option) });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * One picked option has to answer two questions — which record, and whose
 * customer it is — because the field above it is the customer and the list is
 * narrowed by that answer. The value carries the two ids joined by a colon;
 * neither is ever shown, and uuids contain no colon.
 */
export function optionValue(id: string, companyId: string): string {
  return `${id}:${companyId}`;
}

export function splitOption(value: string): { id: string; companyId: string } | null {
  const [id, companyId] = value.split(":");
  return id && companyId ? { id, companyId } : null;
}
