import { and, eq, isNull, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { LiveProvider } from "@/components/live/live-provider";
import { BottomBar } from "@/components/shell/bottom-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { ViewingBanner } from "@/components/shell/viewing-banner";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { dirOf } from "@/i18n/routing";
import { homeFor, requireUser } from "@/lib/authz";
import { getTheme } from "@/lib/theme";

/**
 * The signed-in frame: rail, bar, content column. Authorization happens here
 * once per request (src/proxy.ts only routes locales), so every screen under
 * this layout can assume a user.
 *
 * The bell's starting number is read here rather than fetched by the browser —
 * it is on screen in the first byte of HTML, and the live channel moves it
 * from then on.
 */

async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [locale, theme, unread, t] = await Promise.all([
    getLocale(),
    getTheme(),
    unreadCount(user.id),
    getTranslations(),
  ]);
  const direction = dirOf(locale);

  return (
    <LiveProvider userId={user.id} initialUnread={unread}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:ring-1 focus:ring-line-strong"
      >
        {t("shell.skipToContent")}
      </a>

      <div className="flex min-h-svh">
        <Sidebar role={user.role} direction={direction} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar name={user.name} role={user.role} theme={theme} home={homeFor(user.role)} />
          {/* In the layout, so there is no screen in the app where an admin can
              forget whose eyes he is using (P8.8). */}
          <ViewingBanner user={user} />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 px-4 pt-6 pb-28 outline-none md:px-8 md:pt-8 md:pb-12"
          >
            <div className="w-full max-w-[1320px]">{children}</div>
          </main>
        </div>

        <BottomBar role={user.role} />
      </div>
    </LiveProvider>
  );
}
