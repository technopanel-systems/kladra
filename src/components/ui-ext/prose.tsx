import { cn } from "@/lib/utils";

/**
 * A block of text a person typed, laid out in that person's direction — not in
 * the page's (DESIGN §5, rules/words.md).
 *
 * Every other string on a screen belongs to the locale: it came out of
 * `messages/<locale>/`, and it runs the way the page runs. This one did not. A
 * log entry, a coordinator's reason, a daily report — each was typed by whoever
 * typed it, in whichever language they were thinking in, and both languages are
 * on every screen: Saad writes English and Rawan writes Arabic, and each of them
 * reads the other's on their own page.
 *
 * `<bdi>` is not enough on its own, and that was the defect. It settles the
 * direction of an inline RUN inside a sentence, which is what the message loader
 * uses it for; it does not set the base direction of a BLOCK. So an English
 * paragraph inside an Arabic card read left-to-right internally and sat flush
 * against the right margin, ragged down its left — legible, and wrong, in the
 * way a paragraph in the wrong place is wrong. `dir="auto"` takes the base
 * direction from the first strong character in the text itself, which is exactly
 * the question being asked: whose sentence is this. Arabic goes right, English
 * goes left, on either locale's page, with nothing to remember.
 *
 * That is a PARAGRAPH: the body of its own box, read as a paragraph. A LINE is
 * different, and that was the second defect (Phase 11D shots). The last words on
 * a call card, the reason under a waiting card, the note under a notice — each is
 * one line that belongs to the row above it, and when the line took its own
 * alignment too, an Arabic reason on an English card at 1366 sat alone at the
 * far right edge, nearer the date column than the company it explained. With
 * `line`, the block keeps the page's alignment and the words keep their own
 * direction, isolated in a `<bdi>`: the line starts where its row starts and
 * reads the way it was written.
 *
 * `break-words` because it is user content and somebody will paste a URL.
 *
 * Nothing at all renders nothing at all: `whitespace-pre-line` would turn a note
 * of newlines into visible empty lines, and every caller would otherwise have to
 * remember to check.
 */
export function Prose({
  text,
  className,
  slot,
  line = false,
}: {
  text: string;
  className?: string;
  /** A hook for the specs, where one of these is the thing under test. */
  slot?: string;
  /** A caption under something else, not a paragraph in its own box: the line
   *  sits where its row starts and only the words take the writer's direction. */
  line?: boolean;
}) {
  if (text.trim() === "") return null;
  const classes = cn("break-words whitespace-pre-line", className);

  if (line) {
    return (
      <p data-slot={slot} className={classes}>
        <bdi dir="auto">{text}</bdi>
      </p>
    );
  }
  return (
    <p data-slot={slot} dir="auto" className={classes}>
      {text}
    </p>
  );
}
