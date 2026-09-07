/**
 * The identity is written once (DESIGN §1, SPEC D69).
 *
 * Two rules with teeth, both from the 9E audit, both of which had already been
 * broken by hand:
 *
 *   1. The primary button. `--brand-grad` was a class string in fourteen files,
 *      in two syntaxes and two token names for the same colour — the app's most
 *      important control, copy-pasted. It is `variant="brand"` now, and the
 *      gradient belongs to `button.tsx` and the stylesheet that defines it.
 *   2. The edge of a surface. Every floating surface shadcn ships draws a RING
 *      in its own colour, which sits outside the box and matched no border in
 *      the app. Kladra surfaces take the `--line` border.
 *
 * Run by `npm run lint`, because a rule that is not in the gate is a wish.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** `allow`: a path exempts the file; `path#text` exempts only its lines containing `text`. */
type Rule = { name: string; pattern: RegExp; allow: string[]; fix: string };

const RULES: Rule[] = [
  {
    name: "the primary button is a variant, not a class string",
    pattern: /--brand-grad/,
    allow: ["src/app/globals.css", "src/components/ui/button.tsx"],
    fix: 'use <Button variant="brand">',
  },
  {
    name: "a surface takes the --line border, never a ring",
    pattern: /ring-1 ring-foreground/,
    allow: [],
    fix: "use border border-line",
  },
  {
    // 4. The line between a phone and everything else is Tailwind's `md`, and the
    //    JavaScript query that has to agree with it is derived once
    //    (src/lib/breakpoint.ts). It was 639, 640 and 768 in three files, and a
    //    tablet between them had a bottom bar under centred dialogs (P11H, §5 #35).
    //    globals.css is allowed through for its one other threshold, the blur
    //    strength at 980px, which is about the machine and not the hand — that
    //    line and no other.
    name: "the phone line is written once",
    pattern: /max-width:\s*\d+px|\bmax-(?:sm|lg|xl|2xl|\[[^\]]+\]):|\(width\s*<=?\s*\d/,
    allow: ["src/lib/breakpoint.ts", "src/app/globals.css#980px"],
    fix: "use useIsPhone() from @/hooks/use-is-phone, or max-md: in CSS",
  },
  {
    // 3. A block somebody typed runs in the writer's direction (rules/words.md).
    //    `Prose` is the one place that knows how; a `<p>` that preserves the
    //    typist's line breaks by hand is a typed block laid out by hand, and two
    //    of them sat on the sheets beside a trail that did it right (P11A-12).
    name: "typed text is laid out by Prose, in the writer's direction",
    pattern: /whitespace-pre-(wrap|line)/,
    allow: ["src/components/ui-ext/prose.tsx"],
    fix: "use <Prose text={…} />",
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
    if (!/\.(ts|tsx|css)$/.test(entry)) continue;

    const rel = full.slice(root.length + 1).replaceAll("\\", "/");
    const source = readFileSync(full, "utf8");
    for (const rule of RULES) {
      if (rule.allow.includes(rel)) continue;
      const markers = rule.allow
        .filter((entry) => entry.startsWith(`${rel}#`))
        .map((entry) => entry.slice(rel.length + 1));
      source.split("\n").forEach((line, i) => {
        // A comment explaining the rule is not a breach of it.
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
        if (markers.some((marker) => line.includes(marker))) return;
        if (rule.pattern.test(line)) {
          problems.push(`${rel}:${i + 1} — ${rule.name}; ${rule.fix}`);
        }
      });
    }
  }
}

walk(join(root, "src"));

if (problems.length > 0) {
  console.error(`one-look — ${problems.length} place(s) rewrite the identity by hand:`);
  for (const line of problems) console.error("  " + line);
  process.exit(1);
}
console.log(
  "one-look — the primary button, the surface edge, typed text and the phone line are each written once",
);
