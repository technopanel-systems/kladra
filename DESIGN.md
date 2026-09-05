# DESIGN — how Kladra looks and behaves

## §1 Identity

Warm-black palette with a red undertone; dark is the default and light is designed, not
inverted. Fonts: IBM Plex Sans (en), IBM Plex Sans Arabic (ar), IBM Plex Mono for every
number. Base 14px / 1.5. Card radius 14px (`--radius` 10px + 4). Brand gradient on the
primary button only. Values carried from FACET's globals.css:

| Token | Dark (default) | Light |
|---|---|---|
| canvas / background | `#0f0d0c` | `#f5f2ef` |
| surface (card) | `rgba(30,26,24,.72)` solid `#1b1816` | `rgba(255,255,255,.85)` solid `#ffffff` |
| surface-2 (muted, secondary, accent) | `rgba(40,35,32,.6)` solid `#232120` | `rgba(26,22,20,.05)` solid `#f3efeb` |
| line (border, input) | `rgba(255,255,255,.07)` strong `.12` | `rgba(26,22,20,.13)` strong `.24` |
| text | `#f3eeeb` | `#1a1614` |
| text-muted | `#a69d99` | `#6b615c` |
| text-faint | `#8f8480` | `#736c67` |
| rail (sidebar) | `rgba(9,8,7,.85)` text `#8f8683` strong `#fff8f5` | `rgba(23,19,17,.94)` text `#b5aba6` strong `#ffffff` |
| brand (primary, ring) | `#f2566b` | `#c8102e` |
| brand-grad | `linear-gradient(135deg,#f2566b,#ff7a4a)` | `linear-gradient(135deg,#c8102e,#e5502f)` |
| brand-glow | `0 0 0 1px rgba(242,86,107,.35), 0 8px 28px -8px rgba(242,86,107,.55)` | `0 0 0 1px rgba(200,16,46,.25), 0 8px 24px -8px rgba(200,16,46,.4)` |
| mark-grad (the K, both themes) | `linear-gradient(140deg,#e5233c,#7a1020)` | same |
| avatar-user-grad (the initials circle in the top bar) | `linear-gradient(140deg,#8a3244,#4a1622)` | same |
| state-bad (raw red) bg / fg | `rgba(242,86,107,.14)` / `#ff8fa0` | `rgba(200,16,46,.09)` / `#c8102e` |
| state-wait (raw amber) bg / fg | `rgba(227,166,62,.14)` / `#ebb35a` | `rgba(138,90,0,.11)` / `#8a5a00` |
| state-good (raw green) bg / fg | `rgba(87,197,126,.14)` / `#6fd08f` | `rgba(21,128,61,.09)` / `#15803d` |
| state-open (raw blue) bg / fg | `rgba(127,173,238,.14)` / `#8fb8f0` | `rgba(43,92,168,.09)` / `#2b5ca8` |
| canvas glow | two radials under 14% (red top-start, blue top-end), on body only; mirrored in RTL | same |
| shadow | `0 1px 0 rgba(255,255,255,.04) inset, 0 12px 40px -18px rgba(0,0,0,.8)` | `0 1px 0 rgba(255,255,255,.8) inset, 0 12px 36px -18px rgba(26,22,20,.42)` |

An apostrophe in English copy is `’`, never `'`. Ten strings carried the typewriter
mark — "the coordinator's queue", "today's report" — and one straight quote in a card of
Plex Sans is the difference between typeset and typed. Arabic has no apostrophe, so this
is an English-only rule; there are no quotation marks anywhere in the copy to match it.

Destructive is a tint (`bg-destructive/10 text-destructive`), never a solid red. Popovers
and dialogs take the solid surface — never blurred. Row colour means how long something has
waited: overdue red, due today amber, otherwise faint. Status was a word and not a colour
until P8; it is now a word AND a colour, from the five in §6, and the word never goes away.

The two gradients below brand-grad are marks, not surfaces: the K in the sidebar, on the
sign-in screen and on the installed app's icon, and the initials circle in the top bar. They
are the same in both themes because a logo does not change colour when somebody turns the
lights off. `scripts/icons.ts` redraws the icon files from mark-grad; the K there is paths,
not type, so no machine's font list can change it.

So there are exactly four gradients in the running app: the primary button, the mark, the
initials circle, and the canvas glow on `<body>`. A third mark gradient, for a contact's own
initials circle, was defined for eleven months and used by nothing — an identity table that
lists a colour nobody can see is a table that cannot be checked, so it is gone (D69).

**One primary action means one button.** `variant="brand"` on `Button`, in the fifteen places
a screen has a primary action. It was a class string written by hand in fourteen files, in
two syntaxes and under two token names for the same colour, which is how the app's most
important control drifts without anybody deciding anything.

**Two surfaces, and they are not interchangeable.** `card-face` is a thing at rest: 14px,
a 1px `--line` border, the shadow, and a hairline along its top edge. The inset strip —
`rounded-xl border border-line bg-surface-2` — is a panel WITHIN a card or a header, and has
no shadow because a shadow says "this is lifted off the page" and it is not. Every floating
surface (dialog, drawer, menu, popover, select) takes the same `--line` border as a card;
they keep their own tighter shadows, because a menu that appears under the pointer for two
seconds should not wear the shadow of a card that has been sitting there all day. What none
of them may be is a RING: a ring was shadcn's default, it sits outside the box rather than
inside it, and it was a different colour from every border in the app.

