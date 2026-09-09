/**
 * The shape of a "which parent?" option, and nothing else.
 *
 * Its own file because the dialogs that render these are client components and
 * the queries that build them are not: one `import { splitProjectOption }` from
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
 * The customers of a set of project options, each once, in the order a reader
 * would look for them.
 *
 * Pure, and here rather than beside the query, because both sides need it: the
 * server builds the list and the dialog narrows the projects with the same
 * understanding of what a project option carries.
 */
export function companiesOf(projects: PickerOption[]): PickerOption[] {
  const seen = new Map<string, PickerOption>();
  for (const option of projects) {
    const split = splitProjectOption(option.value);
    if (!split || seen.has(split.companyId)) continue;
    seen.set(split.companyId, { value: split.companyId, label: option.hint ?? option.label });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * A quotation belongs to a company whether or not it names a project, so one
 * picked project has to answer both questions. The option carries the two ids
 * joined by a colon — neither is ever shown, and uuids contain no colon.
 */
export function projectOptionValue(projectId: string, companyId: string): string {
  return `${projectId}:${companyId}`;
}

export function splitProjectOption(value: string): { projectId: string; companyId: string } | null {
  const [projectId, companyId] = value.split(":");
  return projectId && companyId ? { projectId, companyId } : null;
}
