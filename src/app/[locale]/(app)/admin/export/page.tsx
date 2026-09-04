import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { EXPORTS } from "@/lib/export";

/**
 * Three CSV files, admin only (SPEC §3, D19).
 *
 * Plain links to a route handler rather than buttons: the answer is a file, and
 * a browser already knows how to save one. A plain `<a>` rather than `Link`
 * from @/i18n/navigation, too — these are an API path, not a localised app
 * route, and putting a locale prefix in front of one would 404.
 */
export default async function AdminExportPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.export")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("admin.exportHint")}</p>

      <ul className="flex flex-col gap-2">
        {EXPORTS.map((name) => (
          <li key={name} className="card-face flex flex-wrap items-center gap-3 p-3">
            <span className="min-w-0 flex-1 text-sm">
              {t(`admin.exportFile.${name}`)}
            </span>
            <Button asChild variant="outline">
              <a href={`/api/export/${name}`} download>
                <Download aria-hidden="true" />
                {t("admin.download")}
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
