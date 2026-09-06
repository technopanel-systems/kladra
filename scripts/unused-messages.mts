/**
 * Message keys nothing renders. An unused key is a lie about what the app says,
 * and it survives translation review by looking like work that was done.
 *
 * Deliberately conservative: a namespace built dynamically (`t(\`common.${x}\`)`)
 * marks that whole namespace as reachable, because the alternative is deleting a
 * string a screen actually shows.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { families } from "./lib/message-families";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(path);
  }
  return out;
}

const code = [...files("src"), ...files("tests")].map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * Every prefix the code builds a key from at runtime — `common.${role}`,
 * `projects.lossReason.${code}`. A prefix that names a sub-namespace
 * (`projects.lossReason`) is a family of its own and everything under it is
 * reachable. A BARE namespace (`common`) is not: `common.${role}` reaches the
 * five roles and nothing else, and treating it as reaching all of `common`
 * exempted every key in the app's biggest namespace from this check for four
 * phases (D101). So a bare prefix reaches exactly the members the source lists
 * for it (scripts/lib/message-families.ts) — and a bare prefix with no family
 * declared is a blind spot, reported rather than assumed.
 */
// Only prefixes that start with a message namespace: `quotation.${name}` in
// quotation-events.ts is an audit action, not a key, and `majed.${n}` is an
// email in a seed.
const namespaces = new Set(
  readdirSync("messages/en")
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, "")),
);
const dynamicPrefixes = [...code.matchAll(/`([A-Za-z0-9_.]+)\.\$\{/g)]
  .map((m) => m[1])
  .filter((prefix) => namespaces.has(prefix.split(".")[0]));
const reachable = new Map<string, Set<string>>();
for (const [namespace, members] of families) {
  if (namespace.includes(".")) continue;
  const set = reachable.get(namespace) ?? new Set<string>();
  for (const member of members) set.add(member);
  reachable.set(namespace, set);
}
const blind = [...new Set(dynamicPrefixes)].filter((p) => !p.includes(".") && !reachable.has(p));
if (blind.length > 0) {
  console.error(
    `unused-messages — dynamic keys under ${blind.join(", ")} with no family in scripts/lib/message-families.ts; the check is blind there`,
  );
  process.exit(1);
}

const unused: string[] = [];
for (const file of readdirSync("messages/en").filter((f) => f.endsWith(".json"))) {
  const ns = file.replace(/\.json$/, "");
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") {
        walk(v as Record<string, unknown>, key);
        continue;
      }
      const full = `${ns}.${key}`;
      if (
        dynamicPrefixes.some(
          (prefix) => prefix.includes(".") && (full === prefix || full.startsWith(`${prefix}.`)),
        )
      ) {
        continue;
      }
      if (reachable.get(ns)?.has(key)) continue;
      // Either the full path, or the bare key inside a namespaced translator.
      const escaped = full.replace(/\./g, "\\.");
      // The full path has to END where the key does. A plain `includes` counts
      // `common.targets` as a use of `common.target`, and three dead keys —
      // target, achieved and pace, a second copy of words the team screen
      // already had — sat in common.json for four phases because of it.
      // Anything that could continue the key means it is a different key that
      // merely starts the same way.
      if (new RegExp(escaped + "(?![A-Za-z0-9_.])").test(code)) continue;
      if (new RegExp(`["'\`]${key.replace(/\./g, "\\.")}["'\`]`).test(code)) continue;
      unused.push(full);
    }
  };
  walk(JSON.parse(readFileSync(join("messages/en", file), "utf8")), "");
}

if (unused.length === 0) {
  console.log("unused-messages — every key is rendered somewhere");
  process.exit(0);
}
console.log(`unused-messages — ${unused.length} key(s) nothing renders:\n  ${unused.join("\n  ")}`);
process.exit(1);
