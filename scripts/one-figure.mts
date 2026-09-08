/**
 * A figure has one definition (rules/data.md, SPEC D38, D86).
 *
 * The square-metre formula — width × length × quantity sent, rounded once per
 * line and once over the sum — was written by hand in six files, each copy
 * correct and none of them held to another. It lives in `src/lib/sqm.ts` now,
 * and this fails `npm run lint` on any copy outside it. The specs are not
 * walked: their own copy is the second way of computing the figure, which is
 * what makes them worth running.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type Rule = { name: string; pattern: RegExp; allow: string[]; fix: string };

const RULES: Rule[] = [
  {
    name: "the square-metre formula is written once",
    pattern: /qi\.width \* qi\.length|quotationItems\.width\} \* \$\{quotationItems\.length/,
    allow: ["src/lib/sqm.ts"],
    fix: "use LINE_SQM / SUM_SQM or lineSqm / sumSqm from src/lib/sqm.ts",
  },
  {
    // The same rule, one figure along (D148). Dividing a record's metres
    // between the people credited on it has a rounding decision inside it —
    // down, with the leftover to the last of them — and a second copy that
    // rounds to nearest gives a manager's table that is a hundredth short of
    // the dispatch it came from.
    name: "the credit split is written once",
    pattern: /\* 100 \/ (parts|\$\{parts\})|Math\.floor\([a-zA-Z]+ \/ (people|userIds)\.length\)/,
    allow: ["src/lib/credit.ts"],
    fix: "use creditShares or shareOf from src/lib/credit.ts",
  },
];

const root = resolve(import.meta.dirname, "..");
const problems: string[] = [];

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;

    const rel = full.slice(root.length + 1).replaceAll("\\", "/");
    const source = readFileSync(full, "utf8");
    for (const rule of RULES) {
      if (rule.allow.includes(rel)) continue;
      source.split("\n").forEach((line, i) => {
        // A comment explaining the rule is not a breach of it.
        if (/^\s*(\*|\/\/)/.test(line)) return;
        if (rule.pattern.test(line)) {
          problems.push(`${rel}:${i + 1} — ${rule.name}; ${rule.fix}`);
        }
      });
    }
  }
}

walk(join(root, "src"));

if (problems.length > 0) {
  console.error(`one-figure — ${problems.length} place(s) write a figure a second time:`);
  for (const line of problems) console.error("  " + line);
  process.exit(1);
}
console.log(`one-figure — ${RULES.length} figure(s) written once: ${RULES.map((r) => r.name).join("; ")}`);
