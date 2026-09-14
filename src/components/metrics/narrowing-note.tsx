import { X } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { CHAIN_STAGES } from "@/lib/chain";
import { formatDay } from "@/lib/dates";
import type { Narrowing } from "@/lib/narrowing";
import { narrowingNames } from "@/lib/narrowing-names";

/**
 * What a list opened from a figure is showing, in one line over it (D80, D117).
 *
 * A pressed slice lands on the quotations or dispatches list with a window, a
 * person and perhaps a kind of customer in its address, none of which the list's
 * own chips can show. Without this line the list would look like the whole list
 * with some rows missing — a screen lying about what it shows (rules/words.md).
 * So it says which rows these are, in the words the figure used, and offers the
 * way back to all of them.
 */
export async function NarrowingNote({
  narrowing,
  list,
}: {
  narrowing: Narrowing;
  /** Which list, which decides what the window's days are the days OF. */
  list: "dispatches" | "quotations";
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const names = await narrowingNames(narrowing, locale);
  const from = formatDay(narrowing.from, locale);
  const to = narrowing.to ? formatDay(narrowing.to, locale) : null;

  const window =
    list === "dispatches"
      ? to
        ? t("metrics.narrowed.approvedBetween", { from, to })
        : t("metrics.narrowed.approvedSince", { from })
      : to
        ? t("metrics.narrowed.requestedBetween", { from, to })
        : t("metrics.narrowed.requestedSince", { from });

  const parts: string[] = [window];
  if (names.person) parts.push(t("metrics.narrowed.for", { name: names.person }));
  for (const name of [...names.segments, ...names.sources]) parts.push(name);
  for (const city of names.cities) parts.push(city ?? t("metrics.noCity"));
  if (list === "quotations") {
    for (const stage of CHAIN_STAGES) {
      if (narrowing.ended.includes(stage)) parts.push(t(`team.chain.${stage}`));
    }
    if (narrowing.dispatched) parts.push(t("metrics.narrowed.dispatched"));
  }

  return (
    <div
      data-slot="narrowing"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
    >
      <p className="min-w-0 flex-1 text-sm">
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 ? " · " : null}
            <bdi>{part}</bdi>
          </span>
        ))}
      </p>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${list}`}>
          <X aria-hidden="true" />
          {t("metrics.narrowed.showAll")}
        </Link>
      </Button>
    </div>
  );
}
