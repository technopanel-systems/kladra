import { getTranslations } from "next-intl/server";
import { ExportFiles } from "@/components/admin/export-files";
import { requireAdmin } from "@/lib/authz";
import { EXPORTS } from "@/lib/export";

/**
 * Three CSV files, admin only (SPEC §3, D19).
 *
 * The files come from a route handler, because the answer IS a file; the page
 * is the list of them, drawn from the one list the route accepts (D99), and the
 * rows fetch them so a press can say it is working and a failure can say so
 * (P13-G6, `ExportFiles`). An API path, not a localised app route: a locale
 * prefix in front of one would 404.
 */
export default async function AdminExportPage() {
  await requireAdmin();

  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("common.export")}</h1>
      <ExportFiles names={EXPORTS} />
    </div>
  );
}
