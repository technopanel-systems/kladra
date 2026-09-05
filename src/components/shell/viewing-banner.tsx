import { Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { stopViewingFormAction } from "@/actions/view-as";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/types";

/**
 * The bar that says whose screen this is (SPEC §3, P8; src/lib/view-as.ts).
 *
 * It is in the layout rather than on a screen, so there is no page anywhere in
 * the app where an admin could forget he is not himself. It says three things
 * and no more: who he is looking at, that nothing can be changed, and how to
 * stop — because a banner nobody can act on is a banner people stop seeing.
 *
 * A plain form, so it works with no JavaScript: the one control whose whole
 * job is getting out of an unusual state should not depend on hydration.
 */
export async function ViewingBanner({ user }: { user: SessionUser }) {
  if (!user.viewedBy) return null;
  const t = await getTranslations();

  return (
    <div
      // Announced rather than merely drawn: a screen-reader user gets no
      // colour, and this is the one thing on the page they must not miss.
      role="status"
      data-slot="viewing-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-state-wait px-4 py-2 text-sm text-state-wait-fg md:px-8"
    >
      <Eye aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0">
        {t("viewAs.banner", { name: user.name, role: t(`common.${user.role}`) })}
      </span>
      <span className="text-xs opacity-80">{t("common.readOnly")}</span>
      <form action={stopViewingFormAction} className="ms-auto">
        <Button type="submit" size="sm" variant="outline">
          {t("viewAs.stop")}
        </Button>
      </form>
    </div>
  );
}
