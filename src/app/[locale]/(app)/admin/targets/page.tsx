import { getLocale, getTranslations } from "next-intl/server";
import { EarlierTargetsTable } from "@/components/admin/earlier-targets";
import { TargetsPanel } from "@/components/admin/targets-panel";
import { requireAdmin } from "@/lib/authz";
import { earlierTargets, targetsThisMonth } from "@/lib/admin";
import { formatMonth, todayRiyadh } from "@/lib/dates";

/**
 * Targets: one figure per person per month, and the company's beside them
 * (SPEC S43, S44).
 *
 * This month and only this month is set here (SPEC §3 P13: "Targets are the
 * current month only: no navigation across months, editable only where the
 * admin sets it"). The month is Riyadh's today and nothing in the address can
 * move it — a `?month=` in an old link is ignored, and the action refuses any
 * other month for the forged form. The months before it are underneath, read
 * and never set.
 */
export default async function AdminTargetsPage() {
  await requireAdmin();

  // One today for both halves, so a page drawn across midnight on the last of
  // the month cannot list this month among the earlier ones.
  const today = todayRiyadh();
  const [t, locale, targets, earlier] = await Promise.all([
    getTranslations(),
    getLocale(),
    targetsThisMonth(today),
    earlierTargets(today),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.targets")}</h1>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">{t("admin.thisMonth")}</h2>
          <span data-slot="targets-month" className="text-sm text-muted-foreground">
            {formatMonth(targets.month, locale)}
          </span>
        </div>
        <TargetsPanel targets={targets} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">{t("admin.earlierMonths")}</h2>
        <EarlierTargetsTable earlier={earlier} />
      </section>
    </div>
  );
}
