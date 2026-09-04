import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/types";
import type { Theme } from "@/lib/theme";
import { BrandMark } from "./brand-mark";
import { NotificationBell } from "./notification-bell";
import { SearchCommand } from "./search-command";
import { UserMenu } from "./user-menu";

/**
 * Search first, then what changed, then who you are. The bar frosts over the
 * canvas rather than sitting on a slab, so a long list scrolls under it and
 * stays readable.
 */
export async function TopBar({
  name,
  role,
  theme,
  home,
}: {
  name: string;
  role: Role;
  theme: Theme;
  home: string;
}) {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 glass">
      <div className="flex h-14 items-center gap-2 px-4 md:px-8">
        {/* The rail carries the mark from md up; on a phone it lives here. */}
        <Link href={home} className="flex shrink-0 items-center md:hidden">
          <BrandMark />
          <span className="sr-only">{t("common.app")}</span>
        </Link>

        <SearchCommand />

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <NotificationBell />
          <UserMenu name={name} role={role} theme={theme} />
        </div>
      </div>
    </header>
  );
}
