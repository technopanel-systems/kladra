import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { getUser, seesAll } from "@/lib/authz";
import { answer } from "@/lib/builder";
import { parseQuestion } from "@/lib/builder-choice";
import { builderTable } from "@/lib/builder-table";
import { todayRiyadh } from "@/lib/dates";
import { builderCsv } from "@/lib/export";

/**
 * The builder's table as a CSV file, for the manager and the admin (SPEC §3
 * P13, D19).
 *
 * A route handler for the reason the admin's three files are one: the answer IS
 * the file. The question is the builder's own address — `?m=&by=&p=&rep=` — so
 * the Export button is a link to the same question the screen is showing, and
 * the `locale` it carries is the language the table was read in.
 */
export async function GET(request: Request) {
  const user = await getUser();
  // Checked here and not only by the button: a route is a URL anybody signed in
  // could type (§3).
  if (!user || !seesAll(user)) return new NextResponse(null, { status: 404 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const locale = isLocale(params.locale) ? params.locale : user.locale;
  const question = parseQuestion(params, "quarter");

  const [t, result] = await Promise.all([
    getTranslations({ locale }),
    answer(user, question, locale),
  ]);
  const body = builderCsv(builderTable(result, t, locale));

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kladra-${question.measure}-by-${question.by}-${question.period}-${todayRiyadh()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
