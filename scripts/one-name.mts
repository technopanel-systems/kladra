/**
 * A person is named once, in the reader's script (SPEC D68).
 *
 * `users.name` is the Latin name and `users.name_ar` the Arabic one, and a
 * query that selects the first straight onto a screen puts "Faisal Al-Harbi"
 * under a heading that says المندوب. Thirty-odd queries were swept when the
 * column landed; this is what stops the thirty-first from being written. The
 * one place that resolves them is `src/lib/people.ts`.
 *
 * Run by `npm run lint`, because it is a rule about source and it has to be in
 * the gate to be worth anything.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Files that name the Latin one on purpose, each with the reason it may. */
const ALLOWED = new Map<string, string>([
  ["src/lib/people.ts", "the one place that resolves a name"],
  ["src/lib/export.ts", "a CSV is a machine's file and takes the English column throughout"],
  ["src/lib/authz.ts", "the session carries both names; the screen picks"],
  ["src/lib/admin.ts", "the admin's own list edits the pair, so it reads both raw"],
  ["src/auth.config.ts", "the adapter maps the row Auth.js hands back"],
  ["src/auth.ts", "the same, one layer up"],
  ["src/db/schema.ts", "the column itself"],
  ["src/types/next-auth.d.ts", "the type of the column"],
  ["src/actions/view-as.ts", "an audit line records the canonical name"],
  ["src/actions/companies.ts", "the hand-over target's name is never shown"],
]);

const root = resolve(import.meta.dirname, "..");
const found: string[] = [];

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;

    const rel = full.slice(root.length + 1).replaceAll("\\", "/");
    if (ALLOWED.has(rel)) continue;

    const source = readFileSync(full, "utf8");
    source.split("\n").forEach((line, i) => {
      // `users.name` as a column, and `u.name` inside a raw SQL string — the
      // two shapes the sweep found. `users.nameAr` and `.name_ar` are the
      // Arabic one and are never the problem.
      const drizzle = /\busers\.name\b(?!Ar)/.test(line);
      const raw = /\bu\.name\b(?!_ar)/.test(line);
      if (drizzle || raw) found.push(`${rel}:${i + 1} — ${line.trim()}`);
    });
  }
}

walk(join(root, "src"));

if (found.length > 0) {
  console.error(`one-name — ${found.length} place(s) name a person in Latin on a screen:`);
  for (const line of found) console.error("  " + line);
  console.error("\n  Use personName(locale) / personNameOf(alias, locale) from src/lib/people.ts,");
  console.error("  or add the file to ALLOWED in scripts/one-name.mts with the reason it may.");
  process.exit(1);
}
console.log(`one-name — every screen names a person in the reader's script`);
