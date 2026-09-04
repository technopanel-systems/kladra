import { getLocale, getTranslations } from "next-intl/server";
import { TargetsPanel } from "@/components/admin/targets-panel";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { targetsForMonth } from "@/lib/admin";
import { firstOfMonth, todayRiyadh, type Day } from "@/lib/dates";

/**
 * Targets: one figure per person per month, and the company's beside them
 * (SPEC S43, S44).
 *
 * The month lives in the URL, so "next month's targets" is a link somebody can
 * send.
 */
type Search = { month?: string };

function parseMonth(value: string | undefined): Day {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? firstOfMonth(value)
    : firstOfMonth(todayRiyadh());
}

export default async function AdminTargetsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  const [t, targets] = await Promise.all([
    getTranslations(),
    targetsForMonth(parseMonth(params.month)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.targets")}</h1>
      <TargetsPanel targets={targets} />
    </div>
  );
}
