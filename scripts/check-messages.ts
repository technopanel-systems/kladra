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

if (problems.length) {
  console.error(`check:messages — ${problems.length} problem(s)`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`check:messages — ${en.size} keys, both locales complete`);