**A date is not set in the number face, and that is deliberate.** Money and m² are, because
they stand in columns that have to line up. A date does not: `03/Sep/2026` is one value on a
row, and in Arabic it is `03/سبتمبر/2026` — a Latin day and year around an Arabic month name.
Setting that string in IBM Plex Mono would render the month in whatever the browser falls
back to, so the one string on the screen that mixes two scripts would also mix two typefaces.

## §2 Principles

- Work happens in dialogs and drawers over a list; a full page is the exception — users called FACET record-first and slow because every step was a page.
- One primary action per screen, at the top, never the bottom — the eye lands there first, and on a phone the bottom is the bar.
- Humans read words; internal codes and IDs never appear — a rep does not know what `uuid` or `N-CA-FR` mean and should not have to.
- Dropdowns over ~8 entries are searchable, common values pinned, likeliest preselected — Riyadh, Saudi Arabia, 1.24 m, 4 mm are what is typed nine times in ten.
- Dates are picked, shown 04/Aug/2026 — unambiguous in both languages; no 08/04 confusion.
- The screen tells you what changed: toasts for your actions, live arrival and a 2 s highlight for other people's; a bell with a count — nobody refreshes.
- Motion where it explains (150–250 ms): dialogs, drawers, row changes. No loops — motion that repeats is noise.
- Loading states always; never a blank — a blank reads as broken.
- Sidebar collapses; on a phone it is a bottom bar and dialogs are bottom sheets — the thumb reaches the bottom.
- Money and m² in tabular figures (`.num`, Plex Mono); everything else normal text — columns of numbers must line up.
- Anything daily is two clicks from home — log a visit, add a company, check follow-ups.

## §3 Component kit

shadcn/ui via CLI (Radix, RTL on): Dialog, Sheet, Drawer (phone bottom sheet), Command
(searchable dropdowns), Popover + Calendar (date pickers), Sonner (toasts), Skeleton, Tabs,
Badge, Table, Field (forms), Select, Tooltip, plus Button, Input, Textarea, Card,
Dropdown-menu, Switch, Checkbox, Scroll-area, Avatar. On top of them, the app's own
small pieces: `StandingStrip`, `StateBadge`, `Board`, `Sqm`/`Money`, `DayText`, and `Prose`
— one `<p dir="auto">` for any block a PERSON typed. Logical utilities only (`ms-`, `pe-`,
`text-start`, `start-0`); hook H3 blocks physical ones. Radix `DirectionProvider` follows
`<html dir>`.

## §5 Rules earned the hard way

Each of these was a defect first. They are here so the fix is the rule, not the patch.

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
  reads the other's — so every such block goes through `<Prose>`.
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
  hand-written four `-fg` conditionals to dodge the same trap. `TONE_BAR` is the third
  map beside `TONE_CLASS` and `TONE_TEXT`, and a bar uses it.
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
- **A spec that reads the database waits for the DIALOG to close, not for the words to
  appear.** The words it just typed are in the box it typed them into as well as in the
  list behind it, so a page-wide text assertion passes while the write is still in flight —
  and the next line, which counts rows, then reads the database one row too early and
  blames the app. Wait for the form to close, then assert inside the panel that should have
  changed. Scope the assertion too: `page.getByText(x)` sees the whole document, including
  the form.
- **A browser exception is a test failure, wherever it surfaces.** This one reached a spec as
  three unlabelled disabled buttons — Next's error overlay, counted by a check looking for
  dead controls. Every spec now fails on the exception itself and names it.

## §4 Not built until asked

Drag-and-drop, bulk edit, saved views, charts beyond bars, comments, file attachments,
refresh buttons, any gradient beyond the primary button.

Two came off this list in P8, and one did not. A colour-per-status map was asked for and is
built (§6). Remembering which view a person last chose is not a saved view: a saved view is
a filter somebody names and keeps, and nobody has asked for one. Drag-and-drop stays off the
list on its own merits, argued in §6.

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

**Which screens get more than one view.** Quotations and dispatches get a **board of states**
beside their list: those are the only screens where "what is stuck, and for how long" is the
daily question, and a column with a count answers it in one look. Everything else is a list.
Where there are two, the list stays the default because it is the one that answers "mine,
oldest first"; the choice lives in the URL (`?view=board`) and is remembered per person, so a
link still opens what the sender saw.

**The five state colours.** One set, two themes, used the same way on every screen. Colour
never carries meaning alone: every coloured thing also says its word.

| Token | Tone | Means | Worn by |
|---|---|---|---|
| `state-wait` | amber | somebody owes an answer, or it is due today | Requested, Sent back, Waiting; a follow-up due today; behind pace |
| `state-open` | blue | out in the world, nothing owed today | Issued; a company nobody has contacted yet |
| `state-good` | green | it went the right way | Accepted, Approved; ahead of target |
| `state-bad` | red | it went the wrong way, or it is late | Rejected, Refused, Lost; an overdue follow-up; a stuck request |
| `state-over` | neutral | finished, and no longer interesting | Withdrawn, Cancelled, Superseded, Archived |

`src/lib/state-tone.ts` holds the one mapping from a status to a token; no component decides
its own. A tint is `bg-state-x text-state-x-fg`, never a solid fill — a solid is for the
primary button and nothing else.

**A drawer has a hierarchy.** Top: who this is and the one number that matters, then the
actions. Under that, what happened last. Under that, the detail, and the fields nobody reads
twice go last or behind a tab. A flat list of every column in the table is a form, not a
panel.

**A dashboard answers one question.** Name the question at the top of the screen in the
person's own words, put the answer under it, and make every figure on it something that
person can act on today. A number nobody can act on is a report, and reports live on the
team screen.

