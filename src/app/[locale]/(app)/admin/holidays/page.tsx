import { asc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { HolidaysPanel } from "@/components/admin/holidays-panel";
import { db } from "@/db";
import { personName } from "@/lib/people";
import { users } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { listNonWorking } from "@/lib/admin";
import { firstOfMonth, todayRiyadh } from "@/lib/dates";

/**
 * Holidays and leave (SPEC S48).
 *
 * From the start of this month forward: a holiday last March is history the
 * arithmetic still uses but nobody edits, and a screen that opens on it is a
 * screen somebody scrolls past every time.
 */
export default async function AdminHolidaysPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  const locale = await getLocale();
  const [t, rows, people] = await Promise.all([
    getTranslations(),
    listNonWorking(firstOfMonth(todayRiyadh())),
    db
      .select({ id: users.id, name: personName(locale) })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(personName(locale))),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.holidays")}</h1>
      <HolidaysPanel rows={rows} people={people} />
    </div>
  );
}
