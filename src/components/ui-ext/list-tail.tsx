import { getTranslations } from "next-intl/server";

/**
 * What a list is not showing (D80).
 *
 * Every list on this app used to render every row it was given, at both widths
 * at once — the phone's cards and the desk's table are both in the HTML and one
 * is hidden by CSS — and the seeded floor is twelve companies while the
 * founder's is a thousand. The rows are capped now, and this is the line that
 * says so: how many are here, how many there are, and what to do about the
 * difference.
 *
 * It renders nothing when nothing was left out, which is the ordinary case and
 * the reason it can sit under every list without adding a line to any of them.
 *
 * The sentence names what to do about the difference, so it belongs to the
 * screen and not to this component: over a searchable list it says to search,
 * and over the log on a report card it says where the rest of that day is —
 * because that card has no search box, and a line telling a reader to use one
 * is a screen offering work it cannot do (DESIGN §5). The markup stays here,
 * which is the part that was ever worth writing once.
 */
export async function ListTail({
  shown,
  total,
  hint,
}: {
  shown: number;
  total: number;
  /** Already translated, where the default sentence is the wrong advice. */
  hint?: string;
}) {
  if (total <= shown) return null;
  const t = await getTranslations("common");

  return (
    <p data-slot="list-tail" className="text-xs text-muted-foreground">
      {hint ?? t("showingFirst", { shown, total })}
    </p>
  );
}
