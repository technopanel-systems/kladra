/**
 * The identity is written once (DESIGN §1, SPEC D69).
 *
 * Two rules with teeth, both from the 9E audit, both of which had already been
 * broken by hand:
 *
 *   1. The primary button. It was a gradient class string in fourteen files,
 *      in two syntaxes and two token names for the same colour — the app's most
 *      important control, copy-pasted. It is `variant="brand"` now, and the fill
 *      belongs to `button.tsx` and the stylesheet that defines it.
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
    // The brand red as a filled control with its ink on it IS the primary button.
    // It was a gradient class string in fourteen files before it was a variant;
    // since P13-G6 it is a flat fill, and a flat fill is easier still to copy.
    name: "the primary button is a variant, not a class string",
    pattern: /\bbg-brand\b[^"'`]*\btext-brand-ink\b|\btext-brand-ink\b[^"'`]*\bbg-brand\b/,
    // The bell's count is a mark, not a control: the one other place the red is
    // a fill with its ink on it.
    allow: [
      "src/components/ui/button.tsx",
      "src/components/shell/brand-mark.tsx",
      "src/components/shell/notification-bell.tsx#absolute -top-2",
    ],
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
    name: "the phone line is written once",
    pattern: /max-width:\s*\d+px|\bmax-(?:sm|lg|xl|2xl|\[[^\]]+\]):|\(width\s*<=?\s*\d/,
    allow: ["src/lib/breakpoint.ts"],
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
  {
    // 6. The row door. A list row whose whole width opens the record does it by
    //    stretching its own title link over the row (D161), and customers,
    //    projects and the call band each wrote that by hand — `relative` on the
    //    row, `after:absolute after:inset-0` on the link, and two of the three
    //    added a focus ring the third did not. P12-11 was about to make it four.
    //    `row-door` in globals.css owns the overlay and the ring; a row marks
    //    itself with it and its link with `data-door`.
    name: "the row door is written once",
    pattern: /after:inset-0/,
    allow: [],
    fix: 'put `row-door` on the row or card and `data-door` on its link',
  },
  {
    // 7. A number that NAMES something is not translated (P12-11, D161). A
    //    browser translator rewrites Western digits into Arabic-Indic ones, and
    //    a Q-12 that comes out in another script is no longer the name of the
    //    paper the customer is holding. `translate="no"` was on the phone chip
    //    and on one row of the stuck list and nowhere else — right twice, and
    //    absent from the two lists where a document number is the loudest thing
    //    on the row. `Ref` in figures.tsx carries it now.
    name: "a reference number is written once, and never translated",
    pattern: /translate="no"/,
    // And the shell (P13-S11, DESIGN §5): since Edge's translation was measured
    // rewriting React's text under the Arabic screens, the whole document says it
    // is not to be translated, popups included. `Ref` keeps its own mark, so a
    // number stays untranslated wherever it is lifted out of the shell.
    allow: ["src/components/ui-ext/figures.tsx", "src/app/layout.tsx"],
    fix: "use <Ref>…</Ref> from @/components/ui-ext/figures",
  },
  {
    // 8. The panel a record opens in (P12-14, DESIGN §6). Four screens drew
    //    their own drawer and agreed about none of it: a company came in at
    //    32rem, a project at 36rem and a quotation at 42rem, so the surface
    //    resized as a rep walked one job from the customer to the paper; two
    //    of the three loading skeletons were pinned to `side="right"`, so in
    //    Arabic the panel arrived from one edge and the record replacing it
    //    from the other; and three of the four bordered the edge Arabic cannot
    //    see. `RecordPanel` owns the width, the side and the border.
    name: "a record's panel is written once",
    pattern: /<SheetContent/,
    allow: [
      "src/components/ui-ext/record-panel.tsx",
      // The phone's menu, which is a bottom sheet and not a record.
      "src/components/shell/bottom-bar.tsx",
    ],
    fix: "use <RecordPanel> from @/components/ui-ext/record-panel",
  },
  {
    // 5. A `<bdi>` that is the BLOCK is a block that changes direction
    //    (P12-8, §5 #172). `<bdi>` carries `dir=auto`, so as a flex item, a
    //    grid item or anything given `block`, `truncate`, `flex-1` or
    //    `max-w-full` it becomes a box wider than its own text whose alignment
    //    follows the NAME rather than the page — and an Arabic company name sat
    //    flush right on an English card with every field under it flush left.
    //    The block belongs to the page and only the run belongs to the writer:
    //    put the layout on a wrapping element and leave the `<bdi>` bare.
    name: "a bdi is a run inside a block, never the block",
    pattern: /<bdi[^>]*className="[^"]*\b(truncate|line-clamp-\d|block|flex-1|grow|max-w-full|w-full)\b/,
    allow: [],
    fix: "wrap it: <span className={…}><bdi>{…}</bdi></span>",
  },
  {
    // 9. A person or a company is drawn one way (P13-S1, DESIGN §1b): the tint
    //    from the record's id, the letters in the reader's script, round for a
    //    person and square for a company. The top bar drew its own circle in a
    //    gradient of its own, which is how an identity becomes four.
    name: "an avatar is drawn once",
    pattern: /initialsOf\(/,
    allow: ["src/components/ui-ext/avatar.tsx", "src/lib/avatar.ts"],
    fix: "use <Avatar id={…} name={…} /> from @/components/ui-ext/avatar",
  },
  {
    // 10. Nothing here, and why (P13-S1, DESIGN §1b): one sentence in a dashed
    //     edge, written once. Four lists and a drawer each drew their own, in
    //     three paddings and two surfaces.
    name: "an empty state is Empty",
    pattern: /border-dashed/,
    allow: [
      "src/components/ui-ext/empty.tsx",
      // A target line across a chart, not an empty state.
      "src/components/team/months-card.tsx#border-t border-dashed",
    ],
    fix: "use <Empty> from @/components/ui-ext/empty",
  },
  {
    // 11. Loading stands still (P13-S1, DESIGN §1b). A grey shape says "loading"
    //     as well as a breathing one, and motion that loops is noise (§2).
    name: "a skeleton does not pulse",
    pattern: /animate-pulse/,
    allow: [],
    fix: "use <Skeleton> shaped like what it stands in for",
  },
  {
    // 12. Hover is a tint and nothing moves (P13-S1, DESIGN §1b); a control a row
    //     keeps for the pointer is `reveal`, which hides it only where a pointer
    //     can hover, so a phone always has it.
    name: "hover tints, it does not lift, and a hidden control is reveal",
    pattern: /hover:shadow|hover:-?translate|hover:scale|group-hover(\/[\w-]+)?:opacity|hover:opacity-100/,
    allow: [],
    fix: "use `hover-tint` on the row and `reveal` on the control (globals.css)",
  },
  {
    // 13. A wide surface shows its scrollbar where the reader is (P13-S1, 13.3).
    //     The kit's Table renders inside StickyScroll since P13-S7, so every list
    //     table has the proxy bar and no scroller of its own; the page tabs are a
    //     row of links, not a surface.
    name: "a wide surface scrolls in StickyScroll",
    pattern: /overflow-x-auto/,
    allow: [
      "src/components/ui-ext/sticky-scroll.tsx",
      "src/components/ui-ext/page-tabs.tsx",
    ],
    fix: "wrap it in <StickyScroll label={…}> from @/components/ui-ext/sticky-scroll",
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
  "one-look — the primary button, the surface edge, typed text, the phone line, the direction " +
    "of a name, the row door, a reference number, a record's panel, an avatar, an empty state, " +
    "a skeleton, hover and a wide scroller are each written once",
);
