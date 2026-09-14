# Refused: what the library recommends and Kladra does not do

Each line gives the idea, where it comes from, and the rule that refuses it. Reopening one is
allowed, but the proposal has to say what has changed (DESIGN §7). What survives of each idea
is noted after the arrow.

| Idea (pattern) | Refused by | What survives |
|---|---|---|
| Drag a card between columns: pick-up signals, drop zones, snapping (drag-and-drop, yt kanban) | CLAUDE.md Never; DESIGN §4, §6 | A move comes from the drawer or row menu, names its column, and ends in a toast that says where the card went, plus the arrived flash |
| Row checkboxes, select-all with an indeterminate state, "select all 247 matching", bulk actions (data-table, bulk-actions) | CLAUDE.md Never (bulk edit) | Nothing. Kladra rows carry no selection |
| A density control, Compact 36 / Comfortable 48 / Spacious 60 (data-table) | DESIGN §1b One density; §4 | One row height: 40 on a desk, 48 on a phone |
| Linear-dense rows: 13px, 32px rows, -0.01em tracking (reverse-engineered-linear) | §1b rows of 40; words.md; Arabic is never tracked | The rest of Linear's recipe: flat surfaces, one accent, nothing centred, fast hover |
| A shimmering skeleton, a static skeleton "reads as broken" (skeleton-loading) | §1b Skeleton is static; §2 no loops | A skeleton in the content's own shape, shown only when the wait is visible |
| Hover lift of ~8px, scale 1.02–1.05, tinted glow, 3D tilt, parallax (perfect-card, card-hover-anatomy, depth-layers, shadow-elevation) | §1 nothing is lifted by hover; §1b elevation | `hover-tint`; the site's own quiet hover (border or tone step) |
| Spring and overshoot on presses and confirmations, bounce for attention (easing-curves, animation-timing, tabs-system, toast stacking) | §1b motion explains or is not there | Ease-out in, ease-in out, exits faster |
| Staggered entrance of a list, 50ms per item (animation-timing, easing-curves, accordion, card actions) | §1b; motion that decorates | A list arrives as one; a new row takes the arrived flash |
| Confetti or a "delight" peak at the end of a flow (peak-end-rule) | §2 calm; no decoration | The ending says exactly what happens next |
| An animated completion meter, a live countdown ticker, number count-up (zeigarnik-effect, error-states' reconnect countdown, doherty progress ticker) | §1b a number does not count up; §2 no loops | A static figure that updates in place; a line of words for a stopped connection |
| "Refresh page" as an error's way out (error-states) | CLAUDE.md Never (refresh buttons) | "Try again" on a failed write is an exit and allowed; live updates remove the need to refresh |
| Filter presets saved by name, remembered custom ranges (filter-chips, date-pickers) | CLAUDE.md Never (saved views) | Presets that are fixed windows (RangeChips); state on the URL |
| Draggable edges on a date range (date-pickers) | No drag-and-drop | Click start, click end, or type |
| Swipe actions on rows, long-press only menus (swipe-actions, hover-trap, context-menu) | Not in the toolkit. DESIGN has no gesture-only control, and the phone keeps visible controls | Row actions stay drawn on a phone (`reveal` is gated by `hover: hover`) |
| Drag-to-dismiss bottom sheets with snap points (bottom-sheets, modal-hierarchy) | No drag-and-drop | Sheets close by a button, the scrim, or Esc; the primary action is lowest |
| An illustration or icon in every empty state, a warm "Looks quiet in here" voice, the primary CTA repeated in the empty state (empty-states, microcopy) | §1b `Empty` is one sentence; §2 the primary action is not drawn twice | The four kinds of empty, each saying its cause, with the way out in the slot |
| A green tick on every valid field (form-field-states, form-validation-timing) | SPEC §3 colour only means something | A confirmation only where a check actually ran (duplicates) |
| Optimistic updates for saves and status changes (optimistic-ui, toggle-anatomy, inline-editing) | data.md: a write holds its row before it decides | Optimistic only for personal marks, such as a notification marked read |
| Hold-to-confirm rings, typed confirmation, a 14-day deletion cooldown (destructive-actions, undo-ux) | Nothing a user can reach is irreversible (archive, not delete) | Verb labels, Cancel as the default, destructive action away from the primary slot, a red budget |
| Undo stacks, delayed send (undo-ux) | Scope. Kladra has no undo machinery; a paper's chain is its history | Considered per confirm in the inventory, as friction for the founder |
| A mesh gradient, grain, gradient text, a third gradient, the site's animated gradient-border CTA (gradient-design, site UI) | §1 exactly two gradients | The craft checklist applied to the two |
| Violet or teal accent, Inter, uppercase tracked eyebrows, two-tone accent headings (PDF, site) | §1 Sandstone and Readex Pro, chosen by the founder; Arabic has no case and tracking breaks the joins | The labelled group, and a sentence-case eyebrow in muted or accent tone (`visual.md`) |
| One shadow per page, cards borders-only (site UI) | §1: card-face has a hairline and a soft shadow, chosen in S1 | Restraint: no shadow added for importance; floating surfaces keep their own tight shadow |
| File upload dropzone, progress with speed and time left (file-upload-ux) | §4 file attachments not built | — |
| A multi-step wizard for the request dialogs (stepper-wizard) | The coordinator reads the whole paper at once; one screen with titled groups | Chunking by meaning, nothing lost on close |
| Colour pickers, star ratings, OTP boxes, range sliders, live cursors, landing-page skeletons, scroll-driven animation (low-priority set) | No such surface in Kladra | — |
