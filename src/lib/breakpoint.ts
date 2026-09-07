/**
 * The one line between a phone and everything else.
 *
 * Tailwind's `md` (48rem) is where the shell changes — the rail becomes the
 * bottom bar, tables become cards — and the forms have to change on the same
 * line. They did not: the responsive dialog was keyed to 640, the company
 * drawer to 639, the log dialog to `max-sm:`, so between 640 and 767 a tablet
 * had a bottom bar under centred dialogs (P11H, §5 #35). One query, named
 * here in the words Tailwind compiles `max-md:` to — `(width < 48rem)`, not
 * `(max-width: 767px)`, which disagrees with it at a fractional width — and
 * the stylesheet keeps saying `md:` / `max-md:`, which is the same line.
 * `scripts/one-look.mts` refuses any other width query in src.
 *
 * No React and no server imports: a pure constant the hook and the tests read.
 */
export const PHONE_QUERY = "(width < 48rem)";
/** The last whole pixel below the line, for a spec that sets a viewport. */
export const PHONE_MAX_PX = 767;
