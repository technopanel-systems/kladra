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
 * A quotation belongs to a company whether or not it names a project, so one
 * picked project has to answer both questions. The option carries the two ids
 * joined by a colon — neither is ever shown, and uuids contain no colon.
 */
export function splitProjectOption(value: string): { projectId: string; companyId: string } | null {
  const [projectId, companyId] = value.split(":");
  return projectId && companyId ? { projectId, companyId } : null;
}
