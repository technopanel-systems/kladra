import { asc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { HolidaysPanel } from "@/components/admin/holidays-panel";
import { db } from "@/db";
import { personName } from "@/lib/people";
import { users } from "@/db/schema";
import { requireOffice } from "@/lib/authz";
import {
  LONGEST_PERIOD_DAYS,
  listNonWorking,
  monthMarks,
  nonWorkingPeriods,
  stripMonth,
  stripSteps,
} from "@/lib/admin";
import { addDays, firstOfMonth, todayRiyadh } from "@/lib/dates";

/**
 * Holidays and leave (SPEC S48, P14).
 *
 * The admin's screen and the sales manager's (`requireOffice`): between them
 * they are the two people who answer "when is Saad back" and "is the office
 * shut on the 23rd".
 *
 * **One read, two halves.** The strip shows whichever month the address names
 * and the list shows everything from the start of THIS month forward — a
 * holiday last March is history the arithmetic still uses but nobody edits, and
 * a screen that opens on it is a screen somebody scrolls past every time. Both
 * halves come out of the same rows, so the grid and the list can never disagree
 * about a day (rules/data.md: one definition per figure). The read starts a
 * period's length before this month, because a fortnight that began in August
 * and runs into September is ONE entry and has to say the dates it really has.
 *
 * **A viewer reads it and changes nothing.** An admin looking through the
 * manager's eyes is refused by `requireActor` in both calendar actions (D42,
 * P8.8), so Add a day and every Remove are absent rather than present and
 * refusing (DESIGN §5). The month, the marks and the entries are the whole of
 * what he came to see.
 */
type Search = { month?: string };

export default async function AdminHolidaysPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [viewer, params] = await Promise.all([requireOffice(), searchParams]);

  const locale = await getLocale();
  const today = todayRiyadh();
  const thisMonth = firstOfMonth(today);
  const month = stripMonth(params.month, today);

  // Whichever is earlier: far enough back to see the start of any period that
  // reaches into this month, or the first of the month the strip is showing.
  const reach = addDays(thisMonth, -LONGEST_PERIOD_DAYS);
  const from = month < reach ? month : reach;

  const [t, rows, people] = await Promise.all([
    getTranslations(),
    listNonWorking(from),
    db
      .select({ id: users.id, name: personName(locale) })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(personName(locale))),
  ]);

  const steps = stripSteps(month, today);

  return (
    <HolidaysPanel
      title={t("common.holidays")}
      periods={nonWorkingPeriods(rows).filter((period) => period.until >= thisMonth)}
      month={month}
      back={steps.back}
      next={steps.next}
      marks={monthMarks(month, rows)}
      today={today}
      people={people}
      mayEdit={!viewer.viewedBy}
    />
  );
}
