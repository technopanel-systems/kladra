/**
 * Both-locale gate. Messages live in messages/en/<ns>.json and messages/ar/<ns>.json.
 * A namespace or key present in one locale and not the other fails; so does an
 * empty string, a placeholder mismatch, or an Arabic value identical to the
 * English one (almost always untranslated). Run by `npm run check:messages`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { families } from "./lib/message-families";

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
 * The named arguments a message takes — `{name}` and `{name, plural, …}` — as a
 * SET, in one sorted line.
 *
 * Two things it must not be, both of which it was:
 *
 * A regex over `{word}`. A plural branch whose whole body is one Latin word —
 * `=0 {today}` — is indistinguishable from an argument that way, so English read
 * an argument called `today` that Arabic did not have and the two "differed".
 * This walks the message with the same frame stack `src/i18n/isolate.ts` uses,
 * because the question is the same one: is this `{` an argument or a branch?
 *
 * A multiset. Arabic has six plural categories and English has two, so a plural
 * whose branches each mention `{days}` yields three names in English and seven
 * in Arabic — a difference that means nothing. What matters is WHICH arguments a
 * message takes, and a name repeated is still one argument.
 */
function args(message: string): string {
  const found = new Set<string>();
  const frames: ("message" | "argument")[] = ["message"];
  let i = 0;

  while (i < message.length) {
    const char = message[i];

    // ICU quoting: '' is one apostrophe, and '{ starts a literal run.
    if (char === "'") {
      const next = message[i + 1];
      if (next === "'") {
        i += 2;
        continue;
      }
      if (next === "{" || next === "}" || next === "#" || next === "|") {
        const end = message.indexOf("'", i + 2);
        i = end === -1 ? message.length : end + 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (char === "}") {
      if (frames.length > 1) frames.pop();
      i += 1;
      continue;
    }

    if (char !== "{") {
      i += 1;
      continue;
    }

    // Inside an argument, a `{` opens one of its sub-messages, not a name.
    if (frames[frames.length - 1] === "argument") {
      frames.push("message");
      i += 1;
      continue;
    }

    const close = message.indexOf("}", i + 1);
    const comma = message.indexOf(",", i + 1);
    const simple = close !== -1 && (comma === -1 || close < comma);
    const name = (simple ? message.slice(i + 1, close) : message.slice(i + 1, comma)).trim();

    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) found.add(name);
    if (simple) {
      i = close + 1;
      continue;
    }

    frames.push("argument");
    i += 1;
  }

  return [...found].sort().join(",");
}

const problems: string[] = [];
for (const k of en.keys()) if (!ar.has(k)) problems.push(`missing in ar: ${k}`);
for (const k of ar.keys()) if (!en.has(k)) problems.push(`missing in en: ${k}`);
for (const [k, v] of en) {
  if (v.trim() === "") problems.push(`empty in en: ${k}`);
  // One straight quote in a card of Plex Sans is the difference between typeset
  // and typed (DESIGN §1). English only — Arabic has no apostrophe.
  if (v.includes("'")) problems.push(`typewriter apostrophe in en: ${k} = "${v}"`);
}
for (const [k, v] of ar) {
  if (v.trim() === "") problems.push(`empty in ar: ${k}`);
  const e = en.get(k);
  if (e === undefined) continue;
  if (args(e) !== args(v)) problems.push(`placeholders differ: ${k} — en(${args(e)}) ar(${args(v)})`);
  // Allowed identical values: brand words, codes, numbers, units — and a
  // message whose only letters are the NAMES of its arguments. "{percent}%"
  // is the same string in every language, and the check read `percent` as a
  // seven-letter English word and demanded a translation of a symbol.
  const words = v.replace(/\{[^}]*\}/g, "");
  if (e === v && /[a-z]{3,}/i.test(words) && !/^(Kladra|SMAC|VAT|WhatsApp|SAR|English|Q-|D-|N|K|C|D|B1|A2|CT|TT|Cargo|m²)$/.test(v)) {
    problems.push(`untranslated in ar: ${k} = "${v}"`);
  }
}

for (const [namespace, members] of families) {
  for (const member of members) {
    const key = `${namespace}.${member}`;
    if (!en.has(key)) problems.push(`no word for ${key} (a screen renders this key without writing it)`);
  }
}

/**
 * The rail's own keys, which no `t("a.b")` in any file spells out.
 *
 * `navFor` hands a component `item.labelKey` and `item.shortKey` and the
 * component renders `t(item.labelKey)` — one call site, fifteen keys, invisible
 * to every check above. A `shortKey` naming a word nobody wrote reaches the
 * phone's bottom bar as MISSING_MESSAGE, and only on a phone, and only for the
 * roles whose first four items include it. P12-8 added a rail entry with a
 * shortKey and no word for it, and nothing said so.
 */
{
  const navSource = readFileSync(
    resolve(import.meta.dirname, "..", "src", "components", "shell", "nav.ts"),
    "utf8",
  );
  for (const call of navSource.matchAll(/(labelKey|shortKey):\s*"([^"]+)"/g)) {
    const key = call[2];
    if (!en.has(key)) problems.push(`nav.ts names ${key}, which no locale has`);
  }
}

/**
 * A key a SPEC names, which nothing else does.
 *
 * `day.quietMeans` moved into `common` and the specs kept asking for it by its
 * old name; every one of them still passed its own assertions and then threw
 * MISSING_MESSAGE inside a `t()` call, ten minutes into a suite that had
 * already rebuilt the database. The specs read the same message files the app
 * does — that is the point of them — so a name they use is a name that has to
 * exist, and this says so in two seconds instead.
 *
 * Only literal `t("a.b")` calls: a spec that computes a key is doing what a
 * component does, and the families list above is where that gets declared.
 */
const specDir = resolve(import.meta.dirname, "..", "tests");
for (const file of readdirSync(specDir).filter((f) => f.endsWith(".spec.ts")).sort()) {
  const source = readFileSync(resolve(specDir, file), "utf8");
  for (const call of source.matchAll(/(?<![A-Za-z0-9_$])t\(\s*"([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)"/g)) {
    const key = call[1];
    if (!en.has(key)) problems.push(`${file} asks for ${key}, which no locale has`);
  }
}

// Tanween sits on the letter, not on the alif: «صادرًا», never «صادراً». The
// files had drifted into both spellings and a reviewer found them side by side
// on one drawer (P11A-5); one form, checked here, so it cannot drift again.
for (const [key, value] of ar) {
  if (value.includes("اً")) {
    problems.push(`ar ${key}: tanween written on the alif — write it on the letter before it (…ًا)`);
  }
}

// The glossary (SPEC §5) says the word for taking a value from a list is
// "choose" — never "pick" or "select" — and a "picked" sat in errors.json for
// phases because nothing read the glossary but people (P11A-15, D102). The
// forbidden words are checked; the glossary stays the list.
for (const [key, value] of en) {
  if (/\b(pick|picks|picked|picking|select|selects|selected|selecting)\b/i.test(value)) {
    problems.push(`en ${key}: "${value}" — the glossary says choose, never pick or select`);
  }
}

if (problems.length) {
  console.error(`check:messages — ${problems.length} problem(s)`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`check:messages — ${en.size} keys, both locales complete`);
