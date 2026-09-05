/**
 * Both-locale gate. Messages live in messages/en/<ns>.json and messages/ar/<ns>.json.
 * A namespace or key present in one locale and not the other fails; so does an
 * empty string, a placeholder mismatch, or an Arabic value identical to the
 * English one (almost always untranslated). Run by `npm run check:messages`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [ik, iv] of flatten(v, key)) out.set(ik, iv);
  }
  return out;
}

function load(locale: string): Map<string, string> {
  const dir = resolve(import.meta.dirname, "..", "messages", locale);
  const all = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const ns = file.slice(0, -5);
    let tree: Tree;
    try {
      tree = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
    } catch (e) {
      console.error(`check:messages — ${locale}/${file} is not valid JSON: ${(e as Error).message}`);
      process.exit(1);
    }
    for (const [k, v] of flatten(tree, ns)) all.set(k, v);
  }
  return all;
}

const en = load("en");
const ar = load("ar");
/**
 * The named arguments a message takes — `{name}` and `{name, plural, …}`.
 *
 * NOT every `{word` in the string: a plural branch whose text happens to start
 * with a Latin word ("one {added # days ago}") would be read as an argument
 * called `added`, and the English and Arabic of the same message would then
 * "differ" because Arabic starts that branch with an Arabic word. A real
 * argument is a name followed by `}` or `,`.
 */
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\s*[},]/g)].map((m) => m[1]).sort().join(",");

const problems: string[] = [];
for (const k of en.keys()) if (!ar.has(k)) problems.push(`missing in ar: ${k}`);
for (const k of ar.keys()) if (!en.has(k)) problems.push(`missing in en: ${k}`);
for (const [k, v] of en) if (v.trim() === "") problems.push(`empty in en: ${k}`);
for (const [k, v] of ar) {
  if (v.trim() === "") problems.push(`empty in ar: ${k}`);
  const e = en.get(k);
  if (e === undefined) continue;
  if (placeholders(e) !== placeholders(v)) problems.push(`placeholders differ: ${k}`);
  // Allowed identical values: brand words, codes, numbers, units.
  if (e === v && /[a-z]{3,}/i.test(v) && !/^(Kladra|SMAC|VAT|WhatsApp|SAR|English|Q-|D-|N|K|C|D|B1|A2|CT|TT|Cargo|m²)$/.test(v)) {
    problems.push(`untranslated in ar: ${k} = "${v}"`);
  }
}

/**
 * Families a screen renders with a computed key — `t(`common.${role}`)`.
 *
 * The parity check above cannot see these: `common.marketing` was missing from
 * BOTH locales, so both agreed, and the shell printed the key itself under
 * everybody's name on every screen the day the fifth role landed. The members
 * are read from the source union rather than listed here, because a list beside
 * a union is the second copy that drifts (D42's shape, in messages).
 */
function union(file: string, name: string): string[] {
  const source = readFileSync(resolve(import.meta.dirname, "..", file), "utf8");
  const line = new RegExp(`export (?:type|const) ${name}[^=]*=([^;]+);`).exec(source);
  if (!line) {
    console.error(`check:messages — cannot find ${name} in ${file}; the families check is blind`);
    process.exit(1);
  }
  // A union is a list of quoted words; a pgEnum is `pgEnum("name", [...])` and
  // the SQL name is not one of them, so the array wins where there is one.
  const list = /\[([^\]]*)\]/.exec(line[1]);
  const members = [...(list ? list[1] : line[1]).matchAll(/"([a-z]\w*)"/g)].map((m) => m[1]);
  if (members.length === 0) {
    console.error(`check:messages — ${name} in ${file} has no members; the families check is blind`);
    process.exit(1);
  }
  return members;
}

/**
 * The same blindness, one shape along: a table of `{ key: "x" }` rows that a
 * component turns into `t(row.key)`. `src/lib/report-figures.ts` is one — the
 * report screen renders ten labels out of it and not one of them is written at
 * a call site — so the keys are read back out of the table itself rather than
 * listed here, because a list beside the table is the copy that drifts.
 */
function tableKeys(file: string): string[] {
  const source = readFileSync(resolve(import.meta.dirname, "..", file), "utf8");
  const members = [...source.matchAll(/key: "([a-z][A-Za-z0-9]*)"/g)].map((m) => m[1]);
  if (members.length === 0) {
    console.error(`check:messages — no keys in ${file}; the families check is blind`);
    process.exit(1);
  }
  return [...new Set(members)];
}

const families: [string, string[]][] = [
  ["common", union("src/lib/types.ts", "Role")],
  ["common", union("src/db/schema.ts", "channelEnum")],
  ["reports", tableKeys("src/lib/report-figures.ts")],
];
for (const [namespace, members] of families) {
  for (const member of members) {
    const key = `${namespace}.${member}`;
    if (!en.has(key)) problems.push(`no word for ${key} (a screen renders this key without writing it)`);
  }
}

if (problems.length) {
  console.error(`check:messages — ${problems.length} problem(s)`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`check:messages — ${en.size} keys, both locales complete`);
