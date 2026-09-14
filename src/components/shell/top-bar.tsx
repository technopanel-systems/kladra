import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ReportButton, ReportDialogHost } from "@/components/reports/report-dialog";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/authz";
import { writesReports } from "@/lib/floor";
import type { Role } from "@/lib/types";
import type { Theme } from "@/lib/theme";
import { BrandMark } from "./brand-mark";
import { NotificationBell } from "./notification-bell";
import { SearchCommand } from "./search-command";
import { UserMenu } from "./user-menu";

/**
 * Search first, then what changed, then who you are. The bar is the canvas's
 * own colour with a hairline under it, so a long list scrolls under an edge
 * rather than under a slab.
 *
 * And the one thing a person writes from anywhere: Add report (SPEC §3 P13,
 * 13.8), for every role whose day is customer work (`writesReports`). The popup
 * behind it is mounted here, once, for the whole app (D82) — the top bar is on
 * every signed-in screen, so a drawer, a call card or this button all open the
 * same one. Quiet, not the brand: every screen already has its own primary
 * action, and a second red button on each of them would be two (DESIGN §1).
 */
export async function TopBar({
  userId,
  name,
  role,
  theme,
  home,
}: {
  userId: string;
  name: string;
  role: Role;
  theme: Theme;
  home: string;
}) {
  // `requireUser` is read once per request (D131); the layout already asked.
  const [t, user] = await Promise.all([getTranslations(), requireUser()]);
  // A viewer reads and writes nothing (D42, D52): the action refuses a viewer,
  // so the button is not offered to one either.
  const writes = writesReports(role) && !user.viewedBy;

  return (
    // Never on paper: a printed page is its content (SPEC §3 P13's print sheet).
    <header className="sticky top-0 z-20 border-b border-line bg-canvas print:hidden">
      <div className="flex h-14 items-center gap-2 px-4 md:px-8">
        {/* The rail carries the mark from md up; on a phone it lives here. */}
        <Link href={home} className="flex shrink-0 items-center md:hidden">
          <BrandMark />
          <span className="sr-only">{t("common.app")}</span>
        </Link>

        <SearchCommand role={role} />

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          {writes ? (
            <ReportButton
              variant="outline"
              size="sm"
              data-slot="add-report"
              className="me-1.5 max-md:size-11 max-md:px-0"
            >
              <Plus aria-hidden="true" />
              {/* Hidden on a phone, where the bar has room for a glyph and not
                  for words; the button keeps them as its name. */}
              <span className="max-md:sr-only">{t("common.addReport")}</span>
            </ReportButton>
          ) : null}
          <NotificationBell />
          <UserMenu userId={userId} name={name} role={role} theme={theme} />
        </div>
      </div>
      <ReportDialogHost enabled={!user.viewedBy} />
    </header>
  );
}
