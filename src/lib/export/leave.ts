/**
 * The holidays and leave file (SPEC §3, P14 14.10; S48 before it).
 *
 * One row per PERIOD — "Saad, 04/Oct/2026 to 15/Oct/2026, eight working days" —
 * and never one row per day. Leave is read as a period and stored as days
 * (D210): thirty days off is thirty rows in `non_working_days`, because that is
 * what the pace denominator skips and what the daily report marks a day off
 * from, and it is ONE entry on the screen and one line in the file. A file that
 * repeated the same fortnight thirty times would have to be summed before it
 * could be read, and summed with the weekends taken out by hand.
 *
 * Which is the other half of this: `days` is the count of WORKING days the
 * span really costs, not the calendar days between the dates. The weekend here
 * is Friday and Saturday and one module knows it (`src/lib/workdays.ts`); the
 * count comes off `nonWorkingPeriods`, which asks that module, so the file says
 * exactly what the entry on the screen says and no arithmetic is done twice
 * (rules/data.md).
 *
 * `kind` is the column that says which of the two a row is, because both live
 * on one screen and in one table: a company holiday is the office shut and
 * belongs to nobody, so `person` is empty on it — there is no whose about it.
 *
 * It is the holidays SCREEN, exported. The same read (`listNonWorking`), the
 * same grouping (`nonWorkingPeriods`), the same `?month=` read by the screen's
 * own parser (`stripMonth`) and defaulted the way the screen defaults it, and
 * the same list: everything still running from the start of this month. A
 * holiday last March is history the arithmetic uses and nobody edits, so the
 * screen does not list it and neither does the file. The read reaches a
 * period's length further back than that, because a fortnight that began in
 * August and runs into September is one entry and has to say the dates it
 * really has.
 *
 * Nobody's own floor, so the gate is a role rather than a narrowing, and it is
 * the screen's: `runsTheOffice` in src/lib/authz.ts, the predicate
 * `requireOffice` is built on. When the office is shut and when Saad is back is
 * the sales manager's business as much as the admin's (P14).
 */
import { getTranslations } from "next-intl/server";
import { LONGEST_PERIOD_DAYS, listNonWorking, nonWorkingPeriods, stripMonth } from "@/lib/admin";
import { addDays, firstOfMonth, todayRiyadh } from "@/lib/dates";
import { exportDay, type ExportRead } from "@/lib/export/kit";

export const leaveSheet: ExportRead = async ({ locale, params }) => {
  // Riyadh's today, asked once for both halves, so a file built across midnight
  // on the last of the month cannot read from one month and cut at another.
  const today = todayRiyadh();
  const thisMonth = firstOfMonth(today);
  const month = stripMonth(params.get("month"), today);

  // Whichever is earlier: far enough back to catch the start of any period that
  // reaches into this month, or the first of the month the strip is showing.
  // The screen's own arithmetic, so the file reads the rows the screen read.
  const reach = addDays(thisMonth, -LONGEST_PERIOD_DAYS);
  const from = month < reach ? month : reach;

  const [t, rows] = await Promise.all([
    getTranslations({ locale }),
    // The locale is handed over rather than asked for: the export route carries
    // no locale in its path, and a read that asks `getLocale()` there answers
    // with the default and names everybody in Latin (D68).
    listNonWorking(from, locale),
  ]);

  const periods = nonWorkingPeriods(rows).filter((period) => period.until >= thisMonth);

  return {
    columns: ["kind", "person", "from", "to", "days", "note"],
    // The one figure on the row. The dates beside it are days, not quantities.
    numeric: ["days"],
    rows: periods.map((period) => ({
      // The same two words the entry on the screen says.
      kind: period.kind === "leave" ? t("admin.kind.leave") : t("admin.kind.holiday"),
      // Empty where the office is shut: a holiday is nobody's leave.
      person: period.userName ?? "",
      from: exportDay(period.from, locale),
      to: exportDay(period.until, locale),
      days: period.workingDays,
      note: period.note ?? "",
    })),
  };
};
