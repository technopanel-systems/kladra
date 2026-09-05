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
 */
export async function ListTail({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  const t = await getTranslations("common");

  return (
    <p data-slot="list-tail" className="text-xs text-muted-foreground">
      {t("showingFirst", { shown, total })}
    </p>
  );
}
