/**
 * The computed keys — `t(\`namespace.${member}\`)` — and the source list each
 * one reads from. Two checks read this table and neither may keep its own copy:
 * `check-messages` demands both locales carry every member, and
 * `unused-messages` treats a bare dynamic namespace (`common.${role}`) as
 * reaching exactly these members and nothing else — until P11A-14 it exempted
 * the whole namespace, and dead keys hid under `common` for phases (D101).
 *
 * The members are read from the source union rather than listed here, because a
 * list beside a union is the second copy that drifts (D42's shape, in messages).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");

export function union(file: string, name: string): string[] {
  const source = readFileSync(resolve(root, file), "utf8");
  const line = new RegExp(`export (?:type|const) ${name}[^=]*=([^;]+);`).exec(source);
  if (!line) {
    console.error(`message families — cannot find ${name} in ${file}; the check is blind`);
    process.exit(1);
  }
  // A union is a list of quoted words; a pgEnum is `pgEnum("name", [...])` and
  // the SQL name is not one of them, so the array wins where there is one.
  const list = /\[([^\]]*)\]/.exec(line[1]);
  const members = [...(list ? list[1] : line[1]).matchAll(/"([a-z]\w*)"/g)].map((m) => m[1]);
  if (members.length === 0) {
    console.error(`message families — ${name} in ${file} has no members; the check is blind`);
    process.exit(1);
  }
  return members;
}

/**
 * The same blindness, one shape along: a table of `{ key: "x" }` rows that a
 * component turns into `t(row.key)`. `src/lib/report-figures.ts` is one — the
 * report screen renders ten labels out of it and not one of them is written at
 * a call site — so the keys are read back out of the table itself.
 */
export function tableKeys(file: string): string[] {
  const source = readFileSync(resolve(root, file), "utf8");
  const members = [...source.matchAll(/key: "([a-z][A-Za-z0-9]*)"/g)].map((m) => m[1]);
  if (members.length === 0) {
    console.error(`message families — no keys in ${file}; the check is blind`);
    process.exit(1);
  }
  return [...new Set(members)];
}

// Every computed key a screen renders and the source list it reads from. A
// family missing here is a key the parity check cannot see (P11A finding 25:
// there were five of eleven). Finding them: grep src for "t(`".
export const families: [string, string[]][] = [
  ["common", union("src/lib/types.ts", "ROLES")],
  // The tabs across a home screen are rendered from the list itself (D151), so
  // adding a fourth tab is a key the parity check sees the day it is added.
  ["common.tab", union("src/lib/tabs.ts", "TABS")],
  // And the windows a metric is measured over (D152), for the same reason.
  ["common.range", union("src/lib/ranges.ts", "RANGES")],
  // The sentence a refused actor is answered with is computed too — every
  // action guard says `t(refusalKey(error))` and no call site writes either
  // key, so without this family `signedOut` is a key the checks cannot see.
  ["common", union("src/lib/authz.ts", "REFUSAL_KEYS")],
  ["common", union("src/db/schema.ts", "channelEnum")],
  ["common", union("src/lib/quotation-diff.ts", "LINE_FIELDS")],
  ["reports", tableKeys("src/lib/report-figures.ts")],
  // The moved line's labels (P11E): every count figure has a `<key>Label` plural
  // beside its heading, and the m² figure's label carries the unit the bare
  // figure on that line leaves off.
  ["reports", tableKeys("src/lib/report-figures.ts").map((key) => `${key}Label`)],
  ["reports", union("src/components/reports/person-card.tsx", "REPORT_STATES")],
  ["team.chain", union("src/lib/chain.ts", "CHAIN_STAGES")],
  ["quotations.event", union("src/lib/quotation-events.ts", "QUOTATION_EVENTS")],
  ["dispatches.event", union("src/lib/dispatch-events.ts", "DISPATCH_EVENTS")],
  ["admin.exportFile", union("src/lib/export.ts", "EXPORTS")],
  ["admin.kind", union("src/lib/admin.ts", "ARCHIVE_KINDS")],
  ["admin.lookup", union("src/lib/lookup-kinds.ts", "LOOKUP_KINDS")],
  ["projects.lossReason", union("src/lib/loss-reason.ts", "LOSS_REASON_CODES")],
  ["notifications", union("src/db/schema.ts", "NOTIFICATION_KINDS")],
  [
    "companies",
    union("src/components/companies/follow-up-strip.tsx", "Pill").map((pill) => `${pill}Count`),
  ],
  [
    "day",
    union("src/components/day/waiting-list.tsx", "WAITING_KINDS").map((kind) => `${kind}Count`),
  ],
];
