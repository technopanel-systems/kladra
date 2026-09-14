# Standards behind the patterns

This file covers boards without dragging, target size, motion restraint, and bilingual dense
screens. It adds what the pattern library only gestures at, taken from WCAG 2.2, NN/g,
Material 3, Apple HIG, Atlassian, Vercel's interface guidelines, Emil Kowalski (the author of
Sonner and Vaul) and published Arabic typography practice. The full reading is in
`notes/site/deeper2.txt`, with every source URL. Rules marked **inference** are a judgement
drawn from those sources, not a numbered rule in any one of them.

## Boards without dragging
- **Moving by action is the approved pattern, not a workaround.** WCAG 2.5.7 (Dragging
  Movements, AA) requires every drag function to work without dragging. The W3C's own worked
  example is a kanban card moved to another column from a menu.
- **The move lives in the card's existing overflow menu.**
  - It lists the other columns by name. When the move needs input (a reason, a number), it
    opens a dialog instead.
  - Focus returns to the trigger afterwards.
  - A live region announces "X moved to Y from Z".
  - The card shows a brief flash where it landed. Kladra's arrival flash is 2s of colour.
- **Column count.** Three to seven columns still read as one workflow. Do not split a stage
  into finer ones just to make a status change more granular.
- **Age on the card.** Show it as a word or number ("6 days"), never as a colour fade alone.
- **A column that is over its load** is tinted in its header and never blocks a card from
  entering.
- **What a card carries.** No more than two quick actions plus the overflow menu. About four
  things: the name, a state glyph with its word, the owner's avatar, and one figure or date.
  Everything else stays in the drawer. There is no key or code, since Kladra shows none.
- **A desk at 1366.** All columns sit side by side and overflow scrolls sideways
  (`StickyScroll`). The scroll cue is a **visible sliver of the next column**. NN/g found
  people never looked at a scroll arrow that appeared only on hover, and on a left-to-right
  screen about 80% of fixations fall on the left half. In Arabic the cue sits at the other
  edge.
- **A phone at 375.** Show one stage at a time, with a stage picker you tap. Never show two
  columns side by side, and never use an edge-peek that looks like something to drag.
- **An empty column** says why in one line. It is a finished state, not a failure to load.

## Target size and spacing
- **WCAG 2.5.8 (AA): the floor is 24×24 CSS px** for any target that is not inline text. A
  smaller target passes only if a 24px circle around it does not touch its neighbour's
  circle. Kladra does not rely on that exception.
- **WCAG 2.5.5 (AAA), Apple: 44×44. Material: 48×48dp**, with the glyph at 24.
  - Kladra uses 44 on a coarse pointer (D130).
  - On a desk, targets are at least 24. Aim for 44 on these:
    - the drawer's close and overflow buttons (frequent, and at the edge);
    - destructive or hard-to-undo row actions;
    - the "×" that removes a filter, with its own hit area separate from the chip.
- **At least 8px of real gap** between adjacent icon-only buttons.
- **Fitts's law.** Time to reach a target grows with distance and falls with width. Corners and
  edges are effectively infinite targets, so close goes at the panel edge and the most-used
  action sits nearest the content.
- **Thumb reach** (Hoober, 1,333 users). 49% use one hand, and 67% of those use the right
  thumb. The bottom third of the screen is easy, the middle is a stretch, the top needs a
  regrip. Frequent actions go low, and rare ones (back, overflow) go high. A primary action at
  the top right of a phone is penalised twice: it is hard to reach and far from the thumb.

## Motion restraint
- **Material 3 duration tokens:** 50 / 100 / 150 / 200 (short), 250–400 (medium), 450–600
  (long), up to 1000 (extra long). Kladra's 100, 150 and 200 are M3 short2 to short4. Nothing
  in Kladra reaches 450.
- **NN/g on duration.** Simple feedback takes about 100ms. A modal coming into view takes
  200–300ms. At 500ms motion "feels like a drag".
