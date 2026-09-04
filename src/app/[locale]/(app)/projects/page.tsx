import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { ProjectDrawer } from "@/components/projects/project-drawer";
import { ProjectSheetSkeleton, ProjectsTable } from "@/components/projects/projects-table";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/authz";
import { followUpCounts, parseFollowUpFilter } from "@/lib/followups";
import { listProjects } from "@/lib/projects";

/**
 * My projects, in the shape of the rep's home: the follow-up strip, a search
 * that filters as you type, then the list. Everything the list narrows by is
 * narrowed in SQL before any ordering (rules/data.md), and the strip's counts
 * come from the one follow-up definition every screen shares, so clicking "2
 * overdue" cannot show a different two.
 *
 * There is no "Add project" button here, on purpose. A project is a job AT a
 * customer (S18), so it is created from inside its company; a dialog that
 * opened by asking which company would only be a dropdown of every company a
 * rep owns, in front of the company list he was going to open anyway. The
 * primary action therefore opens that list, and the empty state says so in a
 * sentence.
 */

type Search = { q?: string; filter?: string; open?: string };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const filter = parseFollowUpFilter(params.filter);
  const open = params.open?.trim() || null;

  const [t, rows, counts] = await Promise.all([
    getTranslations(),
    listProjects({ user, q: q || undefined, filter, locale }),
    followUpCounts(user),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.projects")}</h1>
        {/* The brand gradient lives on the primary button and nowhere else. */}
        <Button asChild className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
          <Link href="/companies">{t("projects.openCompanies")}</Link>
        </Button>
      </div>

      <ProjectsTable rows={rows} counts={counts} q={q} filter={filter ?? null} openId={open} />

      <Suspense key={open ?? "closed"} fallback={open ? <ProjectSheetSkeleton /> : null}>
        <ProjectDrawer projectId={open} />
      </Suspense>
    </div>
  );
}
