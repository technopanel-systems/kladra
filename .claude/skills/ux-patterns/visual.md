# The visual system

Sources: visual-hierarchy, proximity-rule, gestalt-laws, von-restorff, serial-position,
color-accessibility, dark-mode, design-tokens, design-system-kit, border-radius,
shadow-elevation, depth-layers, perfect-card, card-hover-anatomy, icon-design-rules,
grid-system, gradient-design, charts-that-lie, reverse-engineered-linear, peak-end-rule, the
Blueprint PDF, and the site's own UI (`notes/site/site-ui.txt`). See `sources.md` for URLs.

## Hierarchy
- **Five levers act together on one focal point:** size (the head about 2× the body), weight,
  contrast, space, and colour.
  - A screen where two things win the first read has no hierarchy.
  - A screen where only one lever is used has a weak one.
- **Weight.** Two weights carry a page: body 400, and 500–600 for titles and labels. The site
  never goes past 700. If a screen uses a third or fourth weight to separate things, that is a
  finding.
- **Tone before size.** The site's calm comes from the text ladder (text → muted → faint), not
  from big size jumps. Kladra has the same ladder (§1 tokens), so use it before reaching for a
  larger size.
- **Isolate exactly one thing** (von Restorff). What differs from a calm field gets noticed.
  One brand control, one urgent row tone. When everything differs, nothing stands out.
  Difference is never colour alone: use weight, position and a word as well.
- **First and last are remembered** (serial position). The head of a drawer and its closing
  action carry the most.

## Grouping (proximity, common region)
- **Distance alone groups.** The gap inside a group must be clearly smaller than the gap
  between groups. The library's form numbers are ~12px inside a group and ~40px between
  sections, and ~32px between clusters. Kladra's scale is 8 / 16 / 24 (§1b). In a long dialog,
  the break between titled groups is at least 24.
- **Try spacing first.** A shared border (common region) is the second tool, for when things
  that belong together cannot sit together. A divider between groups that spacing already
  separates is noise.
- **Toolbars group by function** (navigate · act · system), not as one evenly spaced row.
- **Space does three jobs, so decide each one separately.**
  - **Micro** is the padding inside a button, input or card.
  - **Macro** is the margin between sections.
  - **Active** is space left empty on purpose so that one thing stands out.

  A card that looks cheap usually fails on padding, on the gap between its parts, or on
  line-height before it fails on colour or font. The shorts double padding and gaps (8 → 28,
  4 → 18, 16/8 → 32/16) and move body line-height from 1.1 to 1.6. Kladra keeps its own
  scale (16 inside a card, 16 between its parts, a 1.5 base), which suits screens made of
  data. The check is the same: parts of a card never touch, and no body text sits below 1.5.

## Alignment and grid
- **Text starts and numbers end.** Icons sit centred on the text line. Nothing is centred on a
  work screen except a lone empty sentence.
- **Repeated objects share edges.** A drawer's label column is `w-28` on every drawer (§1b).
- **One shared grid** for the edges of lists, boards and dashboards. Alignment is invisible
  when right and loud when wrong.
- **Linear's dense list recipe** (13px text, 32px rows, -0.01em tracking) is refused. Kladra's
  rows carry a second line and a phone number, so they are 40px, and Arabic must not be
  tracked (`refused.md`).

## Colour and contrast
- **Thresholds.** Text 4.5:1. Large text, icons, the focus ring and input borders 3:1. Critical
  figures aim for 7:1.
- **Where failures hide.** Muted greys, placeholders, disabled labels, the light theme.
- **Every colour cue carries a second signal:** a word, an icon, or a pattern in a chart.
  Roughly 8% of men cannot tell red from green.
- **Dark theme.**
  - Never pure black or pure white. Kladra's canvas is `#15110e` and its text `#f4ece3`.
  - Surfaces are told apart by tone steps.
  - The accent is desaturated in dark: Kladra's brand is `#ec5e62` in dark and `#bb2638` in
    light.
  - All three hold.
- **Tokens are named by role, not by value** (§1 table). A hex value or `text-[13px]` in a
  component is a value outside the system. It is flagged, never introduced silently.

