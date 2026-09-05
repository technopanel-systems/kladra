import { MessageCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { DayText } from "@/components/ui-ext/day-text";
import { Link } from "@/i18n/navigation";
import type { CompanyRow } from "@/lib/companies";
import { formatPhone, whatsappHref } from "@/lib/phone";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * Who is owed a call, in the order they are owed it (SPEC §3, P8).
 *
 * This is the timeline, and the reason it is not drawn as one: a rep reads this
 * standing up, on a phone, and a horizontal axis of the next fortnight answers
 * "when" when the question is "who first". Three bands, worst at the top, and
 * the phone number is on the row — the whole point is that the next thing he
 * does is press it (DESIGN §6).
 */

type Band = { key: string; tone: StateTone; rows: CompanyRow[] };

export async function CallList({
  overdue,
  today,
  never,
}: {
  overdue: CompanyRow[];
  today: CompanyRow[];
  never: CompanyRow[];
}) {
  const t = await getTranslations();
  const locale = await getLocale();

  const bands: Band[] = (
    [
      { key: "common.overdue", tone: "bad", rows: overdue },
      { key: "common.dueToday", tone: "wait", rows: today },
      { key: "common.neverContacted", tone: "open", rows: never },
    ] satisfies Band[]
  ).filter((band) => band.rows.length > 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("day.whoToCall")}</h2>

      {bands.length === 0 ? (
        <p className="card-face px-4 py-6 text-center text-sm text-muted-foreground">
          {t("day.nobodyToCall")}
        </p>
      ) : (
        bands.map((band) => (
          <div key={band.key} className="flex flex-col gap-2">
            <h3 className={cn("text-xs font-medium tracking-wide uppercase", TONE_TEXT[band.tone])}>
              {t(band.key)}{" "}
              <span dir="ltr" className="num">
                {band.rows.length}
              </span>
            </h3>

            <ul className="flex flex-col gap-2">
              {band.rows.map((row) => (
                <li
                  key={row.id}
                  className="card-face relative flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={`/companies?open=${row.id}`}
                      // The whole card is the target; the phone link on top of
                      // it is the exception, which is why it carries a z-index.
                      className="truncate text-sm font-medium after:absolute after:inset-0"
                    >
                      <bdi>{row.name}</bdi>
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {row.mainContactName ? <bdi>{row.mainContactName}</bdi> : null}
                      {row.cityName ? <span>{row.cityName}</span> : null}
                    </span>
                  </span>

                  {row.nextFollowUp ? (
                    <DayText
                      day={row.nextFollowUp}
                      locale={locale}
                      className={cn("text-xs", TONE_TEXT[band.tone])}
                    />
                  ) : null}

                  {row.mainContactPhone ? (
                    <a
                      href={whatsappHref(row.mainContactPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface"
                    >
                      <MessageCircle aria-hidden="true" className="size-3.5" />
                      <span dir="ltr" className="num">
                        {formatPhone(row.mainContactPhone)}
                      </span>
                      <span className="sr-only">{t("drawer.openWhatsApp")}</span>
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
