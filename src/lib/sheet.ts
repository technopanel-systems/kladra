/**
 * The sheet this business sells, written once (SPEC §3, S32, P12-9).
 *
 * A composite panel comes off the line in a small number of widths and one
 * usual length, and the founder named them: **1.24 / 1.5 / 2.0 metres, or a
 * number he types**, on a 5.8 m sheet 4 mm thick. Those are facts about the
 * product, not preferences, so they are not a lookup the admin edits: a new
 * width would be a new product line and a decision somebody makes out loud.
 *
 * They were written twice — a `WIDTH_CHOICES` in the line editor and a
 * `STANDARD_WIDTHS` in the seed that nothing read — which is the shape
 * rules/words.md calls a list beside a union: two copies, both legal, and the
 * one nobody runs is the one that drifts. The seed's copy had never been wrong
 * only because no screen had ever asked it anything. One module now, with no
 * database and no `server-only` in it, so the client dialog, the seed and the
 * specs all read the same four values.
 *
 * A pure module for the reason in rules/data.md: a VALUE imported from anything
 * that touches `@/db` drags the database into the browser bundle.
 */

/** The widths a sheet comes in, in metres. Anything else is typed (§3). */
export const STANDARD_WIDTHS = ["1.24", "1.5", "2.0"] as const;

/** What a new line opens on: the standard sheet, 1.24 × 5.8 m (S32). */
export const STANDARD_WIDTH = "1.24";
export const STANDARD_LENGTH = "5.8";

/** The standard thickness, in millimetres — matched by VALUE and never by row
 * position, so an admin adding 3 mm above it does not move what a form opens
 * on. The row itself is a lookup (`thicknesses`); this is which one is usual. */
export const STANDARD_THICKNESS_MM = 4;