## Radius, border, elevation
- **One radius scale.** Kladra's is 12 for controls (`--radius`), 16 for a card, and full for a
  pill or avatar. A value off the scale is a finding.
- **Concentric corners:** inner radius = outer radius − padding, whenever the padding is
  smaller than the radius. Example: a pill in a `p-1` track inside a `rounded-xl` track is
  `rounded-lg`.
- **Borders do most of the surface work.** On a near-black ground a 1px border at ~8–14% light
  separates a surface. The site uses almost no shadow: one per page, on the element meant to
  float.
  - Kladra chose otherwise, and deliberately: `card-face` has a hairline and a soft two-layer
    shadow, contact plus ambient (§1). That is the library's own "layered, not one blur"
    recipe.
  - What Kladra takes from the site is restraint. Level 1 cards do not stack further shadows,
    and nothing gains a shadow by being important (§1b).
- **Tinted glows, 3D tilt, and hover lift or scale are refused.**

## Cards
- **Padding.** Generous inside, 16 on a desk and 12 on a phone (§1b).
- **One title weight.** Secondary text steps down in tone, not in a new colour.
- **A hairline defines the edge.**
- **Nothing on hover but the tint.** The site's own cards only brighten the border on hover and
  never lift. That agrees with Kladra, and not with the library's perfect-card video, which
  lifts and scales.

## Icons
- **One set** (lucide), one stroke width, and one style (outline, never mixed with filled).
- **Sizes:** 16 inline, 20 default, 24 in navigation. Use `currentColor`.
- **Same bounding box for every icon,** so a row of mixed shapes lines up.
- **Optical sizing.** A circular glyph reads smaller than a square one at the same box size.
  Check custom marks (the K, state glyphs) by eye.
- **The hit area is 44 on a coarse pointer, whatever the glyph size.**

## Gradients (Kladra has exactly two)
The library's craft rules are a checklist for the two, never a reason to add a third:
- **Hue travel within ~60°, and lightness moving in one direction.**
  - `brand-grad` #ec5e62 → #f08a4a travels about 25°.
  - `mark-grad` is one hue, dark to darker.
  - Both pass.
- **Text never sits on a gradient's transition zone,** except the button label, which is
  checked for contrast at both ends.
- **Refused:** mesh gradients, grain, gradient text, ambient glows.

## Charts
- **Bars start at zero,** always.
- **The type follows the question.** A bar compares; a line or columns show change over time;
  a pie shows a share and breaks past about 5–6 slices (§1b allows six with a figure on each).
- **The title or the sentence beside the chart is the takeaway,** not the metric name:
  "August was up 17 per cent on July" beats "Monthly metres". Kladra's month card already does
  this.
- **Label marks directly.** Drop gridlines, boxed legends, shadows and 3D. Colour encodes a
  state or a person, never decoration (§1b).
- **The aspect ratio must not flatten or inflate a trend.**

## Endings (peak-end)
A flow is remembered by its hardest moment and its ending. For the request dialogs, the
hand-over and the approval, the ending should say what happens next and where to find it,
calmly. The library's confetti version is refused.

## What the founder liked about the PDF, and what transfers
The PDF uses:
- a near-black ground with slightly lighter surfaces and hairline borders;
- one saturated accent (violet) on small things only;
- a small label above each bordered group;
- two-tone headings (a white line and an accent line);
- tracked uppercase eyebrows ("02 — FOUNDATIONS");
- monospace for values and tokens;
- pill chips.

What already is Kladra: the dark ground with tone-step surfaces and hairlines, one accent on
small things (the brand on one control, state tints small), mono for money and m², and pill
chips.

What transfers into G6: **the labelled group**. A small muted label (`text-xs`, the reader's
case, never tracked in Arabic) sits outside and above a bordered inset group. It fits the
request dialogs' sections, the drawer's detail blocks and the admin forms. The site's
**eyebrow** is a sentence-case word in the accent or muted tone, one step above the label
size, not uppercase and not tracked. That is the form that works in both scripts.

What does not transfer: the violet (the identity is Sandstone, chosen by the founder in S1);
uppercase and letter-spacing (Arabic has no case, and tracking breaks the letter joins); the
two-tone accent heading (decoration, a second accent use on the screen); emoji as markers.
