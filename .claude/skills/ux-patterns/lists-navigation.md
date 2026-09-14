# Lists, search, navigation, overlays, boards

Sources: data-table, filter-chips, search-experience-system, command-palette, pagination,
tabs-system, navigation-patterns, modal-hierarchy, bottom-sheets, context-menu, hover-trap,
yt fitts-law, yt kanban, reverse-engineered-linear, serial-position. See `sources.md` for
URLs.

## Tables
- **Numbers sit at the end of their column,** in tabular figures (`.num`), so a column of m²
  reads as a column. Text sits at the start. Nothing is centred.
- **Headers stay put.** The header is sticky on long lists, and the column you navigate by
  stays visible when the table scrolls sideways (with `StickyScroll`, §1b).
- **Show the task, not the schema.** A list shows who, the state in words, the one figure
  that matters and the age or next date. Everything else lives in the drawer. If a table has
  more columns than the person scans, that is a schema browser (`lens.md` B).
- **Row actions.** The frequent action is on the row, via `reveal` on a desk and always
  visible on a phone. Anything destructive or rare goes in the row's menu, never beside the
  frequent action at equal weight.
- **Sorting.** Kladra's lists have one order, chosen for the job (overdue first, waiting
  longest first). If a slice ever makes a column sortable, sorting has three states (up,
  down, back to the list's own order) with `aria-sort`.
- **Refused:** a density control and row checkboxes with select-all (`refused.md`).

## Filter chips
- **Three states that look different.**
  - **Idle:** surface and border.
  - **Active:** filled, with a check or the count, plus the word.
  - **Disabled:** dimmed, with nothing behind it.

  If active looks like idle, the filter looks broken.
- **The count updates in the same frame as the tap.** If it does not move, people tap twice.
- **Logic:** OR inside a group, AND across groups. The count shows the result.
- **One clear action appears whenever anything is on.**
- **On a phone, chips stay in one row that scrolls** with an edge fade. They never wrap into a
  wall that pushes the list below the fold (D145).
- **The active filters stay visible above the list,** so the reader always sees why the list
  shrank.

## Search
- **The placeholder names what is searched,** as in "Company, contact or phone". A bare
  "Search" does not.
- **Keyboard:** arrows move, Enter opens, Esc closes. The focus ring stays visible throughout.
- **Zero results is never a dead end.** Offer the way out (clear the search, a nearby spelling,
  the last opened record). Kladra's `Empty` slot is exactly this.
- **The palette** (`search-command.tsx`):
  - it matches loosely (subsequence), so "rjh" still finds "Al-Rajhi";
  - results are grouped under labels (Companies, Projects, Quotations);
  - it never opens to a blank box — recent records appear before anything is typed;
  - a slow query keeps the palette open with a mark in place;
  - Esc goes back one level before it closes.
- **The palette speeds things up but is never the only way to a place.** The rail and the
  bottom bar stay.

## Paging and returning
- **Page and filter state live in the URL,** so refresh and back keep them (Kladra's `ListSearch`
  already works this way).
- **Coming back from a record lands on the same row,** not the top. Drawers open over the list,
  so check any flow that leaves the page instead.
- **Never draw every page link.** Show first, last, current and neighbours. Where data changes
  underneath, page by a stable key rather than an offset.

## Tabs
- **Tab labels never wrap to a second line.** When there are too many, the row scrolls with an
  edge fade (and chevrons for a mouse).
- **The focus ring and the active indicator are different marks.**
- **A tablist that switches panels** (the kit's `Tabs`, a drawer's tabs) uses arrows,
  Home and End, and Tab leaves the list. `PageTabs` are links with addresses (§3), so Tab walks
  them.
- **Switching content never jumps the layout.** Panel height does not snap.
- **On a phone,** up to about 5 tabs fit a segmented control. More than that, use a sheet or a
  scrolling row. Never shrink the desk's row.

## Navigation
- **Phone bottom bar:** 3–5 destinations, always visible. Primary navigation is never behind a
  hamburger, which cuts engagement by ~40% on mobile and ~56% on desktop.
- **Desk sidebar:** persistent for five or more sections. Collapsed by default hides what is
  there.
- **Breadcrumbs** only earn their place past two levels. Kladra is two levels deep (a list, and
  a record over it), so it has none.
- **First and last slots are remembered** (serial position). The rail's first item is the
  person's home, and the most-used destinations sit at the ends of the bottom bar, not the
  middle.

## Overlays: does it block?
- **It blocks, meaning a decision is needed before going on:** use a **dialog**. The request
  dialogs, a confirm, a reason.
- **It does not block, and it is a record read beside its list:** use the **drawer**
  (`RecordPanel`, §3).
- **It does not block, and it is a small choice at a control:** use a **popover** or menu,
  anchored and about 200px.
- **On a phone,** dialogs and choices become **bottom sheets**: the page stays visible behind,
  the primary action is the lowest button, and the scrim locks the scroll (§2, D128–D130).
- **Never open a dialog on top of a dialog.** A second decision waits until the first is
  answered.

## Menus (row overflow, context)
- **Place to fit.** Measure, then flip at the viewport edge.
- **Group by intent** with dividers. The destructive item comes last, set apart, in the tint.
- **Keys:** arrows move, a letter jumps to its item, Esc closes one level.
- **Submenus** keep a safe path for a diagonal pointer move. Better, avoid submenus.
- **On touch,** the same actions come from a visible control, not a long-press only.

## Hover and targets
- **Hover reveals extras, never the only way to reach an action.** Gate the hiding with
  `@media (hover: hover)`, never the showing (§1b). A tablet with a mouse still gets hover.
- **Pad the hit area, not the glyph.** A 16–20px icon gets a 44px target on a coarse pointer
  (`@media (pointer: coarse)`).
- **Fitts's law:** time to a target grows with distance and falls with size. Keep frequent
  actions large and near what they act on (row actions, the drawer's head). Keep a destructive
  target away from the one pressed a hundred times a day.

## Boards (without drag)
The kanban short gives four rules, all built around dragging. Kladra refuses dragging (§4,
§6), so each is translated:
- **Pick-up signals** become the column the card will join, named in the action that moves it
  (a status choice in the drawer or the row menu).
- **The drop preview** becomes a confirmation that says where the card went.
- **Snap to structure** is already how a status board behaves.
- **Undo** follows the friction scale in `states-feedback.md`.

The toast after a move names the destination ("Moved to Won"), and the card takes the arrived
flash in its new column. A column carries its count and a card carries its age (§6). A card
shows three or four things; more makes it a form.
