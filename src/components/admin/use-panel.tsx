import { getLocale, getTranslations } from "next-intl/server";
import { DayText } from "@/components/ui-ext/day-text";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { USE_WINDOW_DAYS, type PersonUse, type Use } from "@/lib/adoption";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * Who is using Kladra, and who has stopped (SPEC D77, 9A item 12).
 *
 * Two facts a person, and no third. When they last opened it, and how many
 * records they changed in the week — the second read from the audit log, so it
 * is one question asked of every role rather than a different verb for each job.
 *
 * No score, no ranking, no percentage. The admin reads two columns and does one
 * of two things: ring the person who has not opened it, or ask the person who
 * opens it and changes nothing what is in his way. A number that ranked them
 * would answer neither and would be the first thing shown to the whole floor.
 *
 * Amber is for the row that needs the call, and it is the same rule the figure
 * above the table states in words: nothing opened for a week. Somebody on leave
 * is not amber — he is not avoiding it, he is not at work (D75).
 */
export async function UsePanel({ use }: { use: Use }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <div className="flex flex-col gap-4">
      <StandingStrip
        items={[
          {
            label: t("admin.useQuiet"),
            value: (
              <span dir="ltr" className="num">
                {use.quiet}
              </span>
            ),
            caption: t("admin.useQuietMeans", { days: USE_WINDOW_DAYS }),
            // The same amber the rows use. One fact — this person has not opened
            // it — must not be red at the top of the screen and amber halfway
            // down it, and amber is the right one: it is a call to make, not an
            // error (DESIGN §6).
            tone: use.quiet > 0 ? "wait" : null,
          },
          {
            label: t("admin.usePeople"),
            value: (
              <span dir="ltr" className="num">
                {use.people.length}
              </span>
            ),
            caption: t("admin.usePeopleMeans"),
          },
        ]}
      />

      <div className="flex flex-col gap-2 md:hidden">
        {use.people.map((person) => (
          <div key={person.userId} className="card-face flex flex-col gap-1 p-3">
            <span className="font-medium">{person.name}</span>
            {/* Both facts weighted the same way — a muted label and its value in
                the reading colour — because the desk table gives them equal
                weight and one layout must not rank what the other does not. */}
            <span className="flex flex-wrap items-baseline gap-x-4 text-xs text-muted-foreground">
              <span className="flex items-baseline gap-x-1.5">
                {t("admin.useOpened")}
                <span className="text-foreground">
                  <Opened person={person} locale={locale} />
                </span>
              </span>
              <span className="flex items-baseline gap-x-1.5">
                {t("admin.useDid")}
                <span dir="ltr" className="num text-foreground">
                  {person.did}
                </span>
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="card-face hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="p-3">{t("admin.person")}</TableHead>
              <TableHead className="p-3">{t("admin.useOpened")}</TableHead>
              <TableHead className="p-3 text-end">{t("admin.useDid")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {use.people.map((person) => (
              <TableRow key={person.userId}>
                <TableCell className="p-3 font-medium">{person.name}</TableCell>
                <TableCell className="p-3">
                  <Opened person={person} locale={locale} />
                </TableCell>
                <TableCell className="p-3 text-end">
                  <span dir="ltr" className="num">
                    {person.did}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * When they last opened it: today, the day itself, or never — and amber once it
 * is a week ago, which is the figure above the table said one row at a time.
 */
async function Opened({ person, locale }: { person: PersonUse; locale: string }) {
  const t = await getTranslations();
  const late = person.daysSince === null || person.daysSince >= USE_WINDOW_DAYS;

  // Amber here too, and not red: an account nobody has opened is the same fact
  // as one nobody has opened for a fortnight — somebody to ring — and one fact
  // wears one colour on one screen.
  if (person.lastSeenOn === null) {
    return <span className={TONE_TEXT.wait}>{t("admin.useNever")}</span>;
  }

  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-2", late && !person.away && TONE_TEXT.wait)}>
      <DayText day={person.lastSeenOn} locale={locale} />
      {person.daysSince === 0 ? null : (
        <span className="text-xs">{t("admin.useDaysAgo", { count: person.daysSince ?? 0 })}</span>
      )}
      {person.away ? <span className="text-xs text-faint">{t("admin.useAway")}</span> : null}
    </span>
  );
}
