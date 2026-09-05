import { getLocale, getTranslations } from "next-intl/server";
import { UsePanel } from "@/components/admin/use-panel";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { whoIsUsingIt } from "@/lib/adoption";

/**
 * Whether the team is using Kladra (SPEC D77, 9A item 12).
 *
 * The admin's screen, because it is his question: adoption is what kills a CRM,
 * and the person who can do something about it is the one who bought it. It is
 * deliberately not on the manager's team screen, which is about metres and
 * would then be answering two different questions with one table.
 */
export default async function AdminUsePage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  const [t, use] = await Promise.all([getTranslations(), whoIsUsingIt()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("admin.use")}</h1>
      <UsePanel use={use} />
    </div>
  );
}
