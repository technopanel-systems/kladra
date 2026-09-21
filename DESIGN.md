# DESIGN — how Kladra looks and behaves

## §1 Identity

**Stone** (P13-G6, the founder's restyle brief of 2026-09-14, which retired Sandstone). Quiet
neutrals with almost no hue, plaster by day and a near-black at dusk, and the brand red, flat,
on one control per screen; dark is the default and light is designed, not inverted. Fonts:
**IBM Plex Sans** for Latin and **Noto Sans Arabic** for Arabic, one stack; every figure is
that sans in tabular lining digits (`num`), and nothing is monospace but a keyboard hint.
Base `text-sm` 13.5px / 20. Radius 8px (`--radius`) for a control, 12 for a card, 6 for a
badge or chip; nothing is a pill but an avatar. Surfaces are solid; a card at rest has a
hairline and no shadow; only what floats casts one; nothing is lifted by hover.

**Why Sandstone went.** The brief named three faults, and the screens had all three: colours
too saturated (a state was a tinted pill, the brand a red-to-orange gradient, charts in four
loud tones), type with too little range between a page title and a caption, and a hierarchy
that shadows, tints and gradients each claimed at once. Thirteen reference videos of calm
product UI (`UX-VIDEO/`, git-ignored) were studied frame by frame; what they share is below,
and none of their screens was copied. One accent and greys everywhere else. Near-black, never
black; a surface is raised by lightness and edged by a 1px alpha hairline. Three text tiers,
never pure white. No gradient that says nothing. A state is a small mark and its word.

**Readex Pro retired, and the legibility reason survives it.** Readex was chosen for being one
family drawn for both scripts; beside Plex Sans its Latin read loose, and the new scale is
tighter. Plex's own Arabic was tried first and refused: set next to Plex Latin at 13.5px an
Arabic company name read a size smaller than the English one on the same line, the fault
Aluminium was refused for below. Noto Sans Arabic stands at Plex Latin's height and weight.
**The stack names the faces, not the variables** (`--font-sans` in globals.css): next/font
builds a metric-matched fallback for each family out of Arial with no unicode range, Arial has
Arabic, and a stack of variables drew every Arabic letter in that fallback before it reached
Noto. Turbopack ignores `adjustFontFallback: false`, so the names go first.

**How Sandstone was chosen (P13-S1), kept for what it learned about Arabic.** Three directions were built as token sets switchable on the dev
server and rendered on the rep's home, the coordinator's queue and a quotation drawer, in
both themes and both directions, at 1366 and 375 (`scripts/shots.ts --look`):

- *Ember* — the identity as it stood, made calm: glass off, the glow down to one faint red,
  radius 8. It kept everything people liked and changed so little that a stranger would
  still have seen P8.
- *Aluminium* — neutral greys, Inter with Noto Sans Arabic a step smaller, flat surfaces told
  apart by tone, radius 6, a light rail in the light theme. The most current of the three in
  English and the weakest in Arabic: Noto at 13px set every Arabic company name visibly
  smaller than the Latin one on the next row, and the queue read as dense before it read as
  calm.
- *Sandstone* — chosen, for one reason above the others: **Readex Pro is one family drawn for
  Arabic and Latin together.** A Latin company name inside an Arabic row sits at the same
  height and weight as the words around it, so the two locales — which ship together, and
  which half the office reads in Arabic — look like one product written once, not a product
  and its translation. At a half step above Tailwind's scale an Arabic name on a phone stays
  legible in Riyadh daylight. The warm neutrals keep what people already liked (dark by
  default, the red on one button, nothing moving), and solid surfaces with a soft shadow
  replace the glass and the canvas glow, under which every tint on the screen had depended on
  what happened to be behind it.

| Token | Dark (default) | Light |
|---|---|---|
| canvas / background | `#12100e` | `#f7f5f3` |
| surface (card) | `#191714` | `#fefdfc` |
| surface-2 (muted, secondary, accent) | `#23201d` | `#f0edea` |
| raised (popover, menu, dialog) | `#292623` | `#ffffff` |
| line (border) / strong (input) | `rgba(236,233,229,.08)` / `.14` | `rgba(33,29,26,.10)` / `.17` |
| text | `#ece9e5` | `#211d1a` |
| text-muted | `#ada8a3` | `#605b56` |
| text-faint | `#99948f` | `#706b66` |
| rail (sidebar, bottom bar) | `#0e0c0a` | `#f2f0ed`, text `#605b56`, strong `#211d1a` |
| brand (primary) / hover | `#b95651` / `#c4625d` | `#b33333` / `#a0292a` |
| ring (focus) | the text colour | the text colour |
| state bad · wait · good · open (text) | `#e88f85` `#e0b67b` `#8ac596` `#90b5dc` | `#b33832` `#90601f` `#337344` `#39659b` |
| state tint (a band only) | the same hue at 7–9% | the same hue at 7–9% |
| avatar-1…8 bg / fg | about `oklch(.33 .04 h)` / `oklch(.85 .06 h)` | about `oklch(.92 .03 h)` / `oklch(.44 .065 h)` |
| shadow (floats only) | `0 1px 2px rgba(0,0,0,.4), 0 16px 40px -12px rgba(0,0,0,.6)` | `0 1px 2px rgba(20,16,12,.06), 0 12px 32px -12px rgba(20,16,12,.2)` |

White ink on the brand passes 4.5:1 in both themes, and each text tier passes 4.5:1 on each
surface it sits on; that was measured when the palette was set. The neutrals sit at oklch hue
70 with chroma under 0.01: warm enough not to read blue under office light, too faint to read
as a colour.

The eight avatar hues are 25, 70, 110, 155, 200, 245, 290 and 335 degrees. The type scale is
`text-2xs` 11 · `text-xs` 12 · `text-sm` 13.5 · `text-base` 14.5 · `text-lg` 16 · `text-xl` 20 ·
`text-2xl` 24 (px), set once in `@theme`, in three weights (400, 500, 600) and nothing bolder.
A component that writes `text-[13px]` is a component the scale cannot move.

An apostrophe in English copy is `’`, never `'`. Ten strings carried the typewriter
mark — "the coordinator's queue", "today's report" — and one straight quote in a card of
Plex Sans is the difference between typeset and typed. Arabic has no apostrophe, so this
is an English-only rule; there are no quotation marks anywhere in the copy to match it.

Destructive is a tint (`bg-destructive/10 text-destructive`), never a solid red. Popovers
and dialogs take the solid surface — never blurred. Row colour means how long something has
waited: overdue red, due today amber, otherwise faint. Status was a word and not a colour
until P8; it is now a word AND a colour, from the five in §6, and the word never goes away.

**The running app has no gradient.** A gradient on the primary button said "press me" in a
voice every other colour then had to shout over; flat red on one control says it once. The K
in the sidebar and on the sign-in screen is the flat brand red. The installed app's icon
(`scripts/icons.ts`) keeps its gradient, because it sits among other apps' icons on a phone
and not among Kladra's own controls.

**One primary action means one button.** `variant="brand"` on `Button`, wherever a screen has a
primary action; `controls.spec` finds it by `data-variant="brand"`, and `one-look` refuses the
brand fill written by hand anywhere but the button, the mark and the bell's count. It was a class string written by hand in fourteen files, in
two syntaxes and under two token names for the same colour, which is how the app's most
important control drifts without anybody deciding anything.

**Two surfaces, and they are not interchangeable.** `card-face` is a thing at rest: 12px, a
1px `--line` border, no shadow, and it does not change under the pointer; a card that is
pressed says so with `hover-tint`. The inset strip (`rounded-lg border border-line
bg-surface-2`) is a panel WITHIN a card or a header. A shadow says "this is lifted off the
page", so only what is lifted wears one: dialog, drawer, menu, popover, select and toast, on
the `raised` surface with the same hairline. What none of them may be is a RING: a ring was
shadcn's default, it sits outside the box rather than inside it, and it was a different colour
from every border in the app.

**A figure is the sans in tabular digits, and so is a date.** Money and m² stand in columns
that have to line up, and `num` gives them fixed-width lining digits without leaving the face.
Under Sandstone they were IBM Plex Mono, and a date could not be, because `03/سبتمبر/2026` in
a mono face drew its month in whatever the browser fell back to. With one sans stack for both
scripts, a date, an amount and an Arabic month sit in the same face on the same line.

## §1b One language (P13) — what every screen is drawn in

Written before the P13 sweep, from reading Twenty's code (`packages/twenty-ui/src/theme`,
`record-table`, `record-board`, `Avatar`), Attio and Folk's record pages, Pipedrive's board,
Close's activity table, and the current pattern writing. What was taken is below with its
number; what was refused is in §4. Everything here is tokens and components, so a screen
cannot follow it partly: it imports the piece or `one-look` refuses the hand-drawn copy.

