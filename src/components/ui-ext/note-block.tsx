import { Prose } from "@/components/ui-ext/prose";
import { cn } from "@/lib/utils";

/**
 * Something a person typed, under the word for what it is.
 *
 * `Prose` settles the direction of a typed block; this settles where it sits.
 * A label at the start of a wide drawer and an Arabic paragraph swinging to the
 * far end of it are the same pair of facts a quotation sheet already had to
 * solve — its send-back reason, its rejection reason, its note to the desk —
 * and it solved it with a face of its own: the label and the words inside one
 * box, so the paragraph taking the writer's direction stays visibly attached to
 * the word that says what it is (P11J, D136).
 *
 * A note is not a comment (the Never list). Nobody answers it, nothing threads
 * off it, and it has no author line: it is the record saying what it says, in
 * the place the record is read.
 */
export function NoteBlock({
  title,
  text,
  slot,
  className,
}: {
  title: string;
  text: string | null | undefined;
  /** A hook for the specs, where one of these is the thing under test. */
  slot?: string;
  /** For a field that has no length to speak of — a note runs to four thousand
   *  characters, and a drawer on a phone cannot give them all a home. */
  className?: string;
}) {
  if (!text || text.trim() === "") return null;
  return (
    <div className="card-face flex flex-col gap-1 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <Prose text={text} slot={slot} className={cn("text-sm", className)} />
    </div>
  );
}