- **Frequency** (Kowalski). Remove the animation from anything people do tens or hundreds of
  times a day, because motion makes a frequent interaction feel slower. Opening a record from a
  list is Kladra's most frequent act, so the drawer's entrance stays at the fast end (200ms or
  less), and a row's hover has no transition beyond its 100ms tint. The lens flags any motion
  on a control pressed all day.
- **Easing.** M3 uses decelerate (0,0,0,1) for entering and accelerate (0.3,0,1,1) for exiting.
  Kowalski advises ease-out for both, avoiding ease-in in UI because it starts slow and feels
  laggy. DESIGN §1b says exit eases in. **Considered:** an exit at 150ms or less reads the same
  either way. If a slice finds that an exit feels late, the fix is shortening it, which keeps
  one rule.
- **Never scale from 0.** Start at 0.9 or more, if a scale is used at all.
- **Name the properties, never `transition: all`.** Animate only `opacity` and `transform`,
  never width, height, top or left (Vercel's guidelines, also in this repo's
  web-design-guidelines skill).
- **Reduced motion changes the vocabulary.** A slide becomes a crossfade (MDN), not the same
  slide made shorter. WCAG 2.3.3 (AAA): motion triggered by an interaction can be switched off.
- **WCAG 2.2.2 (A): pause, stop, hide.** Moving or auto-updating content that starts on its own
  and runs longer than 5s needs a way to pause it. Kladra's live updates are events: a row
  changes when the data changes and flashes for 2s. Nothing scrolls or cycles, so nothing needs
  a pause control. Keep it that way.
- **Motion is never the only carrier of meaning.** A row leaving on archive also has its toast.

## Bilingual dense screens
- **Numerals.** Use one system everywhere. Kladra uses Western digits (words.md). Many Saudi
  government and print contexts use Hindi-Arabic digits, and consistency is what counts. Use
  tabular figures in both locales.
- **Digit order.** A number is a left-to-right run inside a right-to-left row. Only the column's
  position moves; the digits never reverse. Kladra isolates figures in the message loader and
  wraps what a component renders in `<span dir="ltr" class="num">` (words.md).
- **Latin names inside Arabic text are isolated** with `<bdi>`, most of all where punctuation or
  a unit follows the name (W3C inline bidi markup). Kladra already does this.
- **Icons.**
  - Directional icons mirror: back and forward, chevrons, next and previous.
  - These do not mirror: checkmarks, clocks and spinners, media controls, depicted objects,
    slashes, and phone numbers (Apple HIG archive, Material bidi guideline).
  - A trend arrow on a figure follows the graph rule and does not mirror. **Inference**; record
    it as a DEFAULT if a slice draws one.
- **Charts.** Apple's archived HIG and AG Charts keep axes unmirrored in RTL; only the legend,
  tooltip and series order mirror. **Kladra decided otherwise**, and deliberately: its month
  columns put the oldest month at the inline start in Arabic, so the chart reads in the same
  direction as the table and the words beside it (§1b), and every chart spec asserts it. The
  standards point the other way. This is recorded here, not reopened, and it goes to the
  founder only if an Arabic reader finds the chart backwards. A linear progress bar fills from
  the inline start in both sources. A ring is a graph and does not mirror its sweep.
- **Arabic needs more leading than Latin.**
  - Body text: about 1.7–1.85 against Latin's 1.5–1.6. Headings: about 1.3–1.4 against
    1.1–1.2. Arabic text below about 14px is a common mistake.
  - Readex Pro is one family drawn for both scripts with shared metrics, so check it against
    the pixels rather than assuming. In the Arabic shots, look at two-line clamps, dense rows
    and badges for ascender and descender collisions or a cramped look. If they appear, the fix
    is a `:lang(ar)` leading token, not a different size.
- **Weight parity.** An Arabic 600 can look heavier than Latin 600 beside it. Compare the
  strokes in a mixed row (a Latin company name inside an Arabic row), especially in badges and
  heads where weight carries meaning.
- **Mirroring covers the whole component** through logical properties. That includes a label
  and value pair, where the value must not come before the label because of a float. Never
  interpolate a left-to-right date or number string into Arabic flow without isolation. GOV.UK
  lists exactly these as open bugs against its own RTL support; use them as a test list.
