import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectDrawer } from "@/components/projects/project-drawer";
import { ProjectSheetSkeleton, ProjectsTable } from "@/components/projects/projects-table";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/authz";
import { ownsCompanies } from "@/lib/floor";
import { followUpCounts, parseFollowUpFilter } from "@/lib/followups";
import { companyOptions } from "@/lib/pickers";
import { listProjects } from "@/lib/projects";

/**
 * My projects, in the shape of the rep's home: the follow-up strip, a search
 * that filters as you type, then the list. Everything the list narrows by is
 * narrowed in SQL before any ordering (rules/data.md), and the strip's counts
 * come from the one follow-up definition every screen shares, so clicking "2
 * overdue" cannot show a different two.
 *
 * The primary action adds a project, and asks which company first (SPEC §3,
 * P8). It used to send the rep to the companies list instead, on the argument
 * that a dialog opening with a dropdown of every company was the same thing
 * slower. Jerom stood on this screen and went hunting, which settled it: a
 * dropdown he is already looking at beats a list he has to go and find.
 *
 * A person with no companies of his own is offered the earlier step instead,
 * never a button whose dropdown would be empty — and somebody who does not own
 * companies at all is offered neither, because "add a company first" is not a
 * step the manager reading this list can take (P8.9).
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

  const [t, rows, counts, companies] = await Promise.all([
    getTranslations(),
    listProjects({ user, q: q || undefined, filter, locale }),
    followUpCounts(user),
    companyOptions(user),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.projects")}</h1>
        {/* The brand gradient lives on the primary button and nowhere else. */}
        {!ownsCompanies(user.role) ? null : companies.length > 0 ? (
          <NewProjectDialog companies={companies} />
        ) : (
          <Button asChild className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
            <Link href="/companies">{t("projects.openCompanies")}</Link>
          </Button>
        )}
      </div>

      <ProjectsTable rows={rows} counts={counts} q={q} filter={filter ?? null} openId={open} />

      <Suspense key={open ?? "closed"} fallback={open ? <ProjectSheetSkeleton /> : null}>
        <ProjectDrawer projectId={open} />
      </Suspense>
    </div>
  );
}
