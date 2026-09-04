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
 * `projects.lossReason.${code}`. Anything under one of these is reachable and
 * cannot be judged from the source, so it is never reported.
 */
const dynamicPrefixes = [...code.matchAll(/`([A-Za-z0-9_.]+)\.\$\{/g)].map((m) => m[1]);

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
      if (dynamicPrefixes.some((prefix) => full === prefix || full.startsWith(`${prefix}.`))) {
        continue;
      }
      // Either the full path, or the bare key inside a namespaced translator.
      if (code.includes(full)) continue;
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
