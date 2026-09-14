# States and feedback

Sources: loading-states-system, skeleton-loading, doherty-threshold, empty-states,
error-states, toast-notifications, notification-system, undo-ux, destructive-actions,
optimistic-ui, behind-the-button, disabled-buttons, modal-hierarchy, peak-end-rule.
See `sources.md` for the URLs.

## Loading: choose by what is known about the wait
| What you know | What to draw | Kladra |
|---|---|---|
| The response usually lands in under ~300ms | Nothing. A loading mark that flashes reads as a glitch. | Check `loading.tsx` skeletons on fast tab and link switches. A skeleton that shows for one frame is a finding. |
| The content's shape is known and the wait is longer than ~300ms | A skeleton in that shape | `Skeleton`: static, the row's own height, the card's own edges (§1b). The library's shimmer is refused (`refused.md`). |
| A short wait of unknown length, started by a control | A mark inside that control ("Saving…"), and the control stays where it is | The pending mark, `aria-busy`, and the button's words. Never a spinner over the whole page. |
| A long wait whose percentage is known | A progress bar with real numbers | Only the CSV export and the backup could qualify. Both are fast today. |
| A reversible, cheap action that is almost certain to succeed | Update at once and reconcile afterwards | Rare in Kladra (see Optimistic below). |

The reaction has to land within about 400ms, the Doherty threshold. The work itself can take
longer. A press gets its tint in under 100ms.

## Empty: four kinds, never one generic line
- **First use.** Say where the work starts. Kladra does not draw the primary action a second
  time (§2, D31).
- **No results.** Offer the way out: "clear the search".
- **Filtered out.** Say how many are hidden and how to show them. "Nothing here" is wrong
  when twelve records are hidden behind a chip.
- **Could not load.** This is an error, not an empty state (see below).

The library adds an illustration and a warm tone. Kladra keeps `Empty`: one sentence in a
dashed edge that says why the list is empty. A reader must never see "No records" flash and
then be replaced by rows. Loading and empty are two separate renders.

## Errors: severity picks the surface
| Severity | Surface | Kladra |
|---|---|---|
| Recoverable, and it belongs to one field | Inline under that field: colour, icon and words together | `fieldErrors`. The message names the problem and the fix. |
| A refused submit | The form's footer, with focus moved to the first field it names | This pattern is already in Kladra (`unhappy.spec`). Check that every dialog does it. |
| Transient: the wire dropped, or a write failed | A toast that stays until it is closed, with the next step in words | Say what was not saved and that the text is kept. |
| Blocking: the screen cannot draw, or you have no access | One card inside the shell | This pattern is already in Kladra (§2). |

No codes, no "An error occurred", and no dead-end "OK". An error answers three questions:
what happened, why, and what to do next. "Retry" on a failed write is an exit, not a refresh
button. A "Refresh page" button stays refused (CLAUDE.md Never).

## Toasts and the other notification surfaces
- **Match the surface to the event.**
  - **Toast:** your own action's result.
  - **Banner:** a condition that lasts, such as live updates stopped. It stays until the
    condition clears.
  - **Dialog:** only when the person must decide before going on.
  - **Badge:** a quiet count, like the bell. It updates in place and never ticks.
- **Toast timing.**
  - Success or information leaves after about **4s**.
  - A warning holds for about **7s**.
  - A failure the person has to act on **stays until closed**.
  - Hovering pauses the timer.
- **Stacking.** No more than **3** visible; the rest queue. Never stack two dialogs.
- **Colour is never alone.** Every toast has an icon and words. An accent edge uses logical
  CSS (`border-s`).
- **Placement.** Kladra puts toasts at bottom-right, or bottom-left in RTL (`layout.tsx`).
  Never in the centre. On the phone a toast must not cover the bottom bar or a sheet's
  primary button. The library puts phone toasts on the top edge, and S12.1 checks the 375
  shots and decides.
- **The ending of a flow is what people remember** (peak-end). The toast after sending a
  request, handing over or approving should say exactly what happens next and where to find
  it. It carries no confetti and no celebration (`refused.md`).

## Friction scale: match friction to what the mistake costs
1. **Nothing.** Reversible, common, and visible straight away (a chip, a tab, a filter).
2. **Undo.** Reversible but costly to redo. The action runs, and a toast offers Undo for about
   5–10s with a visible countdown. Kladra has no undo machinery. Where a confirm guards
   something reversible from the same screen, the inventory records it as friction
   (severity 3) for the founder. S12 does not build undo.
3. **Confirm dialog.** The buttons name the verb ("Archive company" / "Keep it"), Cancel is
   the default, and the destructive button is never where the primary usually sits. Kladra's
   reason fields (refuse, lost, unfile) are a confirm that also records something, so they
   stay.
4. **Typed confirmation, or a cooling-off period.** For something irreversible and rare.
   Kladra has no hard delete a user can reach, so this is not used today.

## Optimistic updates: where the line is
The library's rule: update at once only when the action is reversible, cheap, and succeeds
about 99% of the time, and keep the real state visible for money, transfers and deletes.

In Kladra almost every write is a paper, a load, a status or a hand-over. The server holds the
row and decides (`.claude/rules/data.md`: a write holds its row before it decides), so these
wait for the server and show the pending mark.

Optimistic updates fit only personal marks, such as a notification marked read. Never use
them for an approval, a figure, a status change or anything that counts toward a month.

## Busy is not disabled
- A disabled control drops out of the Tab order, gets no pointer events (so a tooltip
  explaining it never fires) and often fails contrast at ~1.9:1.
- **During a request:** keep focus and place, show the pending mark, set `aria-busy`, and put
  the words on the button ("Saving…").
- **When input is missing:** keep submit live. On press, name the missing fields and move
  focus to the first. If a control truly cannot be used (for example the person may not do
  this), say why beside it rather than only greying it out.
