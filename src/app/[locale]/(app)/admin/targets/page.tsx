import { getLocale } from "next-intl/server";
import { Placeholder } from "@/components/shell/placeholder";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";

export default async function AdminTargetsPage() {
  const user = await requireUser();
  // The rail never offers Admin to anyone else; a typed URL goes home.
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  return (
    <Placeholder titleKey="common.targets" sentenceKey="shell.emptyTargets" actionKey="shell.setTargets" />
  );
}
