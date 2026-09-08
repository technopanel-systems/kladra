/**
 * Every founder decision is reachable from a test (SPEC §3, P12).
 *
 * SPEC §3 is what the people who use Kladra asked for, and until Phase 12
 * nothing in this repo ever compared it to the app. One decision turned out
 * never to have been built at all — the quotation line's Width offered as
 * 1.24, 1.5, 2.0 or a typed number — and the column order of the same line was
 * wrong from the first commit, with a comment above it claiming it was the
 * founder's order. Both survived seventy boxes because no test ever opened
 * those two controls: they hold sensible defaults, and the spec that fills a
 * quotation line says so and skips them.
 *
 * So this holds §3 and `scripts/spec3-registry.ts` to each other in both
 * directions. A bullet nobody claims to prove fails. A claim whose sentence has
 * been reworded fails, because the decision has changed and wants re-reading. A
 * named test that no longer exists fails, which is the whole point: deleting or
 * renaming the test that proves a founder decision now says which decision just
 * lost its proof, rather than passing quietly.
 *
 * A decision that cannot be a browser test says why in one sentence. A decision
 * that is not built yet names the slice that owes it — an honest debt, listed
 * on every run, rather than a claim that would be a lie.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SPEC3, type Spec3Entry } from "./spec3-registry";

const root = resolve(import.meta.dirname, "..");
const problems: string[] = [];

/** §3's bullets, each folded back into the one sentence it is. */
function founderDecisions(): string[] {
  const spec = readFileSync(join(root, "SPEC.md"), "utf8").split("\n");
  const from = spec.findIndex((line) => line.startsWith("## §3 "));
  const to = spec.findIndex((line) => line.startsWith("## §4 "));
  if (from < 0 || to < 0) {
    console.error("spec3 — SPEC.md has no §3 or no §4; the sections have been renamed");
    process.exit(1);
  }

  const bullets: string[] = [];
  for (const line of spec.slice(from + 1, to)) {
    if (line.startsWith("- ")) bullets.push(line.slice(2).trim());
    // An indented line continues the bullet above it; a blank line or prose
    // between bullets ends one, and starts nothing.
    else if (line.startsWith("  ") && bullets.length > 0) {
      bullets[bullets.length - 1] += " " + line.trim();
    }
  }
  return bullets;
}

/** Every test title in the suite, as written. */
function suite(): string {
  const dir = join(root, "tests");
  const files = readdirSync(dir, { recursive: true }) as string[];
  return files
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

function shape(entry: Spec3Entry): "tests" | "unproven" | "owed" | null {
  const kinds = [
    entry.tests ? ("tests" as const) : null,
    entry.unproven ? ("unproven" as const) : null,
    entry.owed ? ("owed" as const) : null,
  ].filter((kind) => kind !== null);
  return kinds.length === 1 ? kinds[0] : null;
}

const bullets = founderDecisions();
const specs = suite();
const matched = new Set<number>();

for (const entry of SPEC3) {
  const kind = shape(entry);
  if (kind === null) {
    problems.push(`"${entry.says}" — say exactly one of tests, unproven or owed`);
    continue;
  }

  const hits = bullets
    .map((bullet, index) => ({ bullet, index }))
    .filter(({ bullet }) => bullet.includes(entry.says));

  if (hits.length === 0) {
    problems.push(
      `"${entry.says}" — no §3 bullet says this any more; the decision has changed, so read it again`,
    );
    continue;
  }
  if (hits.length > 1) {
    problems.push(`"${entry.says}" — matches ${hits.length} §3 bullets; quote more of the sentence`);
    continue;
  }
  matched.add(hits[0].index);

  for (const title of entry.tests ?? []) {
    if (!specs.includes(title)) {
      problems.push(
        `"${entry.says}" — is proved by the test "${title}", and no spec has that title any more`,
      );
    }
  }
}

bullets.forEach((bullet, index) => {
  if (matched.has(index)) return;
  const short = bullet.length > 70 ? bullet.slice(0, 70) + "…" : bullet;
  problems.push(`§3 says "${short}" and nothing in the registry claims to prove it`);
});

const proved = SPEC3.filter((entry) => entry.tests).length;
const unproven = SPEC3.filter((entry) => entry.unproven).length;
const owed = SPEC3.filter((entry) => entry.owed);

if (problems.length > 0) {
  console.error(`spec3 — ${problems.length} founder decision(s) are not held to anything:`);
  for (const line of problems) console.error("  " + line);
  process.exit(1);
}

console.log(
  `spec3 — ${bullets.length} founder decisions: ${proved} proved by tests, ${unproven} proved another way, ${owed.length} owed`,
);
for (const entry of owed) console.log(`  owed by ${entry.owed} — ${entry.says}`);
