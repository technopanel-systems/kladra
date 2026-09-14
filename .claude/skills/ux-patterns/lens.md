# The lens: what every screen state is walked through

Use this for S12.0, for every critic pass and for S12.10. Read the NOW shots first:
both widths (1366 and 375), both locales and both themes. Then check each item below.
A shortfall is a finding only when you can see it in the pixels or read it in the code.
Never report "could be better".

## A · Who, when, and the worst mistake
Name the person (Faisal the rep, Rawan the coordinator, Abdulrahman the manager, Jerom the
admin), the moment in their day, and what they came to do. Then answer three questions:
- Does the first thing the eye lands on serve that job?
- What is the worst mistake this screen lets them make? Examples: the wrong company handed
  over, a dispatch approved against a revised paper, a load raised for the wrong rep.
- Does the screen make that mistake hard to make, or does it make the mistake look routine?

## B · The schema-browser smell
Look for these signs of a product that shows its database rather than a task:
- columns that follow the table's fields rather than the question the person asks;
- two actions of equal weight on every row, especially a destructive one beside a frequent
  one;
- search hidden behind a Filter control on a screen whose job is finding;
- a status shown only as coloured text;
- no empty state, and no loading state.

Each sign is a finding, even when the screen looks tidy.

## C · Six states
Decide which of the six states this screen can reach. Each one it can reach must be drawn.

| State | What Kladra draws |
|---|---|
| Loading | The `Skeleton` in its own shape, static. It appears only when the wait can be seen. A skeleton that flashes for a tenth of a second on a fast tab switch reads as a glitch. |
| Empty | Four kinds of empty, and the `Empty` sentence says which one applies. **First use** says where the work starts. **No results** gives the way out ("clear the search"). **Filtered out** says how many are hidden and how to show them. **Could not load** belongs under error. |
| Partial | Part of the screen drew and part failed, for example a drawer head with a failed tab, or a capped list. A capped list says it is capped (D144). A part that failed says so in its own place and does not blank the whole screen. |
| Error | Say what failed, in the action's own words, and what to do next. A field error goes under the field. A refused submit goes in the form footer, and focus moves to the first field named. A screen that cannot draw shows one card inside the shell (§2). No codes, no "Something went wrong". |
| Success | A toast names what happened in the person's words, and the row that changed takes the arrived flash. |
| Offline | The server is out of reach. Typed text is kept and a line says so (`tests/unhappy.spec.ts`). When live updates stop, the screen says they stopped, rather than showing stale data as if it were live. |

## D · Hierarchy and actions
- **One focal point.** Size, weight, contrast, space and colour all point at the same thing.
  If two things compete for first read, that is a finding.
- **One brand control per screen.** Count them. Primary uses `variant="brand"`, secondary is
  outline, tertiary is ghost or text. Destructive is a tint. It is never in the primary slot
  and never adjacent to a frequent action. Its button names the verb ("Archive company",
  never "Yes"). In a destructive confirm, Cancel is the default, so Enter does not destroy.
- **Count red per screen.** Red means two things: the one brand button and "it went wrong"
  (`state-bad`). If red appears on decoration or on a non-destructive control, the real
  warning stops reading as one.
- **Order places.** The first and last slots of a list, a menu or a rail are remembered. The
  middle is not. The most-used item goes first and the one action goes at the end people
  finish at.

## E · Grouping and alignment
- **Gaps.** The gap inside a group is smaller than the gap between groups: 8 inside a row, 16
  between the parts of a card, 24 between cards and sections. Where spacing already groups
  things, a border adds noise.
- **Alignment.** Text starts, numbers end. Repeated cards share edges, baselines and inner
  padding. A recurring element sits in the same place on each card.
- **Radius.** Nested corners are concentric: inner radius = outer radius − padding, whenever
  the padding is smaller than the radius. A pill inside a `p-1` track is the case to check.

## F · Colour and contrast
- **Words with state tints.** Every state tint carries its word. Check with the colour
  switched off in your head.
- **Contrast.** Text needs 4.5:1. Large text, icons, the focus ring and input borders need
  3:1. The failures hide in muted greys, placeholders and disabled labels, and most often in
  the light theme.
- **Dark theme.** No pure black and no pure white. Surfaces are told apart by tone.

## G · Interaction
- **Pressable things look pressable at rest.** Hover reveals extras only, never the only way
  to reach an action (`@media (hover: hover)` gates the hiding).
- **Hit areas.** On a coarse pointer, the hit area is 44px. Pad the hit area, not the glyph.
  Adjacent row actions need enough gap that a slightly-off tap does not land on the
  destructive one.
- **Bring the action to the thing.** Row-level actions and a menu at the row beat a toolbar
  across the page (Fitts).
- **Focus.**
  - The focus ring is never the same mark as the active or selected indicator.
  - Tab order follows visual order in both directions.
  - Esc closes one level and returns focus to the control that opened it.

## H · Feedback and speed
- A press answers in under 100ms, with the tint or the pending mark.
- A wait people can see gets a mark by about 400ms. `LinkPending` covers links at 150ms.
- **Busy is not disabled.** During a request the control keeps its place and focus,
  announces `aria-busy` and says "Saving…".
- A disabled control either says why beside it, or it stays live and the submit points at
  the missing field.

## I · Motion
- Durations stay within the §1b bands: 100, 150, 200, and 2000 for the flash.
- Nothing loops except the pending mark. Nothing lifts or scales on hover. An exit is no
  slower than its entrance.
- Under reduced motion, travel is dropped and the information stays.

## J · The phone at 375
- The primary action sits within thumb reach. In a sheet it is the lowest button.
- Nothing is clipped and the page never scrolls sideways.
- Tabs never wrap to a second line. A row of chips scrolls with an edge fade.
- Toasts never sit under the bottom bar. Check the actual position.

## K · Words
- A button names its result ("Send for approval", "Hand over").
- An error names the problem and the next move.
- A placeholder is never the label.
- A search placeholder says what the box searches ("Company, contact or phone").
- Words follow SPEC §5. No internal code or id appears on screen, and no sentence assumes a
  gender.

## L · The lineup test: one hand, this month
Take four axes: **type, colour, space, finish** (radius, border, shadow, motion). For each
one, ask whether what the screen does is a decision written in DESIGN §1 and §1b, or a
default the kit or a model fell back on. Examples of defaults:
- shadcn's ring;
- `rounded-lg` everywhere;
- `text-[13px]`;
- a centred empty icon;
- a grey that nobody chose.

Then ask whether this screenshot, placed among ten AI-built CRMs made from the same prompt,
would be picked out as Kladra. It should also read as the same product as the best screen in
the set. A screen that passes the rules and still reads as a template fails the lineup test,
and that is a severity-2 finding.

## Finding format
Order findings by severity:
1. a stranger would call it a different product, or broken;
2. clearly below the best screens;
3. polish.

Each finding is one action a builder can take ("move Archive into the overflow menu, after a
divider"). Tie it to the rule it breaks: a DESIGN line, a SPEC §5 word, or a pattern slug from
`sources.md`. An observation with no action is not a finding.

**A restyle changes only the look.** Behaviour, component contracts and the meaning of the
words stay where they are, unless the finding is about them.
