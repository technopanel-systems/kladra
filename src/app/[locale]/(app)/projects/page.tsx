import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectDrawer } from "@/components/projects/project-drawer";
import { ProjectSheetSkeleton, ProjectsTable } from "@/components/projects/projects-table";
import { ListTail } from "@/components/ui-ext/list-tail";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/authz";
import { mayWrite, ownsCompanies } from "@/lib/floor";
import { parseFollowUpFilter } from "@/lib/followups";
import { companyOptions } from "@/lib/pickers";
import {
  countProjects,
  listProjectBoard,
  listProjects,
  projectFollowUpCounts,
} from "@/lib/projects";
import { LIST_LIMIT } from "@/lib/list-size";
import { PROJECT_STAGES } from "@/lib/project-stage";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { viewFor } from "@/lib/view";

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
 *
 * And a board (SPEC §3 P13, D170): the same projects in five columns their own
 * papers put them in — Open, Quoted, Dispatching, Won, Lost — beside the list,
 * behind the same switch and remembered per person the way the quotations and
 * dispatches boards are (D164). The board is every project; the follow-up chips
 * narrow the list and step aside for it, as the status chips do on quotations.
 */

type Search = { q?: string; filter?: string; open?: string; view?: string };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const filter = parseFollowUpFilter(params.filter);
  const open = params.open?.trim() || null;
  // The URL wins, the person remembers, the list is the default (src/lib/view.ts).
  const stored = chosen(await rememberedChoices(user.id), "view", "projects");
  const view = viewFor(params.view, stored);

  const narrowing = {
    user,
    q: q || undefined,
    filter: view === "board" ? undefined : filter,
    locale,
  };

  const [t, rows, cards, counts, companies] = await Promise.all([
    getTranslations(),
    view === "board" ? Promise.resolve([]) : listProjects({ ...narrowing, limit: LIST_LIMIT }),
    view === "board" ? listProjectBoard({ user, q: q || undefined, locale }) : Promise.resolve([]),
    // The chips count what this list shows — projects — not the home strip's
    // companies (D108).
    projectFollowUpCounts(user),
    companyOptions(user),
  ]);

  // Only when the list came back full: on a floor this size the count is a
  // query nobody needs to run (D80). The board counted its own, in the query:
  // each column is capped on its own, so the board's total is its columns'
  // counts added, never a guess from how many cards came back.
  const shown = view === "board" ? cards.length : rows.length;
  const total =
    view === "board"
      ? PROJECT_STAGES.reduce(
          (sum, stage) => sum + (cards.find((card) => card.stage === stage)?.inStage ?? 0),
          0,
        )
      : shown === LIST_LIMIT
        ? await countProjects(narrowing)
        : shown;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.projects")}</h1>
        {/* The brand gradient lives on the primary button and nowhere else. */}
        {/* The sentence the action asks (`mayWrite`): an admin viewing as a rep
            is reading, and is offered neither door (P8.8, DESIGN §5). */}
        {!ownsCompanies(user.role) || !mayWrite(user, user.id) ? null : companies.length > 0 ? (
          <NewProjectDialog companies={companies} />
        ) : (
          <Button asChild variant="brand">
            <Link href="/companies">{t("projects.openCompanies")}</Link>
          </Button>
        )}
      </div>

      <ProjectsTable
        rows={rows}
        cards={cards}
        counts={counts}
        q={q}
        filter={filter ?? null}
        openId={open}
        view={view}
        remembered={stored}
      />

      <ListTail shown={shown} total={total} />

      <Suspense key={open ?? "closed"} fallback={open ? <ProjectSheetSkeleton /> : null}>
        <ProjectDrawer projectId={open} />
      </Suspense>
    </div>
  );
}
