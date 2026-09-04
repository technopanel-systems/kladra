import { getLocale, getTranslations } from "next-intl/server";
import { ArchivePanel } from "@/components/admin/archive-panel";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { listArchived } from "@/lib/admin";

/**
 * The archive, and the way back out of it (SPEC S16, D24).
 *
 * "Archive, never delete" is only true if somebody can undo it. This is that
 * screen: everything taken off the floor, newest first, with Restore.
 */
export default async function AdminArchivePage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  const [t, rows] = await Promise.all([getTranslations(), listArchived()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("admin.archive")}</h1>
      <ArchivePanel rows={rows} />
    </div>
  );
}
