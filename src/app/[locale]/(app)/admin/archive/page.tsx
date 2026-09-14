import { getLocale, getTranslations } from "next-intl/server";
import { ArchivePanel } from "@/components/admin/archive-panel";
import { ListSearch } from "@/components/ui-ext/list-search";
import { ListTail } from "@/components/ui-ext/list-tail";
import { requireAdmin } from "@/lib/authz";
import { ARCHIVE_KINDS, listArchived } from "@/lib/admin";

/**
 * The archive, and the way back out of it (SPEC S16, D24) — rebuilt from its
 * question in P13-S7.
 *
 * Who opens it: the admin, and for one job. A rep pressed Archive on the wrong
 * row — or a customer he gave up on has rung again — and asks for it back. So
 * the screen is a search, not a history: find the thing by its name or its
 * company's, see what it was, on which company, who took it off the floor and
 * when and why, and put it back in one press where putting it back is allowed
 * (D92: never under a company that is still archived; never a record folded into
 * another). Grouped by kind with a count on each, newest archived first, because
 * what was archived by mistake was archived recently.
 *
 * Not the manager's. He reads every floor and rules duplicates, but restoring is
 * the admin's act in the actions (`restoreAction` asks for the admin) and a
 * screen never offers work the action behind it would refuse (DESIGN §5); the
 * company he might want back is already recognised when it is typed again, with
 * the day it left and why (D109).
 */

type Search = { q?: string };

export default async function AdminArchivePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const q = (params.q ?? "").trim();

  const [t, rows] = await Promise.all([
    getTranslations(),
    listArchived({ q: q || undefined, locale }),
  ]);

  // Every group's own count came back on its rows, counted before the cap, so
  // the tail line adds the groups rather than asking again (D80).
  const total = ARCHIVE_KINDS.reduce(
    (sum, kind) => sum + (rows.find((row) => row.kind === kind)?.inKind ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("admin.archive")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.archiveQuestion")}</p>
      </div>

      <ListSearch
        q={q}
        label={t("admin.archiveSearchLabel")}
        placeholder={t("admin.archiveSearchPlaceholder")}
        clearLabel={t("common.clear")}
        className="max-w-md sm:max-w-md"
      />

      <ArchivePanel rows={rows} q={q} />

      <ListTail shown={rows.length} total={total} />
    </div>
  );
}