**Spacing is a 4px unit on an 8px rhythm.** Every gap, padding and height is a multiple of
4, and the ones a reader feels are multiples of 8: `gap-2` (8) inside a row, `gap-4` (16)
between the parts of a card, `gap-6` (24) between cards and sections, `p-4` (16) inside a
card on a desk and `p-3` (12) on a phone. A list row is 40px on a desk (two lines of 14px
text and their padding) and 48px on a phone, where the thumb rule (D130) already asks for
44. A table cell is `px-3 py-2`. Nothing is 5, 10 or 18px; a value off the scale is a
value nobody chose. (Twenty: base 4, row 32 — theirs is a dense grid for people who live in
it; Kladra's rows carry a second line and a phone number, so 40.)

**A table header is one style everywhere:** `TableHead` is 12px, weight 500, the muted
colour, sentence case. **Alignment: text starts, numbers end.** Words align to the start of the line in both
scripts (`text-start`); every figure aligns to the end in tabular figures (`.num`), so a
column of metres reads as a column. In a drawer, a label sits in a `w-28` column and its
value beside it; the two columns are the same width on every drawer, which is what makes
four drawers look like one app. On a dashboard, cards sit in `grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]`:
as many across as fit, the last row stretched to the edge, so a day with two things on it
is two wide cards and a day with six is two rows of three — never card, gap, card.
`grid-flow-dense` is not used: it reorders what a screen reader and the Tab key walk, and
this app is read in two directions.

**One density.** Fourteen people, one setting: `text-sm` for text, `text-xs` for what is
secondary and for captions, rows of 40. No density toggle — a toggle is a saved view with one option, and it would be
the first control on the screen that changes nothing a rep is here to do.

**An avatar names a person or a company, and a dot says one thing about them.** `Avatar`
in `ui-ext`: initials in the reader's script (D68 — a person is named in the script the
reader reads — first and last letter in Latin with a family's "Al-" set aside, so Faisal
Al-Harbi is FH; ONE letter in Arabic, because two Arabic letters join into a fragment of a
word, with the article and a leading شركة or مؤسسة set aside), round for a person and
`rounded-md` for a company, in three sizes — 24 in a row, 32 in a card and in the top bar, 40
at the head of a drawer. The hue comes from a hash of the record's
own id across eight quiet tints (`--avatar-1` … `--avatar-8`, defined for both themes,
low saturation, text in the same hue's foreground), so one person is one colour on every
screen. A hash cannot promise that no two colleagues share one: in the seed Rawan and Marketing
do, and so do Faisal and Turki (S12.10); only a tint stored per person, the least used one given
at creation, would, which is a schema change left to the founder. That is identity,
not state — the rule "colour only means something" (SPEC §3) holds because the meaning is
"this is Faisal" — and it is a solid tint, never a gradient (§1: the running app has none).
A state dot (the `ring` prop, which kept its name) sits on the avatar's outer (start)
corner, away from the name beside it, cut out of the card by a 2px edge, only where a state exists and only in the five state colours:
`state-over` on a rep on leave, `state-wait` on a lead nobody has acknowledged, `state-bad` on
a company with an overdue follow-up and on a person on the team tab with something stuck past
its line (leave wins when both are true), nothing on anybody else. It was a 2px ring until the
restyle, and a ring in amber round a 24px square read as a focus outline. A dot with no
meaning is decoration, and the word for the state is beside the avatar as well (colour is
never the only carrier). (Twenty: hash → one of 25 hues; round for a person, square for a
company from the record's own shape. Eight, not 25: on a warm-black canvas twenty-five hues
is a fruit bowl.)

**Hover is a tint, never a swap; actions appear, they do not arrive.** A row or a card
under the pointer takes the `hover-tint` utility — seventy per cent of the way to `surface-2`
in 100ms — and nothing else moves; every `row-door` row has it built in; a floating surface
does not change on hover at all. The controls a row keeps for the pointer — Log,
Call, the drawer's own buttons — are `opacity-0` until the row is hovered or focused
within, then 150ms to 1 — the `reveal` utility; on a phone, where nothing hovers, they are always
drawn (`@media (hover: hover)` gates the hiding, never the showing), and a control whose
menu is open stays drawn. Hover and focus are two things: focus
is the 2px brand outline offset 1px on the focused element itself, and it never borrows
the hover tint. A button, a chip and a tab hover by one step on the same tint ladder. (Twenty
wraps every hover in `hover-capable` for exactly this reason; Linear's rows tint, they do not
lift.)

**Elevation has three levels and a page has none.** Level 0 is the canvas. Level 1 is a
card at rest: `surface`, a hairline `--line` border, no shadow. Level 2 is a floating surface
(menu, popover, select list, toast) on `raised`, with the hairline and the float shadow.
Level 3 is a dialog or a drawer: the same, over the scrim. Nothing is lifted by hover or by
being important; importance is position, size and words.

**Colour means five states, one brand and eight identities.** The five state tones (§6),
brand on exactly one control per screen, and the eight avatar tints. A chart series takes
its colour from that same set: a state series in the state tone, a per-person series in that
person's avatar tint, so the legend needs no key a reader has not already learned from the
table beside it. There is no sixth state and no colour for a category.

**Motion has four durations and explains, or it is not there.** 100ms for a hover, a colour
or a text change; 150ms for a menu, a popover, a reveal; 200ms for a dialog, a drawer, a row
that changes place; 2000ms for the arrived flash, which is colour and not travel. Enter
eases out, exit eases in, and `prefers-reduced-motion` keeps every duration and drops every
translate. A number does not count up: a KPI that changes is a live update and takes the
arrived flash like any row, because a ticker is motion that repeats and says nothing the
figure does not (Magic UI's number ticker was looked at and refused for that reason).

**Empty and loading are two components, written once.** `Empty` is one sentence of at most
two lines and forty characters a line, in a dashed edge — the space where things will be, not a
card at rest — saying why there is nothing and, where the work is done elsewhere, where (D127,
D31); it never draws the screen's primary action a second time, because that is already at
the top (§2), and its one slot is for the way OUT of an empty result, "clear the search". `Skeleton` is the shape of the thing it stands in for —
rows of the row's own height, a card of the card's own edges — drawn once, static: it does
not pulse, because motion that loops is noise (§2) and a grey shape says "loading" as well as
a breathing one. Both take `aria-busy` and `role="status"` where a reader needs them.

**Charts are the shadcn kit's, drawn in the language.** The kit (`npx shadcn add chart`) is
added by the first slice that draws a chart (S7) rather than by S1, because a kit file nothing
imports fails `check:dead` — the rule §3 already keeps. `ChartContainer` over Recharts, the
series colours as above, `accessibilityLayer` on, every mark labelled with its figure in the
text beside the drawing so the drawing is never the only carrier (D150's reading argument
stands even where the shape changed). A bar for a comparison, a pie for a share of a whole
with at most six slices and the figure written on each, a ring for progress to a target.
Every slice and bar is a door: pressing it opens the list it counts (D117). Recharts has no
RTL of its own, so the axis and the tooltip are mirrored by the app under `dir="rtl"`, and
the Arabic project of every chart spec asserts the first category sits at the inline start.

**A wide surface shows its scrollbar where the reader is.** A board and a wide table scroll
sideways inside `StickyScroll`: the scrollbar is a thin proxy pinned to the top of the surface
that stays on screen while the surface is, synced both ways, so nobody scrolls to the bottom
of forty rows to find the fifth column. Direction needs no arithmetic: the proxy and the
surface inherit the same `dir`, so both count `scrollLeft` from the same edge with the same
sign in any browser, and copying the number is right in Arabic too — what would break it is
giving the proxy a direction of its own. The surface keeps a rail's worth of room at its own
top for it (1.25rem, inside the scroller so the component's box does not move when the bar
arrives), and the bar is drawn on an opaque band in the theme's own tokens — `scroll-rail`,
thin and round, with `scrollbar-color` so Windows draws ours rather than its own and the
overlay bar stops fading out. Both are P14 14G: a board's gutter was 8px against a 12px bar,
so the bar sat across the column headings, and over a page that paints nothing an inherited
background let the words read straight through it. `surface` on `StickyScroll` says what is
behind the bar — the page, a card, or a chain the caller has already painted.

## §2 Principles

- Work happens in dialogs and drawers over a list; a full page is the exception — users called FACET record-first and slow because every step was a page.
- One primary action per screen, at the top, never the bottom — the eye lands there first, and on a phone the bottom is the bar. **Its empty state does not draw it a second time**: §3 asks an empty list for one sentence and its primary action, and the action is already on the screen, so the sentence says to use it (D31, D35, P12-14).
- Humans read words; internal codes and IDs never appear — a rep does not know what `uuid` or `N-CA-FR` mean and should not have to.
- Dropdowns over ~8 entries are searchable, common values pinned, likeliest preselected — Riyadh, Saudi Arabia, 1.24 m, 4 mm are what is typed nine times in ten.
- Dates are picked, shown 04/Aug/2026 — unambiguous in both languages; no 08/04 confusion.
- The screen tells you what changed: toasts for your actions, live arrival and a 2 s highlight for other people's; a bell with a count — nobody refreshes.
- Motion where it explains (150–250 ms): dialogs, drawers, row changes. Menus, popovers and selects at 100 ms — a menu is not a dialog. No loops — motion that repeats is noise; the one exception is the pending mark inside a pressed link, which says "working". Under `prefers-reduced-motion` the travel goes and the information stays: the arrived flash keeps its two seconds because it is a colour, not a movement.
- Loading states always; never a blank — a blank reads as broken. A pressed link shows it is working after 150 ms (`LinkPending`); a screen that cannot draw itself, or an address that names none, is one card inside the shell in the reader's language, never the framework's page and never a digest.
- Sidebar collapses; on a phone it is a bottom bar and dialogs are bottom sheets — the thumb reaches the bottom. A phone is everything below `md`, one line for the shell and the forms (D128); in a sheet the primary action is the lowest button, and anything a thumb presses is 44px (D129, D130).
- Money and m² in tabular figures (`.num`, the sans in tabular digits); everything else normal text — columns of numbers must line up.
- Anything daily is two clicks from home — log a visit, add a company, check follow-ups.

## §3 Component kit

shadcn/ui via CLI (Radix, RTL on): Dialog, Sheet, Drawer (phone bottom sheet), Command
(searchable dropdowns), Popover + Calendar (date pickers), Sonner (toasts), Skeleton, Tabs,
Badge, Table, Field (forms), Select, Tooltip, plus Button, Input, Textarea,
Dropdown-menu, Checkbox — a kit file nothing imports is deleted, and `check:dead` says so
(the kit's Avatar went in P13-S1, when `ui-ext/avatar` replaced its one user). On top of them, the app's own
small pieces: `StandingStrip`, `StateBadge`, `Board`, `Sqm`/`Money`, `DayText`, `Prose`
— one `<p dir="auto">` for any block a PERSON typed — and `NoteBlock`, which is `Prose` under
the word for what it is, in a face of its own so a paragraph that swings to the other end of a
wide drawer stays attached to its label; and `ListSearch`, the one box a list is filtered by —
term on the URL a quarter-second after the last keystroke, caret never stolen, and one per
screen however many lists are under it; `PageTabs`, the row across the top of a home
screen (D151), which is links rather than the kit's `Tabs` because a tab here is a place with an
address and not a panel toggled in the browser, and which is deliberately not the pill the
list-and-board switch wears — that one is a control inside a screen and this one is the
structure of it; the metrics shapes in `src/components/metrics/` — `SharePie` for a share of a
whole, `ProgressRing` for a part of one, `BarsChart` for a comparison or a trend — over the kit's
`ChartContainer`, each with its figures written beside it (D150, D192); and `RangeChips`, the window a measured screen is read
over, which is `FilterChip` in a row rather than a fourth kind of chip; and `RecordPanel`, the
drawer a record opens in — one width, one edge and one border for a company, a project, a
quotation or a dispatch, and for the skeleton that stands in while each of them loads (D166); and, from P13-S1,
`Avatar` (a person or a company, §1b), `Empty` (nothing here, and why), `StickyScroll` (a wide
surface with its scrollbar at the top) and the `hover-tint` and `reveal` utilities.
**A long form is a paper of parts** (founder, 2026-09-15, after the request dialogs were reported
three times as a stock form): `FormSection` names a part with a 14.5px semibold word, a sentence
under it where the part needs one and the part's own action at its end (Add service beside
Services); `FormSplit` puts the parts in a column and what the paper comes to beside them on a
desk, held in view while the column scrolls, with `FormFooter`'s `summary` keeping the m² and the
total over Save below `xl`; and `LineItem` (with `LineFields`, `LineField`, `LineFigure`) draws one
line of a paper as an item — a card whose head names it and says what it comes to, the m² as the
figure and the money beside it, and its boxes in rows that each answer one question, every box
under its own label at every width. A line of nine boxes is never a table row under one row of
column names: the names hid, the boxes all weighed the same, and nothing said which of them
belonged together. A short line of three answers — a service — is one row of a list with its
units written in its boxes. A field's label is the muted colour and its value the text colour,
so a form reads by its values and a part's word stands over both.
Logical utilities only (`ms-`, `pe-`,
`text-start`, `start-0`); hook H3 blocks physical ones. Radix `DirectionProvider` follows
`<html dir>`.

## §5 Rules earned the hard way

Each of these was a defect first. They are here so the fix is the rule, not the patch.

- **The page is never machine-translated** (P13-S11, D194). Kladra is written in both languages
  and switches between them itself; a browser that translates it as well rewrites text React owns.
  Edge set to translate Arabic swapped React's text nodes for `<font>` wrappers, broke hydration and
  left a picker reading its translated placeholder; on a page translated that way a Select given a
  new value brought the screen down when it was opened again. `translate="no"` sits on `<html>` in
  the root layout and nowhere else, so it covers every popup rendered into `<body>`. A searchable
  picker's rows are keyed so that no row's value is empty, because cmdk never highlights one.
- **A wheel inside a popup belongs to the popup** (P14, 14F). A dialog locks the page's
  scrolling, and the lock cancels any wheel that did not start inside the dialog's own subtree —
  so a popover, which is portalled to `<body>`, opened a list of two hundred countries that the
  wheel did nothing to. `PopoverContent` stops the event at itself, by a listener put on the node
  through a CALLBACK ref: an object ref is still empty when the effect that would use it runs,
  behind Radix's own mounting, and the listener was never attached. Nothing is prevented — the
  event is simply not the page's business. The kit's Select needs none of this: Radix locks
  scrolling for it, and the innermost lock is the one that lets its own list scroll. Every popup
  list carries `overscroll-behavior: contain` too, so a wheel that reaches the end of a list does
  not go on to move the page under it.
- **Direction follows the first strong character, never a forced `ltr`.** A formatted date
  carries a month NAME, so `dir="ltr"` around `04/سبتمبر/2026` puts the month in its own
  right-to-left run and reclassifies the year after it as an Arabic number; the two swap and
  the control reads `04/2026/سبتمبر` while the label beside it is correct. Use `dir="auto"`.
  `dir="ltr"` is for runs with no letters in them at all — a phone number, a quantity, a
  keycap.
- **A block somebody TYPED takes its direction from the text, not from the page.** The rule
  above is about a run inside a sentence, and `<bdi>` is the tool for that. It does not set
  the base direction of a paragraph: an English log entry inside an Arabic card read
  left-to-right internally and still sat flush against the right margin, ragged down its
  left. Both languages are on every screen — Saad writes English, Rawan writes Arabic, each
  reads the other's — so every such block goes through `<Prose>`. That is a PARAGRAPH: the
  body of its own box — a log entry, a report, the reason box on a sheet — and it aligns its
  own way. A LINE under something else is not (Phase 11D shots): the last words on a call
  card, the reason under a waiting card, the note under a notice or a history row belong to
  the row above them, and a line that took its own alignment sat alone at the far right edge
  of an English card at 1366, nearer the date than the company it explained. `<Prose line>`
  keeps the page's alignment for the block and the writer's direction for the words, in a
  `<bdi>`: the line starts where its row starts and reads the way it was written.
- **The brand red and the "it went wrong" red are the same colour.** `--brand` and
  `--a-red-fg` are both `#c8102e` in light mode, so a brand-tinted ring drawn round a card
  to mean "this one is yours" said "alert" in the app's own vocabulary. Colour carries one
  meaning here (§6). Say "yours" with a heading, not with a hue.
- **An effect that reacts to a server action's answer must fire once per answer.**
  next-intl's `useRouter()` returns a new object every render, so anything closing over it
  changes identity every render and the effect runs again. Use `useActionOutcome`, which keys
  on the answer's own identity.
- **A dialog's scrolling body needs `min-h-0 flex-1`.** Without them it sizes to its content
  rather than to the space left over, and the sticky footer lands on top of the last field.
- **One definition per figure, including the ones that look like a column.** "The main
  contact" is not `contacts.is_main`: archiving the marked contact clears the flag, and a
  reader that trusts the column then disagrees with one that falls back to the oldest (D18).
  Both readers call the same SQL.
- **A primary action is never disabled while data loads.** Nothing is fetched until the
  button is pressed; a button that greys itself out on arrival reads as broken.
- **A check that cries wolf is a check nobody reads.** ESLint's flat config does not read
  `.gitignore`, so build and test artefacts are ignored explicitly.
- **A server component's `<Button>` is not an element by the time a dialog slots it.** It
  crosses to the browser as a wrapper around a streamed chunk, and Radix's `asChild` throws
  on it — "failed to slot onto its children" — so the drawer goes to "This page couldn't
  load" from a tab click. Every trigger in the kit resolves it first
  (`useSlotChild`); nothing at a call site has to know. It only shows on a soft
  navigation, so pressing the button in a test that loaded the URL directly proves nothing.
- **Arabic addresses nobody's gender.** `اكتب` is "write" said to a man, and the coordinator
  who reads this app all day is a woman. Every one of those strings was correct Arabic, which
  is why reading them found nothing. Say the action instead of ordering it — the verbal noun,
  or `الرجاء` plus the verbal noun — and it reads as an office notice, which is the register
  a Riyadh office writes in anyway. `npm run check:messages` fails on the marked forms.
- **One rejected input, one sentence, and it is the app's.** `required` on an input makes
  the browser refuse the submit and show its own bubble, in the BROWSER's language and
  direction — an Arabic screen in an English Chrome answered "Please fill out this field",
  and the action that has a sentence for exactly that case never ran. Forms carry
  `noValidate`; `required` stays, because it is what a screen reader announces.
- **A screen is readable before it is live.** React takes over the server-rendered HTML a
  moment after it paints, and a press in between does nothing at all — no error, no dialog.
  The fast screens lose that race, so a suite passes cold and fails warm. `<Hydrated>` marks
  the document when React arrives and every page load in a spec waits for the mark.
- **A value imported from a server library reaches the browser; a type does not.**
  `import { splitProjectOption } from "@/lib/pickers"` in a client dialog pulled the
  module, then `@/db`, then Auth.js, then `server-only`, and the build failed in eleven
  places at once naming a Pages Router that does not exist here. `import type` is erased
  and is always safe; a VALUE is not. A pure helper and its type that both sides need
  live in their own file with no query in it (`src/lib/picker-option.ts`).
- **A control sits beside the fact it changes, not in the row of buttons.** Handing a
  company to somebody else changes one line of the header — whose it is — and the action
  row below it was already carrying the four buttons it can hold on a phone. So the
  control went next to the rep's name, which is also the only place a manager, who is
  offered no action row at all, could ever have found it. The rule generalises: a row of
  buttons is for work done TO a record; a control that edits one stated fact belongs
  against that fact.
- **One mark, one card surface — a screen that draws its own has already drifted.**
  The sign-in screen painted a second K in `bg-brand`, which is a different colour in
  each theme, while `BrandMark` (whose own comment calls itself "the one place the mark
  gradient appears") sat one import away; and it used the component library's card, the
  only one left in the app, with a ring instead of a border and no shadow or hairline.
  Neither was visible to anyone reading screenshots — both were obvious the moment the
  file was read beside the ones it should have matched. If a surface or a mark exists as
  a component, no screen builds its own, and the first screen least of all.
- **A bar takes the FOREGROUND colour of its tone, never the pill tint.** `TONE_CLASS`
  is a background for a pill with text on it — nine to fourteen per cent alpha — and
  `--color-state-over` is `--surface-2` exactly, which is also the empty track every bar
  in this app draws itself on. So the withdrawn bar on the chain card was painted in the
  colour of the track it sat in and could not be seen, while the six-month card had
  hand-written four `-fg` conditionals to dodge the same trap. A drawn mark takes its
  tone's foreground colour (the chart colours in `src/components/metrics/colors.ts`), never
  the pill tint.
- **Colour may carry a state; it may never be the only thing carrying it.** The
  coordinator's queue said "3 working days" in red for a request that was late and "3
  working days" in grey for one that was not — the same words in the same shape, the
  whole difference in a hue. It says the word "late" now. The six-month card passes this
  on a different carrier: the dashed target rule is drawn across every column, so a bar
  that fell short is visibly under its own line whether or not its colour is legible.
- **A label is never truncated; a label that has to be cut is carrying something it
  does not need.** The six-month card wrote "Sep 2026" into a column 47px wide on a
  phone and let CSS cut it. In English that read "Sep 20…", ugly and harmless. In
  Arabic the cut fell the other way and «سبتمبر 2026» came out «سبتمبر 6…» — a year
  that reads as a DIFFERENT year, on a chart axis, where the label's whole job is to
  say which month this bar is. A smaller font and a wider column only move the width
  at which it breaks. The year is the same on five of the six columns, so the name
  goes on one line and the year on a second, inked on the first column and wherever
  the year turns over, with the slot kept empty on the others so the bars keep one
  baseline. `truncate` belongs on a name somebody typed, never on a label we chose.
- **An `aria-label` must CONTAIN the words written on the control.** The Log button on a
  call row says "Log" and was labelled "Log what happened with «customer»" so a screen
  reader would say which customer — which is right in English, where the label starts with
  the visible word, and wrong in Arabic, where «سجّل ما حدث مع» does not contain «تسجيل
  النشاط». Somebody using speech input says the word they can see, and nothing happens.
  The label extends the visible text; it never replaces it.
- **A spec that reads the database waits for the DIALOG to close, not for the words to
  appear.** The words it just typed are in the box it typed them into as well as in the
  list behind it, so a page-wide text assertion passes while the write is still in flight —
  and the next line, which counts rows, then reads the database one row too early and
  blames the app. Wait for the form to close, then assert inside the panel that should have
  changed. Scope the assertion too: `page.getByText(x)` sees the whole document, including
  the form.
- **Two values of one thing are a label, a value and an aside — never one sentence with
  two numbers in it.** "Thickness 5.0 — was 4.0" put both figures in the same size and
  colour, so the only thing separating what it IS from what it WAS was the word "was", and
  a coordinator scanning nine fields reads a string of digits. The value she is about to
  act on now sits where every value on that drawer sits, after its label; the old one is a
  fainter aside behind it. And never an arrow between them: an arrow is a left-to-right
  glyph on a screen that is read both ways.
- **A row of three facts is a row on a desk and a column on a phone.** The stuck list put
  the customer, the rep and the age on one flex line at every width, with `flex-1 min-w-0`
  on the customer — so the customer's name was the only child allowed to shrink, and on a
  375 screen it gave up every pixel to the two beside it and came out one word per line,
  its first word touching the rep's name. The fix is not a truncation: the name is what the
  row is FOR. Stack below `sm:` and keep the one-line row above it, which is what the
  tables on this app already do. Where a row's pieces cannot all shrink, the one carrying
  the subject must not be the one that gives way.
- **A band of figures has a cell for every figure and no cell for none.** The strip was
  written as four columns on a desk and two on a phone, whatever it was given, so a strip of
  two sat in the left half of a full-width card with the right half bare, and a strip of
  three left a hole under the second figure at 375 — both read as a tile that failed to
  load rather than as a band with two or three figures on it. Above `sm:` it takes as many
  columns as it has figures; on the phone grid an odd last figure takes the whole row. The
  rule generalises past this component: a grid whose item count is not a multiple of its
  column count either fills the gap or says why the gap is there.
- **A surface with more below it says so, and a list says how much it left out.** Two
  shapes of one defect. A dialog whose body scrolls looked exactly like one that ended at
  the fold — the overlay scrollbar fades, the footer stays visible above the part nobody
  can see, and the request form read as though it finished at Add item. And every list
  rendered every row it was given, at both widths at once, so a floor of a thousand was a
  thousand cards and a thousand table rows in one document. A scroller carries the hint
  (`scroll-hint`, four backgrounds and no JavaScript, on `FormBody` so every dialog has it
  at once); a capped list carries `ListTail`, which says how many are here, how many there
  are, and that the search box is how to reach the rest. The figure above a list is never
  the length of what was drawn.
- **A flex column that scrolls shrinks its children before it overflows, and a card hides
  what it cannot fit.** The worse half of the same pass, and invisible: at 375 the totals
  block on the request form computed to 26 pixels high with `overflow: hidden` from
  `card-face`, so the m² line showed and "Total excl. VAT", "VAT 15%" and "Total" were
  simply not on the screen, with the notes box painted where they had been. At 1366 the
  same block was 122 pixels and perfect. Nothing was clipped in the sense anybody would
  report — the numbers were gone, and the form still looked like a form. Every scroller in
  the app is `scroller` now, which is the overflow and the rule together: `& > * {
  flex-shrink: 0 }`, so a scroller scrolls rather than squeezing what is inside it.
- **A control that would replace what somebody typed either asks first, or is only there
  while there is nothing to lose.** "Copy the items from Q-12" fills a whole form from an
  earlier quotation, which is the point of it — and pressing it after ten minutes of typing
  would be a confirm dialog nobody wants on the ninety-nine per cent of presses that happen
  on an empty form. So the offer is rendered only while the form is untouched: one item,
  with nothing typed into the fields a blank one leaves empty. It leaves the moment he
  starts, which is also the moment it stops being what he wants. A control that disappears
  is not a control that lies about what it does.
- **The same words may say two things on one screen; a spec then names the ELEMENT, not
  the words.** The quotation drawer says "Sent back" twice over — once as the badge under
  its name, which is where it is now, and once in the trail, which is what happened on the
  27th. A reader tells them apart by where they are and never notices the repetition; six
  assertions matching that text exactly broke the moment the trail arrived. The wording is
  not the defect and rewording to keep a locator unique is a screen bent around its test:
  a spec that means the badge asks for the badge, by the `data-tone` attribute every state
  badge already carries. Every element a spec needs to name has an attribute that says
  what it IS (`data-tone`, `data-event`, `data-slot='figure-sqm'`), and no class names.
- **A browser exception is a test failure, wherever it surfaces.** This one reached a spec as
  three unlabelled disabled buttons — Next's error overlay, counted by a check looking for
  dead controls. Every spec now fails on the exception itself and names it.
- **A list mounts one dialog, and draws its rows as data.** Found by the first walk at the
  founder's volume (P10d), on the one screen a rep opens most. The day screen offered Log on
  every card and mounted a whole dialog behind each button — a hundred closed forms on his
  home page, each written into the page with its own props. And the cards themselves were a
  server loop over client leaves: a link, a button and an icon per row, each serialised on its
  own with its class strings, so the page carried half a megabyte of one card written a
  hundred times. Measured on Faisal's floor of 288 (100 cards, 64 waiting rows), in
  development, both measured before the waiting cap (D83) landed, so the difference is the
  shape alone: 1.04 MB and 1.56 s before, 0.56 MB and 0.49 s after; the manager's stuck list
  was the same shape and went from 292 KB to 211 KB, 0.71 s to 0.50 s; a company drawer with
  three hundred history entries — the one list left whole on purpose (D80) — went from 1.68 MB
  and 2.0 s to 1.09 MB and 0.6 s, because every entry's words had been travelling a second
  time as props to the Correct button beside them. Nothing a person sees changed. Two rules follow. A dialog a ROW can open is mounted once per screen by a host
  (`LogDialogHost`) and the row renders a button that says only which company it is about
  (`LogButton`); there is no trigger-owning variant left to reach for, and a button outside a
  host throws rather than silently doing nothing. And a list of more than a handful of cards
  is drawn by ONE client component from plain rows — the server decides what each row says,
  the client draws it — so the page carries the rows once as data and the card once as code
  (`CallBand`, `WaitingList`, `StuckRows`, `ActivityList`). The tables had always been built
  this way; the card lists had not, and the difference was invisible at twelve companies (D82).
  Gzip hides most of it on the wire — the two-hundred-row customer list is 67 KB compressed —
  which is why the measure that matters is the server's render time and the browser's
  hydration, not the raw byte count.
- **A write holds its row, then decides.** The first thing the stranger read found (P11A, D85):
  every transition in the quotation and dispatch chain checked "still waiting?" before its
  transaction and wrote by id alone, and the dispatch quantity check was a plain SELECT whose
  comment promised what READ COMMITTED does not give. Two hands on one row is not a rare
  case in a fourteen-person office — it is the coordinator and a rep with the same drawer
  open, or one person with two tabs. The rule: a transaction that moves a record begins with
  `SELECT … FOR UPDATE` on that record (`holdQuotation`, `holdDispatch` in `src/lib/hold.ts`),
  asks the state inside the hold, and returns the sentence the app already has for that state
  when somebody else got there first. A check at the door is not a lock on the door; write
  the hold first and the check after it, and never claim in a comment what the isolation
  level does not do.
- **A terminal action says why, and records only what it did.** Three shapes of one fault in
  the stranger read (P11A, D87). Archiving a company wrote a date and nothing else, while every
  other terminal state — lost, sent back, refused — carries its reason and S16 promised the
  record would show why; unfile was offered on any day while its sibling, correct, kept to the
  reporting window; and five admin writes logged an audit row whether or not a row had changed.
  The rule has three clauses. A state a person chooses for a record asks why, in a short free
  box, and keeps the answer where the record is read — on the row and in the audit line — not
  in a list of reasons nobody asked for. Two actions on the same record take the same window,
  checked in the action and shown on the button; a gate on one and not the other is a gate on
  neither. And an audit row is written after the database has handed back the row it changed,
  never before and never regardless — `.returning()` and a count, then the log, or "not there
  any more" in the reader's words.
- **A typed key is refused by name, and can be corrected.** The SMAC number (P11A, D88): unique
  by index, typed by a person, and the only link to the money. A unique typed key fails in two
  ways — typed twice, or typed wrong — and a screen that answers the first with "something went
  wrong" and the second with nothing has no answer to either. The rule: when an index fires,
  the sentence names the record that holds the value, at the field (`src/lib/smac.ts`,
  `violatedUnique` in `src/lib/pg-errors.ts` — the driver's error is wrapped, and a check that
  reads the top level is a check that never fires); and the person who types the key can
  correct it in place, with the old value kept in the trail. A correction is not a second
  transition: status, instants and months stay where they were.
- **A drawer says what it writes.** Three places in the stranger read where the screen and the
  write disagreed (P11A, D94): the company drawer raised a quotation against no project while
  S18 says every quotation belongs to one; its follow-up picker wrote the company's own date
  while the list coloured the row by the earlier of that and its projects', so "cleared" could
  leave the row amber; and correcting or unfiling a log entry wrote its audit row and told no
  open screen. Three clauses. A dialog that creates a child asks for every parent the record
  must have, and when there is none to pick it offers a sentence instead of a button that the
  action would refuse. A control that writes one column, on a screen coloured by another, says
  so where it sits — the drawer names the project and its date under the picker, and the clear
  toast says what still stands. And every write that moves a count sends the live event the
  first write sent: a correction is news exactly as the entry was.
- **A width that fits in English is not a width, it is a coincidence.** `StandingStrip` truncated
  its value, and an Arabic month name is wider than "Aug": «31/أغسطس/2026» in a 103px cell at 375
  read "31/أغسطس/6…", a date that does not exist, with an ellipsis nobody reads as a warning (§5
  #165). The file's own caption rule was one line below it — a sentence that truncates says
  something else — and the value needed it more, because **a figure that truncates IS something
  else**. Anything whose whole job is to be exact wraps rather than clips, and a width is measured
  in the locale that needs the most of it.
- **And the mirror is a defect too: a screen never HIDES work the action would allow.** The
  quotation drawer gated its Send button on the raiser alone while the action behind it asks the
  wider question §3 actually states — the customer's rep, or anybody put on the job (§5 #163).
  Until a project could be shared the two predicates named one person, so the narrow one looked
  right for eleven phases. A refused button says why; a missing one is a permission nobody can
  find and nobody will report. **A control and its action ask the same question, in the same
  words, from the same function** — and when a permission splits in two, every screen that read
  it has to be asked which half it meant.
- **A figure agrees with the figures under it.** Three strips in the stranger read where the
  number and the sentence beneath it were two different reads (P11A, D95): six open quotations
  over "3 with the customer", a headline of quiet people over rows that excused some of them,
  and a longest wait over two lists that did not contain it. The rule has two clauses. A strip
  is read once: the figure and every part named under it come from one query, so the parts add
  up to the figure by construction and not by luck (`openQuotationsForRep`), and a predicate a
  row is coloured by is the predicate the headline counts (`isQuiet`). And a caption over a
  list comes from the list's own rows, never from a second query over the same tables — the
  second query is the one that forgets a filter the first one had.
- **A guard covers every door.** Three from the stranger read (P11A, D96). A guard written for one
  gesture is a guard against that gesture: D84 stopped the tap beside the sheet and not the
  swipe back from its edge, which reaches the same words by a different route. When a screen
  protects unsaved work, it protects it against every way the screen can leave — tap, back,
  and navigation — or it says which one it does not. A file the app writes for another program
  is written for that program's reading of it: the CSV is quoted for Excel's commas and
  apostrophed for Excel's formulas, and the test for it is a list of cells, not a screenshot.
  And a check that guards a family by name guards only the families it was told about: the
  list of computed-key families in `check-messages` is the whole list, found by grepping the
  call sites, and adding a computed key means adding its line there.
- **A day as it happened.** Three from the stranger read (P11A, D97). An off day is offered, not
  owed: the box is there while the day is open and the sentence beside it says nothing is
  required, so the one who worked the Saturday can say so and the one who did not is asked
  nothing. A card shows the figures its person can move and no others — a nought somebody
  cannot change is not a fact about their day, it is a fact about their role, and the manager
  reads it as a floor that did nothing. And working-day arithmetic reads the calendar back to
  the day it counts from, never from a convenient anchor like the first of the month or sixty
  days: the anchor is the second definition of "when the wait began", and the two disagree the
  first time a wait is longer than the anchor.
- **A number is a call.** Three from the stranger read (P11A, D98). A phone number on screen is
  drawn once (`PhoneLinks`) and is two verbs — message and call — because a screen named for
  calling that only messages is missing the verb in its own name; the number stays the visible
  label of the message link, and the handset is icon-only with the person's name in its label.
  A card that lacks a thing says so in the words the list uses for the same lack — "No contact
  yet" on a call card, not silence. And a prompt that takes a value names what the value is for:
  a number typed against "Q-12" is typed against a label, and the customer's name under the
  title is what makes it typed against a company.
- **Derived from the source, walked in the spec.** Three from the stranger read (P11A, D99). A
  list a screen is built from is the list a test sweeps — read from the same constant, never
  retyped beside it, because the retyped copy is the one that misses the seventh entry. A rule
  every page of a kind applies is one function those pages call, not two lines each of them
  carries. And every state the business has is in the seed and is reached once in the spec
  through the screen that reaches it: a state the demo never shows and the walk never enters
  is a state whose screen nobody has read.
- **The database says what the code assumes.** Four from the stranger read (P11A, D100). A
  rule a write relies on — a closed list, a uniqueness, a normalised value — is a constraint
  the database holds, not a type or a Zod line the database never sees; and a closed list is
  written once, with the check reading the constant the type is derived from, so the two cannot
  disagree. An index is added for a read that exists, named for the read, and the read is
  cited beside it. Every one of them is tried in `tests/schema.spec.ts` (rules/data.md: a
  constraint is only worth what it actually refuses).
- **What it says it is.** Four from the stranger read (P11A, D101). A stage's words are true
  of every row it counts, and where a count hides an age the age is said beside it. A dialog
  opened from a card starts on what the card shows. Dead code is deleted, not kept for a badge
  nobody built. And a check that exempts a whole namespace checks nothing there — it exempts
  what the source can produce, read from the one table both checks share.
- **One word for one thing.** Three from the stranger read and the reviewer's notes (P11A,
  D102). SPEC §5 is the glossary and it wins: one word per thing in each locale, the same word
  on every screen, and the words it forbids fail the build (`check:messages`). A sentence with a
  sign in it has three branches, and the third — the same — is a sentence of its own, not "0%
  up".
- **A test that cannot pass for nothing.** Four from the stranger read (P11A, D103). No
  assertion behind an `if` the page decides; no click that happens only when the button is
  there; no rule retyped beside the one the app uses — a spec imports it. And a check the
  documents call part of the build is in the build.
- **A seed obeys the business it fakes.** One from the stranger read (P11A, D104). Whatever
  writes rows the actions would have written — a seed, an import — leaves the trail the
  actions leave, keeps to the floor and the calendar, and checks its own output against the
  database before it reports done.
- **Live is proved, not promised.** Phase 11B (D105). A live update is a spec with two people
  in it, not a diagram: raise here, see it arrive there, no reload, timed. Every list marks a
  row somebody else just touched, from the one provider, and the mark's clock starts when the
  refreshed row is on screen, not when the event landed. A read never goes through the write
  door. And a channel that can be away says so when it is back — one resync, not a hole.
- **Closed where the code is closed.** Phase 11C (D106). A column the code fills from a list
  refuses anything off the list; the list is written once, beside the column, and the type
  is derived from it. A column that explains a state is empty when the state is not there.
  And the schema file and the catalogue are held to each other by a test, both ways.
- **A read is measured, not assumed.** Phase 11C (D107). Every screen's statements are logged
  from the production build against the volume floor and the slowest explained with the app's
  own parameters; an index is added where a plan walks a table once per row, and nowhere else,
  because a whole-table scan of four hundred rows is the planner being right. The baseline
  lives in WORKFLOW §3 and a change to a read is measured against it.
- **A count counts the rows its list shows.** Phase 11D (D108). A pill, a chip or a band's
  number is the list's own filter counted — the same function, the same date expression,
  one per row of the kind that list draws: companies where the list is companies, projects
  where it is projects. A figure counted any other way (dates, say, when the rows are
  companies) is a number above rows it does not describe, and "clicking it lists them" stops
  being true. The spec for it holds the sentence on the pill to the count of the rows.
- **The archive is read, not only written.** Phase 11D (D109). A record kept for the day
  something resurfaces is looked at on that day: the duplicate check matches archived
  companies and says so, with the day and the reason. A warning carries what the person
  decides by — where, when last worked, why it left — and a reason somebody typed is a block
  in its own direction, under the sentence.
- **A notice names its subject in words a person recognises.** Phase 11D (D110). A number is
  a label, not a name: the sentence carries the customer, resolved at read time from the
  notice's subject, never copied into the row — the same rule as the rep's name (D68), so a
  rename reads right and an old row reads the same as a new one.
- **A card that asks for work carries the reason.** Phase 11D (D111). A row that tells a
  person to do something — call this customer, answer this request — says why in the words
  that were written when the reason arose, on the card, not on a screen behind it. The words
  are a typed block: one line, clamped, in their own direction.
- **The person who checks a figure sees the figures it is checked against.** Phase 11D
  (D112). A sheet that asks somebody to approve a quantity shows, beside it, what the paper
  allowed, what other requests already hold, and what is left — computed by the same function
  the form that typed the quantity used, never by a second one.
- **A chore is entered once.** Phase 11D (D113). When the same fact recurs on consecutive days
  — leave, a holiday — the form takes the span and the action writes the rows; the row stays
  the unit the rest of the system reads, and a day already there is not written twice.
- **A dialog with a text field is a form.** Phase 11D (D114). Enter submits it; a multi-line
  field keeps Enter as a new line and takes Ctrl/Cmd+Enter. A dialog that saves from a
  button's `onClick` is one that missed the form shell.
- **A form starts from what the app knows — never from the record before it.** Phase 11D
  (D115, with D74 and D101 before it). The last value of a recurring figure is shown where the
  new one is typed, with one press to keep it; a list with one entry is chosen; a list with
  several is not guessed at. What the app knows is a PARENT's own answer — the store a
  quotation was priced out of, on the dispatch under it — and never the answers of the last
  record of this kind: D81 opened a dispatch on the previous dispatch's site and terms, and
  §3 overruled it outright (D160). A child reading its own parent is not this rule's opposite;
  one record prefilling the next one like it is (P12-10).
- **A row names its person where the reader is not that person.** Phase 11D (D116). On a
  shared desk a row says whose it is, in the reader's script; on somebody's own list it does
  not tell him his own name.
- **A row is a door, all of it, and the door is written once.** Phase 12-11 (D161). Where a
  list draws records, pressing anywhere on the row opens the record — the phone's cards have
  been whole links since P8 and the laptop's tables are the same rule in a wider shape. It is
  the row's own title link stretched over the row, never a click handler on the row: one
  anchor, one tab stop, one thing a screen reader announces, and Cmd-click and the middle
  button still work from anywhere along it. A second link inside such a row has to lift itself
  out of the overlay (`relative z-10`, as the phone chip does), and text inside the row cannot
  be mouse-selected — the accepted trade, because the drawer behind the row is where the text
  worth copying is. **One spelling.** Customers, projects and the call band each stretched
  their own link by hand, in three arrangements of the same four classes, and P12-11 was about
  to write a fourth: `row-door` on the row or card and `data-door` on its link is the whole
  pattern now, the overlay and the focus ring live in `globals.css`, and `one-look` refuses
  the fifth spelling.
- **A record leads with the number the world outside Kladra knows it by.** Phase 12-11 (D161,
  with S3 and S4). SMAC's number is on the paper the customer holds and in the system that
  holds the money; Kladra's own Q-12 or D-3 is how this app refers to the record. So a row
  leads with SMAC's where there is one and says Kladra's quietly under it, and leads with
  Kladra's alone where there is not — a request nobody has issued has no other paper to name,
  and an empty slot is a field a reader has to decide is empty. A row that names ANOTHER
  record names it the same way, because the reader is about to go and look it up. Drawer
  titles, notifications and pickers keep Kladra's name: they are the app talking about its own
  record.
- **A number that names something is not a figure.** Phase 12-11 (D161). A quantity is
  measured and a reference number is said: the paper's (Q-12, D-3, SMAC's own), the customer's,
  the telephone's. It is set in the same face as a figure so a column of them lines up, it runs
  left to right whatever the page does because a person says it in that order in both
  languages, and it is never translated — a browser that rewrites its digits into another
  script has renamed the paper the customer is holding. One component, `Ref`, beside `Sqm` and
  `Money`.
- **A direction belongs to a run, never to a box.** Phase 12-11, generalising the `<bdi>` rule
  of P12-8. An element that carries `dir` resolves `text-align: start` against its own
  direction, so a block-level one — anything given `block`, or simply a child of a flex column
  — leaves the side of the page everything else is on. Turn the RUN around and let the box keep
  the page's direction. It is why `Ref` is two elements and why `<bdi>` is never the block.
- **A record says what its screen does not already know.** Phase 12-13 (D162). The same log
  entry on a customer's drawer and on a person's day is two different lines: the drawer knows
  the customer, so the entry adds the day and the writer; the day's card knows the day and the
  writer, so the entry adds the customer. Printing all of it in both places is how a list stops
  being read — three of the four would be identical on every line of it.
- **A count is a door.** Phase 11E (D117). A number that counts rows opens those rows, with
  the filter the list itself uses, and is underlined so the reader knows it is a door; a zero
  is plain text, because a door onto an empty room is a dead end. A bare count a person has to
  go and verify is a figure that made him do the system's work.
- **A sum of estimates is whole.** Phase 11E (D117). Metres somebody measured — a quotation
  line, a dispatch — keep their decimals; metres somebody estimated and added up are whole,
  and ".00" beside a table of whole figures is a fraction of nothing.
- **A list of waiting says of what kind it waits.** Phase 11E (D118). Work stopped on the
  reader sorts above a customer's silence, and a heading's total is split into its kinds,
  each a door to that kind's own list, so twenty-five cards under "83" never again hide
  which fifty-eight are missing or that most of them are somebody else's turn.
- **What the action will refuse, the screen says first.** Phase 11E (D119, after D112). A
  control whose action would be refused is disabled with the sentence the action would refuse
  with, on the row and on the sheet, before the press — never a live button that fails.
- **A figure's window is in its words, from the constant it counts by.** Phase 11E (D120).
  "This week" over a trailing seven days is a second definition in prose; the sentence takes
  `{days}` from the constant the query uses, with a plural, so the two cannot drift.
- **A noun after a number is counted.** Phase 11E (D120). "1 Companies" and "Of the 1 raised
  … each one" are headings borrowed as sentences; a sentence with a number in it carries an
  ICU plural in both locales, and Arabic's six forms are written out.
- **A warning that names a record is a door to it, where the reader may open it.** Phase 11F
  (D121). "This looks like X" with no way to look at X asks the reader to remember, or to
  abandon what they were typing. The name opens the record over the form — a drawer over a
  dialog is two layers, and the top one closes first — and the form is still there, still
  full, when the record closes. Where the reader may not open X (another rep's floor, S8) the
  door is not drawn, and the warning names the person who can.
- **A screen that cannot draw itself is still a screen.** Phase 11G (D122). No `error.tsx`, no
  `not-found.tsx`: a failed query or an old link handed the reader Next's own page. One card,
  two faces, inside the shell, in the reader's language; Try again where there is something to
  try; Home as a full load; nothing internal on it.
- **A look is asked for by name.** Phase 11G (D123). A `default` variant is a look nobody
  chose: six dialog footers wore a flat brand red because nobody had written `brand`. `Button`
  and `Badge` require `variant`, and a missing name is a type error rather than a second primary.
- **Current is a wash, never a ring.** Phase 11G (D123). The board's open card wore a ring in the
  alert red §1 had retired; the open row of a list is a `bg-surface-2` wash, and so is the card.
- **What the server can decide, it decides before the first byte.** Phase 11G (D124, D125). The
  rail's width, the browser's chrome colour and the offline splash's theme all used to be decided
  in the browser after the first paint, and each snapped. Each is a cookie the server reads — or,
  for the splash that has no server, a cookie the browser may read.
- **A pressed link says it is working.** Phase 11G (D126). Every navigation to a search parameter
  — a row, a chip, a view, a card, a pill — carries `LinkPending`, invisible for 150 ms so a fast
  answer shows nothing. It is not a spinner on the page; it is a mark on the thing that was pressed.
- **Empty says why.** Phase 11G (D127). "Nothing matched" and "nothing yet" are two sentences; a
  board of empty columns is not a sentence; a clear desk needs no search term; a status the page
  fixed offers no "All"; the way back from an empty list keeps whose floor it was.
- **A colour that reads on a light row may not read on a dark one.** Phase 11G (D123, P11B-1).
  The arrived flash began from the amber tint, 14% over the canvas, and on the queue's dark rows
  it was invisible. It begins from the amber text colour at a third: still a colour, no travel,
  and visible in both themes. Every colour that carries information is looked at in both.
- **A guard written in SQL does not short-circuit a cast.** Phase 11G (§5 #99). `'' <> '' and
  number = ''::int` failed on the cast before the guard was read, and any search term without a
  digit took the quotations, dispatches and queue lists down. The decision is made in TypeScript
  (`numberInTerm`), and the integer is bound only when there is one (rules/data.md).
- **The phone line is drawn once.** Phase 11H (D128). `src/lib/breakpoint.ts` names it in Tailwind's
  own words, `(width < 48rem)`, `useIsPhone` reads it, the stylesheet says `md:` and `max-md:`,
  and `one-look` refuses any other width query in src — `max-width:`, `max-sm:`, `max-[…]:`, a
  range. It was 639, 640 and 768 in three files, and the pixel between two of them had a bottom
  bar under a centred dialog; `(max-width: 767px)` would have put the half-pixel between 767 and
  768 there too. The one exception is the blur strength at 980px, allowed by that line alone.
- **Every form is a sheet on a phone, and Save is the lowest thing in it.** Phase 11H (D129).
  `ResponsiveDialog` is the only way a form opens; the raw `Dialog` is for the search palette. A
  bottom sheet's footer stacks Cancel above Save — the thumb rests at the bottom, and the kit's
  `flex-col-reverse` had put Cancel there — and pads for the home indicator with
  `env(safe-area-inset-bottom)`, like the bottom bar and every other thing that touches the
  bottom edge of a phone. A sheet that covers what it was opened from names it in the title.
- **A thing a thumb presses is 44px; the glyph may be small.** Phase 11H (D130). The `touch`
  utility is the rule, written once in globals.css and carried by the kit's controls and the two
  links on a card; a control's own height still wins from `md` up. Apple's and Android's figure,
  not ours. A stretched link under raised controls is allowed because the controls are that
  size; below it, a miss opens the wrong thing.
- **A library's motion is held to the band.** Phase 11H (D129). vaul slides a sheet in 500 ms and
  injects its own stylesheet; globals.css holds it to 250 with `!important`, the one place that
  word is the honest tool, because the library writes the drag-release transition inline. The
  motion spec measures the sheet like it measures the dialog and the drawer.
- **A sheet that carries words does not swipe away.** Phase 11H (D129). Moving the log onto vaul
  brought a gesture the dialog never had: a drag down dismisses. `ResponsiveDialog` hears every
  `input` event under it, and once something is typed — in any of the fifteen forms — the sheet
  does not drag (`handleOnly` with no handle), the pill goes, and a tap beside it does nothing
  (`onPointerDownOutside`, which vaul reads before Radix does); Cancel and Escape — deliberate —
  still close it, as D84 says. A form that knows more than its inputs say — the log's chips and
  dates — adds `guardOutside`. The first cut held the log alone, and the critic swiped a
  half-typed project into nothing.
- **What a finger is on is never swapped under it.** Phase 11H (D129, §5 #127). `useIsPhone` is
  false on the server and true a moment after hydration, and everything inside the branch it
  chooses is unmounted and remounted on that moment. A Radix trigger inside the branch was a
  new button by the time the press finished — one open in thirty on a loaded machine, at a
  phone width, in three gates. The opener stands outside the branch, a plain button with the
  dialog's `aria-haspopup` and `aria-expanded`, and the two faces hand focus back to it on close
  because Radix hands it back only to its own trigger. Anything else that swaps on the phone
  line — the drawer's side, the sheet's face — swaps while closed and holds no finger.
- **A read is asked once per request.** Phase 11I (D131). Anything a layout, a page and the
  figures under it all need — who is signed in, the calendar of non-working days — is a
  function wrapped in React's `cache`, so the request reads it once however many components
  ask. A new kind of shared read goes in `src/lib` behind `cache` from the day it is written,
  and `npm run measure:reads` says what every screen costs before the commit that touches it.
- **No answer is an answer.** Phase 11I (D132). A server action's promise has three ends — a
  result that is ok, a result that refuses, and a rejection when nothing came back at all — and
  React hands the third to the error boundary, from a form's `useActionState` as much as from a
  `startTransition`, which throws away the screen and everything typed on it. No client code
  calls an action bare: `const guarded = useWireGuard()` and `guarded(action)(…)` turn the
  rejection into a refusal that says `common.unreachable`, and every refusal path already puts
  its sentence where the person is looking — the footer, the field, a toast — with the form as
  it was. `useSubmitAction` goes through the guard; so does a site that awaits an action itself,
  one that reads it with `.then`, and a form that passes one to `action=`. `npm run lint` refuses
  all three shapes. The two exceptions are `signOutAction` and `stopViewingFormAction`: both
  return nothing and end in a redirect, so there is no result to turn a refusal into and nothing
  typed on the screen to lose — each is disabled at its line with that reason written there.
- **A figure is not the length of a list.** Phase 11J (D144). Every list here is capped, so the
  count above one is a different question from the rows inside it — asked of the same predicate,
  never of the array. The two must not be able to disagree, which is why the predicate is shared
  (`narrowTo`) rather than the number derived, and why a screen that caps says so with a tail.
- **The chips over a list are one component, and so is the row they sit in.** Phase 11J
  (D145). Five copies of the chip and four of the row, and the copies disagreed about the two
  things nobody notices until a screen is narrow: what a pressed chip does while it waits, and
  what wraps first. What changes the SHAPE of a list — the list/board switch — is not one of the
  filters that change what is IN it, and below the phone line it takes its own row (D128). A
  divider is a mark on a line: drawn where there is a line to mark, and only between things it
  has to separate.
- **A record that passes through hands says what happened to it.** Phase 11J (D143). Two people
  own a quotation at different moments and three own a dispatch, and every one of those handovers
  already writes an audit row inside the transaction that made the change. A chain record whose
  drawer shows only its current state asks the reader to remember the middle — so each one gets
  the same trail, off the same log, with the same shape: what, when, who, and the words the event
  carried. The list of what can happen is a module (`quotation-events`, `dispatch-events`), the
  actions build their audit string from it, and `check-messages` demands a sentence per member in
  both languages, so a new transition cannot reach a screen without a word for it.
- **Working days for lateness, calendar days for silence.** Phase 11J (D141). Two clocks run in
  this app and which one a figure takes is decided by what the figure accuses somebody of. Anything
  that says a PERSON is late — a request on a desk, a promised call, a stuck band, a pace line —
  counts working days, because a weekend and a holiday are not somebody's fault and a rep back
  from Eid must not be told he is nine days behind. Anything that measures a CUSTOMER's silence —
  gone quiet, never contacted — counts calendar days, because a fortnight of silence is a
  fortnight whoever was at work, the band carries no blame, and counting working days there would
  hold back the very customers a rep should ring the morning he returns. The arithmetic for the
  first kind lives in `@/lib/workdays` and is never written again in SQL.
- **Two cards on one screen answer over one window.** Phase 11J (D140). "Where quotations go"
  and "Why we lose" are two halves of one question and both read `CHAIN_WINDOW_DAYS`, from the
  module that defines it. A reader cannot hold two quarters, and the next card added to that
  screen must take the same window or say in its own sentence why it does not — which is the
  two-figures rule (rules/words.md) applied to time rather than to thresholds.
- **A stored code is never a word on a screen.** Phase 11J (D138). `projects.lost_reason` holds
  one of nine codes or, for "Other", the rep's own line — one column, two kinds of value, and the
  rule for reading it back lived in a client hook on one screen. The company drawer printed the
  column, so a rep opened a customer and read "competitor". A column whose values are keys gets
  ONE reader, in `src/lib/loss-reason.ts`, callable from a server component and a client one, and
  the list in it is the union `check-messages` demands a word for. The Never list already says no
  internal codes on screen; this is what that costs in code.
- **A hit opens something for whoever pressed it.** Phase 11J (D139). A destination is not a
  property of the record, it is a property of the record AND the reader: the same company row is
  a drawer for the rep who owns it and an empty screen for the coordinator, who holds no floor.
  Anything that navigates from a shared surface — the palette, a notification, a link in a
  sentence — is written as a function of the role, or it is a dead end for somebody.
- **A field that is written is read somewhere.** Phase 11J (D136). A form that takes something
  from a person owes them a screen that gives it back; a field whose only reader is the form it
  was typed in teaches people to stop filling it. Before a field is added, name the screen that
  reads it, and when one is found with no reader, that is a defect and not a feature request.
- **A control that writes the URL exists once per screen.** Phase 11J (D137). Two controls
  writing the same query parameter are not duplication, they are a bug: each holds its own idea
  of the value, neither hears the other, and the one that did not write it sits there stating
  something false. It bit the queue, which draws two list tables and so had two search boxes.
  A control like that belongs to the SCREEN and is passed down (`showSearch={false}` on a table
  the screen searches for), never drawn once per list — and the same test is worth asking of any
  filter, chip or sort that ends up in `?`.
- **Speed is a number with a ceiling.** Phase 11I (D133). What a mid phone pays to draw a screen
  is measured, not felt: `npm run measure:speed` against the production build, cold and warm, and
  `scripts/speed.baseline.json` is the ceiling the next change is held to. A change that touches
  what every screen ships — a font, a library in the shell, a client component on every row — is
  measured before it is committed, and a screen that got a fifth slower or a tenth heavier is
  explained in WORKFLOW §3 or not committed.
- **A write pressed twice is one write, and only when it is the same write.** Phase 11I (D134).
  A creating action answers the same words from the same person to the same record inside two
  minutes with the row that exists (`src/lib/writes.ts`), because the press that follows "could
  not reach the server" is the same press. Every field the form stores is compared with
  `sameField`, and a row that has been archived is never a twin: what the rep changed before
  pressing again is a correction, and a twin that ignored it would lose it silently. A new
  creating action copies the twin read before its insert.
- **A session that ended is said as such.** Phase 11I (D135). `NotAllowed` carries its reason and
  every action's guard answers through `refusalKey`: signed out is its own sentence, with the way
  back in it; everything else is a real refusal and says so. That includes the actions that guard
  themselves rather than through a shared `guard()` — the two preferences, the search, the form
  lookups — and a failure that is not a refusal at all says `somethingWrong` instead of claiming
  the person was not allowed.
- **A kit cap is read before a class is written over it.** Phase 11H (§5 #122). The sheet said
  `max-h-[92dvh]` and stood 80vh tall, because the kit's own cap is an attribute selector and a
  plain class never beat it; the stated height was fiction for a whole box. The utility that
  has to win over the kit says so with `!`, and the figure is the company drawer's, 88.

- **A control reports a change only when something changed.** Phase 12 (D146). Every option in a
  picker is pressable, the chosen one included — it wears a tick, and pressing what is already true
  is an ordinary thing to do. `SearchableSelect` called `onChange` for it anyway, and the handlers
  above it read that word literally: the dispatch dialog threw away the items it had loaded for
  that quotation, then set the same value back. React bails on a setState that changes nothing, so
  the effect that reloads them saw every dependency compare equal, and the rep watched a skeleton
  that had nothing left to arrive. The guard is one line in the control rather than nine in its
  callers, because a caller that clears what it derived is doing the right thing — it is the word
  "change" that has to be true. The same trap was live in the company form, where choosing the same
  country again wiped the city under it.

- **One door, and the answer to "may he see it" is written at it.** Phase 12 (D147). The rule
  "a rep sees his own companies" was written eleven times: four private `narrowTo` predicates,
  and seven more clauses typed by hand into the readers beside them. Every copy was correct, and
  that is exactly what made them dangerous — the day a company could be shared, ten of them would
  have gone on being correct about the old rule. `seesCompany` in `src/lib/visibility.ts` is the
  sentence now, and every list, count, drawer and search asks it. The pure half stays pure:
  `mayOpen` and `mayWrite` take a role and two ids and no database (D42), so the share arrives as
  a boolean the query already asked for, in the same statement that fetched the owner. Two round
  trips to answer one question are two chances for the answers to disagree.
- **A card ends where its content ends, and cards in a row are paired by length.** Phase 12
  (D154). The metrics tab draws four cards in a two-column grid, and the first arrangement put a
  two-row card beside a nine-row one. Stretched to the row's height, the short card drew a block of
  nothing inside itself; left to its own height, it drew the same block of nothing beside itself —
  three hundred pixels of it, measured. Neither reads as "a short answer"; both read as a card that
  failed to load. So the grid is `items-start`, and the pairing is by length as well as by sense —
  which came out the same pairing here, because the two long cards are both "what happened to what
  we did" and the two short ones are both "how much of it worked". A grid of cards is a layout only
  as long as somebody has looked at it with real data in it (§5 #161).

- **A permission has a real foreign key.** Phase 12 (D147). The two newest tables in the schema
  are polymorphic — a notification and an audit row carry a type and an id and no reference — and
  copying that shape for a share would have been the obvious thing. It is wrong for this one: those
  two are pointers, where an orphan is a row nobody reads, and a share is a permission, where an
  orphan over a recycled id is somebody seeing a customer nobody gave him. Two tables, real
  references, real cascades.

- **A flag nobody can see is not a flag.** Phase 12 (D156). The founder asked for the
  coordinator's own paper to be "flagged for the manager so nobody issues their own work unseen",
  and the obvious reading is a mark only the manager is shown. That is the wrong shape twice over.
  A badge one role sees is a badge nobody can check: the person it is about cannot tell it is
  there, so nothing on the screen ever tests whether it is right, and the first time it is wrong
  is the first time it matters. And a screen that says different things to two readers about the
  same record is the shape this file has refused since P4, one mirror over from offering work the
  action refuses. So the mark sits on the drawer for everybody who may open the quotation — she
  reads it about her own, the manager reads it about hers, and neither is being told a private
  thing about the other.

- **Two questions with one answer are still two questions.** Phase 12 (D156). "Does she run the
  queue" and "does she need a queue at all" name the same person today, and the screens ask them
  separately — `scope.coordinator` and `issuesOwnQuotations` — rather than one off the other. This
  is `mayTouch` again in advance (D42): the collapse only ever looks safe until the day a second
  role runs the desk or a coordinator stops selling, and by then the two meanings have been one
  boolean for a year and nobody remembers which of them each caller meant.

- **A refusal is reachable from the control, not only announced once.** Phase 12 (P12-5 review).
  `FieldError` carries `role="alert"`, so the sentence is read out the moment it appears — and that
  is the whole of it: somebody who tabs back to the box a minute later hears its label and nothing
  else, because nothing on the control pointed at the sentence. Half the app's forms already wired
  `aria-describedby` by hand and the ones built on the `Field` primitives did not, which is two
  idioms for one fact. Every `FieldError` now carries an id and every control beside one points at
  it, derived from the control's own id rather than typed twice — a hand-written id beside a
  hand-written describedby is the second copy this file refuses everywhere else.

- **A row is a link only where the reader may open what it points at.** Phase 12 (D157). The leads
  screen is marketing's, and every lead on it sits on somebody else's floor the moment it is filed
  — which marketing may not open (S8). A table of rows that refuse most of the people looking at
  them is worse than a table of plain rows: it teaches the reader that this screen is broken. So
  the leads list carries no row links and says everything the reader needs instead — who has it,
  what they asked for, whether it has been answered — and the one reader who may open the customer
  reaches him from the screen that is his. The general form is the same rule as "no screen offers
  work the action would refuse", one step out: a DOOR is work too.

- **A count in a row of pills is a link only if it has a list.** Phase 12 (D157). The waiting
  pills on a rep's day are doors to that kind's own screen — every returned quotation, every
  refused dispatch. A lead has no such screen for him, so its pill is text in the kind's own
  colour rather than a link somewhere near enough; the list under the heading IS that kind's list,
  because leads sort first on it. The pills still add up to the figure beside the heading, which
  is the part that must not break: a set of counts that no longer sums to the total it splits is
  the figure-that-lies (rules/data.md), so a new kind gets a pill even when it has nowhere to go.

- **A decision between two records draws both of them the same.** Phase 12 (D158). The duplicate
  screen asks the manager which of two records continues, and the answer is a comparison: same
  fields, same order, same width, same four figures under each, on both sides. The moment one side
  is described better than the other the screen has answered for him — and the side the detector
  happened to write into `company_id` is not the side that deserves to win. The two are ordered by
  age, which is a fact about them rather than about the row that stored them, and the answer is
  pressed ON the record it is about, so choosing the survivor and saying what happens to the other
  are one act rather than a radio button and a submit.

- **An irreversible act names what it will do to the record that loses.** Phase 12 (D158). Every
  confirmation in this app says what happens (D24); the two that fold say it about the OTHER
  record, by name, and say who ends up with access — because that is the half the manager cannot
  see from where he is standing and the half he cannot undo. The third answer says the opposite:
  both records stay exactly as they are, and the pair is never raised again.

- **A figure's caption wraps; it never truncates.** Phase 12 (D158). A row of small figures under
  a card is read as "how much work is on this record", and the caption is the only thing that says
  which figure is which — so an ellipsis there deletes the meaning and leaves the number. Four
  counts across half a card is under 75px a column, and «جهات الاتصال» and «عروض الأسعار» — the
  app's own words, correct on every other screen — are wider than that. The columns drop to two
  until the card is wide enough for four, and the caption is allowed a second line. The general
  form: **truncation is for a name, which the reader already knows, and never for a label, which
  is what tells them what they are looking at.**

- **A form asks in the order the person has the answers, not the order the record stores them.**
  Phase 12 (D159). A rep quoting has the customer in his head, then the job, then the person he is
  sending it to; the Quotations screen asked for the job first, out of one flat list of every job
  in the building with the customer as a quieter line under each — the middle of the chain, and on
  a real floor hundreds of rows deep in the one thing he already knew. The chain is
  **company → project → contact**, each field narrowing the next, and the field further down the
  chain says what to answer first rather than opening on a list that means nothing yet. The same
  rule one level in: a quotation line asks the colour, the make-up and how many before the sheet's
  three measurements, because that is the sentence a rep says out loud.

- **A row on a shared record says whose it is, and only where more than one person has one.**
  Phase 12 (D147, D158). Two reps on one customer each keep their own contacts, and a fold puts
  both lists on one record — so the same buyer, with the same number, is legitimately two rows in
  the Contacts tab. Without a name on them the drawer reads as a screen showing one person twice,
  which is the reading that makes somebody ring the wrong rep to complain. The name appears only
  when the rows actually belong to more than one person: on a company one rep keeps people on,
  a caption that never varies is a word to read past on every row.

- **A choice belongs to a person, not to a browser.** Phase 12 (D164). Three controls remembered
  what somebody had picked — list or board, which tab, which window — and all three did it in a
  cookie, each with the same paragraph explaining why a preference was not worth a table. A cookie
  is per browser: the rep who chose the board at his desk got the list back on his phone, which is
  the founder's own sentence read back at the code. They are rows of `screen_choices` now, keyed by
  the person, the kind and the screen. Two things follow. The URL still wins, because a link
  somebody sends opens what they were looking at, and the memory only decides when the address says
  nothing. And the write says so only when it is news — the page hands the remembered word back
  down to the control, so opening a screen you have not changed writes nothing at all.

- **A record's panel is one panel.** Phase 12 (D166). Work happens in a drawer over the list, and
  four screens drew that drawer themselves: a company at 32rem, a project at 36rem, a quotation at
  42rem, so the surface changed size as a rep walked one job from the customer to the paper. Two of
  the loading skeletons were pinned to the right, which is the wrong edge in Arabic, and three of
  the four drew their line on the edge that faces away from the page. None of it was visible in an
  English screenshot or in any tally. The panel is one component now, and the general form is the
  reason: **a surface that means the same thing every time looks the same every time**, and the
  place to put that is a component rather than four class lists that agree today.

- **The number is on the screen, and holding it takes it.** Phase 12 (D165). A phone number here is
  its own link, so it is legible without being pressed (D98) — which made the founder's
  "long-press shows the number" look already answered. It was not: a tap opens WhatsApp before a
  finger can select anything, so the number could be read and never taken. A hold, or a secondary
  press, opens it as text with one thing to do — copy — and what is copied is what is shown. The
  general form: **a control that consumes the tap owes the other ways of using the thing it covers.**

## §4 Not built until asked

Drag-and-drop, bulk edit, saved views, comments, file attachments, refresh buttons, any
gradient beyond the primary button. "Charts beyond bars" came off this list in P13: the founder
asked twice for pies and rings where a share is the point, and §1b says how they are drawn.

Refused in P13's research, so the next reader does not re-propose them: a density toggle (one
setting for fourteen people, §1b); `grid-flow-dense` and CSS masonry (the first reorders what a
reader and the Tab key walk, the second is behind a flag in two of three engines); a number
ticker (motion that repeats); per-user card fields on the board (Pipedrive's seven — a settings
surface for a card that carries four things); a top-N leaderboard (Close's, built for a team where
the full table would not fit — ours fits); a bespoke PDF renderer for the report builder (the
browser prints the table).

Two came off this list in P8, and one did not. A colour-per-status map was asked for and is
built (§6). Remembering which view a person last chose is not a saved view: a saved view is
a filter somebody names and keeps, and nobody has asked for one. Drag-and-drop stays off the
list on its own merits, argued in §6.

Two more were put to the founder in P11J and answered no (SPEC §3): a screen for a coordinator
who is away, because there are two coordinators and the queue is a shared desk; and a lapsed-
customer screen, because "gone quiet" already says that on the rep's list and a second name for
one silence is the two-figures defect.

## §6 Depth (P8) — what was studied, what was taken, what was rejected

**Taken.** Good pipeline boards earn their place by showing three things a list hides: where
work piles up, what has gone stale, and who is overloaded — so a column carries its count and
a card carries its age, or the board is decoration. Role dashboards are not one screen with a
permission filter: an operator's screen answers queue health and next action, a manager's
answers where the month stands, and neither shows a control that person cannot press. A rep's
day is one prioritised list, not a wall of cards — Close's inbox and every "win the day" tool
converge on the same shape. Colour systems that survive both themes are two palettes under one
set of semantic names, checked against WCAG 2.1 AA and sanity-checked with APCA, and never
carrying meaning on their own.

**Rejected, with the reason.**

- **Drag-and-drop on the board.** Not because the Never list says so, but because every move
  this business makes needs data: Issued needs SMAC's number, Rejected and Refused need a
  written reason, Accepted is the customer's answer. A drag that opens a dialog is a worse
  button than a button. The card carries its own action.
- **A board or a card grid for companies.** The question there is "who do I call today", and
  the answer is a sorted list with dates on it. A card grid shows a third as many rows and
  hides the column a rep is actually scanning. This is how FACET grew.
- **A separate timeline view of follow-ups.** A timeline is a horizontal thing on a screen a
  rep reads on a phone. The same information grouped by day-band — overdue, today, this week,
  later — reads in one column, sorts by urgency instead of by date, and needs no second view.
  The rep's day IS the timeline, made readable.
- **AI summaries and suggested next actions on a record**, which is where every 2026 CRM
  review pointed. Nothing here has enough history yet for a summary to beat reading the last
  three log entries, and a wrong suggestion on a customer record costs more than no suggestion.

**Which screens get more than one view — the board ruling (P12-14).** A screen earns a second
view only when three things are true at once: its records have **states** worth making columns
of; the daily question about them is **where work has piled up**, not what comes next; and it is
opened often enough for the choice to be worth remembering. Quotations and dispatches pass all
three, and since §3 P13 so do projects, so they get a **board of states** beside their list, every
column carrying its count and every card its age — without those two a board is decoration.
Everything else fails one of the three, and which one is worth writing down, because each has been
asked for at least once:

- **Queue** — one state by definition. A board of it is one column, and one column is a list.
- **Projects** — ruled out here in P12-14 ("live until it is lost"), and overruled by the founder
  in P13: a job does have a life, read off its own papers — Open · Quoted · Dispatching · Won ·
  Lost (D170) — and nobody types it. A card moves because a price went out, a load was approved
  or the rep marked it lost, never because it was dragged.
- **Companies** — read for "who do I call today", which is a date order, not a state. A card grid
  shows a third as many rows and hides the column being scanned. This is how FACET grew.
- **Day and Team** — one column on purpose, in the order the work is done; a dashboard answers
  one question.
- **Daily report** — one list the whole floor reads (D56), not a manager's inbox.
- **Admin panels** — opened too rarely for a choice to pay for itself.

Where there are two, the list stays the default because it is the one that answers "mine,
oldest first". The choice lives in the URL (`?view=board`), so a link still opens what the
sender saw, and it is remembered **per person and per screen** (D164): the two screens are read
for different questions, and choosing the board for quotations says nothing about dispatches.

**The question each screen answers, and the view chosen for it (P11F).** Every screen was
read against its own question; a view is kept because it answers that question in one look,
not because another screen has it. At 375 every table becomes a card per row carrying the
same columns in the same order (D59); that is the same view on a narrower page, not a second
one.

| Screen | Who opens it | The question | The view, and why |
|---|---|---|---|
| Companies | rep; manager drilling in | Who do I call today, and where is this company standing? | A follow-up strip of doors over a list sorted by the date the call is owed, a drawer for the record. A grid shows a third as many rows and hides the date column. |
| Projects | rep | What is live, what is it worth, what is due on it? — and: where has each job got to? | The same strip and list, projects as rows, a drawer; and the board of the job's life (D170), each column counted, each card carrying the day it entered the column. |
| Quotations | rep, coordinator, manager | Where is each paper, mine oldest first? — and: what is stuck, and for how long? | Two: the list for the first question, the board of states for the second, with a count on every column and the arrival day on every card. |
| Dispatches | the same | The same two questions, one step later | The same two views, for the same reasons; the choice is remembered per screen, not shared. |
| Queue | coordinator | What is on my desk, oldest first, and how late is it? | Two lists under one strip — requests and dispatches — each row wearing its wait in working days. No board: a desk has one state, and one column is a list. |
| Day | rep | What has come back to me and is stopped, and who is owed a call? | One column in the order the work is done: the month, stopped work by kind (D118), the calls in bands by how late. Not a grid of cards: every figure here is acted on before lunch. |
| Team | manager, admin | How is the month, who is doing it, what has stopped moving? | The company's month and its six months, a strip of what is stuck, one row per person, the chain as a population, then the stuck lists. Not a dashboard of tiles: the order is the order the questions come in. |
| Daily report | everybody | What did each person do today, and what did they say it meant? | Your own card with the box, then everybody's, alphabetically — one list the whole floor reads (D56), not a manager's inbox. |
| Notifications | everybody | What came back to me? | A list, newest first, each row naming the customer (D110); read is a state, not a view. |
| Admin: users, targets, lookups, holidays, use, archive | admin (users and holidays: the sales manager too) | One question each: who may sign in; what is each person aiming at; what words the pickers offer; which days are off; who is using it; what left the floor. | One panel each — a table or a row of boxes with its one action beside it. No second view: none of these is opened often enough to earn a choice. |
| Export | on every list screen | Can I have this list as a file? | Not a screen: an outline button beside the screen's own action, which hands back the list as it stands — the search, the chip and the drill-down in the address included (P14 14.10). One control per screen whatever it holds: a button where there is one file, the same button opening a short menu where there are two, which only the customers screen is (the customers and their contacts). A panel of files was the old shape, and it was a second answer to "which rows". |

**Every move on the board, and what the drop would need (P11F).** The rule in §4 says drag
only where the drop needs nothing the system does not already have. Read against every
transition the actions allow:

| Move | What the action needs | So |
|---|---|---|
| Requested → Issued | SMAC's quotation number, typed | a prompt, not a drop |
| Requested → Sent back | the coordinator's reason, typed | a prompt |
| Sent back → Requested | the rep's edits, then asking again | the edit form |
| Issued → Accepted | the customer's answer — a confirmation | a dialog, and a drag that opens a dialog is a worse button than a button |
| Issued → Rejected | the customer's reason, typed | a prompt |
| Issued → a revision | new lines, typed | the edit form |
| Requested / Sent back → Withdrawn | a confirmation (D32) | a dialog |
| Submitted → Approved | SMAC's dispatch number, typed | a prompt |
| Submitted → Refused | the coordinator's reason, typed | a prompt |
| Refused → Submitted | the rep's edits, then asking again (P12-10) | the edit form |

Nothing qualifies, and the two confirmations do not qualify either: a card dropped into a
column and then asked "did the customer accept?" is the dialog with a longer gesture in front
of it, and at 375 — where the coordinator's queue is read — there is no drag at all. The card
opens its record and the record carries its actions; the rule stands on this table rather
than on the Never list.

**The five state colours.** One set, two themes, used the same way on every screen. Colour
never carries meaning alone: every coloured thing also says its word.

| Token | Tone | Means | Worn by |
|---|---|---|---|
| `state-wait` | amber | somebody owes an answer, or it is due today | Requested, Sent back, Refused, Waiting; a follow-up due today; behind pace |
| `state-open` | blue | out in the world, nothing owed today | Issued; a company nobody has contacted yet |
| `state-good` | green | it went the right way | Accepted, Approved; ahead of target |
| `state-bad` | red | it went the wrong way, or it is late | Rejected, Lost; an overdue follow-up; a stuck request |
| `state-over` | neutral | finished, and no longer interesting | Withdrawn, Cancelled, Superseded, Archived |

`src/lib/state-tone.ts` holds the one mapping from a status to a token; no component decides
its own. **Since the restyle a state is a dot and its word** (`TONE_DOT`, `StateBadge`): a
6px dot in the tone's foreground and the word in the muted text colour, with no box. (A
hairline box was tried: it vanished on a dark card and showed on a light one, so one badge
read as two.) A
filter chip, a waiting pill, a board column's count and a card's title are neutral and carry
the dot, never a tinted fill or a coloured word. A tint (`TONE_CLASS`, `bg-state-x
text-state-x-fg`) survives only as the fill of a warning inside a form (a possible duplicate),
with its words in the text colour; the leads band and the drawer's lead banner are neutral
surfaces, since the dot and word beside the avatar already say "not acknowledged". `TONE_TEXT` is
for a date or a figure that is late or behind. A chart's state series is the tone's
foreground at 0.7 (`toneInk`).

Refused moved from red to amber in P12-10, and the move is what the table is for: red is
where a record STOPPED, and a refusal stopped being an ending the moment the rep could
correct it and ask again (D160). The rep's own day screen had been painting that door amber
for phases — the same amber as a quotation sent back, which is the same event in the founder's
own sentence (§2 S53) — while the badge on the record beside it was red, so one state wore two
colours depending on which screen you read it from. `tests/colour.spec.ts` holds the pair
together by asking the two functions rather than by reading a pixel.

**A drawer has a hierarchy.** Top: who this is and the one number that matters, then the
actions. Under that, what happened last. Under that, the detail, and the fields nobody reads
twice go last or behind a tab. A flat list of every column in the table is a form, not a
panel.

**A dashboard answers one question.** Name the question at the top of the screen in the
person's own words, put the answer under it, and make every figure on it something that
person can act on today. A number nobody can act on is a report, and reports live on the
team screen.

## §7 Depth (P11J) — what a good CRM has that Kladra does not

**How it was asked.** Seven readings of the app, proposing freely and separately: the rep's day,
the coordinator's desk, the manager's week, the founder's question, the feature surface of the
CRMs of 2026, FACET as it was actually used, and the cladding trade in Saudi Arabia. Sixty
proposals came back, and each was then held against the same three questions before anything was
written — WHO is it for, by name; WHEN in their day or week does it happen; and WHAT does it
replace that they do today. A proposal that cannot answer all three is not a small proposal, it
is not a proposal.

**What survived, and where it went.** Ten decisions, in WORKFLOW §5 #142–#153 with their
causes — eight of them proposals that came through the readings and two of them older entries this
box was the last chance to close:
notes read back where the record is read (D136); one search box per screen, and the coordinator's
desk in the order she works it (D137); a quotation and a dispatch that say when the project under
them has been given up (D138); a search hit that opens something for whoever pressed it (D139);
why we lose (D140); one clock for lateness (D141); whose customers have gone quiet (D142); a
dispatch that says what happened to it (D143); a figure that is not the length of a capped list
(D144); and one chip over a list, in one row (D145). Every one of them turned out to be something
the app had already half-built — a field written and never read, a rule kept on one screen, an
audit log nobody displayed, a figure counted off a capped array, a component copied a fifth time
— which is what those three questions select for, and it is the reason the list is short.

**What was refused, by class.** Most of the sixty died against the three questions. The classes
are worth keeping, because the next reading will propose them again:

- **Anything that could not name a person.** "The team", "management", "users": a screen for
  everybody is a screen for nobody, and this business has fourteen people doing four jobs.
- **Anything §6 already refused, unchanged.** AI summaries on a record, drag-and-drop on the
  board, a separate timeline of follow-ups — re-proposed by the CRM-of-2026 reading and rejected
  again for the reasons written there. Reopening one is allowed; it has to say what has changed.
- **Anything SMAC owns.** Invoices, payments, credit, stock levels. Kladra holds square metres and
  the conversation; a second copy of a figure the accounting system is the record for is the drift
  trap with a customer's name on it (S31).
- **Anything on the Never list**, which is the founder's and not open to a proposal.
- **Screens for states this business does not have.** Two were put to Jerom rather than decided
  here, and he answered both no (SPEC §3): a screen for covering the coordinator's desk while she
  is away, because there are two coordinators and the queue is a desk they share; and a
  lapsed-customer screen, because "gone quiet" already says that on the rep's own list, and a
  second name for one silence is the two-figures defect.
- **Anything whose honest answer to "what does it replace" was "nothing, it is just better".**
  The largest class by far.

**What the box found that nobody proposed.** Two of the ten were not proposals at all: the
capped-list figure was the stranger read's own #33, open since box A, and the chip row was a 375
shot finding parked for this box in P11H. Two more came out of critic passes over slices that
were already green — a demo record that had been impossible for five phases and that no screen
had ever read in order until the dispatch trail did, and a test that could have signed in as the
wrong person and reported an empty drawer as a broken one. The pattern is worth keeping: the
reading proposes, and the building finds.

## §8 Depth (P13-G6) — designmotionhq: what was studied, what was taken, what was refused

**How it was asked.** Before G6 the founder sent designmotionhq's free *Design System
Blueprint* PDF and the site behind it. He likes how the PDF looks, and the studio's whole
pitch is "UI that doesn't look AI-made". He does not want to buy its paid Claude Code plugin,
so only public material was read:
- every one of the 76 free pattern breakdowns, each with a contact sheet of its video;
- the PDF;
- the public description of the plugin's eight skills;
- the studio's YouTube shorts on topics the patterns do not cover;
- the standards behind them, for seven deeper topics: WCAG 2.2, NN/g, Material 3, Apple HIG,
  Atlassian, Vercel's interface guidelines, and published Arabic typography practice.

Instagram and TikTok need a login and were not read. All of it, in Kladra's words and with
every URL, is the `ux-patterns` project skill (`.claude/skills/ux-patterns/`). The G6 builders
and reviewers load it, and `lens.md` in it is the walk every S12 state gets.

**What it confirmed.** More than half of the library re-derives rules this file already holds:
- dark is not inverted light, and neither theme uses pure black or pure white;
- one accent, on one control;
- every state has a word, never colour alone;
- skeletons in the content's own shape;
- hover gated on `hover: hover`, and never the only way to reach an action;
- 44px for a thumb;
- motion at 100 / 150 / 200, entering on ease-out, and never looping;
- numbers at the end of their column in tabular figures;
- tokens named by role;
- a pie that breaks past six slices;
- a chart whose sentence is its takeaway;
- moving a card by action, not by drag. WCAG 2.5.7 uses exactly that as its worked example.

Where an outside source independently arrives at a rule that was chosen for Kladra's own
reasons, the rule becomes easier to hold and harder to erode. That is the main value of the
reading.

**Taken.** Each of these is built by the S12 slice whose screens it touches. That slice
records its D number in SPEC §4.
- **A screen is six states.** Loading, empty, partial, error, success and offline. The S12.0
  inventory asks which of the six each screen can reach and whether each is drawn.
- **Empty has four kinds.** First use says where the work starts. No results offers the way
  out. Filtered out says how many are hidden and how to show them. Could not load is an error.
- **Severity picks the surface.**
  - A field's problem goes under the field. A refused submit goes in the footer, with focus on
    the first field it names.
  - A failure toast stays until it is closed. A success leaves after about four seconds.
  - No more than three toasts are visible.
  - On a phone, no toast covers the bottom bar or a sheet's primary action.
- **Busy is not disabled.** A control that is working keeps its place and focus and says so. A
  control that cannot be used says why, or stays live and points at what is missing.
- **When a field is checked.** A format field (phone, email) is checked when it is left. After
  it has shown an error it re-checks as it is typed. Red means finished and wrong, never not
  finished yet.
- **Motion numbers the bands lacked.**
  - A tooltip waits 300ms.
  - An exit is about 150ms against a 200ms entrance.
  - A disclosure animates `grid-template-rows`, with its chevron on the same curve.
  - A transition names its properties and moves only opacity and transform.
  - Under reduced motion a slide becomes a crossfade.
  - Motion on something pressed all day stays at the fast end.
- **Targets.** 24px is the floor for anything pressable on a desk (WCAG 2.5.8). 44px for the
  drawer's close and overflow, for a destructive row action and for the × that removes a
  filter. At least 8px between adjacent icon buttons.
- **A board moved by action.**
  - The move sits in the card's overflow menu and names the columns.
  - Focus returns to the menu's trigger, the move is announced, and the card flashes where it
    lands.
  - On a desk the scroll cue is a visible sliver of the next column, never a hover-only arrow.
  - On a phone, one stage at a time with a stage picker.
- **The labelled group, from the PDF.** A small muted label sits above a bordered inset group.
  It serves the request dialogs' sections, the drawer's detail blocks and the admin forms. An
  eyebrow is a sentence-case word in a muted or accent tone, never uppercase and never tracked.
- **Words.** A search placeholder names what the box searches. A destructive button names its
  verb, Cancel is the default beside it, and it never takes the primary slot. The red on a
  screen is counted: the one brand control and what went wrong, nothing else.
- **Arabic leading and weight.** The Arabic shots are read for cramped two-line text and for a
  weight that looks heavier than the Latin beside it. A fix is a `:lang(ar)` token, not a
  second size.
- **The lineup test.** For type, colour, space and finish, the reader asks whether what the
  screen does is written here or is a default the kit or a model fell back on. Then: would
  this screenshot be picked out as Kladra among ten AI-built CRMs? A screen that passes every
  rule and still reads as a template is a severity-2 finding. This is what the founder's "built
  by one hand" means, turned into a question a reader can answer.

**Refused, by class.** The full list with each reason is `refused.md` in the skill.
- **Anything on the Never list, however it is dressed.** Drag between columns, row checkboxes
  and select-all, filter presets saved by name, a "Refresh page" way out.
- **Motion that decorates.** Hover lift, scale and tilt, springs and overshoot, a list that
  staggers in, a shimmering skeleton, confetti at the end of a flow, a completion meter or a
  countdown that ticks.
- **Surfaces that separate by glow.** Tinted shadows, parallax, a mesh gradient, grain,
  gradient text, any gradient in the running app (§1).
- **Density as a setting.** Linear's 32px rows, the library's three-height density control.
- **Machinery for problems Kladra does not have.** Undo stacks and delayed send, typed
  confirmation and deletion cool-offs (nothing a user can reach is irreversible), optimistic
  saves (a write holds its row before it decides), steppers for a paper the coordinator reads
  whole, uploads, sliders, ratings, one-time codes.
- **The PDF's own identity.** Violet, Inter, uppercase tracked eyebrows, two-tone headings.
  The identity is Stone (§1, the founder's restyle of 2026-09-14), and Arabic has neither case
  nor letter-spacing that leaves its joins intact.

**Considered and kept as it is.**
- **Chart axes in Arabic.** The standards (Apple's archived guidance, AG Charts) keep a chart's
  axes unmirrored in RTL. Kladra puts the oldest month at the inline start, so a chart reads in
  the direction of the table and the sentence beside it (§1b), and every chart spec asserts
  that. It is recorded, not reopened. An Arabic reader who finds the months backwards is the
  one who reopens it.
- **Exit easing.** §1b's ease-in on exit is kept against the advice to ease out both ways,
  because an exit of 150ms or less reads the same either way.
- ~~**Card shadow.**~~ Reopened by the restyle and removed: `card-face` has a hairline and no
  shadow, and only what floats casts one (§1). The restraint the site taught stands.

**The restyle's audit of these rules (founder, 2026-09-14: "they are not absolute").** Every
rule the restyle collided with was judged on its reason, not its age:
- *Kept, check changed:* one brand control per screen — `controls.spec` finds it by
  `data-variant="brand"`, `one-look` refuses the brand fill written by hand.
- *Kept:* nothing lifts or scales on hover; logical CSS only; Western digits; dark by default;
  the red is the brand; theme-color, the offline page and the PWA canvas equal the canvas token.
- *Removed:* "exactly two gradients" (the running app has none; the installed icon keeps its
  own), and a card's resting shadow.
- *Changed:* a state as a tinted pill → a dot and its word (§6); Readex Pro and Plex Mono → Plex
  Sans with Noto Sans Arabic, figures in tabular sans; Sandstone's warm chroma, 12/16 radii and
  a dark rail in both themes → near-neutral Stone, 8/12/6 radii, a rail that follows the theme.
  The legibility reason behind Readex (an Arabic name on a phone stays legible) was kept as a
  check and passed at 375 in Arabic.
