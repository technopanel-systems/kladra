import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";

/**
 * `/` is nobody's screen. Each role has one home and authz owns the answer
 * (SPEC D15): the rep's companies, the coordinator's queue, the manager's and
 * admin's team.
 */
export default async function AppIndex() {
  const user = await requireUser();
  const locale = await getLocale();
  return redirect({ href: homeFor(user.role), locale });
}
