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
- Motion where it explains (150–250 ms): dialogs, drawers, row changes. Menus, popovers and selects at 100 ms — a menu is not a dialog. No loops — motion that repeats is noise; the one exception is the pending mark inside a pressed link, which says "working". Under `prefers-reduced-motion` the travel goes and the information stays: the arrived flash keeps its two seconds because it is a colour, not a movement.
- Loading states always; never a blank — a blank reads as broken. A pressed link shows it is working after 150 ms (`LinkPending`); a screen that cannot draw itself, or an address that names none, is one card inside the shell in the reader's language, never the framework's page and never a digest.
- Sidebar collapses; on a phone it is a bottom bar and dialogs are bottom sheets — the thumb reaches the bottom. A phone is everything below `md`, one line for the shell and the forms (D128); in a sheet the primary action is the lowest button, and anything a thumb presses is 44px (D129, D130).
- Money and m² in tabular figures (`.num`, Plex Mono); everything else normal text — columns of numbers must line up.
- Anything daily is two clicks from home — log a visit, add a company, check follow-ups.

## §3 Component kit

shadcn/ui via CLI (Radix, RTL on): Dialog, Sheet, Drawer (phone bottom sheet), Command
(searchable dropdowns), Popover + Calendar (date pickers), Sonner (toasts), Skeleton, Tabs,
Badge, Table, Field (forms), Select, Tooltip, plus Button, Input, Textarea, Card,
Dropdown-menu, Switch, Checkbox, Scroll-area, Avatar. On top of them, the app's own
small pieces: `StandingStrip`, `StateBadge`, `Board`, `Sqm`/`Money`, `DayText`, `Prose`
— one `<p dir="auto">` for any block a PERSON typed — and `NoteBlock`, which is `Prose` under
the word for what it is, in a face of its own so a paragraph that swings to the other end of a
wide drawer stays attached to its label; and `ListSearch`, the one box a list is filtered by —
term on the URL a quarter-second after the last keystroke, caret never stolen, and one per
screen however many lists are under it; `PageTabs`, the row across the top of a home
screen (D151), which is links rather than the kit's `Tabs` because a tab here is a place with an
address and not a panel toggled in the browser, and which is deliberately not the pill the
list-and-board switch wears — that one is a control inside a screen and this one is the
structure of it; `ShareBars`, the one way a share of a whole is drawn — ranked longest first,
the figure written on every row, the bar hidden from a reader because there is nothing in it
that is not in the text (D150, D65); and `RangeChips`, the window a measured screen is read
over, which is `FilterChip` in a row rather than a fourth kind of chip. Logical utilities only (`ms-`, `pe-`,
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
- **A form starts from what the app knows.** Phase 11D (D115, with D74, D81 and D101 before
  it). The last value of a recurring figure is shown where the new one is typed, with one
  press to keep it; a list with one entry is chosen; a list with several is not guessed at.
- **A row names its person where the reader is not that person.** Phase 11D (D116). On a
  shared desk a row says whose it is, in the reader's script; on somebody's own list it does
  not tell him his own name.
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

- **A row on a shared record says whose it is, and only where more than one person has one.**
  Phase 12 (D147, D158). Two reps on one customer each keep their own contacts, and a fold puts
  both lists on one record — so the same buyer, with the same number, is legitimately two rows in
  the Contacts tab. Without a name on them the drawer reads as a screen showing one person twice,
  which is the reading that makes somebody ring the wrong rep to complain. The name appears only
  when the rows actually belong to more than one person: on a company one rep keeps people on,
  a caption that never varies is a word to read past on every row.

## §4 Not built until asked

Drag-and-drop, bulk edit, saved views, charts beyond bars, comments, file attachments,
refresh buttons, any gradient beyond the primary button.

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

**Which screens get more than one view.** Quotations and dispatches get a **board of states**
beside their list: those are the only screens where "what is stuck, and for how long" is the
daily question, and a column with a count answers it in one look. Everything else is a list.
Where there are two, the list stays the default because it is the one that answers "mine,
oldest first"; the choice lives in the URL (`?view=board`) and is remembered per person, so a
link still opens what the sender saw.

**The question each screen answers, and the view chosen for it (P11F).** Every screen was
read against its own question; a view is kept because it answers that question in one look,
not because another screen has it. At 375 every table becomes a card per row carrying the
same columns in the same order (D59); that is the same view on a narrower page, not a second
one.

| Screen | Who opens it | The question | The view, and why |
|---|---|---|---|
| Companies | rep; manager drilling in | Who do I call today, and where is this company standing? | A follow-up strip of doors over a list sorted by the date the call is owed, a drawer for the record. A grid shows a third as many rows and hides the date column. |
| Projects | rep | What is live, what is it worth, what is due on it? | The same strip and list, projects as rows, a drawer. One view: a project has no states to make columns of. |
| Quotations | rep, coordinator, manager | Where is each paper, mine oldest first? — and: what is stuck, and for how long? | Two: the list for the first question, the board of states for the second, with a count on every column and the arrival day on every card. |
| Dispatches | the same | The same two questions, one step later | The same two views, for the same reasons; the choice is remembered per screen, not shared. |
| Queue | coordinator | What is on my desk, oldest first, and how late is it? | Two lists under one strip — requests and dispatches — each row wearing its wait in working days. No board: a desk has one state, and one column is a list. |
| Day | rep | What has come back to me and is stopped, and who is owed a call? | One column in the order the work is done: the month, stopped work by kind (D118), the calls in bands by how late. Not a grid of cards: every figure here is acted on before lunch. |
| Team | manager, admin | How is the month, who is doing it, what has stopped moving? | The company's month and its six months, a strip of what is stuck, one row per person, the chain as a population, then the stuck lists. Not a dashboard of tiles: the order is the order the questions come in. |
| Daily report | everybody | What did each person do today, and what did they say it meant? | Your own card with the box, then everybody's, alphabetically — one list the whole floor reads (D56), not a manager's inbox. |
| Notifications | everybody | What came back to me? | A list, newest first, each row naming the customer (D110); read is a state, not a view. |
| Admin: users, targets, lookups, holidays, use, archive, export | admin | One question each: who may sign in; what is each person aiming at; what words the pickers offer; which days are off; who is using it; what left the floor; what finance wants. | One panel each — a table or a row of boxes with its one action beside it. No second view: none of these is opened often enough to earn a choice. |

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

Nothing qualifies, and the two confirmations do not qualify either: a card dropped into a
column and then asked "did the customer accept?" is the dialog with a longer gesture in front
of it, and at 375 — where the coordinator's queue is read — there is no drag at all. The card
opens its record and the record carries its actions; the rule stands on this table rather
than on the Never list.

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
