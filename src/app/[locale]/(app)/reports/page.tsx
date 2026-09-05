import { getTranslations } from "next-intl/server";
import { DayNav } from "@/components/reports/day-nav";
import { OwnCard, PersonCard } from "@/components/reports/person-card";
import { ReportBox } from "@/components/reports/report-box";
import { requireUser } from "@/lib/authz";
import { todayRiyadh, type Day } from "@/lib/dates";
import { latestReportDay, mayWriteFor, owesReport, reportNeighbours, teamDay } from "@/lib/reports";

/**
 * The daily report (SPEC D55-D58, WORKFLOW §4, Jerom's phase 9B).
 *
 * This is the thing that kept the Google Sheet open. A rep wrote one line a day,
 * the manager read them all in the evening, and Kladra replaced every other part
 * of that sheet and not this one — so the sheet stayed, and everything on it
 * that Kladra also holds drifted.
 *
 * S27 said there would be no report to write, on the grounds that a company's
 * history already is one. That half is kept and is the whole design of the
 * screen: nobody retypes a visit, a quotation or a metre, because all of it is
 * read back out of the records the work itself produced. What S27 got wrong is
 * that a history says what happened and never what it meant — "Al-Rajhi went
 * quiet, I think they went to the other supplier" is not derivable from any row
 * — and that sentence is the one thing this screen asks for (D55).
 *
 * One screen, not two. The rep's own day is the card at the top with the box in
 * it; everybody else's is the list under it, alphabetically, and the same list
 * is what the manager reads. It is deliberately not a manager's inbox: a report
 * written to one person is a report to the boss, and the habit it is replacing
 * was a sheet the whole floor could open (D56).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const [user, params, t] = await Promise.all([
    requireUser(),
    searchParams,
    getTranslations("reports"),
  ]);

  const today = todayRiyadh();
  // An unreadable ?day= is not an error page. The screen has an obvious right
  // answer for "which day" and shows that instead (S8: no telling-off).
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(params.day ?? "") ? (params.day as Day) : null;
  const day = asked && asked <= today ? asked : await latestReportDay(today);

  const [team, neighbours, dayIsOpen] = await Promise.all([
    teamDay(day, today),
    reportNeighbours(day, today),
    mayWriteFor(day, today),
  ]);

  // A viewer is a reader (D42). `requireActor` refuses every write while somebody
  // is viewing as another person, so the box is not offered while viewing either
  // — a screen never offers work the action behind it would turn down.
  const canWrite = dayIsOpen && !user.viewedBy;

  const mine = owesReport(user.role) ? team.people.find((p) => p.userId === user.id) : undefined;
  const others = team.people.filter((person) => person.userId !== mine?.userId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <DayNav day={day} previous={neighbours.previous} next={neighbours.next} today={today} />
      </header>

      {/* Yours first, because on the day you are reading it you are here to
          write rather than to read. A person who is off gets no box and no
          nagging — a day he did not work is not a day he owes (D57). */}
      {mine && mine.state !== "off" ? (
        <OwnCard person={mine} open={team.open}>
          <ReportBox day={day} note={mine.note} canWrite={canWrite} closed={!dayIsOpen} />
        </OwnCard>
      ) : null}

      {/* How many of the people who owed one wrote. It is a count and not a
          list of names: the names are right underneath, and saying them twice
          would turn a participation line into a roll call (D56). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {!team.working
            ? t("notWorking")
            : team.owed === 0
              ? t("nobodyOwes")
              : t("written", { written: team.written, owed: team.owed })}
        </h2>

        <ul className="flex flex-col gap-3">
          {others.map((person) => (
            <li key={person.userId}>
              <PersonCard person={person} open={team.open} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
