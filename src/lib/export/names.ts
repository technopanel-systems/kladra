/**
 * The ten files, in the order the founder listed them (SPEC §3, P14 14.10).
 *
 * Their own module, and a pure one: the control on every list screen is a
 * client component and the specs read this list to walk every file, and neither
 * can import the registry beside it without dragging the database, the session
 * and `server-only` in behind it (the rule at the end of rules/data.md).
 *
 * The LIST is the source. `FILES` in index.ts is a record over it, so a name
 * added here without a builder does not compile; `scripts/lib/message-families.ts`
 * reads it the same way.
 */
export const EXPORTS = [
  "companies",
  "contacts",
  "projects",
  "quotations",
  "dispatches",
  "reports",
  "leads",
  "targets",
  "users",
  "leave",
] as const;

export type ExportName = (typeof EXPORTS)[number];

export function isExportName(value: unknown): value is ExportName {
  return typeof value === "string" && (EXPORTS as readonly string[]).includes(value);
}
