# Forms and input

Sources: form-field-states, form-validation-timing, input-masking, yt card-input,
dropdown-design, date-pickers, stepper-wizard, inline-editing, autosave-ux, settings-system,
microcopy, disabled-buttons, toggle-anatomy, behind-the-button. See `sources.md` for URLs.

## A field's states
Every input is drawn once in the kit, with all of these states:
- **Default:** the label sits above the field and the helper text below.
- **Focus:** the 2px brand outline (§1b).
- **Invalid:** colour, icon and words together; a red border alone is not enough.
- **Disabled:** it looks different from busy (see below). A field at 50% opacity reads as
  loading, not disabled.
- **Busy:** a mark inside the field while a check runs, for example the duplicate company or
  phone check.
- **Confirmed:** used only where a check actually ran against something, such as "no company
  with this phone". Kladra puts no green tick on every filled field, because colour only
  means something (SPEC §3) and a form full of ticks says nothing.

A placeholder is never the label. It disappears as soon as someone types.

## When to validate
- **Format fields** (phone, email, a number with a range) are checked when the person leaves
  the field. They are never checked on each keystroke, which marks "05" as a wrong phone
  while the person is still typing.
- **After a field has shown an error, it re-checks as the person types** and clears the
  moment it is right.
- **Red means "finished and wrong".** It never means "not finished yet".
- **Submit stays pressable.** A refused submit names the fields and moves focus to the first
  one, in the footer.
- **The server repeats every check the client made, and computes totals from its own data.**
  Kladra already does this in its actions. Never trust a total the browser sent.

## Masked input (phone)
- **Show the formatted value, store the raw value.** Kladra already stores `phone` and a
  `normalized` +966 form.
- **Keep the caret where the person left it** when a separator is inserted.
- **Clean up a paste.** A pasted "+966 55-111-7788" is tidied, not rejected.
- **Validate on blur.** An unfinished number is never shown as an error.

## Dropdowns
- **The trigger looks pressable at rest.** It has a visible caret, a hover step, and is 40px
  tall on a desk and 44px on a phone.
- **Behaviour:** the list opens in about 150ms and flips upward when there is no room below.
  Arrow keys, Enter and Esc all work.
- **Search:** add a search box when the list is long. The library says past about 10 entries;
  Kladra says past about 8, with common values pinned and the likeliest one preselected (§2).
  Kladra's rule stands.

## Dates
- **Presets come first.** One click covers most choices: Today, Tomorrow, Next week for a
  follow-up; This month and Last month for a window (RangeChips already do this).
- **A custom range shows two months side by side on a desk.** The full keyboard works: arrow
  keys, PgUp/PgDn, Enter, Esc.
- **On a phone the picker is a sheet,** not a shrunken popover.
- **Dates read 04/Aug/2026** (§2).

## Long dialogs (the request dialogs)
- **Group by meaning.** Lines, services, delivery and payment are each a titled group, with a
  larger gap between groups than inside one. This matches the proximity numbers in
  `visual.md`.
- **Don't split into steps.** Kladra's request is one screen with visible sections, because a
  coordinator checks the whole paper at once. Steps only pay off when later groups depend on
  earlier answers and each step can be checked by itself.
- **Nothing typed is lost** on Back, on close by mistake, or when the server is out of reach.
  Closing a dialog with unsaved input asks before it discards. Where Kladra already keeps a
  draft, the inventory checks that every dialog does the same.

## Inline editing (if a slice adds any)
- **Show editability at rest,** with a hover tint or a pencil that `reveal` shows.
- **No layout shift.** The input uses the same font, padding and box as the text it replaces;
  only the border changes.
- **Keys:** Enter commits and Esc cancels. Choose one rule for blur across the whole app and
  never mix it.
- **Match edit mode to cost.** Cheap values can be edited with a click. Expensive ones (money,
  m², a status) need an explicit Edit. In Kladra everything that counts is expensive, so
  expensive values are edited in dialogs.

## Settings and admin
- **Group by task,** not by the database table.
- **Save model by risk.** A preference applies at once and says "Saved" in place (theme,
  language). An identity or business value needs an explicit Save, with an unsaved-changes
  line (users, targets, lookups).
- **Irreversible or wide-reaching actions go last,** apart from the rest and behind a divider,
  with a verb label.
- **Rare options sit behind one "More" disclosure,** not on the main path.

## Words on controls
A button names what happens: "Send for approval", "Hand over", "Add report". Never "Submit"
or "OK". An error reads as a detour, not a dead end: "This phone is on Al-Rajhi Trading —
open it?" beats "Duplicate".
